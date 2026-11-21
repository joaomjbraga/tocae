import { lstat, mkdir, rename } from 'node:fs/promises'
import path from 'node:path'
import type { AiOrganizationPlan, AiOrganizationPlanEntry } from '@shared/ai'
import type { LibraryMediaItem, LibrarySnapshot } from '@shared/library'
import type { MediaMetadata } from '@shared/media'

export const MAX_ORGANIZATION_PLAN_ITEMS = 500
const METADATA_CONCURRENCY = 4
const RESERVED_WINDOWS_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i

export interface OrganizationPlanOptions {
  unknownArtist: string
  unknownAlbum: string
  unknownGenre: string
  videoFolder: string
  imageFolder: string
  organizeByGenre: boolean
  renameFiles: boolean
  namePattern: string
}

interface PlannedEntry extends AiOrganizationPlanEntry {
  destinationPath: string
}

export interface OrganizationMove {
  sourcePath: string
  destinationPath: string
}

export interface OrganizationApplyResult {
  appliedItems: number
  skippedItems: number
  failedItems: number
  undoAvailable: boolean
  moves: OrganizationMove[]
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function pathKey(filePath: string): string {
  const resolved = path.resolve(filePath)
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved
}

function samePath(left: string, right: string): boolean {
  return pathKey(left) === pathKey(right)
}

function safePathSegment(value: string | undefined, fallback: string): string {
  const cleaned = (value ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
    .slice(0, 120)
  if (!cleaned || cleaned === '.' || cleaned === '..') return fallback
  return RESERVED_WINDOWS_NAME.test(cleaned) ? `_${cleaned}` : cleaned
}

function safeFileName(fileName: string): string {
  const extension = path.extname(fileName).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 32)
  const name = safePathSegment(path.basename(fileName, path.extname(fileName)), 'Untitled')
  return `${name.slice(0, 120 - extension.length)}${extension}`
}

function applyNamePattern(
  item: LibraryMediaItem,
  metadata: MediaMetadata | undefined,
  options: OrganizationPlanOptions,
): string {
  if (!options.renameFiles) return safeFileName(item.name)
  const originalExtension = path.extname(item.name)
  const values: Record<string, string> = {
    artist: metadata?.artist ?? options.unknownArtist,
    album: metadata?.album ?? options.unknownAlbum,
    title: metadata?.title ?? path.basename(item.name, originalExtension),
    genre: metadata?.genres?.map((value) => value.trim()).find(Boolean) ?? options.unknownGenre,
    year: metadata?.year ? String(metadata.year) : '',
  }
  const baseName = options.namePattern
    .replace(/\{(artist|album|title|genre|year)\}/gi, (token, key: string) =>
      values[key.toLowerCase()] ?? token,
    )
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim()
  return safeFileName(`${baseName || path.basename(item.name, originalExtension)}${originalExtension}`)
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const index = nextIndex
        nextIndex += 1
        results[index] = await mapper(items[index])
      }
    }),
  )
  return results
}

function targetSegments(
  item: LibraryMediaItem,
  metadata: MediaMetadata | undefined,
  options: OrganizationPlanOptions,
): string[] {
  const fileName = applyNamePattern(item, metadata, options)
  if (item.type === 'audio') {
    if (options.organizeByGenre) {
      const genre = metadata?.genres?.map((value) => value.trim()).find(Boolean)
      return [
        safePathSegment(genre, options.unknownGenre),
        safePathSegment(metadata?.artist, options.unknownArtist),
        safePathSegment(metadata?.album, options.unknownAlbum),
        fileName,
      ]
    }
    return [
      safePathSegment(metadata?.artist, options.unknownArtist),
      safePathSegment(metadata?.album, options.unknownAlbum),
      fileName,
    ]
  }
  return [
    safePathSegment(item.type === 'video' ? options.videoFolder : options.imageFolder, 'Media'),
    fileName,
  ]
}

async function destinationExists(destinationPath: string): Promise<boolean> {
  try {
    await lstat(destinationPath)
    return true
  } catch (error) {
    if (isMissingFile(error)) return false
    throw error
  }
}

