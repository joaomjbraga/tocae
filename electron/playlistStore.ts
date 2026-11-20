import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { PersistedPlaylist, PlaylistItem } from '@shared/playlist'

interface StoredPlaylist extends PersistedPlaylist {
  version: number
}

function normalizedIndex(value: unknown, length: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length
    ? value
    : -1
}

export function isPlaylistItem(value: unknown): value is PlaylistItem {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Partial<PlaylistItem>
  return (
    typeof item.id === 'string' &&
    item.id.length > 0 &&
    typeof item.path === 'string' &&
    item.path.length > 0 &&
    typeof item.name === 'string'
  )
}

function withoutDuplicates(items: PlaylistItem[]): PlaylistItem[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.path)) return false
    seen.add(item.path)
    return true
  })
}

export async function readPlaylistFile(file: string): Promise<PersistedPlaylist> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if (!isMissingFile(error)) console.warn('Could not read the saved playlist', error)
    return { items: [], currentIndex: -1 }
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    const stored = parsed as Partial<StoredPlaylist> | null
    if (!stored || !Array.isArray(stored.items)) return { items: [], currentIndex: -1 }

    const selectedIndex = normalizedIndex(stored.currentIndex, stored.items.length)
    const selectedItem =
      selectedIndex >= 0 && isPlaylistItem(stored.items[selectedIndex])
        ? stored.items[selectedIndex]
        : null
    const items = withoutDuplicates(stored.items.filter(isPlaylistItem))
    const currentIndex = selectedItem
      ? items.findIndex((item) => item.path === selectedItem.path)
      : -1

    return { items, currentIndex }
  } catch (error) {
    console.warn('Could not parse the saved playlist; using an empty list', error)
    return { items: [], currentIndex: -1 }
  }
}

export async function writePlaylistFile(
  file: string,
  items: PlaylistItem[],
  currentIndex: number,
): Promise<void> {
  const tempFile = `${file}.tmp`
  const cleanItems = withoutDuplicates(items)
  // Remove duplicatas pode mudar os índices: acompanha o id do item selecionado.
  const selectedId = items[currentIndex]?.id
  const cleanIndex = selectedId ? cleanItems.findIndex((item) => item.id === selectedId) : -1
  const payload: StoredPlaylist = {
    version: 1,
    items: cleanItems,
    currentIndex: cleanIndex,
  }

  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(tempFile, JSON.stringify(payload, null, 2), 'utf8')
  await rename(tempFile, file)
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
