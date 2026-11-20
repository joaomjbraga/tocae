import assert from 'node:assert/strict'
import test from 'node:test'
import { releaseStaleTrackOutput } from './trackOutput.ts'

test('an output for a changed media item is released instead of applied', async () => {
  let activeFilePath = '/first.mp4'
  const released = []
  const getActiveFilePath = () => activeFilePath
  const release = async (path) => released.push(path)

  activeFilePath = '/second.mp4'
  const wasReleased = await releaseStaleTrackOutput(
    '/first.mp4',
    getActiveFilePath,
    '/tmp/selected-audio.mkv',
    release,
  )

  assert.equal(wasReleased, true)
  assert.deepEqual(released, ['/tmp/selected-audio.mkv'])
})

test('an output for the active media item is kept', async () => {
  const released = []
  const wasReleased = await releaseStaleTrackOutput(
    '/active.mp4',
    () => '/active.mp4',
    '/tmp/selected-subtitle.vtt',
    async (path) => released.push(path),
  )

  assert.equal(wasReleased, false)
  assert.deepEqual(released, [])
})
