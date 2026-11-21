import assert from 'node:assert/strict'
import test from 'node:test'
import { lstat, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
  applyOrganizationPlan,
  buildOrganizationPlan,
  undoOrganizationMoves,
} from './organizationPlan.ts'
import {
  readOrganizationUndoStore,
  writeOrganizationUndoStore,
} from './organizationUndoStore.ts'

const options = {
  unknownArtist: 'Unknown Artist',
  unknownAlbum: 'Unknown Album',
  videoFolder: 'Videos',
  imageFolder: 'Images',
}

async function createLibrary(root, items) {
  const inbox = path.join(root, 'Inbox')
  await mkdir(inbox)
  const libraryItems = []
  for (const item of items) {
    const filePath = item.pathFromRoot
      ? path.join(root, item.pathFromRoot)
      : path.join(inbox, item.source ?? item.name)
    await mkdir(path.dirname(filePath), { recursive: true })
    await writeFile(filePath, 'fixture')
    libraryItems.push({
      path: filePath,
      name: item.name,
      relativePath: path.relative(root, filePath).replace(/\\/g, '/'),
      folderId: 'music',
      type: item.type,
    })
  }
  return {
    folders: [{
      id: 'music',
      kind: 'custom',
      name: 'Music',
      path: root,
    }],
    items: libraryItems,
    unavailableFolderIds: [],
  }
}

test('builds a safe read-only preview using audio tags and media types', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tocae-organization-plan-'))
  try {
    const library = await createLibrary(root, [
      { name: 'track.mp3', type: 'audio' },
      { name: 'clip.mp4', type: 'video' },
      { name: 'cover.jpg', type: 'image' },
      { name: 'already.mp3', pathFromRoot: 'Artist/Album/already.mp3', type: 'audio' },
    ])
    const plan = await buildOrganizationPlan(
      library,
      async (filePath) => filePath.endsWith('already.mp3')
        ? {
            fileSize: 7,
            modifiedAt: 1,
            artist: 'Artist',
            album: 'Album',
          }
        : {
            fileSize: 7,
            modifiedAt: 1,
            artist: '../outside',
            album: 'Album\\Name',
          },
      options,
    )

    assert.deepEqual(
      plan.entries.map(({ targetRelativePath, status }) => ({ targetRelativePath, status })),
      [
        { targetRelativePath: '.._outside/Album_Name/track.mp3', status: 'ready' },
        { targetRelativePath: 'Videos/clip.mp4', status: 'ready' },
        { targetRelativePath: 'Images/cover.jpg', status: 'ready' },
        { targetRelativePath: 'Artist/Album/already.mp3', status: 'already-organized' },
      ],
    )
    assert.equal(plan.readyItems, 3)
    assert.equal(plan.alreadyOrganizedItems, 1)
    assert.equal(plan.omittedItems, 0)
    for (const item of library.items) {
      await lstat(item.path)
    }
    for (const entry of plan.entries.filter((item) => item.status !== 'already-organized')) {
      await assert.rejects(
        lstat(path.join(root, ...entry.targetRelativePath.split('/'))),
        { code: 'ENOENT' },
      )
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('marks existing and duplicate targets as conflicts without changing files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tocae-organization-conflicts-'))
  try {
    const library = await createLibrary(root, [
      { name: 'same.mp3', source: 'Disc 1/same.mp3', type: 'audio' },
      { name: 'same.mp3', source: 'Disc 2/same.mp3', type: 'audio' },
      { name: 'clip.mp4', type: 'video' },
    ])
    const videoTarget = path.join(root, 'Videos')
    await mkdir(videoTarget)
    await writeFile(path.join(videoTarget, 'clip.mp4'), 'existing target')

    const plan = await buildOrganizationPlan(
      library,
      async () => ({
        fileSize: 7,
        modifiedAt: 1,
        artist: 'Artist',
        album: 'Album',
      }),
      options,
    )

    assert.deepEqual(
      plan.entries.map((entry) => entry.status),
      ['target-conflict', 'target-conflict', 'target-conflict'],
    )
    assert.equal(plan.conflictItems, 3)
    assert.equal(await (await lstat(path.join(videoTarget, 'clip.mp4'))).isFile(), true)
    for (const item of library.items) {
      await lstat(item.path)
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('limits large previews and reports omitted library items', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tocae-organization-limit-'))
  try {
    const library = {
      folders: [{
        id: 'pictures',
        kind: 'custom',
        name: 'Pictures',
        path: root,
      }],
      items: Array.from({ length: 502 }, (_, index) => ({
        path: path.join(root, `photo-${index}.jpg`),
        name: `photo-${index}.jpg`,
        relativePath: `photo-${index}.jpg`,
        folderId: 'pictures',
        type: 'image',
      })),
      unavailableFolderIds: [],
    }
    const plan = await buildOrganizationPlan(library, async () => {
      throw new Error('Image plans must not read audio metadata.')
    }, options)

    assert.equal(plan.totalItems, 502)
    assert.equal(plan.includedItems, 500)
    assert.equal(plan.omittedItems, 2)
    assert.equal(plan.readyItems, 500)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('applies only ready items and can undo the moves', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tocae-organization-apply-'))
  try {
    const library = await createLibrary(root, [
      { name: 'move.mp4', type: 'video' },
    ])
    const source = library.items[0].path

    const result = await applyOrganizationPlan(library, async () => {
      throw new Error('Video metadata is not needed.')
    }, options)

    assert.equal(result.appliedItems, 1)
    assert.equal(result.failedItems, 0)
    assert.equal(result.undoAvailable, true)
    await assert.rejects(lstat(source), { code: 'ENOENT' })
    await lstat(path.join(root, 'Videos', 'move.mp4'))

    const undo = await undoOrganizationMoves(result.moves)
    assert.equal(undo.appliedItems, 1)
    await lstat(source)
    await assert.rejects(lstat(path.join(root, 'Videos', 'move.mp4')), { code: 'ENOENT' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('does not overwrite an existing destination', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tocae-organization-no-overwrite-'))
  try {
    const library = await createLibrary(root, [
      { name: 'existing.jpg', type: 'image' },
    ])
    const source = library.items[0].path
    const destinationFolder = path.join(root, 'Images')
    await mkdir(destinationFolder)
    await writeFile(path.join(destinationFolder, 'existing.jpg'), 'do not replace')

    const result = await applyOrganizationPlan(library, async () => {
      throw new Error('Image metadata is not needed.')
    }, options)

    assert.equal(result.appliedItems, 0)
    assert.equal(result.skippedItems, 1)
    await lstat(source)
    assert.equal(
      await (await lstat(path.join(destinationFolder, 'existing.jpg'))).isFile(),
      true,
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('persists organization moves for undo after a restart', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tocae-organization-journal-'))
  try {
    const journal = path.join(root, 'ai-organization-undo.json')
    const moves = [{
      sourcePath: path.join(root, 'Artist', 'track.mp3'),
      destinationPath: path.join(root, 'Music', 'track.mp3'),
    }]
    await writeOrganizationUndoStore(journal, moves)
    assert.deepEqual(await readOrganizationUndoStore(journal), moves)

    await writeOrganizationUndoStore(journal, [])
    assert.deepEqual(await readOrganizationUndoStore(journal), [])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
