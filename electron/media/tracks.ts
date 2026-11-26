import { app, ipcMain } from 'electron'
import ffmpegPath from 'ffmpeg-static'
import ffprobePath from '@derhuerst/ffprobe-static'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { IPC_CHANNELS } from '@shared/ipc'
import { mediaTypeForPath } from '@shared/media'
import type { MediaTrack } from '@shared/mediaTracks'
import { canRemuxMovVideo } from './movCompatibility'
import { MovPlaybackCache } from './movPlaybackCache'
import { registerTrackIpcHandlers } from './trackIpcHandlers'
import { assertTrackAvailable, parseTrackIndex } from './trackSelection'
import { TemporaryTrackOutputs } from './temporaryTrackOutputs'

const MAX_PROBE_OUTPUT = 4 * 1024 * 1024
const PROBE_TIMEOUT_MS = 30_000
const EXTRACTION_TIMEOUT_MS = 30 * 60 * 1000
const VIDEO_CONVERSION_TIMEOUT_MS = 60 * 60 * 1000
const MAX_MOV_PLAYBACK_CACHE_BYTES = 1024 * 1024 * 1024
const MAX_MOV_PLAYBACK_CACHE_ENTRIES = 5
const temporaryTrackOutputs = new TemporaryTrackOutputs({
  createDirectory: () => mkdtemp(path.join(os.tmpdir(), 'tocae-media-track-')),
  removeDirectory: (directory) => rm(directory, { recursive: true, force: true }),
})
const movPlaybackCache = new MovPlaybackCache({
  getSize: async (outputPath) => (await stat(outputPath)).size,
  releaseOutput: (outputPath) => temporaryTrackOutputs.release(outputPath),
  maxBytes: MAX_MOV_PLAYBACK_CACHE_BYTES,
  maxEntries: MAX_MOV_PLAYBACK_CACHE_ENTRIES,
})
const movPlaybackControllers = new Map<string, AbortController>()

type ProcessResult = {
  stdout: string
  stderr: string
}

type ProcessOptions = {
  maxOutput?: number
  signal?: AbortSignal
  onStdoutLine?: (line: string) => void
}

