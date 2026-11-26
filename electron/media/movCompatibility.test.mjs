import assert from 'node:assert/strict'
import test from 'node:test'
import { canRemuxMovVideo, movVideoEncodingArgs } from './movCompatibility.ts'

test('allows remuxing browser-compatible H.264 MOV video without re-encoding', () => {
  assert.equal(canRemuxMovVideo('h264', 'yuv420p'), true)
})

test('requires conversion for codecs or pixel formats that may not be browser-compatible', () => {
  assert.equal(canRemuxMovVideo('hevc', 'yuv420p'), false)
  assert.equal(canRemuxMovVideo('h264', 'yuv420p10le'), false)
  assert.equal(canRemuxMovVideo('prores', 'yuv422p10le'), false)
})

test('preserves HDR with HEVC when the player supports it', () => {
  const args = movVideoEncodingArgs(
    { codecName: 'hevc', pixelFormat: 'yuv420p10le', colorTransfer: 'smpte2084' },
    true,
  )
  assert.deepEqual(args, ['-c:v', 'copy', '-tag:v', 'hvc1'])
})

test('re-encodes HDR HEVC when its pixel format is unsupported', () => {
  const args = movVideoEncodingArgs(
    { codecName: 'hevc', pixelFormat: 'yuv422p10le', colorTransfer: 'smpte2084' },
    true,
  )
  assert.ok(args.includes('libx265'))
  assert.ok(args.includes('yuv420p10le'))
})

test('does not pass HDR H.264 through as SDR-compatible video', () => {
  const args = movVideoEncodingArgs(
    { codecName: 'h264', pixelFormat: 'yuv420p', colorTransfer: 'smpte2084' },
    true,
  )
  assert.ok(args.includes('libx265'))
})

test('uses 10-bit HEVC to retain HDR when re-encoding is needed and supported', () => {
  const args = movVideoEncodingArgs(
    {
      codecName: 'prores',
      pixelFormat: 'yuv422p10le',
      colorTransfer: 'smpte2084',
      colorPrimaries: 'bt2020',
      colorSpace: 'bt2020nc',
    },
    true,
  )
  assert.ok(args.includes('libx265'))
  assert.ok(args.includes('yuv420p10le'))
  assert.ok(args.includes('hdr10=1:hdr10-opt=1'))
})

test('tone maps HDR to SDR when HEVC playback is unavailable', () => {
  const args = movVideoEncodingArgs(
    { codecName: 'prores', pixelFormat: 'yuv422p10le', colorTransfer: 'arib-std-b67' },
    false,
  )
  assert.ok(args.includes('libx264'))
  assert.ok(args.some((argument) => argument.includes('tonemap=tonemap=hable')))
  assert.ok(args.includes('bt709'))
})
