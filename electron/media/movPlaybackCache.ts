type MovPlaybackCacheEntry = {
  key: string
  outputPath: string
  size: number
  references: number
}

type MovPlaybackCacheDependencies = {
  getSize: (outputPath: string) => Promise<number>
  releaseOutput: (outputPath: string) => Promise<void>
  maxBytes?: number
  maxEntries?: number
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return
  const error = new Error('MOV playback preparation was cancelled.')
  error.name = 'AbortError'
  throw error
}

export class MovPlaybackCache {
  private readonly dependencies: MovPlaybackCacheDependencies
  private readonly entries = new Map<string, MovPlaybackCacheEntry>()
  private readonly entriesByOutput = new Map<string, MovPlaybackCacheEntry>()
  private readonly maxBytes: number
  private readonly maxEntries: number
  private cachedBytes = 0

  constructor(dependencies: MovPlaybackCacheDependencies) {
    this.dependencies = dependencies
    this.maxBytes = dependencies.maxBytes ?? 1024 * 1024 * 1024
    this.maxEntries = dependencies.maxEntries ?? 5
  }

  async acquire(
    key: string,
    createOutput: (signal: AbortSignal) => Promise<string>,
    signal: AbortSignal,
  ): Promise<string> {
    throwIfAborted(signal)

    const cached = this.entries.get(key)
    if (cached) {
      cached.references += 1
      this.touch(cached)
      return cached.outputPath
    }

    const outputPath = await createOutput(signal)
    let size: number
    try {
      throwIfAborted(signal)
      size = await this.dependencies.getSize(outputPath)
      throwIfAborted(signal)
    } catch (error) {
      await this.dependencies.releaseOutput(outputPath)
      throw error
    }

    const existing = this.entries.get(key)
    if (existing) {
      existing.references += 1
      this.touch(existing)
      await this.dependencies.releaseOutput(outputPath)
      return existing.outputPath
    }

    if (size > this.maxBytes) return outputPath

    const entry: MovPlaybackCacheEntry = {
      key,
      outputPath,
      size,
      references: 1,
    }
    this.entries.set(key, entry)
    this.entriesByOutput.set(outputPath, entry)
    this.cachedBytes += size
    await this.evict()
    return outputPath
  }

  async release(outputPath: string): Promise<boolean> {
    const entry = this.entriesByOutput.get(outputPath)
    if (!entry) return false
    if (entry.references === 0) {
      throw new TypeError('The MOV playback output has no active references.')
    }

    entry.references -= 1
    await this.evict()
    return true
  }

  async cleanup(onError: (outputPath: string, error: unknown) => void): Promise<void> {
    const entries = [...this.entries.values()]
    this.entries.clear()
    this.entriesByOutput.clear()
    this.cachedBytes = 0

    await Promise.all(
      entries.map(async ({ outputPath }) => {
        try {
          await this.dependencies.releaseOutput(outputPath)
        } catch (error) {
          onError(outputPath, error)
        }
      }),
    )
  }

  private touch(entry: MovPlaybackCacheEntry): void {
    this.entries.delete(entry.key)
    this.entries.set(entry.key, entry)
  }

  private async evict(): Promise<void> {
    while (this.cachedBytes > this.maxBytes || this.entries.size > this.maxEntries) {
      const oldestUnused = [...this.entries.values()].find((entry) => entry.references === 0)
      if (!oldestUnused) return

      this.entries.delete(oldestUnused.key)
      this.entriesByOutput.delete(oldestUnused.outputPath)
      this.cachedBytes -= oldestUnused.size
      await this.dependencies.releaseOutput(oldestUnused.outputPath)
    }
  }
}
