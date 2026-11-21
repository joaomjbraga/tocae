import { app, BrowserWindow, ipcMain, safeStorage } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { IPC_CHANNELS } from '@shared/ipc'
import type {
  AiPlayerState,
  AiPlaylistProposal,
  AiProviderConfig,
  AiStatus,
} from '@shared/ai'
import { DEFAULT_AI_PROVIDER_CONFIG } from '@shared/ai'
import { readSettings, writeSettings } from '../settings'
import { AiCore, AiRequestError } from './core'
import { AiProviderError, GeminiSdkProvider, OpenAiCompatibleProvider } from './provider'
import type { AiProvider } from './provider'
import {
  credentialForProvider,
  migrateLegacyCredential,
  type AiCredentials,
  type CredentialProvider,
  validateAiProviderConfig,
} from './config'
import { clearAiHistoryFile, readAiHistoryFile, writeAiHistoryFile } from './historyStore'
import { getLibrarySnapshot } from '../library'
import { readPlaylist, writePlaylist } from '../playlist'
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
  createConfiguredProvider,
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

    if (name === 'propose_playlist') {
      if (
        !isRecord(args) ||
        typeof args.title !== 'string' ||
        typeof args.query !== 'string'
      ) {
        throw new Error('A proposta precisa de título e tema.')
      }
      const library = await getLibrarySnapshot()
      const query = args.query.trim().toLowerCase()
      const type = typeof args.type === 'string' ? args.type : null
      const limit =
        typeof args.limit === 'number' && Number.isInteger(args.limit)
          ? Math.min(50, Math.max(1, args.limit))
          : 20
      const terms = query.split(/\s+/).filter(Boolean)
      const matches = library.items
        .filter((item) => !type || item.type === type)
        .map((item) => {
          const searchable = `${item.name} ${item.relativePath} ${item.type}`.toLowerCase()
          const score = terms.reduce(
            (total, term) => total + (searchable.includes(term) ? 1 : 0),
            0,
          )
          return { item, score }
        })
        .filter(({ score }) => terms.length === 0 || score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, limit)
        .map(({ item }) => ({ path: item.path, name: item.name }))

      playlistProposal = {
        id: randomUUID(),
        title: args.title.trim(),
        items: matches,
        createdAt: Date.now(),
      }
      publishPlaylistProposal()
      return {
        accepted: true,
        title: playlistProposal.title,
        itemCount: playlistProposal.items.length,
        requiresUserConfirmation: true,
      }
    }

    if (name === 'search_library_semantic') {
      if (!isRecord(args) || typeof args.query !== 'string' || !args.query.trim()) {
        throw new Error('A busca semântica exige uma descrição.')
      }
      if (config.provider !== 'ollama' && !credentialForProvider(credentialCache, config.provider)) {
        throw new Error('Configure uma chave de API antes de usar a busca semântica.')
      }

      const library = await getLibrarySnapshot()
      const fingerprint = libraryFingerprint(library)
      let index = await readSemanticIndex(semanticIndexPath())
      if (!index || index.fingerprint !== fingerprint) {
        const provider = createConfiguredProvider(config)
        if (!provider) throw new Error('Configure uma chave de API antes de usar a busca semântica.')
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

      const provider = createConfiguredProvider(config)
      if (!provider) throw new Error('Configure uma chave de API antes de usar a busca semântica.')
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
let playlistProposal: AiPlaylistProposal | null = null

function credentialsPath(): string {
  return path.join(app.getPath('userData'), CREDENTIAL_FILE_NAME)
}

function historyPath(): string {
  return path.join(app.getPath('userData'), HISTORY_FILE_NAME)
}

function semanticIndexPath(): string {
  return path.join(app.getPath('userData'), SEMANTIC_INDEX_FILE_NAME)
}

let credentialCache: AiCredentials = {}

function createConfiguredProvider(providerConfig: AiProviderConfig): AiProvider | null {
  const apiKey = credentialForProvider(credentialCache, providerConfig.provider)
  if (providerConfig.provider === 'ollama') {
    return new OpenAiCompatibleProvider(providerConfig, '')
  }
  if (!apiKey) return null
  if (providerConfig.provider === 'gemini') {
    return new GeminiSdkProvider(providerConfig, apiKey)
  }
  return new OpenAiCompatibleProvider(providerConfig, apiKey)
}

async function initialize(): Promise<void> {
  if (initialized) return
  const settings = await readSettings()
  config = validateAiProviderConfig(settings.ai ?? { ...DEFAULT_AI_PROVIDER_CONFIG })
  credentialCache = await readCredentials()
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

async function readCredentials(): Promise<AiCredentials> {
  if (!safeStorage.isEncryptionAvailable()) return {}
  let raw: string
  try {
    raw = await readFile(credentialsPath(), 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return {}
    console.warn('Could not read AI credentials', error)
    return {}
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch (error) {
    console.warn('Could not parse AI credentials', error)
    return {}
  }
  if (!isRecord(parsed)) return {}
  if (parsed.version === 2 && isRecord(parsed.credentials)) {
    const credentials: AiCredentials = {}
    for (const provider of ['openai', 'gemini', 'openai-compatible'] as const) {
      const encrypted = parsed.credentials[provider]
      if (typeof encrypted !== 'string') continue
      try {
        credentials[provider] = safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
      } catch (error) {
        console.warn(`Could not decrypt ${provider} AI credentials`, error)
      }
    }
    return credentials
  }

  if (parsed.version === 1 && typeof parsed.value === 'string') {
    let legacyCredential: string
    try {
      legacyCredential = safeStorage.decryptString(Buffer.from(parsed.value, 'base64'))
    } catch (error) {
      console.warn('Could not decrypt legacy AI credentials', error)
      return {}
    }
    const credentials = migrateLegacyCredential(config.provider, legacyCredential)
    await writeCredentials(credentials)
    return credentials
  }
  return {}
}

async function writeCredentials(credentials: AiCredentials): Promise<void> {
  const entries = Object.entries(credentials).filter(
    (entry): entry is [CredentialProvider, string] => typeof entry[1] === 'string' && Boolean(entry[1]),
  )
  const file = credentialsPath()
  if (entries.length === 0) {
    await rm(file, { force: true })
    credentialCache = {}
    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('O armazenamento seguro de credenciais não está disponível neste sistema.')
  }
  const encryptedCredentials = Object.fromEntries(
    entries.map(([provider, apiKey]) => [
      provider,
      safeStorage.encryptString(apiKey).toString('base64'),
    ]),
  )
  const temp = `${file}.tmp`
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(
    temp,
    JSON.stringify({ version: 2, credentials: encryptedCredentials }),
    'utf8',
  )
  await rename(temp, file)
  credentialCache = Object.fromEntries(entries)
}

async function setCredential(provider: CredentialProvider, apiKey: string): Promise<void> {
  await writeCredentials({ ...credentialCache, [provider]: apiKey })
}

async function removeCredential(provider: CredentialProvider): Promise<void> {
  const credentials = { ...credentialCache }
  delete credentials[provider]
  await writeCredentials(credentials)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function status(): AiStatus {
  return {
    configured:
      config.provider === 'ollama' ||
      Boolean(credentialForProvider(credentialCache, config.provider)),
    busy: core.isBusy(),
    provider: { ...config },
    messages: core.getHistory(),
  }
}

function publishPlaylistProposal(): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(
        IPC_CHANNELS.AI_PLAYLIST_PROPOSAL_CHANGED,
        playlistProposal ? { ...playlistProposal, items: [...playlistProposal.items] } : null,
      )
    }
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
    if (/thought.?signature/i.test(error.message)) {
      return new Error(
        'O Gemini rejeitou a continuação de uma chamada de ferramenta. Tente novamente; se o problema persistir, atualize o Tocaê.',
      )
    }
    if (/HTTP 404|404/i.test(error.message)) {
      return new Error(
        'O modelo configurado não foi encontrado. Em Configurações > Teco, carregue os modelos disponíveis do Gemini, selecione um modelo listado e salve a configuração.',
      )
    }
    if (/HTTP 401|401|invalid api key|API_KEY_INVALID/i.test(error.message)) {
      return new Error('A chave da API não foi aceita pelo provedor. Verifique ou substitua a credencial.')
    }
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
  ipcMain.handle(IPC_CHANNELS.AI_PLAYLIST_PROPOSAL_GET, (event) => {
    validateSender(event)
    return playlistProposal
      ? { ...playlistProposal, items: [...playlistProposal.items] }
      : null
  })
  ipcMain.handle(IPC_CHANNELS.AI_PLAYLIST_PROPOSAL_APPLY, async (event) => {
    validateSender(event)
    if (!playlistProposal) return false
    const items = playlistProposal.items.map((item) => ({
      id: randomUUID(),
      path: item.path,
      name: item.name,
    }))
    await writePlaylist(items, items.length > 0 ? 0 : -1)
    playlistProposal = null
    publishPlaylistProposal()
    return true
  })
  ipcMain.handle(IPC_CHANNELS.AI_PLAYLIST_PROPOSAL_CLEAR, (event) => {
    validateSender(event)
    playlistProposal = null
    publishPlaylistProposal()
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
    config = validateAiProviderConfig(value)
    const settings = await readSettings()
    await writeSettings({ ...settings, ai: config })
    return { ...config }
  })
  ipcMain.handle(IPC_CHANNELS.AI_MODELS_LIST, async (event) => {
    validateSender(event)
    await initialize()
    if (config.provider !== 'gemini') {
      throw new Error('A listagem de modelos está disponível apenas para o Google Gemini.')
    }
    const apiKey = credentialForProvider(credentialCache, 'gemini')
    if (!apiKey) {
      throw new Error('Configure uma chave de API para carregar os modelos disponíveis.')
    }
    try {
      return await new GeminiSdkProvider(config, apiKey).listModels()
    } catch (error) {
      throw normalizeError(error)
    }
  })
  ipcMain.handle(IPC_CHANNELS.AI_CREDENTIAL_SET, async (event, value: unknown) => {
    validateSender(event)
    await initialize()
    if (config.provider === 'ollama') {
      throw new Error('O Ollama não precisa de uma chave de API.')
    }
    if (typeof value !== 'string' || !value.trim()) throw new TypeError('Informe uma chave de API.')
    await setCredential(config.provider, value.trim())
  })
  ipcMain.handle(IPC_CHANNELS.AI_CREDENTIAL_REMOVE, async (event) => {
    validateSender(event)
    await initialize()
    if (config.provider !== 'ollama') await removeCredential(config.provider)
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