function executablePath(binaryPath: string | null, name: string): string {
  if (!binaryPath) throw new Error(`${name} is not available for this platform.`)
  if (!app.isPackaged) return binaryPath
  return binaryPath.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`,
  )
}

function runProcess(
  binaryPath: string,
  args: string[],
  timeoutMs: number,
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  if (options.signal?.aborted) {
    const error = new Error(`${path.basename(binaryPath)} was cancelled.`)
    error.name = 'AbortError'
    return Promise.reject(error)
  }

  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let stdoutLineBuffer = ''
    let settled = false
    const timeout = setTimeout(() => {
      child.kill()
      finish(new Error(`${path.basename(binaryPath)} timed out.`))
    }, timeoutMs)

    const abort = () => {
      child.kill()
      const error = new Error(`${path.basename(binaryPath)} was cancelled.`)
      error.name = 'AbortError'
      finish(error)
    }

    function finish(error?: Error) {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      options.signal?.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve({ stdout, stderr })
    }

    function appendOutput(current: string, chunk: Buffer, isError: boolean) {
      const next = current + chunk.toString('utf8')
      if (stdout.length + stderr.length + chunk.length > (options.maxOutput ?? MAX_PROBE_OUTPUT)) {
        child.kill()
        finish(new Error(`${path.basename(binaryPath)} produced too much output.`))
        return current
      }
      if (isError) stderr = next
      else stdout = next
      return next
    }

    child.stdout.on('data', (chunk: Buffer) => {
      if (!options.onStdoutLine) {
        stdout = appendOutput(stdout, chunk, false)
        return
      }

      stdoutLineBuffer += chunk.toString('utf8')
      const lines = stdoutLineBuffer.split(/\r?\n/)
      stdoutLineBuffer = lines.pop() ?? ''
      for (const line of lines) {
        if (line) options.onStdoutLine(line)
      }
    })
    child.stderr.on('data', (chunk: Buffer) => appendOutput(stderr, chunk, true))
    child.once('error', (error) => finish(error))
    child.once('close', (code, signal) => {
      if (code === 0) {
        finish()
        return
      }
      const detail = stderr.trim()
      finish(
        new Error(
          detail ||
            `${path.basename(binaryPath)} exited with ${signal ? `signal ${signal}` : `code ${code}`}.`,
        ),
      )
    })
    options.signal?.addEventListener('abort', abort, { once: true })
    if (options.signal?.aborted) abort()
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringTag(tags: unknown, key: string): string | undefined {
  if (!isRecord(tags)) return undefined
  const value = tags[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function parseTracks(serialized: string): MediaTrack[] {
  const parsed: unknown = JSON.parse(serialized)
  if (!isRecord(parsed) || !Array.isArray(parsed.streams)) {
    throw new TypeError('FFprobe returned an invalid stream list.')
  }

  const tracks: MediaTrack[] = []
  for (const stream of parsed.streams) {
    if (!isRecord(stream) || typeof stream.index !== 'number' || !Number.isInteger(stream.index)) {
      continue
    }
    const kind =
      stream.codec_type === 'audio'
        ? 'audio'
        : stream.codec_type === 'subtitle'
          ? 'subtitle'
          : null
    if (!kind || typeof stream.codec_name !== 'string') continue
    const disposition = isRecord(stream.disposition) ? stream.disposition : null
    const language = stringTag(stream.tags, 'language')
    const title = stringTag(stream.tags, 'title')

    tracks.push({
      streamIndex: stream.index,
      kind,
      codec: stream.codec_name,
      ...(language ? { language } : {}),
      ...(title ? { title } : {}),
      isDefault: disposition?.default === 1,
    })
  }
  return tracks
}

function parseMovVideoInfo(serialized: string): {
  codecName: string
  pixelFormat: string | undefined
  duration: number | undefined
} {
  const parsed: unknown = JSON.parse(serialized)
  if (!isRecord(parsed) || !Array.isArray(parsed.streams)) {
    throw new TypeError('FFprobe returned invalid MOV video information.')
  }

  const videoStream = parsed.streams.find(
    (stream) => isRecord(stream) && typeof stream.codec_name === 'string',
  )
  if (!isRecord(videoStream) || typeof videoStream.codec_name !== 'string') {
    throw new Error('The MOV file does not contain a decodable video stream.')
  }

  const format = isRecord(parsed.format) ? parsed.format : null
  const rawDuration = format?.duration
  const parsedDuration = typeof rawDuration === 'string' ? Number(rawDuration) : Number.NaN
  return {
    codecName: videoStream.codec_name,
    pixelFormat: typeof videoStream.pix_fmt === 'string' ? videoStream.pix_fmt : undefined,
    duration:
      Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : undefined,
  }
}

async function getMovVideoInfo(filePath: string, signal?: AbortSignal) {
  const { stdout } = await runProcess(
    executablePath(ffprobePath, 'FFprobe'),
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=codec_name,pix_fmt:format=duration',
      '-of',
      'json',
      filePath,
    ],
    PROBE_TIMEOUT_MS,
    { signal },
  )
  return parseMovVideoInfo(stdout)
}

function videoEncodingArgs(videoInfo: ReturnType<typeof parseMovVideoInfo>): string[] {
  return canRemuxMovVideo(videoInfo.codecName, videoInfo.pixelFormat)
    ? ['-c:v', 'copy']
    : [
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
      ]
}

async function mediaFilePath(value: unknown): Promise<string> {
  if (typeof value !== 'string' || !mediaTypeForPath(value)) {
    throw new TypeError('A supported media file path is required.')
  }
  const resolvedPath = path.resolve(value)
  const fileStats = await stat(resolvedPath)
  if (!fileStats.isFile()) throw new Error(`Not a media file: "${resolvedPath}"`)
  return resolvedPath
}

async function getMediaTracks(filePath: unknown): Promise<MediaTrack[]> {
  const resolvedPath = await mediaFilePath(filePath)
  const { stdout } = await runProcess(
    executablePath(ffprobePath, 'FFprobe'),
    [
      '-v',
      'error',
      '-show_entries',
      'stream=index,codec_type,codec_name:stream_tags=language,title:stream_disposition=default',
      '-of',
      'json',
      resolvedPath,
    ],
    PROBE_TIMEOUT_MS,
  )
  return parseTracks(stdout)
}

async function createMovPlayback(
  filePath: unknown,
  rawRequestId: unknown,
  onProgress: (progress: number) => void,
): Promise<string> {
  if (typeof rawRequestId !== 'string' || rawRequestId.length === 0 || rawRequestId.length > 128) {
    throw new TypeError('A valid MOV playback request ID is required.')
  }
  if (movPlaybackControllers.has(rawRequestId)) {
    throw new TypeError('The MOV playback request ID is already in use.')
  }

  const controller = new AbortController()
  movPlaybackControllers.set(rawRequestId, controller)
  try {
    const resolvedPath = await mediaFilePath(filePath)
    if (path.extname(resolvedPath).toLowerCase() !== '.mov') {
      throw new TypeError('A MOV video file is required.')
    }

    const fileStats = await stat(resolvedPath)
    const normalizedPath =
      process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath
    const cacheKey = `${normalizedPath}\u0000${fileStats.size}\u0000${fileStats.mtimeMs}`

    return await movPlaybackCache.acquire(
      cacheKey,
      async (signal) => {
        const videoInfo = await getMovVideoInfo(resolvedPath, signal)
        const encodingArgs = videoEncodingArgs(videoInfo)

        return temporaryTrackOutputs.create('compatible-video.mp4', async (outputPath) => {
          let lastProgress = 0
          await runProcess(
            executablePath(ffmpegPath, 'FFmpeg'),
            [
              '-nostdin',
              '-hide_banner',
              '-loglevel',
              'error',
              '-y',
              '-progress',
              'pipe:1',
              '-stats_period',
              '0.5',
              '-nostats',
              '-i',
              resolvedPath,
              '-map',
              '0:v:0',
              '-map',
              '0:a?',
              '-sn',
              '-map_metadata',
              '0',
              ...encodingArgs,
              '-c:a',
              'aac',
              '-b:a',
              '192k',
              '-movflags',
              '+faststart',
              '-f',
              'mp4',
              outputPath,
            ],
            VIDEO_CONVERSION_TIMEOUT_MS,
            {
              signal,
              onStdoutLine(line) {
                if (line === 'progress=end') {
                  onProgress(1)
                  return
                }

                const [key, rawValue] = line.split('=', 2)
                if (
                  (key !== 'out_time_us' && key !== 'out_time_ms') ||
                  !videoInfo.duration
                ) {
                  return
                }

                const seconds = Number(rawValue) / 1_000_000
                if (!Number.isFinite(seconds)) return
                const progress = Math.min(1, Math.max(lastProgress, seconds / videoInfo.duration))
                if (progress === lastProgress) return
                lastProgress = progress
                onProgress(progress)
              },
            },
          )
          onProgress(1)
        })
      },
      controller.signal,
    )
  } finally {
    if (movPlaybackControllers.get(rawRequestId) === controller) {
      movPlaybackControllers.delete(rawRequestId)
    }
  }
}

async function releaseMediaTrackOutput(outputPath: unknown): Promise<void> {
  if (typeof outputPath !== 'string') throw new TypeError('A temporary track path is required.')
  if (await movPlaybackCache.release(path.resolve(outputPath))) return
  await temporaryTrackOutputs.release(outputPath)
}

function cancelMovPlayback(rawRequestId: unknown): void {
  if (typeof rawRequestId !== 'string') {
    console.warn('Ignoring MOV playback cancellation without a request ID.')
    return
  }
  movPlaybackControllers.get(rawRequestId)?.abort()
}

async function validateStream(
  filePath: unknown,
  rawStreamIndex: unknown,
  kind: MediaTrack['kind'],
): Promise<{ filePath: string; streamIndex: number }> {
  const streamIndex = parseTrackIndex(rawStreamIndex)
  const resolvedPath = await mediaFilePath(filePath)
  assertTrackAvailable(await getMediaTracks(resolvedPath), streamIndex, kind)
  return { filePath: resolvedPath, streamIndex }
}

async function createAudioTrackPlayback(
  filePath: unknown,
  rawStreamIndex: unknown,
): Promise<string> {
  const { filePath: resolvedPath, streamIndex } = await validateStream(
    filePath,
    rawStreamIndex,
    'audio',
  )
  const isMov = path.extname(resolvedPath).toLowerCase() === '.mov'
  const encodingArgs = isMov
    ? videoEncodingArgs(await getMovVideoInfo(resolvedPath))
    : ['-c', 'copy']
  return temporaryTrackOutputs.create(
    isMov ? 'selected-audio.mp4' : 'selected-audio.mkv',
    async (outputPath) => {
      await runProcess(
        executablePath(ffmpegPath, 'FFmpeg'),
        [
          '-nostdin',
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          '-i',
          resolvedPath,
          '-map',
          '0:v:0?',
          '-map',
          `0:${streamIndex}`,
          '-map_metadata',
          '0',
          ...encodingArgs,
          ...(isMov ? ['-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'] : []),
          '-f',
          isMov ? 'mp4' : 'matroska',
          outputPath,
        ],
        EXTRACTION_TIMEOUT_MS,
      )
    },
  )
}

async function extractSubtitleTrack(
  filePath: unknown,
  rawStreamIndex: unknown,
): Promise<string> {
  const { filePath: resolvedPath, streamIndex } = await validateStream(
    filePath,
    rawStreamIndex,
    'subtitle',
  )
  return temporaryTrackOutputs.create('selected-subtitle.vtt', async (outputPath) => {
    await runProcess(
      executablePath(ffmpegPath, 'FFmpeg'),
      [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-y',
        '-i',
        resolvedPath,
        '-map',
        `0:${streamIndex}`,
        '-c:s',
        'webvtt',
        '-f',
        'webvtt',
        outputPath,
      ],
      EXTRACTION_TIMEOUT_MS,
    )
  })
}

export function registerMediaTracksIpc(): void {
  registerTrackIpcHandlers(
    (channel, handler) => {
      ipcMain.handle(channel, (event, ...args) => handler(event, ...args))
    },
    {
      getMediaTracks,
      createMovPlayback,
      createAudioTrackPlayback,
      extractSubtitleTrack,
      releaseMediaTrackOutput,
    },
  )
  ipcMain.on(IPC_CHANNELS.MEDIA_MOV_PLAYBACK_CANCEL, (_event, requestId: unknown) =>
    cancelMovPlayback(requestId),
  )
  app.once('will-quit', () => {
    for (const controller of movPlaybackControllers.values()) controller.abort()
    void movPlaybackCache
      .cleanup((outputPath, error) => {
        console.error(`Could not remove cached MOV playback "${outputPath}"`, error)
      })
      .then(() =>
        temporaryTrackOutputs.cleanup((directory, error) => {
          console.error(`Could not remove temporary media tracks in "${directory}"`, error)
        }),
      )
      .catch((error: unknown) => console.error('Could not clean up MOV playback cache', error))
  })
}
