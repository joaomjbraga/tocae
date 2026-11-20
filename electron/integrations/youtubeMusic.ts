import {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  session,
  shell,
} from 'electron'
import type { IpcMainInvokeEvent, Rectangle, Session, WebContents } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type { YouTubeMusicStatus } from '@shared/ipc'
import { getMainWindow } from '../windows'

const HOME_URL = 'https://music.youtube.com/'
const SESSION_PARTITION = 'persist:tocae-youtube-music'
const LOAD_TIMEOUT_MS = 30_000
const ALLOWED_HOSTS = new Set([
  'music.youtube.com',
  'youtube.com',
  'www.youtube.com',
  'accounts.google.com',
  'accounts.youtube.com',
  'consent.google.com',
  'consent.youtube.com',
  'myaccount.google.com',
])

let serviceSession: Session | null = null
let serviceView: WebContentsView | null = null
let ownerWindow: BrowserWindow | null = null
let visibleRequested = false
let hasLoadedServicePage = false
let loadTimeout: ReturnType<typeof setTimeout> | null = null
let serviceBounds: Rectangle = { x: 0, y: 0, width: 0, height: 0 }
let status: YouTubeMusicStatus = {
  state: 'idle',
  canGoBack: false,
  canGoForward: false,
}
const authenticationWindows = new Set<BrowserWindow>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null
    return url
  } catch {
    return null
  }
}

function isServiceUrl(value: string): boolean {
  const url = parseHttpsUrl(value)
  return Boolean(url && ALLOWED_HOSTS.has(url.hostname.toLowerCase()))
}

function openExternalUrl(value: string): void {
  const url = parseHttpsUrl(value)
  if (!url || isServiceUrl(url.href)) return

  void shell.openExternal(url.href).catch((error: unknown) => {
    console.error('Could not open an external YouTube Music link', error)
  })
}

function getServiceSession(): Session {
  if (serviceSession) return serviceSession

  serviceSession = session.fromPartition(SESSION_PARTITION)
  serviceSession.setPermissionCheckHandler(() => false)
  serviceSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false)
  })
  return serviceSession
}

