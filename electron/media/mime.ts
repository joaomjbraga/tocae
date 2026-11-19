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
    case '.mkv':
      return 'video/x-matroska'
    case '.avi':
      return 'video/x-msvideo'
    case '.mov':
    case '.qt':
      return 'video/quicktime'
    case '.ogv':
    case '.ogg':
      return 'video/ogg'
    case '.mpg':
    case '.mpeg':
      return 'video/mpeg'
    default:
      return 'application/octet-stream'
  }
}