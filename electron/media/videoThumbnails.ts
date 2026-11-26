import { app, ipcMain } from 'electron'
import ffmpegPath from 'ffmpeg-static'
import ffprobePath from '@derhuerst/ffprobe-static'
import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { IPC_CHANNELS } from '@shared/ipc'
import { mediaTypeForPath } from '@shared/media'
import type { VideoThumbnail } from '@shared/media'

const THUMBNAIL_TIMEOUT_MS = 30_000
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024
const MAX_CACHE_BYTES = 32 * 1024 * 1024
const MAX_CACHE_ENTRIES = 128

type VideoInfo = {
  width: number
  height: number
  duration?: number
}

type CachedThumbnail = {
  thumbnail: VideoThumbnail
  size: number
}

const thumbnailCache = new Map<string, CachedThumbnail>()
const pendingThumbnails = new Map<string, Promise<VideoThumbnail>>()
let cachedBytes = 0
let activeThumbnails = 0
const thumbnailQueue: Array<() => void> = []

function executablePath(binaryPath: string | null, name: string): string {
  if (!binaryPath) throw new Error(`${name} is not available for this platform.`)
  if (!app.isPackaged) return binaryPath
  return binaryPath.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`,
  )
}

function runTextProcess(binaryPath: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      binaryPath,
      args,
      {
        encoding: 'utf8',
        maxBuffer: 256 * 1024,
        timeout: THUMBNAIL_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error)
          return
        }
        resolve(stdout)
      },
    )
  })
}

function runImageProcess(binaryPath: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      binaryPath,
      args,
      {
        encoding: 'buffer',
        maxBuffer: MAX_THUMBNAIL_BYTES,
        timeout: THUMBNAIL_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error)
          return
        }
        if (!Buffer.isBuffer(stdout) || stdout.byteLength === 0) {
          reject(new Error('FFmpeg returned an empty video thumbnail.'))
          return
        }
        resolve(stdout)
      },
    )
  })
}

function parseVideoInfo(serialized: string): VideoInfo {
  const parsed: unknown = JSON.parse(serialized)
  if (typeof parsed !== 'object' || parsed === null || !('streams' in parsed)) {
    throw new TypeError('FFprobe returned invalid video dimensions.')
  }
  const streams = parsed.streams
  if (!Array.isArray(streams)) throw new TypeError('FFprobe returned invalid video dimensions.')
  const stream = streams.find(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      'width' in entry &&
      'height' in entry &&
      typeof entry.width === 'number' &&
      typeof entry.height === 'number',
  )
  if (!stream || stream.width <= 0 || stream.height <= 0) {
    throw new Error('The video does not contain a decodable video stream.')
  }

  const format =
    'format' in parsed && typeof parsed.format === 'object' && parsed.format !== null
      ? parsed.format
      : null
  const rawDuration = format && 'duration' in format ? format.duration : undefined
  const duration =
    typeof rawDuration === 'string' && Number.isFinite(Number(rawDuration))
      ? Number(rawDuration)
      : undefined
  return {
    width: stream.width,
    height: stream.height,
    ...(duration && duration > 0 ? { duration } : {}),
  }
}

async function withThumbnailSlot<T>(operation: () => Promise<T>): Promise<T> {
  if (activeThumbnails >= 2) {
    await new Promise<void>((resolve) => thumbnailQueue.push(resolve))
  } else {
    activeThumbnails += 1
  }
  try {
    return await operation()
  } finally {
    const next = thumbnailQueue.shift()
    if (next) next()
    else activeThumbnails -= 1
  }
}

async function createVideoThumbnail(filePath: string): Promise<VideoThumbnail> {
  return withThumbnailSlot(async () => {
    const [infoText, fileStats] = await Promise.all([
      runTextProcess(executablePath(ffprobePath, 'FFprobe'), [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=width,height:format=duration',
        '-of',
        'json',
        filePath,
      ]),
      stat(filePath),
    ])
    if (!fileStats.isFile()) throw new Error(`Not a video file: "${filePath}"`)
    const info = parseVideoInfo(infoText)
    const seekTime = info.duration ? Math.min(1, info.duration * 0.1) : 0
    const image = await runImageProcess(executablePath(ffmpegPath, 'FFmpeg'), [
      '-nostdin',
      '-hide_banner',
      '-loglevel',
      'error',
      '-ss',
      String(seekTime),
      '-i',
      filePath,
      '-frames:v',
      '1',
      '-vf',
      'scale=320:180:force_original_aspect_ratio=decrease:force_divisible_by=2',
      '-q:v',
      '5',
      '-f',
      'image2pipe',
      '-vcodec',
      'mjpeg',
      'pipe:1',
    ])

    return {
      dataUrl: `data:image/jpeg;base64,${image.toString('base64')}`,
      width: info.width,
      height: info.height,
      ...(info.duration ? { duration: info.duration } : {}),
    }
  })
}

function cacheThumbnail(key: string, thumbnail: VideoThumbnail): void {
  const size = Buffer.byteLength(thumbnail.dataUrl)
  if (size > MAX_CACHE_BYTES) return

  const existing = thumbnailCache.get(key)
  if (existing) {
    cachedBytes -= existing.size
    thumbnailCache.delete(key)
  }

  thumbnailCache.set(key, { thumbnail, size })
  cachedBytes += size
  while (cachedBytes > MAX_CACHE_BYTES || thumbnailCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = thumbnailCache.keys().next().value
    if (oldestKey === undefined) break
    const oldest = thumbnailCache.get(oldestKey)
    if (oldest) cachedBytes -= oldest.size
    thumbnailCache.delete(oldestKey)
  }
}

async function getVideoThumbnail(value: unknown): Promise<VideoThumbnail> {
  if (typeof value !== 'string' || mediaTypeForPath(value) !== 'video') {
    throw new TypeError('A supported video file path is required.')
  }

  const filePath = path.resolve(value)
  const fileStats = await stat(filePath)
  if (!fileStats.isFile()) throw new Error(`Not a video file: "${filePath}"`)
  const normalizedPath = process.platform === 'win32' ? filePath.toLowerCase() : filePath
  const key = `${normalizedPath}\u0000${fileStats.size}\u0000${fileStats.mtimeMs}`
  const cached = thumbnailCache.get(key)
  if (cached) {
    thumbnailCache.delete(key)
    thumbnailCache.set(key, cached)
    return cached.thumbnail
  }

  let pending = pendingThumbnails.get(key)
  if (!pending) {
    pending = createVideoThumbnail(filePath).then((thumbnail) => {
      cacheThumbnail(key, thumbnail)
      return thumbnail
    })
    pendingThumbnails.set(key, pending)
  }

  try {
    return await pending
  } finally {
    if (pendingThumbnails.get(key) === pending) pendingThumbnails.delete(key)
  }
}

export function registerVideoThumbnailIpc(): void {
  ipcMain.handle(IPC_CHANNELS.MEDIA_VIDEO_THUMBNAIL_GET, (_event, filePath: unknown) =>
    getVideoThumbnail(filePath),
  )
}
