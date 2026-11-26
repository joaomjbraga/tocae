import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getSavedPlaybackPositions,
  PLAYBACK_PROGRESS_CHANGED_EVENT,
  savePlaybackPosition,
} from './playbackProgress.ts'

test('returns resumable items newest-first and notifies the library about progress changes', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const values = new Map()
  const events = []
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
      },
      dispatchEvent: (event) => events.push(event.type),
    },
  })

  try {
    savePlaybackPosition('/media/first.mp4', 15, 120)
    savePlaybackPosition('/media/second.mp3', 42, 240)
    savePlaybackPosition('/media/first.mp4', 30)

    assert.deepEqual(getSavedPlaybackPositions(), [
      { source: '/media/first.mp4', position: 30, duration: 120 },
      { source: '/media/second.mp3', position: 42, duration: 240 },
    ])
    assert.deepEqual(events, Array(3).fill(PLAYBACK_PROGRESS_CHANGED_EVENT))

    savePlaybackPosition('/media/first.mp4', 0)
    assert.deepEqual(getSavedPlaybackPositions(), [
      { source: '/media/second.mp3', position: 42, duration: 240 },
    ])

    values.set(
      'tocae.playback-progress.v1',
      JSON.stringify({ '/media/legacy.mp4': 18 }),
    )
    assert.deepEqual(getSavedPlaybackPositions(), [
      { source: '/media/legacy.mp4', position: 18 },
    ])
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow)
    } else {
      delete globalThis.window
    }
  }
})
