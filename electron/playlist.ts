import { app, ipcMain } from 'electron'
import path from 'node:path'
import { IPC_CHANNELS } from '@shared/ipc'
import type { PersistedPlaylist, PlaylistItem } from '@shared/playlist'
import { isPlaylistItem, readPlaylistFile, writePlaylistFile } from './playlistStore'

const STORE_FILE_NAME = 'playlist.json'
let writeQueue: Promise<void> = Promise.resolve()

function storeFilePath(): string {
  return path.join(app.getPath('userData'), STORE_FILE_NAME)
}

export async function readPlaylist(): Promise<PersistedPlaylist> {
  return readPlaylistFile(storeFilePath())
}

export function writePlaylist(items: PlaylistItem[], currentIndex: number): Promise<void> {
  const write = writeQueue.then(() => writePlaylistFile(storeFilePath(), items, currentIndex))
  writeQueue = write.catch(() => {})
  return write
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
