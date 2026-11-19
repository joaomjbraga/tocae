import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { dialog, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import { isVideoPath, VIDEO_EXTENSIONS } from '@shared/media'
import { translate } from '@shared/i18n'
import { sendCommand } from './commands'
import { getAppLocale } from './locale'
import { getMainWindow } from './windows'

export async function openVideoDialog(): Promise<void> {
  const window = getMainWindow()
  if (!window) return

  // O diálogo nativo é do sistema, então o texto acompanha o idioma do app.
  const locale = getAppLocale()

  const result = await dialog.showOpenDialog(window, {
    title: translate(locale, 'dialog.openTitle'),
    properties: ['openFile'],
    filters: [
      { name: translate(locale, 'dialog.videosFilter'), extensions: [...VIDEO_EXTENSIONS] },
      { name: translate(locale, 'dialog.allFilesFilter'), extensions: ['*'] },
    ],
  })

  if (result.canceled || result.filePaths.length === 0) return
  sendCommand({ type: 'open-videos', paths: result.filePaths })
}

async function findVideosInFolder(folderPath: string): Promise<string[]> {
  const entries = await readdir(folderPath, { withFileTypes: true })
  const videos: string[] = []

  entries.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' }),
  )

  for (const entry of entries) {
    const entryPath = path.join(folderPath, entry.name)
    if (entry.isDirectory()) {
      videos.push(...(await findVideosInFolder(entryPath)))
    } else if (entry.isFile() && isVideoPath(entry.name)) {
      videos.push(entryPath)
    }
  }

  return videos
}

export async function openFolderDialog(): Promise<void> {
  const window = getMainWindow()
  if (!window) return

  const locale = getAppLocale()
  const result = await dialog.showOpenDialog(window, {
    title: translate(locale, 'dialog.openFolderTitle'),
    properties: ['openDirectory'],
  })

  const [folderPath] = result.filePaths
  if (result.canceled || !folderPath) return

  let paths: string[]
  try {
    paths = await findVideosInFolder(folderPath)
  } catch (error) {
    console.error('Failed to scan the selected video folder', error)
    await dialog.showMessageBox(window, {
      type: 'error',
      title: translate(locale, 'dialog.openFolderTitle'),
      message: translate(locale, 'dialog.folderReadError'),
      detail: error instanceof Error ? error.message : String(error),
    })
    return
  }

  if (paths.length === 0) {
    await dialog.showMessageBox(window, {
      type: 'info',
      title: translate(locale, 'dialog.openFolderTitle'),
      message: translate(locale, 'dialog.noVideosFound'),
    })
    return
  }

  sendCommand({ type: 'open-videos', paths })
}

export function registerDialogIpc(): void {
  ipcMain.handle(IPC_CHANNELS.VIDEO_PICK, () => openVideoDialog())
  ipcMain.handle(IPC_CHANNELS.VIDEO_FOLDER_PICK, () => openFolderDialog())
}
