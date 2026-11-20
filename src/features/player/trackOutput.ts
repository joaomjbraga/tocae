export async function releaseStaleTrackOutput(
  requestedFilePath: string,
  getActiveFilePath: () => string | null,
  outputPath: string,
  releaseOutput: (path: string) => Promise<void>,
): Promise<boolean> {
  if (getActiveFilePath() === requestedFilePath) return false
  await releaseOutput(outputPath)
  return true
}