function canUseWindow(window: BrowserWindow | null): window is BrowserWindow {
  return Boolean(window && !window.isDestroyed())
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function currentStatus(state = status.state): YouTubeMusicStatus {
  const webContents = serviceView?.webContents
  return {
    state,
    canGoBack: Boolean(webContents && !webContents.isDestroyed() && webContents.canGoBack()),
    canGoForward: Boolean(
      webContents && !webContents.isDestroyed() && webContents.canGoForward(),
    ),
  }
}

function publishStatus(state = status.state): void {
  status = currentStatus(state)
  if (canUseWindow(ownerWindow) && !ownerWindow.webContents.isDestroyed()) {
    ownerWindow.webContents.send(IPC_CHANNELS.YOUTUBE_MUSIC_STATUS, status)
  }
}

function setServiceState(state: YouTubeMusicStatus['state']): void {
  if (loadTimeout) {
    clearTimeout(loadTimeout)
    loadTimeout = null
  }
  if (state === 'loading') {
    loadTimeout = setTimeout(() => {
      loadTimeout = null
      if (serviceView && status.state === 'loading') {
        console.error('YouTube Music did not finish loading in time')
        setServiceState('error')
      }
    }, LOAD_TIMEOUT_MS)
  }
  if (serviceView && state === 'error') serviceView.setVisible(false)
  publishStatus(state)
  if (
    serviceView &&
    (state === 'ready' || (state === 'loading' && hasLoadedServicePage))
  ) {
    applyServiceBounds()
  }
}

function clampBounds(bounds: Rectangle, window: BrowserWindow): Rectangle {
  const [contentWidth, contentHeight] = window.getContentSize()
  const x = Math.min(contentWidth, Math.max(0, Math.round(bounds.x)))
  const y = Math.min(contentHeight, Math.max(0, Math.round(bounds.y)))
  return {
    x,
    y,
    width: Math.min(Math.round(bounds.width), Math.max(0, contentWidth - x)),
    height: Math.min(Math.round(bounds.height), Math.max(0, contentHeight - y)),
  }
}

function applyServiceBounds(): void {
  if (!serviceView || !canUseWindow(ownerWindow)) return

  const bounds = clampBounds(serviceBounds, ownerWindow)
  serviceView.setBounds(bounds)
  serviceView.setVisible(
    visibleRequested &&
      (status.state === 'ready' || (status.state === 'loading' && hasLoadedServicePage)) &&
      bounds.width > 0 &&
      bounds.height > 0,
  )
}

function parseBounds(value: unknown): Rectangle {
  if (!isRecord(value)) {
    throw new TypeError('Valid YouTube Music view bounds are required.')
  }

  const { x, y, width, height } = value
  if (
    !isFiniteNumber(x) ||
    !isFiniteNumber(y) ||
    !isFiniteNumber(width) ||
    !isFiniteNumber(height)
  ) {
    throw new TypeError('Valid YouTube Music view bounds are required.')
  }
  if (
    Math.abs(x) > 100_000 ||
    Math.abs(y) > 100_000 ||
    width < 0 ||
    height < 0 ||
    width > 100_000 ||
    height > 100_000
  ) {
    throw new RangeError('YouTube Music view bounds are outside the allowed range.')
  }

  return { x, y, width, height }
}

function secureWebContents(webContents: WebContents, onBlocked?: () => void): void {
  webContents.on('will-navigate', (event, url) => {
    if (!isServiceUrl(url)) {
      event.preventDefault()
      onBlocked?.()
    }
  })
  webContents.on('will-redirect', (event, url, _isInPlace, isMainFrame) => {
    if (isMainFrame && !isServiceUrl(url)) {
      event.preventDefault()
      onBlocked?.()
    }
  })
  webContents.setWindowOpenHandler((details) => {
    if (isServiceUrl(details.url)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 480,
          height: 640,
          minWidth: 360,
          minHeight: 480,
          autoHideMenuBar: true,
          webPreferences: {
            session: getServiceSession(),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            webSecurity: true,
            allowRunningInsecureContent: false,
            devTools: false,
          },
        },
      }
    }

    if (details.disposition === 'new-window' || details.disposition === 'foreground-tab') {
      openExternalUrl(details.url)
    }
    return { action: 'deny' }
  })
  webContents.on('did-create-window', (childWindow) => {
    authenticationWindows.add(childWindow)
    secureWebContents(childWindow.webContents, () => childWindow.destroy())
    childWindow.once('closed', () => authenticationWindows.delete(childWindow))
  })
}

function attachWindow(window: BrowserWindow): void {
  if (ownerWindow === window) return
  if (serviceView) destroyServiceView()
  ownerWindow = window

  window.on('resize', applyServiceBounds)
  window.once('closed', () => {
    if (ownerWindow !== window) return
    destroyServiceView()
    closeAuthenticationWindows()
    ownerWindow = null
    visibleRequested = false
    status = { state: 'idle', canGoBack: false, canGoForward: false }
  })
}

function createServiceView(window: BrowserWindow): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      session: getServiceSession(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: false,
    },
  })

  serviceView = view
  hasLoadedServicePage = false
  window.contentView.addChildView(view)
  view.setBorderRadius(10)
  view.setVisible(false)
  secureWebContents(view.webContents, () => setServiceState('error'))

  view.webContents.on('did-start-loading', () => {
    if (!hasLoadedServicePage) setServiceState('loading')
  })
  view.webContents.on('did-finish-load', () => {
    hasLoadedServicePage = true
    setServiceState('ready')
  })
  view.webContents.on('did-stop-loading', () => {
    if (
      serviceView === view &&
      status.state === 'loading' &&
      isServiceUrl(view.webContents.getURL())
    ) {
      hasLoadedServicePage = true
      setServiceState('ready')
    }
  })
  view.webContents.on('did-navigate', (_event, url) => {
    if (isServiceUrl(url)) {
      hasLoadedServicePage = true
      setServiceState('ready')
    } else {
      publishStatus()
    }
  })
  view.webContents.on('did-navigate-in-page', () => publishStatus())
  view.webContents.on(
    'did-fail-load',
    (_event, errorCode, _errorDescription, _validatedURL, isMainFrame) => {
      if (isMainFrame && errorCode !== -3) setServiceState('error')
    },
  )
  view.webContents.on('render-process-gone', () => {
    if (serviceView !== view) return
    setServiceState('error')
    destroyServiceView()
  })
  view.webContents.on('destroyed', () => {
    if (serviceView !== view) return
    serviceView = null
    setServiceState('error')
  })

  return view
}

