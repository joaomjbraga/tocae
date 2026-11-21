import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  createSavedPlaylistFile,
  deleteSavedPlaylistFile,
  readSavedPlaylistsFile,
  updateSavedPlaylistFile,
} from './savedPlaylistStore.ts'

const firstItem = { id: 'one', path: '/music/one.mp3', name: 'One' }
const secondItem = { id: 'two', path: '/music/two.mp3', name: 'Two' }

async function createTempFile(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tocae-saved-playlists-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return path.join(directory, 'saved-playlists.json')
}

test('saved playlists can be created, edited, read, and deleted without changing their identity', async (t) => {
  const file = await createTempFile(t)
  const created = await createSavedPlaylistFile(file, '  Evening mix  ', [firstItem, firstItem, secondItem])

  assert.equal(created.name, 'Evening mix')
  assert.deepEqual(created.items, [firstItem, secondItem])
  assert.deepEqual(await readSavedPlaylistsFile(file), [created])

  const updated = await updateSavedPlaylistFile(file, created.id, 'Night mix', [secondItem])
  assert.equal(updated.id, created.id)
  assert.equal(updated.createdAt, created.createdAt)
  assert.equal(updated.name, 'Night mix')
  assert.deepEqual(updated.items, [secondItem])

  assert.equal(await deleteSavedPlaylistFile(file, created.id), true)
  assert.equal(await deleteSavedPlaylistFile(file, created.id), false)
  assert.deepEqual(await readSavedPlaylistsFile(file), [])
})

test('saved playlist writes reject invalid names and non-local items', async (t) => {
  const file = await createTempFile(t)

  await assert.rejects(createSavedPlaylistFile(file, '  ', [firstItem]), /nome da playlist/)
  await assert.rejects(createSavedPlaylistFile(file, 'Mix', [{ ...firstItem, path: 'relative.mp3' }]), /itens da playlist/)
  await assert.rejects(createSavedPlaylistFile(file, 'Mix', []), /itens da playlist/)
  assert.deepEqual(await readSavedPlaylistsFile(file), [])
})

test('reading saved playlists filters malformed and duplicate records', async (t) => {
  const file = await createTempFile(t)
  const duplicate = { ...firstItem, id: 'duplicate' }
  await writeFile(file, JSON.stringify({
    version: 1,
    playlists: [
      {
        id: 'saved-one',
        name: 'First',
        items: [firstItem, duplicate, null],
        createdAt: 1,
        updatedAt: 2,
      },
      {
        id: 'saved-one',
        name: 'Duplicate ID',
        items: [secondItem],
        createdAt: 1,
        updatedAt: 2,
      },
      { id: 'invalid' },
    ],
  }))

  const playlists = await readSavedPlaylistsFile(file)
  assert.equal(playlists.length, 1)
  assert.deepEqual(playlists[0].items, [firstItem])
})

test('reading saved playlists repairs duplicate item identifiers', async (t) => {
  const file = await createTempFile(t)
  await writeFile(file, JSON.stringify({
    version: 1,
    playlists: [{
      id: 'saved-one',
      name: 'First',
      items: [firstItem, { ...secondItem, id: firstItem.id }],
      createdAt: 1,
      updatedAt: 2,
    }],
  }))

  const [playlist] = await readSavedPlaylistsFile(file)
  assert.equal(playlist.items.length, 2)
  assert.notEqual(playlist.items[0].id, playlist.items[1].id)
})
