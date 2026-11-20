import { BrowserWindow, WebContentsView, ipcMain, shell } from 'electron'
import type { BrowserWindowConstructorOptions, IpcMainInvokeEvent, Rectangle } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type { StreamingService, StreamingServiceViewBounds } from '@shared/ipc'
import { getAppLocale } from './locale'
import { getMainWindow } from './windows'

interface ServiceConfiguration {
  title: string
  url: string
  domain: string
  partition: string
  scrollbarColor: string
  scrollbarHoverColor: string
}

const SERVICES: Record<StreamingService, ServiceConfiguration> = {
  netflix: {
    title: 'Netflix',
    url: 'https://www.netflix.com',
    domain: 'netflix.com',
    partition: 'persist:tocae-netflix',
    scrollbarColor: 'rgba(229, 9, 20, 0.72)',
    scrollbarHoverColor: '#e50914',
  },
  spotify: {
    title: 'Spotify',
    url: 'https://open.spotify.com',
    domain: 'spotify.com',
    partition: 'persist:tocae-spotify',
    scrollbarColor: 'rgba(30, 215, 96, 0.72)',
    scrollbarHoverColor: '#1ed760',
  },
}

const IDENTITY_HOSTS = ['accounts.google.com', 'appleid.apple.com', 'facebook.com']
const serviceViews = new Map<StreamingService, WebContentsView>()
const cleanupWindows = new WeakSet<BrowserWindow>()
let activeService: StreamingService | null = null

function isStreamingService(value: unknown): value is StreamingService {
  return value === 'netflix' || value === 'spotify'
}

function isViewBounds(value: unknown): value is StreamingServiceViewBounds {
  if (typeof value !== 'object' || value === null) return false
  const bounds = value as Record<string, unknown>
  return ['x', 'y', 'width', 'height'].every(
    (key) => typeof bounds[key] === 'number' && Number.isFinite(bounds[key]),
  )
}

function getServicePreferences(service: StreamingService) {
  return {
    partition: SERVICES[service].partition,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    devTools: false,
  }
}

function popupWindowOptions(
  service: StreamingService,
  parent: BrowserWindow,
): BrowserWindowConstructorOptions {
  return {
    title: `${SERVICES[service].title} — Tocaê Reprodutor`,
    width: 520,
    height: 680,
    minWidth: 360,
    minHeight: 480,
    autoHideMenuBar: true,
    show: true,
    parent,
    webPreferences: getServicePreferences(service),
  }
}

