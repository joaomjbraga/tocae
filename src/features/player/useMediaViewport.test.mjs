import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateWheelZoom } from './useMediaViewport.ts'

test('wheel zoom keeps the point under the cursor anchored', () => {
  const original = { zoom: 1.5, pan: { x: 12, y: -8 }, pointer: { x: 80, y: 45 } }
  const transformed = calculateWheelZoom(
    original.zoom,
    original.pan,
    original.pointer,
    -100,
  )

  assert.ok(transformed.zoom > original.zoom)
  assert.ok(
    Math.abs(
      (original.pointer.x - original.pan.x) / original.zoom -
        (original.pointer.x - transformed.pan.x) / transformed.zoom,
    ) < 1e-10,
  )
})

test('wheel zoom remains within its minimum and maximum bounds', () => {
  const basePan = { x: 0, y: 0 }
  const pointer = { x: 0, y: 0 }
  assert.equal(calculateWheelZoom(1, basePan, pointer, 1000).zoom, 1)
  assert.equal(calculateWheelZoom(3, basePan, pointer, -1000).zoom, 3)
})

