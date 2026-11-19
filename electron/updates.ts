import { BrowserWindow, app, ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import { sendCommand } from './commands'
import { getMainWindow } from './windows'

const REPOSITORY = 'joaomjbraga/tocae-reprodutor'
const RELEASES_PAGE_URL = `https://github.com/${REPOSITORY}/releases/latest`
const LATEST_RELEASE_API_URL = `https://api.github.com/repos/${REPOSITORY}/releases/latest`
const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const REQUEST_TIMEOUT_MS = 10_000

function isStableVersion(version: string): boolean {
  return /^v?\d+\.\d+\.\d+$/.test(version)
}

function isNewerVersion(candidate: string, current: string): boolean {
  if (!isStableVersion(candidate) || !isStableVersion(current)) return false

  const candidateParts = candidate.replace(/^v/, '').split('.').map(Number)
  const currentParts = current.replace(/^v/, '').split('.').map(Number)
  for (let index = 0; index < candidateParts.length; index += 1) {
    if (candidateParts[index] > currentParts[index]) return true
    if (candidateParts[index] < currentParts[index]) return false
  }
  return false
}

async function fetchLatestVersion(): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(LATEST_RELEASE_API_URL, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Tocae-Reprodutor',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: controller.signal,
    })

    if (response.status === 404) return null
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`)

    const payload: unknown = await response.json()
    if (
      typeof payload !== 'object' ||
      payload === null ||
      !('tag_name' in payload) ||
      typeof payload.tag_name !== 'string'
    ) {
      throw new Error('The latest GitHub release has no valid tag name')
    }

    const version = payload.tag_name.replace(/^v/, '')
    if (!isStableVersion(version)) throw new Error(`Unsupported release version: ${version}`)
    return version
  } finally {
    clearTimeout(timeout)
  }
}

async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) return

  try {
    const version = await fetchLatestVersion()
    if (version && isNewerVersion(version, app.getVersion())) {
      sendCommand({ type: 'update-available', version })
    }
  } catch (error) {
    console.warn('Could not check for Tocaê updates', error)
  }
}

export function startUpdateChecks(): void {
  if (!app.isPackaged) return

  void checkForUpdates()
  const timer = setInterval(() => void checkForUpdates(), UPDATE_CHECK_INTERVAL_MS)
  app.once('will-quit', () => clearInterval(timer))
}

export function registerUpdateIpc(): void {
  ipcMain.handle(IPC_CHANNELS.RELEASES_OPEN, (event) => {
    const window = getMainWindow()
    if (!window || BrowserWindow.fromWebContents(event.sender) !== window) {
      throw new Error('Release page requested by an unknown window')
    }
    return shell.openExternal(RELEASES_PAGE_URL)
  })
}
