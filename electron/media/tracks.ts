import { app, ipcMain } from 'electron'
import ffmpegPath from 'ffmpeg-static'
import ffprobePath from '@derhuerst/ffprobe-static'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { mediaTypeForPath } from '@shared/media'
import type { MediaTrack } from '@shared/mediaTracks'
import { registerTrackIpcHandlers } from './trackIpcHandlers'
import { assertTrackAvailable, parseTrackIndex } from './trackSelection'
import { TemporaryTrackOutputs } from './temporaryTrackOutputs'

const MAX_PROBE_OUTPUT = 4 * 1024 * 1024
const MAX_EXTRACTED_VIDEO_FRAME_BYTES = 1024 * 1024
const PROBE_TIMEOUT_MS = 30_000
const VIDEO_FRAME_TIMEOUT_MS = 15_000
const EXTRACTION_TIMEOUT_MS = 30 * 60 * 1000
const temporaryTrackOutputs = new TemporaryTrackOutputs({
  createDirectory: () => mkdtemp(path.join(os.tmpdir(), 'tocae-media-track-')),
  removeDirectory: (directory) => rm(directory, { recursive: true, force: true }),
})

type ProcessResult = {
  stdout: string
  stderr: string
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
  maxOutput = MAX_PROBE_OUTPUT,
  signal?: AbortSignal,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timeout = setTimeout(() => {
      child.kill()
      finish(new Error(`${path.basename(binaryPath)} timed out.`))
    }, timeoutMs)

    function finish(error?: Error) {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve({ stdout, stderr })
    }

    function abort() {
      child.kill()
      finish(new DOMException('Solicitação cancelada.', 'AbortError'))
    }

    function appendOutput(current: string, chunk: Buffer, isError: boolean) {
      const next = current + chunk.toString('utf8')
      if (stdout.length + stderr.length + chunk.length > maxOutput) {
        child.kill()
        finish(new Error(`${path.basename(binaryPath)} produced too much output.`))
        return current
      }
      if (isError) stderr = next
      else stdout = next
      return next
    }

    child.stdout.on('data', (chunk: Buffer) => appendOutput(stdout, chunk, false))
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
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
  })
}

function runBinaryProcess(
  binaryPath: string,
  args: string[],
  signal: AbortSignal,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(binaryPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    let stdoutBytes = 0
    let stderr = ''
    let settled = false
    const timeout = setTimeout(() => {
      child.kill()
      finish(new Error(`${path.basename(binaryPath)} timed out.`))
    }, VIDEO_FRAME_TIMEOUT_MS)

    function finish(error?: Error, output?: Buffer) {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      if (error) reject(error)
      else resolve(output ?? Buffer.alloc(0))
    }

    function abort() {
      child.kill()
      finish(new DOMException('Solicitação cancelada.', 'AbortError'))
    }

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length
      if (stdoutBytes > MAX_EXTRACTED_VIDEO_FRAME_BYTES) {
        child.kill()
        finish(new Error('FFmpeg produced an oversized video frame.'))
        return
      }
      stdout.push(chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      const remainingBytes = 16 * 1024 - Buffer.byteLength(stderr, 'utf8')
      if (remainingBytes > 0) stderr += chunk.subarray(0, remainingBytes).toString('utf8')
    })
    child.once('error', (error) => finish(error))
    child.once('close', (code, exitSignal) => {
      if (code !== 0) {
        finish(
          new Error(
            stderr.trim() ||
              `${path.basename(binaryPath)} exited with ${exitSignal ? `signal ${exitSignal}` : `code ${code}`}.`,
          ),
        )
        return
      }
      finish(undefined, Buffer.concat(stdout))
    })
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
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

export async function getVideoDuration(
  filePath: unknown,
  signal?: AbortSignal,
): Promise<number> {
  const resolvedPath = await mediaFilePath(filePath)
  if (mediaTypeForPath(resolvedPath) !== 'video') {
    throw new TypeError('A supported video file path is required.')
  }
  const { stdout } = await runProcess(
    executablePath(ffprobePath, 'FFprobe'),
    [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      resolvedPath,
    ],
    PROBE_TIMEOUT_MS,
    1024,
    signal,
  )
  const duration = Number(stdout.trim())
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('FFprobe could not determine the video duration.')
  }
  return duration
}

export async function extractVideoFrameAt(
  filePath: unknown,
  timestampSeconds: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const resolvedPath = await mediaFilePath(filePath)
  if (mediaTypeForPath(resolvedPath) !== 'video') {
    throw new TypeError('A supported video file path is required.')
  }
  if (!Number.isFinite(timestampSeconds) || timestampSeconds < 0) {
    throw new TypeError('A valid video frame timestamp is required.')
  }
  const frame = await runBinaryProcess(
    executablePath(ffmpegPath, 'FFmpeg'),
    [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      timestampSeconds.toFixed(3),
      '-i',
      resolvedPath,
      '-map',
      '0:v:0',
      '-frames:v',
      '1',
      '-vf',
      'scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2',
      '-q:v',
      '5',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      'pipe:1',
    ],
    signal,
  )
  if (frame.byteLength === 0) throw new Error('FFmpeg did not extract a video frame.')
  return frame
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
  return temporaryTrackOutputs.create('selected-audio.mkv', async (outputPath) => {
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
        '-c',
        'copy',
        '-f',
        'matroska',
        outputPath,
      ],
      EXTRACTION_TIMEOUT_MS,
    )
  })
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

async function releaseMediaTrackOutput(outputPath: unknown): Promise<void> {
  if (typeof outputPath !== 'string') throw new TypeError('A temporary track path is required.')
  await temporaryTrackOutputs.release(outputPath)
}

export function registerMediaTracksIpc(): void {
  registerTrackIpcHandlers(
    (channel, handler) => {
      ipcMain.handle(channel, (event, ...args) => handler(event, ...args))
    },
    {
      getMediaTracks,
      createAudioTrackPlayback,
      extractSubtitleTrack,
      releaseMediaTrackOutput,
    },
  )
  app.once('will-quit', () => {
    void temporaryTrackOutputs.cleanup((directory, error) => {
      console.error(`Could not remove temporary media tracks in "${directory}"`, error)
    })
  })
}
