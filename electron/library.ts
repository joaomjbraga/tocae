import { randomUUID } from 'node:crypto'
import { watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import {
  STANDARD_LIBRARY_FOLDERS,
  type LibraryFolder,
  type LibraryFolderKind,
  type LibraryMediaItem,
  type LibrarySnapshot,
  type StandardLibraryFolderId,
} from '@shared/library'
import { mediaTypeForPath } from '@shared/media'
import { translate } from '@shared/i18n'
import { getAppLocale } from './locale'
import { findMediaInFolder } from './media/files'
import { getMainWindow } from './windows'

const STORE_FILE_NAME = 'library.json'
const WATCH_RETRY_MS = 30_000
const WATCH_FALLBACK_POLL_MS = 15_000
const CHANGE_DEBOUNCE_MS = 450

let folders: LibraryFolder[] = []
let initialization: Promise<void> | null = null
let folderMutationQueue: Promise<void> = Promise.resolve()
let watchers = new Map<string, FSWatcher>()
let watcherRetryTimer: ReturnType<typeof setInterval> | null = null
let fallbackPollTimer: ReturnType<typeof setInterval> | null = null
let changeTimer: ReturnType<typeof setTimeout> | null = null

function storeFilePath(): string {
  return path.join(app.getPath('userData'), STORE_FILE_NAME)
}

function isStandardFolderKind(value: unknown): value is StandardLibraryFolderId {
  return (
    typeof value === 'string' &&
    (STANDARD_LIBRARY_FOLDERS as readonly string[]).includes(value)
  )
}

function isLibraryFolder(value: unknown): value is LibraryFolder {
  if (typeof value !== 'object' || value === null) return false
  const folder = value as Partial<LibraryFolder>
  return (
    typeof folder.id === 'string' &&
    folder.id.length > 0 &&
    typeof folder.name === 'string' &&
    folder.name.length > 0 &&
    typeof folder.path === 'string' &&
    folder.path.length > 0 &&
    (folder.kind === 'custom' || isStandardFolderKind(folder.kind))
  )
}

function pathKey(folderPath: string): string {
  const resolved = path.resolve(folderPath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function normalizeFolders(values: unknown[]): LibraryFolder[] {
  const seen = new Set<string>()
  const result: LibraryFolder[] = []

  for (const value of values) {
    if (!isLibraryFolder(value)) continue
    const resolvedPath = path.resolve(value.path)
    const key = pathKey(resolvedPath)
    if (seen.has(key)) continue
    seen.add(key)

    const kind: LibraryFolderKind = value.kind
    result.push({
      id: kind === 'custom' ? value.id : kind,
      kind,
      name: kind === 'custom' ? value.name : kind,
      path: resolvedPath,
    })
  }

  return result
}

function defaultFolders(): LibraryFolder[] {
  return normalizeFolders(
    STANDARD_LIBRARY_FOLDERS.map((kind) => ({
      id: kind,
      kind,
      name: kind,
      path: app.getPath(kind),
    })),
  )
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

async function readStoredFolders(): Promise<LibraryFolder[] | null> {
  let raw: string
  try {
    raw = await readFile(storeFilePath(), 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return null
    console.error('Could not read the media library folders', error)
    return defaultFolders()
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || !('folders' in parsed)) {
      console.warn('Ignoring invalid media library configuration')
      return null
    }
    const storedFolders = (parsed as { folders?: unknown }).folders
    if (!Array.isArray(storedFolders)) {
      console.warn('Ignoring invalid media library folder list')
      return null
    }
    return normalizeFolders(storedFolders)
  } catch (error) {
    console.warn('Could not parse media library configuration', error)
    return null
  }
}

async function persistFolders(nextFolders: LibraryFolder[]): Promise<void> {
  const file = storeFilePath()
  const tempFile = `${file}.tmp`
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(
    tempFile,
    JSON.stringify({ version: 1, folders: nextFolders }, null, 2),
    'utf8',
  )
  await rename(tempFile, file)
}

export function initializeLibrary(): Promise<void> {
  if (initialization) return initialization

  initialization = (async () => {
    const storedFolders = await readStoredFolders()
    folders = storedFolders ?? defaultFolders()
    if (storedFolders === null) await persistFolders(folders)

    refreshWatchers()
    watcherRetryTimer = setInterval(refreshWatchers, WATCH_RETRY_MS)
    watcherRetryTimer.unref?.()
    app.once('will-quit', disposeLibrary)
  })()

  return initialization
}

async function scanLibrary(): Promise<LibrarySnapshot> {
  const currentFolders = [...folders]
  const scanOrder = [...currentFolders].sort((left, right) => right.path.length - left.path.length)
  const unavailableFolderIds = new Set<string>()
  const scanned = await Promise.all(
    scanOrder.map(async (folder) => {
      const filePaths = await findMediaInFolder(folder.path, (_directoryPath, error) => {
        if (isMissingFile(error)) return
        if (unavailableFolderIds.has(folder.id)) return
        unavailableFolderIds.add(folder.id)
        console.warn(`Could not read part of media folder "${folder.path}"`, error)
      })
      return { folder, filePaths }
    }),
  )

  const seenPaths = new Set<string>()
  const items: LibraryMediaItem[] = []
  for (const { folder, filePaths } of scanned) {
    for (const filePath of filePaths) {
      const key = pathKey(filePath)
      if (seenPaths.has(key)) continue
      seenPaths.add(key)

      const type = mediaTypeForPath(filePath)
      if (!type) continue
      items.push({
        path: filePath,
        name: path.basename(filePath),
        relativePath: path.relative(folder.path, filePath).replace(/\\/g, '/'),
        folderId: folder.id,
        type,
      })
    }
  }

  const folderOrder = new Map(currentFolders.map((folder, index) => [folder.id, index]))
  items.sort((left, right) => {
    const folderDifference =
      (folderOrder.get(left.folderId) ?? 0) - (folderOrder.get(right.folderId) ?? 0)
    if (folderDifference !== 0) return folderDifference
    return left.relativePath.localeCompare(right.relativePath, undefined, {
      numeric: true,
      sensitivity: 'base',
    })
  })

  return {
    folders: currentFolders,
    items,
    unavailableFolderIds: [...unavailableFolderIds],
  }
}

async function getLibrarySnapshot(): Promise<LibrarySnapshot> {
  await initializeLibrary()
  return scanLibrary()
}

function isSameOrNestedPath(candidate: string, ancestor: string): boolean {
  const relative = path.relative(ancestor, candidate)
  return (
    relative === '' ||
    (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
  )
}

function watchRoots(): LibraryFolder[] {
  const candidates = [...folders].sort((left, right) => left.path.length - right.path.length)
  const roots: LibraryFolder[] = []
  for (const candidate of candidates) {
    if (!roots.some((root) => isSameOrNestedPath(candidate.path, root.path))) {
      roots.push(candidate)
    }
  }
  return roots
}

function enableFallbackPolling(): void {
  if (fallbackPollTimer) return
  fallbackPollTimer = setInterval(scheduleLibraryChange, WATCH_FALLBACK_POLL_MS)
  fallbackPollTimer.unref?.()
}

function refreshWatchers(): void {
  const roots = watchRoots()
  const rootKeys = new Set(roots.map((folder) => pathKey(folder.path)))
  let addedWatcher = false

  for (const [key, watcher] of watchers) {
    if (rootKeys.has(key)) continue
    watcher.close()
    watchers.delete(key)
  }

  for (const folder of roots) {
    const key = pathKey(folder.path)
    if (watchers.has(key)) continue

    try {
      const watcher = watch(folder.path, { recursive: true }, scheduleLibraryChange)
      watcher.on('error', (error) => {
        watcher.close()
        if (watchers.get(key) === watcher) watchers.delete(key)
        scheduleLibraryChange()
        if (isMissingFile(error)) return
        console.error(`Could not monitor media folder "${folder.path}"`, error)
        enableFallbackPolling()
      })
      watchers.set(key, watcher)
      addedWatcher = true
    } catch (error) {
      if (!isMissingFile(error)) {
        console.error(`Could not monitor media folder "${folder.path}"`, error)
        enableFallbackPolling()
      }
    }
  }

  if (addedWatcher) scheduleLibraryChange()
}

function scheduleLibraryChange(): void {
  if (changeTimer) clearTimeout(changeTimer)
  changeTimer = setTimeout(() => {
    changeTimer = null
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.LIBRARY_CHANGED)
    }
  }, CHANGE_DEBOUNCE_MS)
}

function disposeLibrary(): void {
  for (const watcher of watchers.values()) watcher.close()
  watchers.clear()
  if (watcherRetryTimer) clearInterval(watcherRetryTimer)
  if (fallbackPollTimer) clearInterval(fallbackPollTimer)
  if (changeTimer) clearTimeout(changeTimer)
}

function updateFolders(
  update: (current: LibraryFolder[]) => LibraryFolder[],
): Promise<void> {
  const operation = folderMutationQueue.then(async () => {
    const nextFolders = normalizeFolders(update([...folders]))
    if (JSON.stringify(nextFolders) === JSON.stringify(folders)) return
    await persistFolders(nextFolders)
    folders = nextFolders
    refreshWatchers()
  })
  folderMutationQueue = operation.then(
    () => undefined,
    () => undefined,
  )
  return operation
}

async function addLibraryFolder(): Promise<LibrarySnapshot | null> {
  const window = getMainWindow()
  if (!window) return null

  const locale = getAppLocale()
  const result = await dialog.showOpenDialog(window, {
    title: translate(locale, 'library.addFolderDialog'),
    properties: ['openDirectory'],
  })
  const [selectedPath] = result.filePaths
  if (result.canceled || !selectedPath) return null

  const resolvedPath = path.resolve(selectedPath)
  await updateFolders((current) => [
    ...current,
    {
      id: `custom:${randomUUID()}`,
      kind: 'custom',
      name: path.basename(resolvedPath) || resolvedPath,
      path: resolvedPath,
    },
  ])
  const snapshot = await getLibrarySnapshot()
  scheduleLibraryChange()
  return snapshot
}

async function removeLibraryFolder(folderId: unknown): Promise<LibrarySnapshot> {
  if (typeof folderId !== 'string' || folderId.length === 0) {
    throw new TypeError('A media library folder id is required.')
  }
  await updateFolders((current) => current.filter((folder) => folder.id !== folderId))
  const snapshot = await getLibrarySnapshot()
  scheduleLibraryChange()
  return snapshot
}

export function registerLibraryIpc(): void {
  ipcMain.handle(IPC_CHANNELS.LIBRARY_GET, () => getLibrarySnapshot())
  ipcMain.handle(IPC_CHANNELS.LIBRARY_ADD_FOLDER, () => addLibraryFolder())
  ipcMain.handle(IPC_CHANNELS.LIBRARY_REMOVE_FOLDER, (_event, folderId: unknown) =>
    removeLibraryFolder(folderId),
  )
}
