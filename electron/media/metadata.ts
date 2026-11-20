import { Buffer } from 'node:buffer'
import { constants as fsConstants } from 'node:fs'
import { copyFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { ipcMain } from 'electron'
import { ExifDateTime, exiftool } from 'exiftool-vendored'
import type { WriteTags } from 'exiftool-vendored'
import exifr from 'exifr'
import { parseFile } from 'music-metadata'
import NodeID3 from 'node-id3'
import { IPC_CHANNELS } from '@shared/ipc'
import { mediaTypeForPath } from '@shared/media'
import type {
  MediaMetadata,
  MediaMetadataUpdate,
  MediaMetadataUpdateResult,
  MediaType,
} from '@shared/media'

const MAX_CACHE_ENTRIES = 64
const MAX_COVER_SIZE = 512 * 1024

type MetadataWriteTags = WriteTags & {
  Genre?: string | null
  Year?: number | null
}

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

  if (mediaType === 'image') {
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredText(value: unknown, field: string, maximumLength: number): string {
  if (typeof value !== 'string') throw new TypeError(`The ${field} must be a string.`)
  const normalized = value.trim()
  if (normalized.length > maximumLength) {
    throw new RangeError(`The ${field} must not exceed ${maximumLength} characters.`)
  }
  return normalized
}

function validateMediaMetadataUpdate(value: unknown, mediaType: MediaType): MediaMetadataUpdate {
  if (!isRecord(value) || value.mediaType !== mediaType) {
    throw new TypeError('Metadata updates must match the media file type.')
  }

  if (mediaType === 'audio') {
    const allowedFields = new Set(['mediaType', 'title', 'artist', 'album', 'year', 'genre'])
    if (Object.keys(value).some((field) => !allowedFields.has(field))) {
      throw new TypeError('The audio metadata update contains an unsupported field.')
    }

    const year =
      value.year === null
        ? null
        : typeof value.year === 'number' &&
            Number.isInteger(value.year) &&
            value.year >= 1000 &&
            value.year <= 9999
          ? value.year
          : (() => {
              throw new TypeError('The year must be a four-digit year or empty.')
            })()

    return {
      mediaType,
      title: requiredText(value.title, 'title', 512),
      artist: requiredText(value.artist, 'artist', 512),
      album: requiredText(value.album, 'album', 512),
      year,
      genre: requiredText(value.genre, 'genre', 256),
    }
  }

  const allowedFields = new Set(['mediaType', 'title', 'description', 'capturedAt'])
  if (Object.keys(value).some((field) => !allowedFields.has(field))) {
    throw new TypeError('The media metadata update contains an unsupported field.')
  }

  const capturedAt =
    value.capturedAt === null
      ? null
      : typeof value.capturedAt === 'number' &&
          Number.isFinite(value.capturedAt) &&
          Number.isFinite(new Date(value.capturedAt).getTime())
        ? value.capturedAt
        : (() => {
            throw new TypeError('The date must be valid or empty.')
          })()

  return {
    mediaType,
    title: requiredText(value.title, 'title', 512),
    description: requiredText(value.description, 'description', 4096),
    capturedAt,
  }
}

function exifDate(timestamp: number | null): string | null {
  if (timestamp === null) return null
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}:${pad(date.getMonth() + 1)}:${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

function writeTagsForUpdate(updates: MediaMetadataUpdate): MetadataWriteTags {
  if (updates.mediaType === 'audio') {
    return {
      Title: updates.title || null,
      Artist: updates.artist || null,
      Album: updates.album || null,
      Year: updates.year,
      Genre: updates.genre || null,
    }
  }

  const date = exifDate(updates.capturedAt)
  return updates.mediaType === 'image'
    ? {
        Title: updates.title || null,
        Description: updates.description || null,
        ImageDescription: updates.description || null,
        DateTimeOriginal: date,
        CreateDate: date,
      }
    : {
        Title: updates.title || null,
        Description: updates.description || null,
        CreateDate: date,
      }
}

async function preserveOriginal(filePath: string): Promise<void> {
      try {
        await copyFile(filePath, `${filePath}_original`, fsConstants.COPYFILE_EXCL)
      } catch (error) {
        if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST') {
          return
        }
        throw error
      }
}

async function writeMp3Metadata(
      filePath: string,
      updates: Extract<MediaMetadataUpdate, { mediaType: 'audio' }>,
): Promise<void> {
      await preserveOriginal(filePath)
      const expected = {
        title: updates.title,
        artist: updates.artist,
        album: updates.album,
        year: updates.year === null ? '' : String(updates.year),
        genre: updates.genre,
      }
      await NodeID3.Promise.update(expected, filePath)
      const written = await NodeID3.Promise.read(filePath)
      if (
        (written.title ?? '') !== expected.title ||
        (written.artist ?? '') !== expected.artist ||
        (written.album ?? '') !== expected.album ||
        (written.year ?? '') !== expected.year ||
        (written.genre ?? '') !== expected.genre
      ) {
        throw new Error('The MP3 metadata could not be written to this file.')
      }
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

async function updateMediaMetadata(
  filePath: unknown,
  rawUpdates: unknown,
): Promise<MediaMetadataUpdateResult> {
  if (typeof filePath !== 'string') throw new TypeError('A media file path is required.')
  const mediaType = mediaTypeForPath(filePath)
  if (!mediaType) throw new TypeError('A supported media file path is required.')

  const resolvedPath = path.resolve(filePath)
  const fileStats = await stat(resolvedPath)
  if (!fileStats.isFile()) throw new Error(`Not a media file: "${resolvedPath}"`)
  const updates = validateMediaMetadataUpdate(rawUpdates, mediaType)
  const isMp3 = mediaType === 'audio' && path.extname(resolvedPath).toLowerCase() === '.mp3'
  let warnings: string[] = []

  if (isMp3 && updates.mediaType === 'audio') {
    await writeMp3Metadata(resolvedPath, updates)
  } else {
    const result = await exiftool.write(resolvedPath, writeTagsForUpdate(updates))
    if (result.updated === 0 && result.unchanged === 0) {
      throw new Error('The metadata could not be written to this file format.')
    }
    warnings = result.warnings ?? []
    if (warnings.length > 0) {
      console.warn(`Some metadata could not be written for "${resolvedPath}"`, warnings)
    }
  }

  const key = cacheKey(resolvedPath)
  metadataCache.delete(key)
  const metadata = await getMediaMetadata(resolvedPath)
  return { metadata, warnings }
}

export function registerMediaMetadataIpc(): void {
  ipcMain.handle(IPC_CHANNELS.MEDIA_METADATA_GET, (_event, filePath: unknown) =>
    getMediaMetadata(filePath),
  )
  ipcMain.handle(
    IPC_CHANNELS.MEDIA_METADATA_UPDATE,
    (_event, filePath: unknown, updates: unknown) => updateMediaMetadata(filePath, updates),
  )
}
