import { app, ipcMain } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { IPC_CHANNELS } from '@shared/ipc'
import type { PersistedPlaylist, PlaylistItem } from '@shared/playlist'

const STORE_FILE_NAME = 'playlist.json'

interface StoredPlaylist extends PersistedPlaylist {
  version: number
}

function normalizedIndex(value: unknown, length: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < length
    ? value
    : -1
}

function storeFilePath(): string {
  return path.join(app.getPath('userData'), STORE_FILE_NAME)
}

function isPlaylistItem(value: unknown): value is PlaylistItem {
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

export async function readPlaylist(): Promise<PersistedPlaylist> {
  let raw: string
  try {
    raw = await readFile(storeFilePath(), 'utf8')
  } catch (error) {
    if (!isMissingFile(error)) console.warn('Could not read the saved playlist', error)
    return { items: [], currentIndex: -1 }
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    const stored = parsed as Partial<StoredPlaylist> | null
    if (!stored || !Array.isArray(stored.items)) return { items: [], currentIndex: -1 }
    const items = withoutDuplicates(stored.items.filter(isPlaylistItem))
    return { items, currentIndex: normalizedIndex(stored.currentIndex, items.length) }
  } catch (error) {
    console.warn('Could not parse the saved playlist; using an empty list', error)
    return { items: [], currentIndex: -1 }
  }
}

export async function writePlaylist(items: PlaylistItem[], currentIndex: number): Promise<void> {
  const file = storeFilePath()
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

export function registerPlaylistIpc(): void {
  ipcMain.handle(IPC_CHANNELS.PLAYLIST_READ, () => readPlaylist())

  ipcMain.handle(IPC_CHANNELS.PLAYLIST_WRITE, async (_event, items: unknown, currentIndex: unknown) => {
    if (!Array.isArray(items)) return
    await writePlaylist(
      items.filter(isPlaylistItem),
      typeof currentIndex === 'number' && Number.isInteger(currentIndex) ? currentIndex : -1,
    )
  })
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
