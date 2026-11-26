import assert from 'node:assert/strict'
import test from 'node:test'
import { mimeTypeFor } from './mime.ts'

test('returns the HEIC MIME type for HEIC files', () => {
  assert.equal(mimeTypeFor('/photos/IMG_1234.HEIC'), 'image/heic')
})

test('returns the QuickTime MIME type for MOV files', () => {
  assert.equal(mimeTypeFor('/videos/clip.MOV'), 'video/quicktime')
})
