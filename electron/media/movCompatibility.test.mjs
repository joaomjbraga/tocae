import assert from 'node:assert/strict'
import test from 'node:test'
import { canRemuxMovVideo } from './movCompatibility.ts'

test('allows remuxing browser-compatible H.264 MOV video without re-encoding', () => {
  assert.equal(canRemuxMovVideo('h264', 'yuv420p'), true)
})

test('requires conversion for codecs or pixel formats that may not be browser-compatible', () => {
  assert.equal(canRemuxMovVideo('hevc', 'yuv420p'), false)
  assert.equal(canRemuxMovVideo('h264', 'yuv420p10le'), false)
  assert.equal(canRemuxMovVideo('prores', 'yuv422p10le'), false)
})
