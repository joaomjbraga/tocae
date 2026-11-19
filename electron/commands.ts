import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AppCommand } from '@shared/ipc'
import { getMainWindow } from './windows'

let rendererReady = false
const pendingCommands: AppCommand[] = []

export function sendCommand(command: AppCommand): void {
  const window = getMainWindow()
  if (!window || !rendererReady || window.webContents.isLoadingMainFrame()) {
    pendingCommands.push(command)
    return
  }
  window.webContents.send(IPC_CHANNELS.COMMAND, command)
}

export function markRendererNotReady(): void {
  rendererReady = false
}

export function registerCommandIpc(): void {
  ipcMain.on(IPC_CHANNELS.RENDERER_READY, (event) => {
    const window = getMainWindow()
    if (!window || event.sender !== window.webContents) return

    rendererReady = true
    for (const command of pendingCommands.splice(0)) {
      window.webContents.send(IPC_CHANNELS.COMMAND, command)
    }
  })
}
