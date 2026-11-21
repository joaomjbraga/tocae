export const MAX_VIDEO_ANALYSIS_FRAMES = 8
export const MAX_VIDEO_ANALYSIS_DURATION_SECONDS = 10 * 60

export function sampleVideoFrameTimestamps(durationSeconds: number): number[] {
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > MAX_VIDEO_ANALYSIS_DURATION_SECONDS
  ) {
    throw new RangeError('Video duration must be greater than zero and at most 10 minutes.')
  }
  const frameCount = Math.min(MAX_VIDEO_ANALYSIS_FRAMES, Math.ceil(durationSeconds))
  return Array.from(
    { length: frameCount },
    (_, index) => durationSeconds * (index + 1) / (frameCount + 1),
  )
}
