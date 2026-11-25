import { Buffer } from 'node:buffer'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { ipcMain } from 'electron'
import { ExifDateTime, exiftool } from 'exiftool-vendored'
import exifr from 'exifr'
import { parseFile } from 'music-metadata'
import { IPC_CHANNELS } from '@shared/ipc'
import { mediaTypeForPath } from '@shared/media'
import type { MediaMetadata } from '@shared/media'

const MAX_CACHE_ENTRIES = 64
const MAX_COVER_SIZE = 512 * 1024

type CachedMetadata = {
  fileSize: number
  modifiedAt: number
  metadata: MediaMetadata
}

const metadataCache = new Map<string, CachedMetadata>()
const pendingReads = new Map<string, Promise<MediaMetadata>>()

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function timestampValue(value: unknown): number | undefined {
  if (value instanceof ExifDateTime) {
    const timestamp = value.toMillis()
    return Number.isFinite(timestamp) ? timestamp : undefined
  }
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date.getTime() : undefined
}

function cacheKey(filePath: string): string {
  const resolved = path.resolve(filePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

async function extractMetadata(
  filePath: string,
  fileSize: number,
  modifiedAt: number,
): Promise<MediaMetadata> {
  const mediaType = mediaTypeForPath(filePath)
  const result: MediaMetadata = { fileSize, modifiedAt }

  try {
    const tags = await exiftool.read(filePath)
    result.title = textValue(tags.Title ?? tags.DocumentName ?? tags.ObjectName)
    result.description = textValue(tags.Description ?? tags.ImageDescription)
    result.capturedAt = timestampValue(
      tags.DateTimeOriginal ?? tags.CreateDate ?? tags.DateCreated,
    )
    result.width = numberValue(tags.ImageWidth ?? tags.SourceImageWidth)
    result.height = numberValue(tags.ImageHeight ?? tags.SourceImageHeight)
    const make = textValue(tags.Make)
    const model = textValue(tags.Model)
    const camera = [make, model].filter(Boolean).join(' ')
    if (camera) result.camera = camera
  } catch (error) {
    console.warn(`Could not read ExifTool metadata for "${filePath}"`, error)
  }

  if (
    mediaType === 'image' &&
    (!result.width || !result.height || !result.capturedAt || !result.camera)
  ) {
    try {
      const tags = await exifr.parse(filePath, {
        pick: ['ImageWidth', 'ImageHeight', 'DateTimeOriginal', 'CreateDate', 'Make', 'Model'],
      })
      if (tags) {
        result.width = numberValue(tags.ImageWidth) ?? result.width
        result.height = numberValue(tags.ImageHeight) ?? result.height
        result.capturedAt =
          timestampValue(tags.DateTimeOriginal ?? tags.CreateDate) ?? result.capturedAt
        const make = textValue(tags.Make)
        const model = textValue(tags.Model)
        const camera = [make, model].filter(Boolean).join(' ')
        if (camera) result.camera = camera
      }
    } catch (error) {
      console.warn(`Could not read image metadata for "${filePath}"`, error)
    }
    return result
  }

  try {
    const parsed = await parseFile(filePath, { maxMemoryAllocation: 8 * 1024 * 1024 })
    const { common, format } = parsed
    result.title = textValue(common.title) ?? result.title
    result.artist = textValue(common.artist)
    result.album = textValue(common.album)
    result.year = numberValue(common.year)
    result.genres = common.genre?.filter((genre) => genre.trim().length > 0)
    result.duration = numberValue(format.containerDuration ?? format.duration) ?? result.duration
    result.codec = textValue(format.codec) ?? result.codec

    const cover = common.picture?.find(
      (picture) => picture.format.startsWith('image/') && picture.data.byteLength <= MAX_COVER_SIZE,
    )
    if (cover) {
      result.coverArt = `data:${cover.format};base64,${Buffer.from(cover.data).toString('base64')}`
    }
  } catch (error) {
    console.warn(`Could not read media metadata for "${filePath}"`, error)
  }

  return result
}

async function getMediaMetadata(filePath: unknown): Promise<MediaMetadata> {
  if (typeof filePath !== 'string' || !mediaTypeForPath(filePath)) {
    throw new TypeError('A supported media file path is required.')
  }

  const resolvedPath = path.resolve(filePath)
  const fileStats = await stat(resolvedPath)
  if (!fileStats.isFile()) throw new Error(`Not a media file: "${resolvedPath}"`)

  const key = cacheKey(resolvedPath)
  const cached = metadataCache.get(key)
  if (cached?.fileSize === fileStats.size && cached.modifiedAt === fileStats.mtimeMs) {
    metadataCache.delete(key)
    metadataCache.set(key, cached)
    return cached.metadata
  }

  const pendingKey = `${key}\u0000${fileStats.size}\u0000${fileStats.mtimeMs}`
  let pending = pendingReads.get(pendingKey)
  if (!pending) {
    pending = extractMetadata(resolvedPath, fileStats.size, fileStats.mtimeMs).then((metadata) => {
      metadataCache.delete(key)
      metadataCache.set(key, {
        fileSize: fileStats.size,
        modifiedAt: fileStats.mtimeMs,
        metadata,
      })
      while (metadataCache.size > MAX_CACHE_ENTRIES) {
        const oldestKey = metadataCache.keys().next().value
        if (oldestKey === undefined) break
        metadataCache.delete(oldestKey)
      }
      return metadata
    })
    pendingReads.set(pendingKey, pending)
  }

  try {
    return await pending
  } finally {
    pendingReads.delete(pendingKey)
  }
}

export function registerMediaMetadataIpc(): void {
  ipcMain.handle(IPC_CHANNELS.MEDIA_METADATA_GET, (_event, filePath: unknown) =>
    getMediaMetadata(filePath),
  )
}
