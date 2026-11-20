import assert from 'node:assert/strict'
import test from 'node:test'
import { assertTrackAvailable, parseTrackIndex } from './trackSelection.ts'

const tracks = [
  { streamIndex: 0, kind: 'audio', codec: 'aac', isDefault: true },
  { streamIndex: 2, kind: 'subtitle', codec: 'webvtt', isDefault: false },
]

test('parses only safe non-negative integer stream indexes', () => {
  assert.equal(parseTrackIndex(0), 0)
  assert.equal(parseTrackIndex(2), 2)

  for (const invalid of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '2', null]) {
    assert.throws(() => parseTrackIndex(invalid), /valid media stream index/)
  }
})

test('checks that a stream index belongs to the requested track kind', () => {
  assert.doesNotThrow(() => assertTrackAvailable(tracks, 0, 'audio'))
  assert.doesNotThrow(() => assertTrackAvailable(tracks, 2, 'subtitle'))
  assert.throws(() => assertTrackAvailable(tracks, 2, 'audio'), /audio stream was not found/)
  assert.throws(() => assertTrackAvailable(tracks, 1, 'subtitle'), /subtitle stream was not found/)
})
