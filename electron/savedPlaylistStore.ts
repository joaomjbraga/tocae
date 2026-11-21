import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  MAX_SAVED_PLAYLIST_ITEM_COUNT,
  MAX_SAVED_PLAYLIST_NAME_LENGTH,
} from '../shared/playlist.ts'
import type { SavedPlaylist, PlaylistItem } from '@shared/playlist'

const MAX_SAVED_PLAYLISTS = 200
const MAX_SAVED_ITEM_NAME_LENGTH = 512
const MAX_SAVED_ITEM_PATH_LENGTH = 4096

interface StoredSavedPlaylists {
  version: 1
  playlists: readonly SavedPlaylist[]
}

let writeQueue: Promise<void> = Promise.resolve()

export async function readSavedPlaylistsFile(file: string): Promise<SavedPlaylist[]> {
  await writeQueue
  return readEntries(file)
}

export function createSavedPlaylistFile(
  file: string,
  name: unknown,
  items: unknown,
): Promise<SavedPlaylist> {
  return enqueueWrite(async () => {
    const playlists = await readEntries(file)
    if (playlists.length >= MAX_SAVED_PLAYLISTS) {
      throw new Error('O limite de playlists salvas foi atingido.')
    }
    const now = Date.now()
    const playlist: SavedPlaylist = {
      id: randomUUID(),
      name: validateName(name),
      items: validateItems(items, false),
      createdAt: now,
      updatedAt: now,
    }
    await writeEntries(file, [playlist, ...playlists])
    return playlist
  })
}

export function updateSavedPlaylistFile(
  file: string,
  id: unknown,
  name: unknown,
  items: unknown,
): Promise<SavedPlaylist> {
  return enqueueWrite(async () => {
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError('O identificador da playlist não é válido.')
    }
    const playlists = await readEntries(file)
    const index = playlists.findIndex((playlist) => playlist.id === id)
    if (index < 0) throw new Error('A playlist salva não foi encontrada.')
    const previous = playlists[index]
    const updated: SavedPlaylist = {
      ...previous,
      name: validateName(name),
      items: validateItems(items, true),
      updatedAt: Date.now(),
    }
    const next = [...playlists]
    next[index] = updated
    await writeEntries(file, next)
    return updated
  })
}

export function deleteSavedPlaylistFile(file: string, id: unknown): Promise<boolean> {
  return enqueueWrite(async () => {
    if (typeof id !== 'string' || id.length === 0) {
      throw new TypeError('O identificador da playlist não é válido.')
    }
    const playlists = await readEntries(file)
    const next = playlists.filter((playlist) => playlist.id !== id)
    if (next.length === playlists.length) return false
    await writeEntries(file, next)
    return true
  })
}

function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const write = writeQueue.then(operation)
  writeQueue = write.then(() => undefined, () => undefined)
  return write
}

async function readEntries(file: string): Promise<SavedPlaylist[]> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if (!isMissingFile(error)) {
      console.warn('Could not read saved playlists', error)
      throw error
    }
    return []
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.playlists)) {
      console.warn('Ignoring invalid saved playlists')
      return []
    }
    const ids = new Set<string>()
    return parsed.playlists
      .map(parseSavedPlaylist)
      .filter((playlist): playlist is SavedPlaylist => playlist !== null)
      .filter((playlist) => {
        if (ids.has(playlist.id)) return false
        ids.add(playlist.id)
        return true
      })
      .slice(0, MAX_SAVED_PLAYLISTS)
      .map((playlist) => ({
        ...playlist,
        items: normalizeItems(playlist.items, true),
      }))
  } catch (error) {
    console.warn('Could not parse saved playlists', error)
    return []
  }
}

async function writeEntries(file: string, playlists: readonly SavedPlaylist[]): Promise<void> {
  const tempFile = `${file}.tmp`
  const payload: StoredSavedPlaylists = { version: 1, playlists }
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(tempFile, JSON.stringify(payload, null, 2), 'utf8')
  await rename(tempFile, file)
}

function validateName(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.trim().length > MAX_SAVED_PLAYLIST_NAME_LENGTH
  ) {
    throw new TypeError('O nome da playlist precisa ter entre 1 e 80 caracteres.')
  }
  return value.trim()
}

function validateItems(value: unknown, allowEmpty: boolean): PlaylistItem[] {
  if (
    !Array.isArray(value) ||
    value.length > MAX_SAVED_PLAYLIST_ITEM_COUNT ||
    (!allowEmpty && value.length === 0) ||
    value.some((item) => !isSavedPlaylistItem(item))
  ) {
    throw new TypeError('Os itens da playlist não são válidos.')
  }
  return normalizeItems(value, allowEmpty)
}

function normalizeItems(items: readonly PlaylistItem[], allowEmpty: boolean): PlaylistItem[] {
  const seenPaths = new Set<string>()
  const seenIds = new Set<string>()
  const normalized: PlaylistItem[] = []
  for (const item of items) {
    if (seenPaths.has(item.path)) continue
    const id = seenIds.has(item.id) ? randomUUID() : item.id
    seenPaths.add(item.path)
    seenIds.add(id)
    normalized.push(id === item.id ? item : { ...item, id })
  }
  return allowEmpty || normalized.length > 0 ? normalized : []
}

function parseSavedPlaylist(value: unknown): SavedPlaylist | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    value.id.length === 0 ||
    value.id.length > 100 ||
    typeof value.name !== 'string' ||
    value.name.trim().length === 0 ||
    value.name.trim().length > MAX_SAVED_PLAYLIST_NAME_LENGTH ||
    !Array.isArray(value.items) ||
    value.items.length > MAX_SAVED_PLAYLIST_ITEM_COUNT ||
    typeof value.createdAt !== 'number' ||
    !Number.isFinite(value.createdAt) ||
    typeof value.updatedAt !== 'number' ||
    !Number.isFinite(value.updatedAt)
  ) {
    return null
  }
  return {
    id: value.id,
    name: value.name.trim(),
    items: value.items.filter(isSavedPlaylistItem),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  }
}

function isSavedPlaylistItem(value: unknown): value is PlaylistItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    value.id.length <= 100 &&
    typeof value.path === 'string' &&
    value.path.length > 0 &&
    value.path.length <= MAX_SAVED_ITEM_PATH_LENGTH &&
    path.isAbsolute(value.path) &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    value.name.length <= MAX_SAVED_ITEM_NAME_LENGTH
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