export async function buildOrganizationPlan(
  library: LibrarySnapshot,
  getMediaMetadata: (filePath: string) => Promise<MediaMetadata>,
  options: OrganizationPlanOptions,
): Promise<AiOrganizationPlan> {
  const candidates = library.items.slice(0, MAX_ORGANIZATION_PLAN_ITEMS)
  const folders = new Map(library.folders.map((folder) => [folder.id, folder]))
  const entries = await mapWithConcurrency(candidates, METADATA_CONCURRENCY, async (item) => {
    const folder = folders.get(item.folderId)
    if (!folder) throw new Error(`The library folder for "${item.relativePath}" is unavailable.`)
    const metadata = item.type === 'audio'
      ? await getMediaMetadata(item.path)
      : undefined
    const segments = targetSegments(item, metadata, options)
    const destinationPath = path.resolve(folder.path, ...segments)
    const relativeDestination = path.relative(folder.path, destinationPath)
    if (
      path.isAbsolute(relativeDestination) ||
      relativeDestination === '..' ||
      relativeDestination.startsWith(`..${path.sep}`)
    ) {
      throw new Error('The organization plan contains a path outside the library folder.')
    }

    const targetRelativePath = relativeDestination.split(path.sep).join('/')
    const sourcePath = path.resolve(item.path)
    const status = samePath(sourcePath, destinationPath)
      ? 'already-organized'
      : await destinationExists(destinationPath)
        ? 'target-conflict'
        : 'ready'

    return {
      folderName: folder.name,
      sourceRelativePath: item.relativePath,
      targetRelativePath,
      type: item.type,
      status,
      destinationPath,
    } satisfies PlannedEntry
  })

  const destinationIndexes = new Map<string, number[]>()
  for (let index = 0; index < entries.length; index += 1) {
    const key = pathKey(entries[index].destinationPath)
    const indexes = destinationIndexes.get(key) ?? []
    indexes.push(index)
    destinationIndexes.set(key, indexes)
  }
  for (const indexes of destinationIndexes.values()) {
    if (indexes.length < 2) continue
    for (const index of indexes) entries[index].status = 'target-conflict'
  }

  const publicEntries = entries.map(({ destinationPath: _destinationPath, ...entry }) => entry)
  return {
    totalItems: library.items.length,
    includedItems: publicEntries.length,
    omittedItems: Math.max(0, library.items.length - publicEntries.length),
    readyItems: publicEntries.filter((entry) => entry.status === 'ready').length,
    alreadyOrganizedItems:
      publicEntries.filter((entry) => entry.status === 'already-organized').length,
    conflictItems: publicEntries.filter((entry) => entry.status === 'target-conflict').length,
    entries: publicEntries,
    undoAvailable: false,
  }
}

export async function applyOrganizationPlan(
  library: LibrarySnapshot,
  getMediaMetadata: (filePath: string) => Promise<MediaMetadata>,
  options: OrganizationPlanOptions,
): Promise<OrganizationApplyResult> {
  const plan = await buildOrganizationPlan(library, getMediaMetadata, options)
  const moves: OrganizationMove[] = []
  let failedItems = 0
  let skippedItems = 0

  for (const entry of plan.entries) {
    if (entry.status !== 'ready') {
      skippedItems += 1
      continue
    }
    const item = library.items.find((candidate) =>
      candidate.relativePath === entry.sourceRelativePath &&
      library.folders.find((folder) =>
        folder.id === candidate.folderId && folder.name === entry.folderName
      ),
    )
    if (!item) {
      failedItems += 1
      continue
    }
    const folder = library.folders.find((candidate) => candidate.id === item.folderId)
    if (!folder) {
      failedItems += 1
      continue
    }
    const sourcePath = path.resolve(item.path)
    const destinationPath = path.resolve(folder.path, ...entry.targetRelativePath.split('/'))
    const relativeDestination = path.relative(folder.path, destinationPath)
    if (
      path.isAbsolute(relativeDestination) ||
      relativeDestination === '..' ||
      relativeDestination.startsWith(`..${path.sep}`)
    ) {
      failedItems += 1
      continue
    }
    try {
      const [sourceInfo, hasDestination] = await Promise.all([
        lstat(sourcePath),
        destinationExists(destinationPath),
      ])
      if (!sourceInfo.isFile() || hasDestination) {
        skippedItems += 1
        continue
      }
      await mkdir(path.dirname(destinationPath), { recursive: true })
      await rename(sourcePath, destinationPath)
      moves.push({ sourcePath, destinationPath })
    } catch {
      failedItems += 1
    }
  }

  return {
    appliedItems: moves.length,
    skippedItems,
    failedItems,
    undoAvailable: moves.length > 0,
    moves,
  }
}

export async function undoOrganizationMoves(
  moves: readonly OrganizationMove[],
): Promise<OrganizationApplyResult> {
  let restoredItems = 0
  let skippedItems = 0
  let failedItems = 0
  const remainingMoves: OrganizationMove[] = []

  for (const move of [...moves].reverse()) {
    try {
      const destinationInfo = await lstat(move.destinationPath).catch((error) => {
        if (isMissingFile(error)) return null
        throw error
      })
      if (!destinationInfo?.isFile()) {
        skippedItems += 1
        continue
      }
      if (await destinationExists(move.sourcePath)) {
        skippedItems += 1
        continue
      }
      await mkdir(path.dirname(move.sourcePath), { recursive: true })
      await rename(move.destinationPath, move.sourcePath)
      restoredItems += 1
    } catch (error) {
      if (isMissingFile(error)) {
        skippedItems += 1
        continue
      }
      failedItems += 1
      remainingMoves.push(move)
    }
  }

  return {
    appliedItems: restoredItems,
    skippedItems,
    failedItems,
    undoAvailable: false,
    moves: remainingMoves,
  }
}
