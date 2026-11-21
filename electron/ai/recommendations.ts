import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AiRecommendation, AiRecommendationFeedback } from '@shared/ai'
import type { LibraryMediaItem } from '@shared/library'
import type { MediaMetadata } from '@shared/media'

const MAX_FEEDBACK_ENTRIES = 500
const MAX_SIGNAL_ITEMS = 50
const MAX_CANDIDATE_ITEMS = 300
const MAX_RECOMMENDATIONS = 12
const METADATA_CONCURRENCY = 4

export interface RecommendationFeedbackEntry {
  path: string
  feedback: AiRecommendationFeedback
  updatedAt: number
}

interface StoredRecommendationFeedback {
  version: 1
  entries: readonly RecommendationFeedbackEntry[]
}

type MetadataReader = (filePath: string) => Promise<MediaMetadata>

let writeQueue: Promise<void> = Promise.resolve()

export async function readRecommendationFeedbackFile(
  file: string,
): Promise<RecommendationFeedbackEntry[]> {
  await writeQueue
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return []
    console.warn('Could not read Teco recommendation feedback', error)
    throw error
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      console.warn('Ignoring invalid Teco recommendation feedback')
      return []
    }
    return normalizeFeedback(parsed.entries)
  } catch (error) {
    console.warn('Could not parse Teco recommendation feedback', error)
    return []
  }
}

export function setRecommendationFeedback(
  file: string,
  filePath: string,
  feedback: AiRecommendationFeedback,
): Promise<void> {
  if (!path.isAbsolute(filePath)) throw new TypeError('O caminho da recomendação não é válido.')
  if (feedback !== 'like' && feedback !== 'dislike') {
    throw new TypeError('O feedback da recomendação não é válido.')
  }
  const write = writeQueue.then(async () => {
    const entries = await readFeedback(file)
    entries.unshift({ path: filePath, feedback, updatedAt: Date.now() })
    await writeFeedback(file, normalizeFeedback(entries))
  })
  writeQueue = write.catch(() => {})
  return write
}

export function clearRecommendationFeedbackFile(file: string): Promise<void> {
  const write = writeQueue.then(async () => {
    await rm(file, { force: true })
    await rm(`${file}.tmp`, { force: true })
  })
  writeQueue = write.catch(() => {})
  return write
}

export async function buildRecommendations(
  items: readonly LibraryMediaItem[],
  favoritePaths: readonly string[],
  feedback: readonly RecommendationFeedbackEntry[],
  getMetadata: MetadataReader,
): Promise<AiRecommendation[]> {
  const audioItems = items.filter((item) => item.type === 'audio')
  const itemsByPath = new Map(audioItems.map((item) => [item.path, item]))
  const excludedPaths = new Set(
    feedback.filter((entry) => entry.feedback === 'dislike').map((entry) => entry.path),
  )
  const signalSources = new Map<string, 'favorite' | 'liked'>()
  favoritePaths.forEach((filePath) => {
    if (itemsByPath.has(filePath) && !excludedPaths.has(filePath)) {
      signalSources.set(filePath, 'favorite')
    }
  })
  feedback.forEach((entry) => {
    if (
      entry.feedback === 'like' &&
      itemsByPath.has(entry.path) &&
      !signalSources.has(entry.path)
    ) {
      signalSources.set(entry.path, 'liked')
    }
  })
  const signalPaths = new Set(signalSources.keys())
  const signals = [...signalSources]
    .map(([filePath, signal]) => ({
      item: itemsByPath.get(filePath),
      signal,
    }))
    .filter((entry): entry is { item: LibraryMediaItem; signal: 'favorite' | 'liked' } =>
      Boolean(entry.item),
    )
    .slice(0, MAX_SIGNAL_ITEMS)
  const sortedCandidates = audioItems
    .filter((item) => !signalPaths.has(item.path) && !excludedPaths.has(item.path))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }))
  const candidates = sortedCandidates.length <= MAX_CANDIDATE_ITEMS
    ? sortedCandidates
    : Array.from({ length: MAX_CANDIDATE_ITEMS }, (_, index) => {
        const sampleIndex = Math.round(
          index * (sortedCandidates.length - 1) / (MAX_CANDIDATE_ITEMS - 1),
        )
        return sortedCandidates[sampleIndex]
      })

  if (signals.length === 0 || candidates.length === 0) return []

  const [signalMetadata, candidateMetadata] = await Promise.all([
    loadMetadata(signals.map(({ item }) => item), getMetadata),
    loadMetadata(candidates, getMetadata),
  ])
  const recommendations: { recommendation: AiRecommendation; score: number }[] = []

  candidateMetadata.forEach(({ item, metadata }) => {
    if (!metadata) return
    let score = 0
    let bestReason: AiRecommendation['reason'] | null = null
    let bestReasonWeight = 0

    signalMetadata.forEach(({ item: signal, metadata: signalTags }, signalIndex) => {
      if (!signalTags) return
      const signalType = signals[signalIndex].signal
      const matches: { kind: AiRecommendation['reason']['kind']; value: string; weight: number }[] = []
      if (sameText(metadata.artist, signalTags.artist)) {
        matches.push({ kind: 'artist', value: metadata.artist ?? '', weight: 4 })
      }
      if (sameText(metadata.album, signalTags.album)) {
        matches.push({ kind: 'album', value: metadata.album ?? '', weight: 3 })
      }
      const signalGenres = new Set((signalTags.genres ?? []).map(normalizeText).filter(Boolean))
      const matchingGenre = metadata.genres?.find((genre) => signalGenres.has(normalizeText(genre)))
      if (matchingGenre) matches.push({ kind: 'genre', value: matchingGenre, weight: 2 })

      for (const match of matches) {
        score += match.weight
        if (match.weight > bestReasonWeight) {
          bestReasonWeight = match.weight
          bestReason = {
            kind: match.kind,
            value: match.value,
            basedOn: signalTags.title?.trim() || signal.name,
            signal: signalType,
          }
        }
      }
    })

    if (score > 0 && bestReason) {
      recommendations.push({
        score,
        recommendation: {
          path: item.path,
          name: item.name,
          title: metadata.title?.trim() || item.name,
          ...(metadata.artist ? { artist: metadata.artist } : {}),
          reason: bestReason,
        },
      })
    }
  })

  return recommendations
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.recommendation.title.localeCompare(right.recommendation.title, undefined, {
          sensitivity: 'base',
        }),
    )
    .slice(0, MAX_RECOMMENDATIONS)
    .map(({ recommendation }) => recommendation)
}

