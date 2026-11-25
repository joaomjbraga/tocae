import { execFile } from 'node:child_process'
import { app, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type { DefaultPlayerStatus } from '@shared/ipc'
import { DESKTOP_FILE_NAME } from './paths'

const MEDIA_MIME_TYPES = [
  'video/mp4',
  'video/x-m4v',
  'video/webm',
  'video/x-matroska',
  'video/x-msvideo',
  'video/quicktime',
  'video/ogg',
  'video/mpeg',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/flac',
  'audio/ogg',
  'audio/webm',
  'image/jpeg',
  'image/png',
  'image/apng',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/avif',
  'image/heic',
]

function runXdgMime(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('xdg-mime', args, { encoding: 'utf8' }, (error, stdout) => {
      if (error) {
        reject(error)
        return
      }
      resolve(String(stdout).trim())
    })
  })
}

export async function getDefaultPlayerStatus(): Promise<DefaultPlayerStatus> {
  if (process.platform !== 'linux' || !app.isPackaged) {
    return { supported: false, isDefault: false }
  }

  const handlers = await Promise.all(
    MEDIA_MIME_TYPES.map((mimeType) => runXdgMime(['query', 'default', mimeType])),
  )

  return {
    supported: true,
    isDefault: handlers.every((handler) => handler === DESKTOP_FILE_NAME),
  }
}

export async function setDefaultPlayer(): Promise<void> {
  if (process.platform !== 'linux' || !app.isPackaged) {
    throw new Error('Setting the default media player requires a packaged Linux installation.')
  }

  for (const mimeType of MEDIA_MIME_TYPES) {
    await runXdgMime(['default', DESKTOP_FILE_NAME, mimeType])
  }
}

export function registerDefaultPlayerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.DEFAULT_PLAYER_STATUS, () => getDefaultPlayerStatus())
  ipcMain.handle(IPC_CHANNELS.DEFAULT_PLAYER_SET, () => setDefaultPlayer())
}
