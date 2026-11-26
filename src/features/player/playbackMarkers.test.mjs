import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addPlaybackMarker,
  getPlaybackMarkers,
  removePlaybackMarker,
  updatePlaybackMarkerLabel,
} from './playbackMarkers.ts'

const storage = new Map()
globalThis.window = {
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  },
}

test('persists markers per media, sorts them, renames and removes them', () => {
  const source = '/media/movie.mp4'
  const later = addPlaybackMarker(source, 30)[0]
  const earlier = addPlaybackMarker(source, 10)[0]

  assert.deepEqual(
    getPlaybackMarkers(source).map(({ time }) => time),
    [10, 30],
  )
  assert.deepEqual(
    updatePlaybackMarkerLabel(source, earlier.id, 'Intro').map(({ label }) => label),
    ['Intro', ''],
  )
  assert.deepEqual(
    removePlaybackMarker(source, later.id).map(({ time }) => time),
    [10],
  )
  assert.deepEqual(getPlaybackMarkers('/media/other.mp4'), [])
})

test('rejects invalid marker times and enforces a per-media limit', () => {
  assert.throws(() => addPlaybackMarker('/media/movie.mp4', Number.NaN), TypeError)
  for (let index = 0; index < 100; index += 1) {
    addPlaybackMarker('/media/long.mp4', index)
  }
  assert.throws(() => addPlaybackMarker('/media/long.mp4', 100), RangeError)
})
