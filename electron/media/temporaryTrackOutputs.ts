import path from 'node:path'

type TemporaryTrackOutputDependencies = {
  createDirectory: () => Promise<string>
  removeDirectory: (directory: string) => Promise<void>
}

export class TemporaryTrackOutputs {
  #directories = new Set<string>()
  #outputDirectories = new Map<string, string>()
  private readonly dependencies: TemporaryTrackOutputDependencies

  constructor(dependencies: TemporaryTrackOutputDependencies) {
    this.dependencies = dependencies
  }

  async create(fileName: string, extract: (outputPath: string) => Promise<void>): Promise<string> {
    const directory = await this.dependencies.createDirectory()
    this.#directories.add(directory)
    const outputPath = path.join(directory, fileName)

    try {
      await extract(outputPath)
      this.#outputDirectories.set(path.resolve(outputPath), directory)
      return outputPath
    } catch (error) {
      await this.dependencies.removeDirectory(directory)
      this.#directories.delete(directory)
      throw error
    }
  }

  async release(outputPath: string): Promise<void> {
    const resolvedPath = path.resolve(outputPath)
    const directory = this.#outputDirectories.get(resolvedPath)
    if (!directory) {
      throw new TypeError('The temporary track path is not owned by this session.')
    }

    await this.dependencies.removeDirectory(directory)
    this.#outputDirectories.delete(resolvedPath)
    this.#directories.delete(directory)
  }

  async cleanup(onError: (directory: string, error: unknown) => void): Promise<void> {
    const directories = [...this.#directories]
    this.#directories.clear()
    this.#outputDirectories.clear()

    await Promise.all(
      directories.map(async (directory) => {
        try {
          await this.dependencies.removeDirectory(directory)
        } catch (error) {
          onError(directory, error)
        }
      }),
    )
  }
}
