import assert from 'node:assert/strict'
import test from 'node:test'
import { IMAGE_EXTENSIONS, MEDIA_EXTENSIONS, isMediaPath, mediaTypeForPath } from './media.ts'

test('recognizes HEIC files as images in every media path', () => {
  assert.ok(IMAGE_EXTENSIONS.includes('heic'))
  assert.ok(MEDIA_EXTENSIONS.includes('heic'))
  assert.equal(mediaTypeForPath('/photos/IMG_1234.HEIC'), 'image')
  assert.equal(isMediaPath('C:\\photos\\IMG_1234.HEIC'), true)
})
