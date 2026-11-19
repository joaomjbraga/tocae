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

function extensionFor(source: string): string {
  const withoutQuery = source.split(/[?#]/)[0]
  return withoutQuery.slice(withoutQuery.lastIndexOf('.') + 1).toLowerCase()
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

export function isVideoPath(source: string): boolean {
  return (VIDEO_EXTENSIONS as readonly string[]).includes(extensionFor(source))
}
