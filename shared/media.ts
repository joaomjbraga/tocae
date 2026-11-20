export const VIDEO_EXTENSIONS = [
  'mp4',
  'webm',
  'mkv',
  'avi',
  'mov',
  'qt',
  'm4v',
  'ogv',
  'mpg',
  'mpeg',
] as const

export const AUDIO_EXTENSIONS = [
  'mp3',
  'm4a',
  'aac',
  'wav',
  'flac',
  'ogg',
  'oga',
  'opus',
  'weba',
] as const

export const IMAGE_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'apng',
  'webp',
  'gif',
  'bmp',
  'avif',
] as const

export const MEDIA_EXTENSIONS = [
  ...new Set([...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS, ...IMAGE_EXTENSIONS]),
]

export type MediaType = 'video' | 'audio' | 'image'

export interface MediaMetadata {
  fileSize: number
  modifiedAt: number
  title?: string
  artist?: string
  album?: string
  description?: string
  year?: number
  genres?: string[]
  duration?: number
  codec?: string
  width?: number
  height?: number
  capturedAt?: number
  camera?: string
  coverArt?: string
}


function extensionFor(source: string): string {
  const isUrl = /^[a-z][a-z\d+.-]*:\/\//i.test(source)
  const path = isUrl ? source.split(/[?#]/, 1)[0] : source
  const fileName = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
  const extensionStart = fileName.lastIndexOf('.')
  return extensionStart < 0 ? '' : fileName.slice(extensionStart + 1).toLowerCase()
}

export function mediaTypeForPath(source: string): MediaType | null {
  const extension = extensionFor(source)
  if ((VIDEO_EXTENSIONS as readonly string[]).includes(extension)) return 'video'
  if ((AUDIO_EXTENSIONS as readonly string[]).includes(extension)) return 'audio'
  if ((IMAGE_EXTENSIONS as readonly string[]).includes(extension)) return 'image'
  return null
}

export function isMediaPath(source: string): boolean {
  return mediaTypeForPath(source) !== null
}
