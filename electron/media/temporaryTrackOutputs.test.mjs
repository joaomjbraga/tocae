import assert from 'node:assert/strict'
import test from 'node:test'
import path from 'node:path'
import { TemporaryTrackOutputs } from './temporaryTrackOutputs.ts'

function createTrackOutputs(directory, removed = []) {
  return new TemporaryTrackOutputs({
    createDirectory: async () => directory,
    removeDirectory: async (target) => removed.push(target),
  })
}

test('failed extraction removes its temporary directory', async () => {
  const directory = path.join(path.sep, 'tmp', 'track-output-failure')
  const removed = []
  const outputs = createTrackOutputs(directory, removed)
  const extractionError = new Error('FFmpeg failed')

  await assert.rejects(
    outputs.create('selected-audio.mkv', async () => {
      throw extractionError
    }),
    extractionError,
  )

  assert.deepEqual(removed, [directory])
})

test('only registered outputs can be released', async () => {
  const directory = path.join(path.sep, 'tmp', 'track-output-owned')
  const removed = []
  const outputs = createTrackOutputs(directory, removed)
  const outputPath = await outputs.create('selected-subtitle.vtt', async () => {})

  await assert.rejects(
    outputs.release(path.join(directory, 'other-file.vtt')),
    /not owned by this session/,
  )
  await outputs.release(outputPath)
  assert.deepEqual(removed, [directory])
  await assert.rejects(outputs.release(outputPath), /not owned by this session/)
})

test('cleanup removes all outstanding output directories', async () => {
  const directories = [
    path.join(path.sep, 'tmp', 'track-output-one'),
    path.join(path.sep, 'tmp', 'track-output-two'),
  ]
  const removed = []
  let nextDirectory = 0
  const outputs = new TemporaryTrackOutputs({
    createDirectory: async () => directories[nextDirectory++],
    removeDirectory: async (directory) => removed.push(directory),
  })
  await outputs.create('selected-audio.mkv', async () => {})
  await outputs.create('selected-subtitle.vtt', async () => {})

  await outputs.cleanup(() => assert.fail('Unexpected cleanup error'))

  assert.deepEqual(removed, directories)
})
