import assert from 'node:assert/strict'
import test from 'node:test'
import { MovPlaybackCache } from './movPlaybackCache.ts'

test('reuses a cached MOV output until the cache limit evicts it', async () => {
  const released = []
  const sizes = new Map([
    ['/tmp/one.mp4', 6],
    ['/tmp/two.mp4', 6],
  ])
  const cache = new MovPlaybackCache({
    getSize: async (outputPath) => sizes.get(outputPath),
    releaseOutput: async (outputPath) => released.push(outputPath),
    maxBytes: 10,
    maxEntries: 2,
  })
  let firstConversionCount = 0
  const createFirst = async () => {
    firstConversionCount += 1
    return '/tmp/one.mp4'
  }

  const first = await cache.acquire('first', createFirst, new AbortController().signal)
  await cache.release(first)
  const reused = await cache.acquire('first', createFirst, new AbortController().signal)
  assert.equal(firstConversionCount, 1)
  await cache.release(reused)

  const second = await cache.acquire(
    'second',
    async () => '/tmp/two.mp4',
    new AbortController().signal,
  )
  assert.deepEqual(released, ['/tmp/one.mp4'])
  await cache.release(second)
  await cache.cleanup(() => assert.fail('Unexpected cache cleanup error'))
  assert.deepEqual(released, ['/tmp/one.mp4', '/tmp/two.mp4'])
})

test('releases a completed output when its request is cancelled', async () => {
  const released = []
  const cache = new MovPlaybackCache({
    getSize: async () => 1,
    releaseOutput: async (outputPath) => released.push(outputPath),
  })
  const controller = new AbortController()

  await assert.rejects(
    cache.acquire(
      'cancelled',
      async (signal) => {
        controller.abort()
        assert.equal(signal.aborted, true)
        return '/tmp/cancelled.mp4'
      },
      controller.signal,
    ),
    { name: 'AbortError' },
  )
  assert.deepEqual(released, ['/tmp/cancelled.mp4'])
})
