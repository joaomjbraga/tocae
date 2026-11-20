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

const MAX_PROBE_OUTPUT = 4 * 1024 * 1024
const PROBE_TIMEOUT_MS = 30_000
const EXTRACTION_TIMEOUT_MS = 30 * 60 * 1000
const temporaryDirectories = new Set<string>()
const temporaryOutputs = new Map<string, string>()

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
      if (error) reject(error)
      else resolve({ stdout, stderr })
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

async function validateStream(
  filePath: unknown,
  rawStreamIndex: unknown,
  kind: MediaTrack['kind'],
): Promise<{ filePath: string; streamIndex: number }> {
  if (!Number.isSafeInteger(rawStreamIndex) || (rawStreamIndex as number) < 0) {
    throw new TypeError('A valid media stream index is required.')
  }
  const resolvedPath = await mediaFilePath(filePath)
  const streamIndex = rawStreamIndex as number
  const track = (await getMediaTracks(resolvedPath)).find(
    (candidate) => candidate.streamIndex === streamIndex && candidate.kind === kind,
  )
  if (!track) throw new TypeError(`The requested ${kind} stream was not found.`)
  return { filePath: resolvedPath, streamIndex }
}

async function createTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tocae-media-track-'))
  temporaryDirectories.add(directory)
  return directory
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
  const directory = await createTemporaryDirectory()
  const outputPath = path.join(directory, 'selected-audio.mkv')

  try {
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
    temporaryOutputs.set(outputPath, directory)
    return outputPath
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    temporaryDirectories.delete(directory)
    throw error
  }
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
  const directory = await createTemporaryDirectory()
  const outputPath = path.join(directory, 'selected-subtitle.vtt')

  try {
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
    temporaryOutputs.set(outputPath, directory)
    return outputPath
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    temporaryDirectories.delete(directory)
    throw error
  }
}

async function releaseMediaTrackOutput(outputPath: unknown): Promise<void> {
  if (typeof outputPath !== 'string') throw new TypeError('A temporary track path is required.')
  const resolvedPath = path.resolve(outputPath)
  const directory = temporaryOutputs.get(resolvedPath)
  if (!directory) throw new TypeError('The temporary track path is not owned by this session.')

  await rm(directory, { recursive: true, force: true })
  temporaryOutputs.delete(resolvedPath)
  temporaryDirectories.delete(directory)
}

export function registerMediaTracksIpc(): void {
  ipcMain.handle(IPC_CHANNELS.MEDIA_TRACKS_GET, (_event, filePath: unknown) =>
    getMediaTracks(filePath),
  )
  ipcMain.handle(
    IPC_CHANNELS.MEDIA_TRACK_AUDIO_CREATE,
    (_event, filePath: unknown, streamIndex: unknown) =>
      createAudioTrackPlayback(filePath, streamIndex),
  )
  ipcMain.handle(
    IPC_CHANNELS.MEDIA_TRACK_SUBTITLE_EXTRACT,
    (_event, filePath: unknown, streamIndex: unknown) =>
      extractSubtitleTrack(filePath, streamIndex),
  )
  ipcMain.handle(
    IPC_CHANNELS.MEDIA_TRACK_OUTPUT_RELEASE,
    (_event, outputPath: unknown) => releaseMediaTrackOutput(outputPath),
  )
  app.once('will-quit', () => {
    for (const directory of temporaryDirectories) {
      void rm(directory, { recursive: true, force: true }).catch((error: unknown) => {
        console.error(`Could not remove temporary media tracks in "${directory}"`, error)
      })
    }
    temporaryDirectories.clear()
  })
}
