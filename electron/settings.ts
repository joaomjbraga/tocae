import { app } from 'electron'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { DEFAULT_SETTINGS } from '@shared/settings'
import type { Settings } from '@shared/settings'
import { isLocale } from '@shared/i18n'

const STORE_FILE_NAME = 'settings.json'
let writeQueue: Promise<void> = Promise.resolve()

function storeFilePath(): string {
  return path.join(app.getPath('userData'), STORE_FILE_NAME)
}

/** Lê as preferências gravadas; arquivo ausente ou corrompido vira o padrão. */
export async function readSettings(): Promise<Settings> {
  let raw: string
  try {
    raw = await readFile(storeFilePath(), 'utf8')
  } catch (error) {
    if (!isMissingFile(error)) console.warn('Could not read app settings', error)
    return { ...DEFAULT_SETTINGS }
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    const stored = parsed as Partial<Settings> | null
    if (!stored || typeof stored !== 'object') return { ...DEFAULT_SETTINGS }
    const ai = stored.ai
    const aiData =
      typeof stored.aiData === 'object' && stored.aiData !== null
        ? stored.aiData
        : DEFAULT_SETTINGS.aiData
    return {
      locale: isLocale(stored.locale) ? stored.locale : null,
      ai:
        ai &&
        (ai.provider === 'openai' ||
          ai.provider === 'gemini' ||
          ai.provider === 'ollama' ||
          ai.provider === 'openai-compatible') &&
        typeof ai.baseUrl === 'string' &&
        typeof ai.model === 'string'
          ? {
              provider: ai.provider,
              baseUrl: ai.baseUrl,
              model: ai.model,
              embeddingModel:
                typeof ai.embeddingModel === 'string' && ai.embeddingModel.trim()
                  ? ai.embeddingModel
                  : undefined,
            }
          : { ...DEFAULT_SETTINGS.ai },
      aiData: {
        allowFavorites:
          typeof aiData.allowFavorites === 'boolean'
            ? aiData.allowFavorites
            : DEFAULT_SETTINGS.aiData.allowFavorites,
        collectPlaybackHistory:
          typeof aiData.collectPlaybackHistory === 'boolean'
            ? aiData.collectPlaybackHistory
            : DEFAULT_SETTINGS.aiData.collectPlaybackHistory,
        localRecommendations:
          typeof aiData.localRecommendations === 'boolean'
            ? aiData.localRecommendations
            : DEFAULT_SETTINGS.aiData.localRecommendations,
        audioMoodAnalysis:
          typeof aiData.audioMoodAnalysis === 'boolean'
            ? aiData.audioMoodAnalysis
            : DEFAULT_SETTINGS.aiData.audioMoodAnalysis,
        imageDescription:
          typeof aiData.imageDescription === 'boolean'
            ? aiData.imageDescription
            : DEFAULT_SETTINGS.aiData.imageDescription,
      },
    }
  } catch (error) {
    console.warn('Could not parse app settings; using defaults', error)
    return { ...DEFAULT_SETTINGS }
  }
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

/** Grava as preferências de forma atômica (arquivo temporário + rename). */
export function writeSettings(settings: Settings): Promise<void> {
  const write = writeQueue.then(() => persistSettings(settings))
  writeQueue = write.catch(() => {})
  return write
}

async function persistSettings(settings: Settings): Promise<void> {
  const file = storeFilePath()
  const tempFile = `${file}.tmp`

  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(tempFile, JSON.stringify({ version: 1, ...settings }, null, 2), 'utf8')
  await rename(tempFile, file)
}