function ensureServiceView(): { view: WebContentsView; created: boolean } {
  const window = getMainWindow()
  if (!canUseWindow(window)) throw new Error('The main window is not available.')
  attachWindow(window)
  if (serviceView && !serviceView.webContents.isDestroyed()) {
    return { view: serviceView, created: false }
  }

  const view = createServiceView(window)
  applyServiceBounds()
  return { view, created: true }
}

function loadHome(view: WebContentsView): void {
  setServiceState('loading')
  void view.webContents.loadURL(HOME_URL).catch((error: unknown) => {
    console.error('Could not load YouTube Music', error)
    if (serviceView === view) setServiceState('error')
  })
}

function closeAuthenticationWindows(): void {
  for (const window of authenticationWindows) {
    if (!window.isDestroyed()) window.destroy()
  }
  authenticationWindows.clear()
}

function destroyServiceView(): void {
  if (loadTimeout) {
    clearTimeout(loadTimeout)
    loadTimeout = null
  }
  if (!serviceView) return

  const view = serviceView
  serviceView = null
  if (canUseWindow(ownerWindow)) ownerWindow.contentView.removeChildView(view)
  if (!view.webContents.isDestroyed()) {
    view.webContents.close({ waitForBeforeUnload: false })
  }
}

function assertMainWindowSender(event: IpcMainInvokeEvent): void {
  const window = getMainWindow()
  if (!canUseWindow(window) || window.webContents !== event.sender) {
    throw new Error('YouTube Music can only be controlled by the Tocaê window.')
  }
}

export function registerYouTubeMusicIpc(): void {
  ipcMain.handle(IPC_CHANNELS.YOUTUBE_MUSIC_OPEN, (event) => {
    assertMainWindowSender(event)
    const { view, created } = ensureServiceView()
    visibleRequested = true
    if (created) loadHome(view)
    else if (status.state === 'error') {
      setServiceState('loading')
      view.webContents.reload()
    } else {
      publishStatus()
      applyServiceBounds()
    }
  })
  ipcMain.handle(IPC_CHANNELS.YOUTUBE_MUSIC_CLOSE, (event) => {
    assertMainWindowSender(event)
    visibleRequested = false
    serviceView?.setVisible(false)
  })
  ipcMain.handle(IPC_CHANNELS.YOUTUBE_MUSIC_STOP, (event) => {
    assertMainWindowSender(event)
    visibleRequested = false
    destroyServiceView()
    hasLoadedServicePage = false
    closeAuthenticationWindows()
    setServiceState('idle')
  })
  ipcMain.handle(IPC_CHANNELS.YOUTUBE_MUSIC_SET_BOUNDS, (event, value: unknown) => {
    assertMainWindowSender(event)
    serviceBounds = parseBounds(value)
    applyServiceBounds()
  })
  ipcMain.handle(IPC_CHANNELS.YOUTUBE_MUSIC_RELOAD, (event) => {
    assertMainWindowSender(event)
    const { view, created } = ensureServiceView()
    visibleRequested = true
    if (created) loadHome(view)
    else {
      setServiceState('loading')
      view.webContents.reload()
    }
  })
  ipcMain.handle(IPC_CHANNELS.YOUTUBE_MUSIC_GO_BACK, (event) => {
    assertMainWindowSender(event)
    const webContents = serviceView?.webContents
    if (webContents && !webContents.isDestroyed() && webContents.canGoBack()) {
      webContents.goBack()
    }
  })
  ipcMain.handle(IPC_CHANNELS.YOUTUBE_MUSIC_GO_FORWARD, (event) => {
    assertMainWindowSender(event)
    const webContents = serviceView?.webContents
    if (webContents && !webContents.isDestroyed() && webContents.canGoForward()) {
      webContents.goForward()
    }
  })
  ipcMain.handle(IPC_CHANNELS.YOUTUBE_MUSIC_GET_STATUS, (event) => {
    assertMainWindowSender(event)
    return currentStatus()
  })
  app.once('will-quit', () => {
    destroyServiceView()
    closeAuthenticationWindows()
    serviceSession = null
    ownerWindow = null
  })
}
