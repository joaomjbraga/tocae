import assert from 'node:assert/strict'
import test from 'node:test'
import { selectContinuePlaybackItems } from './continuePlayback.ts'

const libraryItems = [
  { path: '/media/episode.mp4', name: 'Episode', relativePath: 'episode.mp4', folderId: 'one', type: 'video' },
  { path: '/media/album.flac', name: 'Album', relativePath: 'album.flac', folderId: 'one', type: 'audio' },
  { path: '/media/photo.jpg', name: 'Photo', relativePath: 'photo.jpg', folderId: 'one', type: 'image' },
]

test('selects recent resumable media that still belongs to the library', () => {
  const selected = selectContinuePlaybackItems(
    libraryItems,
    [
      { source: '/media/album.flac', position: 42, duration: 240 },
      { source: '/media/missing.mp4', position: 15 },
      { source: '/media/photo.jpg', position: 9 },
      { source: '/media/episode.mp4', position: 120 },
    ],
    (path) => path,
  )

  assert.deepEqual(
    selected.map(({ item, position }) => [item.name, position]),
    [
      ['Album', 42],
      ['Episode', 120],
    ],
  )
})

test('limits the continue section to the six most recently saved items', () => {
  const items = Array.from({ length: 7 }, (_, index) => ({
    path: `/media/${index}.mp4`,
    name: `Video ${index}`,
    relativePath: `${index}.mp4`,
    folderId: 'one',
    type: 'video',
  }))
  const positions = items.map((item, index) => ({
    source: item.path,
    position: index + 1,
  }))

  assert.deepEqual(
    selectContinuePlaybackItems(items, positions, (path) => path).map(({ item }) => item.name),
    ['Video 0', 'Video 1', 'Video 2', 'Video 3', 'Video 4', 'Video 5'],
  )
})
