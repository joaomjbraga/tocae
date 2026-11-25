import path from 'node:path'

/** A lista canônica de extensões fica em `shared/media.ts` (usada pelo diálogo e pelo renderer). */
export function mimeTypeFor(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase()
  switch (extension) {
    case '.mp4':
    case '.m4v':
      return 'video/mp4'
    case '.webm':
      return 'video/webm'
    case '.vtt':
      return 'text/vtt'
    case '.mkv':
      return 'video/x-matroska'
    case '.avi':
      return 'video/x-msvideo'
    case '.mov':
    case '.qt':
      return 'video/quicktime'
    case '.ogv':
      return 'video/ogg'
    case '.mpg':
    case '.mpeg':
      return 'video/mpeg'
    case '.mp3':
      return 'audio/mpeg'
    case '.m4a':
      return 'audio/mp4'
    case '.aac':
      return 'audio/aac'
    case '.wav':
      return 'audio/wav'
    case '.flac':
      return 'audio/flac'
    case '.ogg':
    case '.oga':
    case '.opus':
      return 'audio/ogg'
    case '.weba':
      return 'audio/webm'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.png':
    case '.apng':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.bmp':
      return 'image/bmp'
    case '.avif':
      return 'image/avif'
    case '.heic':
      return 'image/heic'
    default:
      return 'application/octet-stream'
  }
}