import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { LibrarySnapshot } from '@shared/library'

export interface SemanticIndexEntry {
  path: string
  name: string
  relativePath: string
  type: string
  text: string
  vector: number[]
}

interface StoredSemanticIndex {
  version: 1
  fingerprint: string
  entries: readonly SemanticIndexEntry[]
}

export function libraryFingerprint(library: LibrarySnapshot): string {
  return JSON.stringify(
    library.items.map((item) => [
      item.path,
      item.name,
      item.relativePath,
      item.type,
    ]),
  )
}

export async function readSemanticIndex(file: string): Promise<StoredSemanticIndex | null> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 1) return null
    if (typeof parsed.fingerprint !== 'string' || !Array.isArray(parsed.entries)) return null

    const entries: SemanticIndexEntry[] = []
    for (const value of parsed.entries) {
      if (!isRecord(value)) continue
      if (
        typeof value.path !== 'string' ||
        typeof value.name !== 'string' ||
        typeof value.relativePath !== 'string' ||
        typeof value.type !== 'string' ||
        typeof value.text !== 'string' ||
        !Array.isArray(value.vector)
      ) continue
      const vector = value.vector.filter(
        (item): item is number => typeof item === 'number' && Number.isFinite(item),
      )
      if (vector.length !== value.vector.length || vector.length === 0) continue
      entries.push({
        path: value.path,
        name: value.name,
        relativePath: value.relativePath,
        type: value.type,
        text: value.text,
        vector,
      })
    }
    return { version: 1, fingerprint: parsed.fingerprint, entries }
  } catch {
    return null
  }
}

export async function writeSemanticIndex(
  file: string,
  fingerprint: string,
  entries: readonly SemanticIndexEntry[],
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  const temp = `${file}.tmp`
  await writeFile(
    temp,
    JSON.stringify({ version: 1, fingerprint, entries } satisfies StoredSemanticIndex),
    'utf8',
  )
  await rename(temp, file)
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) return -1
  let dot = 0
  let leftLength = 0
  let rightLength = 0
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index]
    leftLength += left[index] * left[index]
    rightLength += right[index] * right[index]
  }
  if (leftLength === 0 || rightLength === 0) return -1
  return dot / (Math.sqrt(leftLength) * Math.sqrt(rightLength))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
