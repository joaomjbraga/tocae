import { createRequire } from 'node:module'
import type { Buffer } from 'node:buffer'

type HeicConvert = (options: {
  buffer: Buffer
  format: 'JPEG'
  quality: number
}) => Promise<Buffer>

const require = createRequire(import.meta.url)
const convertHeic = require('heic-convert') as HeicConvert

export function convertHeicToJpeg(buffer: Buffer): Promise<Buffer> {
  return convertHeic({ buffer, format: 'JPEG', quality: 0.92 })
}
