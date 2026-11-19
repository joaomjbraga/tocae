import { isMediaPath } from '@shared/media'

export function toMediaUrl(filePath: string): string {
  const segments = filePath.split('/').map(encodeURIComponent)
  return `media://file/${segments.join('/')}`
}

export function isMediaFile(file: File): boolean {
  return isMediaPath(file.name)
}
