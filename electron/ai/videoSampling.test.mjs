import assert from 'node:assert/strict'
import test from 'node:test'
import {
  MAX_VIDEO_ANALYSIS_DURATION_SECONDS,
  MAX_VIDEO_ANALYSIS_FRAMES,
  sampleVideoFrameTimestamps,
} from './videoSampling.ts'

test('samples frame timestamps in order and stays inside the video duration', () => {
  assert.deepEqual(sampleVideoFrameTimestamps(3), [0.75, 1.5, 2.25])

  const timestamps = sampleVideoFrameTimestamps(MAX_VIDEO_ANALYSIS_DURATION_SECONDS)
  assert.equal(timestamps.length, MAX_VIDEO_ANALYSIS_FRAMES)
  assert.ok(timestamps[0] > 0)
  assert.ok(timestamps.at(-1) < MAX_VIDEO_ANALYSIS_DURATION_SECONDS)
  assert.deepEqual(timestamps, [...timestamps].sort((left, right) => left - right))
})

test('rejects invalid and over-limit video durations', () => {
  for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => sampleVideoFrameTimestamps(duration), RangeError)
  }
  assert.throws(
    () => sampleVideoFrameTimestamps(MAX_VIDEO_ANALYSIS_DURATION_SECONDS + 1),
    /at most 10 minutes/,
  )
})
