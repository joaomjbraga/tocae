import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AiPlayerState, AiProviderConfig, AiStatus } from '@shared/ai'
import { DEFAULT_AI_PROVIDER_CONFIG } from '@shared/ai'
import { readSettings, writeSettings } from '../settings'
import { AiCore, AiRequestError } from './core'
import { AiProviderError, OpenAiCompatibleProvider } from './provider'
import { clearAiHistoryFile, readAiHistoryFile, writeAiHistoryFile } from './historyStore'
import { getLibrarySnapshot } from '../library'
import { readPlaylist } from '../playlist'
import { AI_TOOL_DEFINITIONS, executeReadOnlyTool } from './tools'
import { getMediaMetadata } from '../media/metadata'
import { sendCommand } from '../commands'
import {
  cosineSimilarity,
  libraryFingerprint,
  readSemanticIndex,
  writeSemanticIndex,
  type SemanticIndexEntry,
} from './semanticIndex'

const CREDENTIAL_FILE_NAME = 'ai-credentials.json'
const HISTORY_FILE_NAME = 'ai-history.json'
const SEMANTIC_INDEX_FILE_NAME = 'ai-library-index.json'
const EMBEDDING_BATCH_SIZE = 64
let historyWriteQueue: Promise<void> = Promise.resolve()
const core = new AiCore(
  (config) => {
    const apiKey = readCredentialSync()
    return apiKey ? new OpenAiCompatibleProvider(config, apiKey) : null
  },
  AI_TOOL_DEFINITIONS,
  async (name, args) => {
    if (name === 'get_player_state') {
      const playlist = await readPlaylist()
      const current = playlist.currentIndex >= 0 ? playlist.items[playlist.currentIndex] : null
      return {
        ...playerState,
        current: current ? { name: current.name } : null,
      }
    }
    if (name === 'player_play') {
      sendCommand({ type: 'playback-play' })
      return { accepted: true, action: 'play' }
    }
    if (name === 'player_pause') {
      sendCommand({ type: 'playback-pause' })
      return { accepted: true, action: 'pause' }
    }
    if (name === 'player_toggle') {
      sendCommand({ type: 'playback-toggle' })
      return { accepted: true, action: 'toggle' }
    }
    if (name === 'player_next') {
      sendCommand({ type: 'next-video' })
      return { accepted: true, action: 'next' }
    }
    if (name === 'player_previous') {
      sendCommand({ type: 'previous-video' })
      return { accepted: true, action: 'previous' }
    }

    if (name === 'search_library_semantic') {
      if (!isRecord(args) || typeof args.query !== 'string' || !args.query.trim()) {
        throw new Error('A busca semântica exige uma descrição.')
      }
      if (!credentialCache) {
        throw new Error('Configure uma chave de API antes de usar a busca semântica.')
      }

      const library = await getLibrarySnapshot()
      const fingerprint = libraryFingerprint(library)
      let index = await readSemanticIndex(semanticIndexPath())
      if (!index || index.fingerprint !== fingerprint) {
        const provider = new OpenAiCompatibleProvider(config, credentialCache)
        const entries: SemanticIndexEntry[] = []

        for (let start = 0; start < library.items.length; start += EMBEDDING_BATCH_SIZE) {
          const batch = library.items.slice(start, start + EMBEDDING_BATCH_SIZE)
          const texts = batch.map((item) =>
            [item.name, item.relativePath, item.type].filter(Boolean).join(' | '),
          )
          const vectors = await provider.embed(texts, new AbortController().signal)
          for (let indexValue = 0; indexValue < batch.length; indexValue += 1) {
            const item = batch[indexValue]
            entries.push({
              path: item.path,
              name: item.name,
              relativePath: item.relativePath,
              type: item.type,
              text: texts[indexValue],
              vector: vectors[indexValue],
            })
          }
        }

        await writeSemanticIndex(semanticIndexPath(), fingerprint, entries)
        index = { version: 1, fingerprint, entries }
      }

      const provider = new OpenAiCompatibleProvider(config, credentialCache)
      const [queryVector] = await provider.embed(
        [String(args.query).trim()],
        new AbortController().signal,
      )
      const type = typeof args.type === 'string' ? args.type : null
      const limit =
        typeof args.limit === 'number' && Number.isInteger(args.limit)
          ? Math.min(50, Math.max(1, args.limit))
          : 20

      return {
        matches: index.entries
          .filter((entry) => !type || entry.type === type)
          .map((entry) => ({
            name: entry.name,
            relativePath: entry.relativePath,
            type: entry.type,
            score: cosineSimilarity(queryVector, entry.vector),
          }))
          .sort((left, right) => right.score - left.score)
          .slice(0, limit),
      }
    }

    if (name === 'get_current_media') {
      const playlist = await readPlaylist()
      const current = playlist.currentIndex >= 0 ? playlist.items[playlist.currentIndex] : null
      if (!current) return { current: null }

      const metadata = await getMediaMetadata(current.path)
      return {
        current: {
          name: current.name,
          title: metadata.title ?? current.name,
          metadata: {
            fileSize: metadata.fileSize,
            title: metadata.title,
            artist: metadata.artist,
            album: metadata.album,
            description: metadata.description,
            year: metadata.year,
            genres: metadata.genres,
            duration: metadata.duration,
            codec: metadata.codec,
            width: metadata.width,
            height: metadata.height,
            capturedAt: metadata.capturedAt,
            camera: metadata.camera,
          },
        },
      }
    }

    const [library, playlist] = await Promise.all([
      getLibrarySnapshot(),
      readPlaylist(),
    ])
    return executeReadOnlyTool(name, args, library, playlist)
  },
)
let config: AiProviderConfig = { ...DEFAULT_AI_PROVIDER_CONFIG }
let initialized = false
let playerState: AiPlayerState = { playing: false, updatedAt: 0 }

