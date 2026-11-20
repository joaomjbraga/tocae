import { app, Menu } from 'electron'
import { fileURLToPath } from 'node:url'
import { isMediaPath } from '@shared/media'
import { registerMediaSchemes, registerMediaProtocol } from './media/protocol'
import { registerMediaMetadataIpc } from './media/metadata'
import { registerMediaTracksIpc } from './media/tracks'
import { registerYouTubeMusicIpc } from './integrations/youtubeMusic'
import { registerDialogIpc } from './dialogs'
import { registerPlaylistIpc } from './playlist'
import { initializeLibrary, registerLibraryIpc } from './library'
import { createMainWindow, focusMainWindow, registerWindowIpc } from './windows'
import { initLocale, registerLocaleIpc } from './locale'
import {
  markRendererNotReady,
  registerCommandIpc,
  sendCommand,
} from './commands'
import { registerDefaultPlayerIpc } from './default-player'
import { registerUpdateIpc, startUpdateChecks } from './updates'
import { DESKTOP_FILE_NAME } from './paths'

registerMediaSchemes()

function mediaPathsFromArgs(args: string[]): string[] {
  const paths: string[] = []
  for (const argument of args) {
    if (argument.startsWith('-')) continue

    let filePath = argument
    if (argument.startsWith('file://')) {
      try {
        filePath = fileURLToPath(argument)
      } catch {
        continue
      }
    }
    if (isMediaPath(filePath)) paths.push(filePath)
  }
  return paths
}

function openMediaPaths(args: string[]): void {
  const paths = mediaPathsFromArgs(args)
  if (paths.length > 0) sendCommand({ type: 'play-media', paths })
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.setDesktopName(DESKTOP_FILE_NAME)

  app.on('second-instance', (_event, argv) => {
    focusMainWindow()
    openMediaPaths(argv.slice(1))
  })
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    openMediaPaths([filePath])
  })
  app.on('window-all-closed', () => app.quit())

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    registerMediaProtocol()
    registerCommandIpc()
    registerPlaylistIpc()
    registerLibraryIpc()
    registerMediaMetadataIpc()
    registerMediaTracksIpc()
    registerYouTubeMusicIpc()
    registerDialogIpc()
    registerDefaultPlayerIpc()
    registerUpdateIpc()
    registerWindowIpc()
    registerLocaleIpc()
    // O idioma precisa estar resolvido antes da primeira janela para a
    // interface começar no idioma escolhido.
    await initLocale()
    await initializeLibrary()
    const window = createMainWindow()
    window.webContents.on('did-start-loading', markRendererNotReady)
    openMediaPaths(process.argv.slice(1))
    startUpdateChecks()
  })
}