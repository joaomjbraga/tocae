import { app, BrowserWindow, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { IPC_CHANNELS } from '@shared/ipc'
import {
  createSavedPlaylistFile,
  deleteSavedPlaylistFile,
  readSavedPlaylistsFile,
  updateSavedPlaylistFile,
} from './savedPlaylistStore'

const STORE_FILE_NAME = 'saved-playlists.json'

function storeFilePath(): string {
  return path.join(app.getPath('userData'), STORE_FILE_NAME)
}

export function registerSavedPlaylistIpc(): void {
  ipcMain.handle(IPC_CHANNELS.SAVED_PLAYLISTS_LIST, (event) => {
    validateSender(event)
    return readSavedPlaylistsFile(storeFilePath())
  })
  ipcMain.handle(IPC_CHANNELS.SAVED_PLAYLISTS_CREATE, (event, name: unknown, items: unknown) => {
    validateSender(event)
    return createSavedPlaylistFile(storeFilePath(), name, items)
  })
  ipcMain.handle(IPC_CHANNELS.SAVED_PLAYLISTS_UPDATE, (event, value: unknown) => {
    validateSender(event)
    if (!isRecord(value)) {
      throw new TypeError('Os dados da playlist salva não são válidos.')
    }
    return updateSavedPlaylistFile(
      storeFilePath(),
      value.id,
      value.name,
      value.items,
    )
  })
  ipcMain.handle(IPC_CHANNELS.SAVED_PLAYLISTS_DELETE, (event, id: unknown) => {
    validateSender(event)
    return deleteSavedPlaylistFile(storeFilePath(), id)
  })
}

function validateSender(event: IpcMainInvokeEvent): void {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || !BrowserWindow.getAllWindows().includes(window)) {
    throw new Error('Solicitação de playlist enviada por uma janela desconhecida.')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