function credentialsPath(): string {
  return path.join(app.getPath('userData'), CREDENTIAL_FILE_NAME)
}

function historyPath(): string {
  return path.join(app.getPath('userData'), HISTORY_FILE_NAME)
}

function semanticIndexPath(): string {
  return path.join(app.getPath('userData'), SEMANTIC_INDEX_FILE_NAME)
}

let credentialCache: string | null = null

async function initialize(): Promise<void> {
  if (initialized) return
  const settings = await readSettings()
  config = settings.ai ?? { ...DEFAULT_AI_PROVIDER_CONFIG }
  credentialCache = await readCredential()
  core.restoreHistory(await readAiHistoryFile(historyPath()))
  initialized = true
}

function persistHistory(): Promise<void> {
  const write = historyWriteQueue.then(() =>
    writeAiHistoryFile(historyPath(), core.getHistory()),
  )
  historyWriteQueue = write.catch((error) => {
    console.warn('Could not persist AI history', error)
  })
  return historyWriteQueue
}

function readCredentialSync(): string | null {
  return credentialCache
}

async function readCredential(): Promise<string | null> {
  if (!safeStorage.isEncryptionAvailable()) return null
  let raw: string
  try {
    raw = await readFile(credentialsPath(), 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return null
    console.warn('Could not read AI credentials', error)
    return null
  }
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!isRecord(parsed) || typeof parsed.value !== 'string') return null
    const encrypted = Buffer.from(parsed.value, 'base64')
    return safeStorage.decryptString(encrypted)
  } catch (error) {
    console.warn('Could not decrypt AI credentials', error)
    return null
  }
}

async function writeCredential(apiKey: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('O armazenamento seguro de credenciais não está disponível neste sistema.')
  }
  const encrypted = safeStorage.encryptString(apiKey)
  const file = credentialsPath()
  const temp = `${file}.tmp`
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(temp, JSON.stringify({ version: 1, value: encrypted.toString('base64') }), 'utf8')
  await rename(temp, file)
  credentialCache = apiKey
}

async function removeCredential(): Promise<void> {
  try {
    await rm(credentialsPath(), { force: true })
  } catch (error) {
    if (!isMissingFile(error)) throw error
  }
  credentialCache = null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function validateConfig(value: unknown): AiProviderConfig {
  if (!isRecord(value)) throw new TypeError('Configuração de IA inválida.')
  if (value.provider !== 'openai-compatible') throw new TypeError('Provedor de IA inválido.')
  if (typeof value.baseUrl !== 'string' || typeof value.model !== 'string') {
    throw new TypeError('URL base e modelo são obrigatórios.')
  }
  const baseUrl = value.baseUrl.trim().replace(/\/+$/, '')
  const model = value.model.trim()
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new TypeError('A URL base do provedor é inválida.')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError('Use uma URL HTTP ou HTTPS.')
  }
  if (!model) throw new TypeError('Informe o modelo.')
  return {
    provider: 'openai-compatible',
    baseUrl: url.toString().replace(/\/+$/, ''),
    model,
    embeddingModel:
      typeof value.embeddingModel === 'string' && value.embeddingModel.trim()
        ? value.embeddingModel.trim()
        : 'text-embedding-3-small',
  }
}