function isAllowedServiceUrl(url: string, service: StreamingService): boolean {
  let host: string
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'https:') return false
    host = parsedUrl.hostname.toLowerCase()
  } catch {
    return false
  }

  const serviceDomain = SERVICES[service].domain
  return (
    host === serviceDomain ||
    host.endsWith(`.${serviceDomain}`) ||
    IDENTITY_HOSTS.some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`))
  )
}

function openExternalUrl(url: string): void {
  try {
    if (new URL(url).protocol === 'https:') {
      void shell.openExternal(url).catch((error: unknown) => {
        console.error('Could not open the external streaming-service link', error)
      })
    }
  } catch {
    // Invalid and non-web URLs are intentionally not opened externally.
  }
}

function offlinePageUrl(service: StreamingService): string {
  const configuration = SERVICES[service]
  const isPortuguese = getAppLocale() === 'pt-BR'
  const copy = isPortuguese
    ? {
        title: 'Não foi possível acessar o serviço',
        message: 'Verifique sua conexão com a internet e tente novamente.',
        retry: 'Tentar novamente',
        note: 'Enquanto isso, você ainda pode reproduzir arquivos locais no Tocaê.',
      }
    : {
        title: 'Could not connect to the service',
        message: 'Check your internet connection and try again.',
        retry: 'Try again',
        note: 'In the meantime, you can still play local media in Tocaê.',
      }

  const html = `<!doctype html>
<html lang="${isPortuguese ? 'pt-BR' : 'en'}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${configuration.title} — Tocaê Reprodutor</title>
    <style>
      :root { color-scheme: dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; display: grid; place-items: center; margin: 0; padding: 24px; background: #101014; color: #f5f5f7; }
      main { width: min(440px, 100%); padding: 32px; border: 1px solid rgba(255,255,255,.11); border-radius: 16px; background: rgba(255,255,255,.035); text-align: center; }
      .mark { width: 42px; height: 3px; margin: 0 auto 22px; border-radius: 999px; background: #55c7a6; }
      h1 { margin: 0; font-size: 19px; line-height: 1.35; }
      p { margin: 12px 0 0; color: #c1c1c6; font-size: 13px; line-height: 1.6; }
      a { display: inline-flex; min-height: 38px; align-items: center; justify-content: center; margin-top: 22px; padding: 0 16px; border-radius: 9px; background: #55c7a6; color: #101014; font-size: 13px; font-weight: 650; text-decoration: none; }
      a:hover { background: #70d7b8; }
      .note { margin-top: 22px; color: #9e9ea4; font-size: 12px; }
    </style>
  </head>
  <body>
    <main>
      <div class="mark" aria-hidden="true"></div>
      <h1>${copy.title}</h1>
      <p>${copy.message}</p>
      <a href="${configuration.url}">${copy.retry}</a>
      <p class="note">${copy.note}</p>
    </main>
  </body>
</html>`

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function configureServiceContents(
  webContents: Electron.WebContents,
  service: StreamingService,
  parent: BrowserWindow,
): () => void {
  let offlineUrl: string | null = null
  const scrollbarStyles = `
    :root, * {
      scrollbar-width: thin !important;
      scrollbar-color: ${SERVICES[service].scrollbarColor} transparent !important;
    }
    *::-webkit-scrollbar {
      width: 9px !important;
      height: 9px !important;
    }
    *::-webkit-scrollbar-track,
    *::-webkit-scrollbar-corner {
      background: transparent !important;
    }
    *::-webkit-scrollbar-thumb {
      border: 2px solid transparent !important;
      border-radius: 999px !important;
      background-color: ${SERVICES[service].scrollbarColor} !important;
      background-clip: content-box !important;
    }
    *::-webkit-scrollbar-thumb:hover {
      background-color: ${SERVICES[service].scrollbarHoverColor} !important;
    }
  `
  const showOfflinePage = () => {
    if (webContents.isDestroyed() || offlineUrl) return
    offlineUrl = offlinePageUrl(service)
    void webContents.loadURL(offlineUrl).catch((error: unknown) => {
      console.error(`Could not show the offline page for ${service}`, error)
    })
  }

  const handleNavigation = (event: Electron.Event, url: string) => {
    if (url === offlineUrl) return
    if (isAllowedServiceUrl(url, service)) {
      offlineUrl = null
      return
    }
    event.preventDefault()
    openExternalUrl(url)
  }

  webContents.on('did-finish-load', () => {
    void webContents.insertCSS(scrollbarStyles).catch((error: unknown) => {
      console.error(`Could not style the ${service} scrollbar`, error)
    })
  })
  webContents.on('will-navigate', handleNavigation)
  webContents.on('will-redirect', handleNavigation)
  webContents.on('did-fail-load', (_event, errorCode, _description, failedUrl, isMainFrame) => {
    if (isMainFrame && errorCode !== -3 && failedUrl !== offlineUrl) showOfflinePage()
  })
  webContents.on('will-attach-webview', (event) => event.preventDefault())
  webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedServiceUrl(url, service)) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: popupWindowOptions(service, parent),
      }
    }
    openExternalUrl(url)
    return { action: 'deny' }
  })
  webContents.on('did-create-window', (childWindow) => {
    childWindow.setMenuBarVisibility(false)
    configureServiceContents(childWindow.webContents, service, parent)
  })

  return showOfflinePage
}

function ensureWindowCleanup(mainWindow: BrowserWindow): void {
  if (cleanupWindows.has(mainWindow)) return
  cleanupWindows.add(mainWindow)
  mainWindow.on('closed', () => {
    for (const view of serviceViews.values()) {
      if (!view.webContents.isDestroyed()) view.webContents.close()
    }
    serviceViews.clear()
    activeService = null
  })
}

function getOrCreateServiceView(
  mainWindow: BrowserWindow,
  service: StreamingService,
): WebContentsView {
  const existingView = serviceViews.get(service)
  if (existingView && !existingView.webContents.isDestroyed()) return existingView

  const view = new WebContentsView({ webPreferences: getServicePreferences(service) })
  view.setVisible(false)
  serviceViews.set(service, view)
  mainWindow.contentView.addChildView(view)
  const showOfflinePage = configureServiceContents(view.webContents, service, mainWindow)
  void view.webContents.loadURL(SERVICES[service].url).catch((error: unknown) => {
    console.error(`Could not load ${service}`, error)
    showOfflinePage()
  })
  return view
}

function normalizedBounds(
  mainWindow: BrowserWindow,
  bounds: StreamingServiceViewBounds,
): Rectangle {
  const [contentWidth, contentHeight] = mainWindow.getContentSize()
  const x = Math.max(0, Math.min(Math.round(bounds.x), contentWidth - 1))
  const y = Math.max(0, Math.min(Math.round(bounds.y), contentHeight - 1))
  const width = Math.min(Math.round(bounds.width), contentWidth - x)
  const height = Math.min(Math.round(bounds.height), contentHeight - y)
  if (width < 1 || height < 1) throw new Error('Streaming service view has invalid dimensions')
  return { x, y, width, height }
}

function showServiceView(
  mainWindow: BrowserWindow,
  service: StreamingService,
  bounds: StreamingServiceViewBounds,
): void {
  ensureWindowCleanup(mainWindow)
  for (const [viewService, view] of serviceViews) {
    if (viewService !== service) view.setVisible(false)
  }

  const view = getOrCreateServiceView(mainWindow, service)
  view.setBounds(normalizedBounds(mainWindow, bounds))
  view.setVisible(true)
  activeService = service
}

function hideServiceView(): void {
  if (!activeService) return
  serviceViews.get(activeService)?.setVisible(false)
  activeService = null
}

function mainWindowFromSender(event: IpcMainInvokeEvent): BrowserWindow {
  const mainWindow = getMainWindow()
  if (
    !mainWindow ||
    BrowserWindow.fromWebContents(event.sender) !== mainWindow ||
    event.senderFrame !== mainWindow.webContents.mainFrame
  ) {
    throw new Error('Streaming service requested by an untrusted window')
  }
  return mainWindow
}

export function registerStreamingServiceIpc(): void {
  ipcMain.handle(
    IPC_CHANNELS.STREAMING_SERVICE_VIEW_SET,
    (event: IpcMainInvokeEvent, service: unknown, bounds: unknown) => {
      const mainWindow = mainWindowFromSender(event)
      if (!isStreamingService(service)) {
        throw new Error(`Unknown streaming service: ${String(service)}`)
      }
      if (!isViewBounds(bounds)) throw new Error('Streaming service view bounds are invalid')
      showServiceView(mainWindow, service, bounds)
    },
  )
  ipcMain.handle(IPC_CHANNELS.STREAMING_SERVICE_VIEW_HIDE, (event: IpcMainInvokeEvent) => {
    mainWindowFromSender(event)
    hideServiceView()
  })
}
