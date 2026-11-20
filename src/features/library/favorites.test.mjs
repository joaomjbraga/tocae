import assert from 'node:assert/strict'
import test from 'node:test'
import { readFavoritePaths, saveFavoritePaths, toggleFavoritePath } from './favorites.ts'

function createStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

test('favorite toggles do not mutate the existing set', () => {
  const favorites = new Set(['/one.mp3'])

  const added = toggleFavoritePath(favorites, '/two.mp3')
  const removed = toggleFavoritePath(added, '/one.mp3')

  assert.deepEqual([...favorites], ['/one.mp3'])
  assert.deepEqual([...added], ['/one.mp3', '/two.mp3'])
  assert.deepEqual([...removed], ['/two.mp3'])
})

test('favorites persist and load from storage', () => {
  const storage = createStorage()
  const favorites = new Set(['/one.mp3', '/two.mp3'])

  saveFavoritePaths(favorites, storage)

  assert.deepEqual(readFavoritePaths(storage), favorites)
})

test('invalid saved favorites are ignored', () => {
  const storage = {
    getItem: () => '{invalid json',
    setItem: () => {},
  }
  const originalError = console.error
  console.error = () => {}

  try {
    assert.deepEqual(readFavoritePaths(storage), new Set())
  } finally {
    console.error = originalError
  }
})

test('unavailable browser storage returns an empty favorites set', () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const originalError = console.error
  console.error = () => {}
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      get localStorage() {
        throw new Error('Storage is unavailable')
      },
    },
  })

  try {
    assert.deepEqual(readFavoritePaths(), new Set())
  } finally {
    console.error = originalError
    if (originalDescriptor) {
      Object.defineProperty(globalThis, 'window', originalDescriptor)
    } else {
      delete globalThis.window
    }
  }
})

test('storage write failures are surfaced to the caller', () => {
  const storage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('Storage is full')
    },
  }

  assert.throws(() => saveFavoritePaths(new Set(['/one.mp3']), storage), /Storage is full/)
})