function status(): AiStatus {
  return {
    configured: Boolean(credentialCache),
    busy: core.isBusy(),
    provider: { ...config },
    messages: core.getHistory(),
  }
}

function validateSender(event: IpcMainInvokeEvent): void {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || !BrowserWindow.getAllWindows().includes(window)) {
    throw new Error('Solicitação de IA enviada por uma janela desconhecida.')
  }
}

function normalizeError(error: unknown): Error {
  if (error instanceof AiRequestError || error instanceof AiProviderError) return error
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error('Solicitação cancelada ou excedeu o tempo limite.')
  }
  if (error instanceof Error) {
    if (/fetch failed|network|ENOTFOUND|ECONN|timeout/i.test(error.message)) {
      return new Error('Não foi possível conectar ao provedor. Verifique a URL e a conexão.')
    }
    return error
  }
  return new Error('Não foi possível concluir a solicitação de IA.')
}

export function registerAiIpc(): void {
  void initialize()

  ipcMain.handle(IPC_CHANNELS.AI_STATUS_GET, async (event) => {
    validateSender(event)
    await initialize()
    return status()
  })
  ipcMain.handle(IPC_CHANNELS.AI_PLAYER_STATE_SET, (event, value: unknown) => {
    validateSender(event)
    if (
      !isRecord(value) ||
      typeof value.playing !== 'boolean' ||
      typeof value.updatedAt !== 'number'
    ) {
      throw new TypeError('Estado do player inválido.')
    }
    playerState = {
      playing: value.playing,
      updatedAt: value.updatedAt,
    }
    return { ...playerState }
  })
  ipcMain.handle(IPC_CHANNELS.AI_PLAYER_STATE_GET, (event) => {
    validateSender(event)
    return { ...playerState }
  })
  ipcMain.handle(IPC_CHANNELS.AI_CONFIG_GET, async (event) => {
    validateSender(event)
    await initialize()
    return { ...config }
  })
  ipcMain.handle(IPC_CHANNELS.AI_CONFIG_SET, async (event, value: unknown) => {
    validateSender(event)
    await initialize()
    config = validateConfig(value)
    const settings = await readSettings()
    await writeSettings({ ...settings, ai: config })
    return { ...config }
  })
  ipcMain.handle(IPC_CHANNELS.AI_CREDENTIAL_SET, async (event, value: unknown) => {
    validateSender(event)
    await initialize()
    if (typeof value !== 'string' || !value.trim()) throw new TypeError('Informe uma chave de API.')
    await writeCredential(value.trim())
  })
  ipcMain.handle(IPC_CHANNELS.AI_CREDENTIAL_REMOVE, async (event) => {
    validateSender(event)
    await initialize()
    await removeCredential()
  })
  ipcMain.handle(IPC_CHANNELS.AI_SEND, async (event, value: unknown) => {
    validateSender(event)
    await initialize()
    if (typeof value !== 'string') throw new TypeError('A mensagem deve ser texto.')
    try {
      await core.send(value, config, (chunk) => {
        event.sender.send(IPC_CHANNELS.AI_STREAM_CHUNK, chunk)
      })
      await persistHistory()
      return status()
    } catch (error) {
      throw normalizeError(error)
    }
  })
  ipcMain.handle(IPC_CHANNELS.AI_CANCEL, async (event) => {
    validateSender(event)
    core.cancel()
    return status()
  })
  ipcMain.handle(IPC_CHANNELS.AI_CLEAR, async (event) => {
    validateSender(event)
    if (core.isBusy()) throw new Error('Cancele a solicitação antes de limpar o histórico.')
    core.clear()
    await clearAiHistoryFile(historyPath())
    return status()
  })
}
