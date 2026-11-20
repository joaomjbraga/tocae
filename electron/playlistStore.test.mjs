import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readPlaylistFile, writePlaylistFile } from './playlistStore.ts'

const itemA = { id: 'a', path: '/a.mp3', name: 'A' }
const itemB = { id: 'b', path: '/b.mp3', name: 'B' }

async function createTempPlaylist(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tocae-playlist-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return path.join(directory, 'playlist.json')
}

test('writing removes duplicate paths and preserves the selected item', async (t) => {
  const file = await createTempPlaylist(t)
  const duplicate = { id: 'duplicate', path: itemA.path, name: 'Duplicate A' }

  await writePlaylistFile(file, [itemA, duplicate, itemB], 2)

  assert.deepEqual(await readPlaylistFile(file), {
    items: [itemA, itemB],
    currentIndex: 1,
  })
})

test('reading filters invalid and duplicate entries without losing selection', async (t) => {
  const file = await createTempPlaylist(t)
  const duplicate = { id: 'duplicate', path: itemA.path, name: 'Duplicate A' }
  await writeFile(
    file,
    JSON.stringify({
      version: 1,
      items: [itemA, null, duplicate, itemB],
      currentIndex: 3,
    }),
  )

  assert.deepEqual(await readPlaylistFile(file), {
    items: [itemA, itemB],
    currentIndex: 1,
  })
})

test('a missing playlist file produces an empty queue', async (t) => {
  const file = await createTempPlaylist(t)

  assert.deepEqual(await readPlaylistFile(file), { items: [], currentIndex: -1 })
})

test('a malformed playlist file produces an empty queue', async (t) => {
  const file = await createTempPlaylist(t)
  await writeFile(file, '{invalid json')
  const originalWarn = console.warn
  console.warn = () => {}

  try {
    assert.deepEqual(await readPlaylistFile(file), { items: [], currentIndex: -1 })
  } finally {
    console.warn = originalWarn
  }
})

test('playlist read failures are logged and return an empty queue', async (t) => {
  const file = await createTempPlaylist(t)
  const originalWarn = console.warn
  let logged = false
  console.warn = () => {
    logged = true
  }

  try {
    assert.deepEqual(
      await readPlaylistFile(`${file}\0`),
      { items: [], currentIndex: -1 },
    )
    assert.equal(logged, true)
  } finally {
    console.warn = originalWarn
  }
})

test('playlist write failures reject instead of reporting success', async (t) => {
  const file = await createTempPlaylist(t)
  const blockingFile = `${file}.parent`
  await writeFile(blockingFile, 'not a directory')

  await assert.rejects(
    writePlaylistFile(path.join(blockingFile, 'playlist.json'), [itemA], 0),
  )
})
