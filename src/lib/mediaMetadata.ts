import type { MediaMetadata, MediaType } from '@shared/media'
import { formatTime } from './format'

function formatFileSize(size: number, locale: string): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = size
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)} ${units[unitIndex]}`
}

function formatDate(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(timestamp))
}

export function summarizeMediaMetadata(
  type: MediaType,
  metadata: MediaMetadata,
  locale: string,
): string {
  const details: string[] = []

  if (type === 'audio') {
    if (metadata.artist) details.push(metadata.artist)
    if (metadata.album) details.push(metadata.album)
    if (metadata.year) details.push(String(metadata.year))
    if (metadata.genres?.length) details.push(metadata.genres.join(', '))
    if (metadata.duration) details.push(formatTime(metadata.duration))
  } else if (type === 'video') {
    if (metadata.duration) details.push(formatTime(metadata.duration))
    if (metadata.width && metadata.height) details.push(`${metadata.width} × ${metadata.height}`)
    if (metadata.codec) details.push(metadata.codec)
    if (metadata.description) details.push(metadata.description)
    if (metadata.capturedAt) details.push(formatDate(metadata.capturedAt, locale))
  } else {
    if (metadata.width && metadata.height) details.push(`${metadata.width} × ${metadata.height}`)
    if (metadata.camera) details.push(metadata.camera)
    if (metadata.capturedAt) details.push(formatDate(metadata.capturedAt, locale))
    if (metadata.description) details.push(metadata.description)
  }

  details.push(formatFileSize(metadata.fileSize, locale))
  details.push(formatDate(metadata.modifiedAt, locale))
  return details.join(' · ')
}
