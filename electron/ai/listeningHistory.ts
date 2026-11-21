import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { MediaType } from '@shared/media'

export const MAX_LISTENING_HISTORY_ENTRIES = 500
export const MAX_LISTENING_HISTORY_NAME_LENGTH = 160
const MAX_LISTENING_HISTORY_TOOL_LIMIT = 20

export interface ListeningHistoryEntry {
  name: string
  type: MediaType
  playedAt: number
}

interface StoredListeningHistory {
  version: 1
  entries: readonly ListeningHistoryEntry[]
}

let writeQueue: Promise<void> = Promise.resolve()

export async function readListeningHistoryFile(file: string): Promise<ListeningHistoryEntry[]> {
  await writeQueue
  return readEntries(file)
}

export async function readListeningHistoryForTool(
  file: string,
  args: unknown,
  enabled: boolean,
  signal: AbortSignal,
): Promise<{ total: number; entries: { name: string; type: MediaType; playedAt: string }[] }> {
  if (!enabled) {
    throw new Error('Ative a coleta do histórico nas configurações do Teco para consultar reproduções recentes.')
  }
  if (!isRecord(args)) throw new TypeError('O limite do histórico não é válido.')
  throwIfAborted(signal)
  const entries = await readListeningHistoryFile(file)
  throwIfAborted(signal)
  const limit =
    typeof args.limit === 'number' && Number.isInteger(args.limit)
      ? Math.min(MAX_LISTENING_HISTORY_TOOL_LIMIT, Math.max(1, args.limit))
      : MAX_LISTENING_HISTORY_TOOL_LIMIT
  return {
    total: entries.length,
    entries: entries.slice(0, limit).map((entry) => ({
      name: entry.name,
      type: entry.type,
      playedAt: new Date(entry.playedAt).toISOString(),
    })),
  }
}

export function recordListeningHistory(
  file: string,
  entry: ListeningHistoryEntry,
): Promise<void> {
  const write = writeQueue.then(async () => {
    const entries = await readEntries(file)
    entries.unshift(entry)
    await writeEntries(file, entries.slice(0, MAX_LISTENING_HISTORY_ENTRIES))
  })
  writeQueue = write.catch(() => {})
  return write
}

export function clearListeningHistoryFile(file: string): Promise<void> {
  const write = writeQueue.then(async () => {
    await rm(file, { force: true })
    await rm(`${file}.tmp`, { force: true })
  })
  writeQueue = write.catch(() => {})
  return write
}

async function readEntries(file: string): Promise<ListeningHistoryEntry[]> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if (!isMissingFile(error)) {
      console.warn('Could not read Teco listening history', error)
      throw error
    }
    return []
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      console.warn('Ignoring invalid Teco listening history')
      return []
    }
    return parsed.entries
      .filter(isListeningHistoryEntry)
      .map(({ name, type, playedAt }) => ({ name, type, playedAt }))
  } catch (error) {
    console.warn('Could not parse Teco listening history', error)
    return []
  }
}

async function writeEntries(
  file: string,
  entries: readonly ListeningHistoryEntry[],
): Promise<void> {
  const tempFile = `${file}.tmp`
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(
    tempFile,
    JSON.stringify({ version: 1, entries } satisfies StoredListeningHistory),
    'utf8',
  )
  await rename(tempFile, file)
}

function isListeningHistoryEntry(value: unknown): value is ListeningHistoryEntry {
  if (!isRecord(value)) return false
  return (
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    value.name.length <= MAX_LISTENING_HISTORY_NAME_LENGTH &&
    (value.type === 'audio' || value.type === 'video' || value.type === 'image') &&
    typeof value.playedAt === 'number' &&
    Number.isFinite(value.playedAt) &&
    value.playedAt >= 0 &&
    Number.isFinite(new Date(value.playedAt).getTime())
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Solicitação cancelada.', 'AbortError')
}
