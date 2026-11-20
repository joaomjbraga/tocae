import type { Dirent } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { isMediaPath } from '@shared/media'

export type DirectoryErrorHandler = (directoryPath: string, error: unknown) => void

export async function findMediaInFolder(
  folderPath: string,
  onDirectoryError?: DirectoryErrorHandler,
): Promise<string[]> {
  const media: string[] = []

  async function visit(directoryPath: string): Promise<void> {
    let entries: Dirent[]
    try {
      entries = await readdir(directoryPath, { withFileTypes: true })
    } catch (error) {
      if (!onDirectoryError) throw error
      onDirectoryError(directoryPath, error)
      return
    }

    entries.sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }),
    )

    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name)
      if (entry.isDirectory()) {
        await visit(entryPath)
      } else if (entry.isFile() && isMediaPath(entry.name)) {
        media.push(entryPath)
      }
    }
  }

  await visit(folderPath)
  return media
}
