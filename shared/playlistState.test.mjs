import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mergePersistedPlaylist,
  movePlaylistItem,
  removePlaylistItem,
} from './playlistState.ts'

const items = [
  { id: 'a', path: '/a.mp3', name: 'A' },
  { id: 'b', path: '/b.mp3', name: 'B' },
  { id: 'c', path: '/c.mp3', name: 'C' },
]

test('merging the saved queue keeps pending unique items and current selection', () => {
  const persisted = { items: [items[0], items[1]], currentIndex: 0 }
  const pending = { items: [items[1], items[2], items[2]], currentIndex: 1 }
  const result = mergePersistedPlaylist(persisted, pending)

  assert.deepEqual(result.items.map((item) => item.id), ['a', 'b', 'c'])
  assert.equal(result.currentIndex, 2)
})

test('merging without pending items restores the saved selection', () => {
  const persisted = { items, currentIndex: 2 }

  assert.equal(
    mergePersistedPlaylist(persisted, { items: [], currentIndex: -1 }),
    persisted,
  )
})

test('a delayed saved-queue read preserves items added while it was pending', async () => {
  let resolveRead
  const savedQueueRead = new Promise((resolve) => {
    resolveRead = resolve
  })
  let currentState = { items: [], currentIndex: -1 }
  const hydration = savedQueueRead.then((persisted) =>
    mergePersistedPlaylist(persisted, currentState),
  )

  currentState = { items: [items[2]], currentIndex: 0 }
  resolveRead({ items: [items[0], items[1]], currentIndex: 1 })

  assert.deepEqual(await hydration, { items, currentIndex: 2 })
})

test('moving an item keeps the currently playing item selected', () => {
  const result = movePlaylistItem({ items, currentIndex: 1 }, 1, 0)

  assert.deepEqual(result.items.map((item) => item.id), ['b', 'a', 'c'])
  assert.equal(result.currentIndex, 0)
})

test('moving outside the queue leaves the state unchanged', () => {
  const state = { items, currentIndex: 1 }

  assert.equal(movePlaylistItem(state, -1, 0), state)
  assert.equal(movePlaylistItem(state, 0, items.length), state)
})

test('removing an item preserves selection and chooses a valid replacement', () => {
  const afterCurrent = removePlaylistItem({ items, currentIndex: 2 }, 'a')
  const afterSelected = removePlaylistItem({ items, currentIndex: 1 }, 'b')

  assert.deepEqual(afterCurrent?.items.map((item) => item.id), ['b', 'c'])
  assert.equal(afterCurrent?.currentIndex, 1)
  assert.deepEqual(afterSelected?.items.map((item) => item.id), ['a', 'c'])
  assert.equal(afterSelected?.currentIndex, 1)
  assert.equal(removePlaylistItem({ items, currentIndex: 1 }, 'missing'), null)
})
