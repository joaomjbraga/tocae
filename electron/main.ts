import { app, Menu } from 'electron'
import { fileURLToPath } from 'node:url'
import { isVideoPath } from '@shared/media'
import { registerMediaSchemes, registerMediaProtocol } from './media/protocol'
import { registerDialogIpc } from './dialogs'
import { registerPlaylistIpc } from './playlist'
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

function videoPathsFromArgs(args: string[]): string[] {
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
    if (isVideoPath(filePath)) paths.push(filePath)
  }
  return paths
}

function openVideoPaths(args: string[]): void {
  const paths = videoPathsFromArgs(args)
  if (paths.length > 0) sendCommand({ type: 'play-videos', paths })
}

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.setDesktopName(DESKTOP_FILE_NAME)

  app.on('second-instance', (_event, argv) => {
    focusMainWindow()
    openVideoPaths(argv.slice(1))
  })
  app.on('open-file', (event, filePath) => {
    event.preventDefault()
    openVideoPaths([filePath])
  })
  app.on('window-all-closed', () => app.quit())

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null)
    registerMediaProtocol()
    registerCommandIpc()
    registerPlaylistIpc()
    registerDialogIpc()
    registerDefaultPlayerIpc()
    registerUpdateIpc()
    registerWindowIpc()
    registerLocaleIpc()
    // O idioma precisa estar resolvido antes da primeira janela para a
    // interface começar no idioma escolhido.
    await initLocale()
    const window = createMainWindow()
    window.webContents.on('did-start-loading', markRendererNotReady)
    openVideoPaths(process.argv.slice(1))
    startUpdateChecks()
  })
}