async function loadMetadata(
  items: readonly LibraryMediaItem[],
  getMetadata: MetadataReader,
): Promise<{ item: LibraryMediaItem; metadata: MediaMetadata | null }[]> {
  const results: { item: LibraryMediaItem; metadata: MediaMetadata | null }[] = []
  let nextIndex = 0
  const workers = Array.from(
    { length: Math.min(METADATA_CONCURRENCY, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex++
        const item = items[index]
        try {
          results[index] = { item, metadata: await getMetadata(item.path) }
        } catch (error) {
          console.warn('Could not read metadata for a Teco recommendation', error)
          results[index] = { item, metadata: null }
        }
      }
    },
  )
  await Promise.all(workers)
  return results
}

function normalizeFeedback(values: unknown[]): RecommendationFeedbackEntry[] {
  const seenPaths = new Set<string>()
  const entries: RecommendationFeedbackEntry[] = []
  for (const value of values) {
    if (
      !isRecord(value) ||
      typeof value.path !== 'string' ||
      !path.isAbsolute(value.path) ||
      (value.feedback !== 'like' && value.feedback !== 'dislike') ||
      typeof value.updatedAt !== 'number' ||
      !Number.isFinite(value.updatedAt) ||
      value.updatedAt < 0 ||
      seenPaths.has(value.path)
    ) {
      continue
    }
    seenPaths.add(value.path)
    entries.push({
      path: value.path,
      feedback: value.feedback,
      updatedAt: value.updatedAt,
    })
    if (entries.length >= MAX_FEEDBACK_ENTRIES) break
  }
  return entries
}

async function readFeedback(file: string): Promise<RecommendationFeedbackEntry[]> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return []
    console.warn('Could not read Teco recommendation feedback', error)
    throw error
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.entries)) {
      console.warn('Ignoring invalid Teco recommendation feedback')
      return []
    }
    return normalizeFeedback(parsed.entries)
  } catch (error) {
    console.warn('Could not parse Teco recommendation feedback', error)
    return []
  }
}

async function writeFeedback(
  file: string,
  entries: readonly RecommendationFeedbackEntry[],
): Promise<void> {
  const tempFile = `${file}.tmp`
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(
    tempFile,
    JSON.stringify({ version: 1, entries } satisfies StoredRecommendationFeedback),
    'utf8',
  )
  await rename(tempFile, file)
}

function sameText(left: string | undefined, right: string | undefined): boolean {
  return Boolean(left && right && normalizeText(left) === normalizeText(right))
}

function normalizeText(value: string): string {
  return value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
