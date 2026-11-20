import assert from 'node:assert/strict'
import test from 'node:test'
import { findMediaTrack, preferredMediaTrack } from './trackSelection.ts'

const tracks = [
  { streamIndex: 0, kind: 'audio', codec: 'aac', isDefault: false },
  { streamIndex: 1, kind: 'audio', codec: 'opus', isDefault: true },
  { streamIndex: 2, kind: 'subtitle', codec: 'webvtt', isDefault: true },
]

test('track selection requires both the stream index and kind to match', () => {
  assert.equal(findMediaTrack(tracks, 'audio', 1), tracks[1])
  assert.equal(findMediaTrack(tracks, 'subtitle', 1), null)
  assert.equal(findMediaTrack(tracks, 'subtitle', 2), tracks[2])
})

test('invalid or unknown stream indices cannot select a track', () => {
  assert.equal(findMediaTrack(tracks, 'audio', -1), null)
  assert.equal(findMediaTrack(tracks, 'audio', 0.5), null)
  assert.equal(findMediaTrack(tracks, 'audio', 99), null)
})

test('preferred track chooses the default track of the requested kind', () => {
  assert.equal(preferredMediaTrack(tracks, 'audio'), tracks[1])
  assert.equal(preferredMediaTrack(tracks, 'subtitle'), tracks[2])
  assert.equal(preferredMediaTrack([], 'audio'), null)
})
