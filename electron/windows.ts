import { BrowserWindow, ipcMain } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import { IPC_CHANNELS } from '@shared/ipc'
import {
  APP_TITLE,
  ICON_PATH,
  PRELOAD_PATH,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL,
} from './paths'

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    title: APP_TITLE,
    width: 960,
    height: 600,
    minWidth: 480,
    minHeight: 320,
    frame: false,
    transparent: true,
    hasShadow: true,
    backgroundColor: '#00000000',
    show: false,
    icon: ICON_PATH,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
    },
  })

  watchWindowState(mainWindow)
  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => { mainWindow = null })

  loadRenderer(mainWindow)
  return mainWindow
}

export function focusMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
}

export function registerWindowIpc(): void {
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, (event) => {
    windowFromSender(event).minimize()
  })
  ipcMain.handle(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE, (event) => {
    const window = windowFromSender(event)
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })
  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, (event) => {
    windowFromSender(event).close()
  })
  ipcMain.handle(IPC_CHANNELS.WINDOW_IS_MAXIMIZED, (event) => {
    return windowFromSender(event).isMaximized()
  })
}

function watchWindowState(window: BrowserWindow): void {
  const notify = () => window.webContents.send(IPC_CHANNELS.WINDOW_STATE, window.isMaximized())
  window.on('maximize', notify)
  window.on('unmaximize', notify)
}

function windowFromSender(event: IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window) throw new Error('Window control requested by a sender without a BrowserWindow')
  return window
}

function loadRenderer(window: BrowserWindow): void {
  if (VITE_DEV_SERVER_URL) {
    window.loadURL(VITE_DEV_SERVER_URL).catch(console.error)
  } else {
    window.loadFile(path.join(RENDERER_DIST, 'index.html')).catch(console.error)
  }
}