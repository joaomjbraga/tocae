import { app, BrowserWindow, dialog, ipcMain, safeStorage } from 'electron'
import type { IpcMainInvokeEvent } from 'electron'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { IPC_CHANNELS } from '@shared/ipc'
import type {
  AiDataPreferences,
  AiPlayerState,
  AiPlaylistProposal,
  AiProviderConfig,
  AiStatus,
} from '@shared/ai'
import { DEFAULT_AI_PROVIDER_CONFIG } from '@shared/ai'
import { mediaTypeForPath } from '@shared/media'
import { translate } from '@shared/i18n'
import type { Locale } from '@shared/i18n'
import { DEFAULT_SETTINGS } from '@shared/settings'
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
import { extractVideoFrameAt, getVideoDuration } from '../media/tracks'
import { sendCommand } from '../commands'
import { getAppLocale } from '../locale'
import {
  clearListeningHistoryFile,
  MAX_LISTENING_HISTORY_NAME_LENGTH,
  readListeningHistoryForTool,
  recordListeningHistory,
} from './listeningHistory'
import {
  buildRecommendations,
  clearRecommendationFeedbackFile,
  readRecommendationFeedbackFile,
  setRecommendationFeedback as saveRecommendationFeedback,
} from './recommendations'
import {
  cosineSimilarity,
  libraryFingerprint,
  readSemanticIndex,
  writeSemanticIndex,
  type SemanticIndexEntry,
} from './semanticIndex'
import {
  MAX_VIDEO_ANALYSIS_DURATION_SECONDS,
  sampleVideoFrameTimestamps,
} from './videoSampling'
import {
  applyOrganizationPlan,
  buildOrganizationPlan,
  undoOrganizationMoves,
  type OrganizationMove,
} from './organizationPlan'
import {
  readOrganizationUndoStore,
  writeOrganizationUndoStore,
} from './organizationUndoStore'

const CREDENTIAL_FILE_NAME = 'ai-credentials.json'
const HISTORY_FILE_NAME = 'ai-history.json'
const LISTENING_HISTORY_FILE_NAME = 'ai-listening-history.json'
const RECOMMENDATION_FEEDBACK_FILE_NAME = 'ai-recommendation-feedback.json'
const SEMANTIC_INDEX_FILE_NAME = 'ai-library-index.json'
const ORGANIZATION_UNDO_FILE_NAME = 'ai-organization-undo.json'
const EMBEDDING_BATCH_SIZE = 64
const MAX_FAVORITE_PATHS_PER_REQUEST = 10_000
const MAX_FAVORITE_PATH_CONTEXT_BYTES = 1024 * 1024
const MAX_AUDIO_MOOD_INPUT_BYTES = 10 * 1024 * 1024
const MAX_IMAGE_DESCRIPTION_INPUT_BYTES = 10 * 1024 * 1024
const MAX_VIDEO_ANALYSIS_FRAME_BYTES = 8 * 1024 * 1024
const MEDIA_ANALYSIS_TIMEOUT_MS = 90_000
let historyWriteQueue: Promise<void> = Promise.resolve()
let organizationUndoMoves: OrganizationMove[] = []
let mediaAnalysisController: AbortController | null = null
const core = new AiCore(
  createConfiguredProvider,
  AI_TOOL_DEFINITIONS,
  async (name, args, signal, requestContext) => {
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

    if (name === 'get_favorites' && !dataPreferences.allowFavorites) {
      throw new Error('Ative o acesso aos favoritos nas configurações do Teco para consultar essa lista.')
    }
    if (name === 'get_favorites') {
      if (!isRecord(args)) throw new TypeError('O limite de favoritos não é válido.')
      const library = await getLibrarySnapshot()
      throwIfAborted(signal)
      return executeReadOnlyTool(name, args, library, undefined, {
        favoritesEnabled: true,
        favoritePaths: requestContext.favoritePaths,
      })
    }

    if (name === 'get_listening_history') {
      return readListeningHistoryForTool(
        listeningHistoryPath(),
        args,
        dataPreferences.collectPlaybackHistory,
        signal,
      )
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
      throwIfAborted(signal)
      if (config.provider !== 'ollama' && !credentialForProvider(credentialCache, config.provider)) {
        throw new Error('Configure uma chave de API antes de usar a busca semântica.')
      }

      const library = await getLibrarySnapshot()
      throwIfAborted(signal)
      const fingerprint = libraryFingerprint(library)
      let index = await readSemanticIndex(semanticIndexPath())
      throwIfAborted(signal)
      if (!index || index.fingerprint !== fingerprint) {
        const provider = createConfiguredProvider(config)
        if (!provider) throw new Error('Configure uma chave de API antes de usar a busca semântica.')
        const entries: SemanticIndexEntry[] = []

        for (let start = 0; start < library.items.length; start += EMBEDDING_BATCH_SIZE) {
          throwIfAborted(signal)
          const batch = library.items.slice(start, start + EMBEDDING_BATCH_SIZE)
          const texts = batch.map((item) =>
            [item.name, item.relativePath, item.type].filter(Boolean).join(' | '),
          )
          const vectors = await provider.embed(texts, signal)
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

        throwIfAborted(signal)
        await writeSemanticIndex(semanticIndexPath(), fingerprint, entries)
        index = { version: 1, fingerprint, entries }
      }

      throwIfAborted(signal)
      const provider = createConfiguredProvider(config)
      if (!provider) throw new Error('Configure uma chave de API antes de usar a busca semântica.')
      const [queryVector] = await provider.embed(
        [String(args.query).trim()],
        signal,
      )
      throwIfAborted(signal)
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

    const [library, playlist] = await Promise.all([getLibrarySnapshot(), readPlaylist()])
    return executeReadOnlyTool(name, args, library, playlist, {
      getMediaMetadata,
      signal,
      favoritesEnabled: dataPreferences.allowFavorites,
      favoritePaths: requestContext.favoritePaths,
    })
  },
)
let config: AiProviderConfig = { ...DEFAULT_AI_PROVIDER_CONFIG }
let dataPreferences: AiDataPreferences = { ...DEFAULT_SETTINGS.aiData }
let initialized = false
let playerState: AiPlayerState = { playing: false, updatedAt: 0 }
let playlistProposal: AiPlaylistProposal | null = null

function credentialsPath(): string {
  return path.join(app.getPath('userData'), CREDENTIAL_FILE_NAME)
}

function historyPath(): string {
  return path.join(app.getPath('userData'), HISTORY_FILE_NAME)
}

function listeningHistoryPath(): string {
  return path.join(app.getPath('userData'), LISTENING_HISTORY_FILE_NAME)
}

function recommendationFeedbackPath(): string {
  return path.join(app.getPath('userData'), RECOMMENDATION_FEEDBACK_FILE_NAME)
}

function audioMoodMimeType(filePath: string): string | null {
  const mimeTypes: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg',
    '.aac': 'audio/aac',
    '.m4a': 'audio/mp4',
  }
  return mimeTypes[path.extname(filePath).toLowerCase()] ?? null
}

function imageDescriptionMimeType(filePath: string): string | null {
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  }
  return mimeTypes[path.extname(filePath).toLowerCase()] ?? null
}

async function extractVideoAnalysisFrames(
  filePath: string,
  durationSeconds: number | undefined,
  signal: AbortSignal,
): Promise<PreparedMediaPart[]> {
  if (durationSeconds === undefined || durationSeconds <= 0) {
    throw new Error('A valid video duration is required for analysis.')
  }
  const frames: PreparedMediaPart[] = []
  let totalBytes = 0
  for (const timestampSeconds of sampleVideoFrameTimestamps(durationSeconds)) {
    if (signal.aborted) throw new DOMException('Solicitação cancelada.', 'AbortError')
    const data = await extractVideoFrameAt(filePath, timestampSeconds, signal)
    totalBytes += data.byteLength
    if (totalBytes > MAX_VIDEO_ANALYSIS_FRAME_BYTES) {
      throw new Error('Os quadros extraídos excederam o limite total de 8 MiB.')
    }
    frames.push({ data, mimeType: 'image/jpeg', timestampSeconds })
  }
  return frames
}

function samePath(left: string, right: string): boolean {
  const normalizedLeft = path.resolve(left)
  const normalizedRight = path.resolve(right)
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight
}

interface ConfirmedMediaAnalysisOptions {
  type: 'audio' | 'image' | 'video'
  isEnabled: () => boolean
  disabledMessage: string
  maxBytes: number | null
  mimeTypeForPath?: (filePath: string) => string | null
  unsupportedFormatMessage: string
  sizeLimitMessage: string
  durationLimitMessage?: (locale: Locale) => string
  consent: {
    title: (locale: Locale) => string
    message: (locale: Locale, name: string) => string
    detail: (locale: Locale, sizeMiB: string, durationSeconds?: number) => string
    confirm: (locale: Locale) => string
    cancel: (locale: Locale) => string
  }
  prepareMedia?: (
    filePath: string,
    signal: AbortSignal,
    durationSeconds?: number,
  ) => Promise<PreparedMediaPart[]>
  analyze: (
    provider: GeminiSdkProvider,
    media: readonly PreparedMediaPart[],
    signal: AbortSignal,
    locale: Locale,
  ) => Promise<string>
}

interface PreparedMediaPart {
  data: Uint8Array
  mimeType: string
  timestampSeconds?: number
}

async function analyzeLibraryMediaWithConsent(
  event: IpcMainInvokeEvent,
  value: unknown,
  options: ConfirmedMediaAnalysisOptions,
): Promise<string | null> {
  validateSender(event)
  await initialize()
  if (mediaAnalysisController) {
    throw new Error('Já existe uma análise multimodal em andamento.')
  }
  const controller = new AbortController()
  mediaAnalysisController = controller
  let timeout: ReturnType<typeof setTimeout> | null = null

  try {
    const locale = getAppLocale()
    if (!options.isEnabled()) throw new Error(options.disabledMessage)
    if (config.provider !== 'gemini') {
      throw new Error('A análise multimodal está disponível apenas com o provedor Gemini.')
    }
    const analysisConfig = { ...config }
    const apiKey = credentialForProvider(credentialCache, 'gemini')
    if (!apiKey) throw new Error('Configure uma chave de API do Gemini antes da análise.')
    const assertAnalysisSettingsUnchanged = () => {
      if (!options.isEnabled()) {
        throw new Error('A análise foi desativada antes do envio.')
      }
      if (
        config.provider !== 'gemini' ||
        config.model !== analysisConfig.model ||
        credentialForProvider(credentialCache, 'gemini') !== apiKey
      ) {
        throw new Error('A configuração do Gemini mudou. Confirme a análise novamente.')
      }
    }
    if (typeof value !== 'string' || !path.isAbsolute(value)) {
      throw new TypeError('Selecione uma mídia válida da biblioteca.')
    }

    const resolvedPath = path.resolve(value)
    if (mediaTypeForPath(resolvedPath) !== options.type) {
      throw new Error(options.unsupportedFormatMessage)
    }
    const mimeType = options.mimeTypeForPath?.(resolvedPath) ?? null
    if (options.type !== 'video' && !mimeType) {
      throw new Error(options.unsupportedFormatMessage)
    }
    const library = await getLibrarySnapshot()
    if (controller.signal.aborted) throw new DOMException('Solicitação cancelada.', 'AbortError')
    if (!library.items.some(
      (item) => item.type === options.type && samePath(item.path, resolvedPath),
    )) {
      throw new Error('A mídia precisa estar na biblioteca local do Tocaê.')
    }
    const fileInfo = await stat(resolvedPath)
    if (!fileInfo.isFile()) throw new Error('O caminho selecionado não é um arquivo.')
    if (fileInfo.size === 0 || (options.maxBytes !== null && fileInfo.size > options.maxBytes)) {
      throw new Error(options.sizeLimitMessage)
    }
    const durationSeconds = options.type === 'video'
      ? await getVideoDuration(resolvedPath, controller.signal)
      : undefined
    if (
      durationSeconds !== undefined &&
      durationSeconds > MAX_VIDEO_ANALYSIS_DURATION_SECONDS
    ) {
      throw new Error(
        options.durationLimitMessage?.(locale) ?? 'O vídeo excede o limite de duração da análise.',
      )
    }

    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner) throw new Error('Não foi possível confirmar a janela que solicitou a análise.')
    const confirmation = await dialog.showMessageBox(owner, {
      type: 'warning',
      title: options.consent.title(locale),
      message: options.consent.message(locale, path.basename(resolvedPath)),
      detail: options.consent.detail(
        locale,
        (fileInfo.size / (1024 * 1024)).toFixed(1),
        durationSeconds,
      ),
      buttons: [
        options.consent.confirm(locale),
        options.consent.cancel(locale),
      ],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    })
    if (confirmation.response !== 0) return null
    if (controller.signal.aborted) throw new DOMException('Solicitação cancelada.', 'AbortError')
    assertAnalysisSettingsUnchanged()

    const currentInfo = await stat(resolvedPath)
    if (
      !currentInfo.isFile() ||
      currentInfo.size !== fileInfo.size ||
      currentInfo.mtimeMs !== fileInfo.mtimeMs
    ) {
      throw new Error('O arquivo mudou depois da confirmação. Selecione-o novamente para analisar.')
    }
    timeout = setTimeout(() => controller.abort(), MEDIA_ANALYSIS_TIMEOUT_MS)
    const media = options.prepareMedia
      ? await options.prepareMedia(resolvedPath, controller.signal, durationSeconds)
      : mimeType
        ? [{ data: await readFile(resolvedPath), mimeType }]
        : []
    if (media.length === 0) throw new Error('Nenhuma mídia foi preparada para a análise.')
    if (controller.signal.aborted) throw new DOMException('Solicitação cancelada.', 'AbortError')
    assertAnalysisSettingsUnchanged()
    const preparedInfo = await stat(resolvedPath)
    if (
      !preparedInfo.isFile() ||
      preparedInfo.size !== fileInfo.size ||
      preparedInfo.mtimeMs !== fileInfo.mtimeMs
    ) {
      throw new Error('O arquivo mudou durante a análise. Selecione-o novamente para analisar.')
    }
    const provider = new GeminiSdkProvider(analysisConfig, apiKey)
    return await options.analyze(provider, media, controller.signal, locale)
  } catch (error) {
    throw normalizeError(error)
  } finally {
    if (timeout) clearTimeout(timeout)
    if (mediaAnalysisController === controller) mediaAnalysisController = null
  }
}

function semanticIndexPath(): string {
  return path.join(app.getPath('userData'), SEMANTIC_INDEX_FILE_NAME)
}

function organizationUndoPath(): string {
  return path.join(app.getPath('userData'), ORGANIZATION_UNDO_FILE_NAME)
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
  dataPreferences = { ...settings.aiData }
  credentialCache = await readCredentials()
  core.restoreHistory(await readAiHistoryFile(historyPath()))
  organizationUndoMoves = await readOrganizationUndoStore(organizationUndoPath())
  initialized = true
}

function persistHistory(): Promise<void> {
  const write = historyWriteQueue.then(() =>
    writeAiHistoryFile(historyPath(), core.getHistory()),
  )
  historyWriteQueue = write.catch((error) => {
    console.warn('Could not persist AI history', error)
  })
  return write
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

function validateAiDataPreferences(value: unknown): AiDataPreferences {
  if (
    !isRecord(value) ||
    typeof value.allowFavorites !== 'boolean' ||
    typeof value.collectPlaybackHistory !== 'boolean' ||
    typeof value.localRecommendations !== 'boolean' ||
    typeof value.audioMoodAnalysis !== 'boolean' ||
    typeof value.imageDescription !== 'boolean' ||
    typeof value.videoAnalysis !== 'boolean' ||
    typeof value.fileOrganizationPreview !== 'boolean' ||
    typeof value.fileOrganizationByGenre !== 'boolean' ||
    typeof value.fileOrganizationRename !== 'boolean' ||
    typeof value.fileOrganizationNamePattern !== 'string'
  ) {
    throw new TypeError('As preferências de dados do Teco não são válidas.')
  }
  return {
    allowFavorites: value.allowFavorites,
    collectPlaybackHistory: value.collectPlaybackHistory,
    localRecommendations: value.localRecommendations,
    audioMoodAnalysis: value.audioMoodAnalysis,
    imageDescription: value.imageDescription,
    videoAnalysis: value.videoAnalysis,
    fileOrganizationPreview: value.fileOrganizationPreview,
    fileOrganizationByGenre: value.fileOrganizationByGenre,
    fileOrganizationRename: value.fileOrganizationRename,
    fileOrganizationNamePattern: value.fileOrganizationNamePattern.slice(0, 160),
  }
}

function validateFavoritePaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_FAVORITE_PATHS_PER_REQUEST) {
    throw new TypeError('A lista de favoritos enviada ao Teco não é válida.')
  }
  const paths = new Set<string>()
  let totalBytes = 0
  for (const item of value) {
    if (typeof item !== 'string' || item.length === 0 || item.length > 4096) {
      throw new TypeError('A lista de favoritos enviada ao Teco não é válida.')
    }
    totalBytes += Buffer.byteLength(item, 'utf8')
    if (totalBytes > MAX_FAVORITE_PATH_CONTEXT_BYTES) {
      throw new TypeError('A lista de favoritos enviada ao Teco excede o limite permitido.')
    }
    paths.add(item)
  }
  return [...paths]
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException('Solicitação cancelada.', 'AbortError')
}

function status(): AiStatus {
  return {
    configured:
      config.provider === 'ollama' ||
      Boolean(credentialForProvider(credentialCache, config.provider)),
    busy: core.isBusy(),
    provider: { ...config },
    dataPreferences: { ...dataPreferences },
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
  ipcMain.handle(IPC_CHANNELS.AI_DATA_PREFERENCES_SET, async (event, value: unknown) => {
    validateSender(event)
    await initialize()
    const nextPreferences = validateAiDataPreferences(value)
    const settings = await readSettings()
    await writeSettings({ ...settings, aiData: nextPreferences })
    dataPreferences = nextPreferences
    return { ...dataPreferences }
  })
  ipcMain.handle(IPC_CHANNELS.AI_PLAYBACK_RECORD, async (event, filePath: unknown, title: unknown) => {
    validateSender(event)
    await initialize()
    if (!dataPreferences.collectPlaybackHistory) return
    if (
      typeof filePath !== 'string' ||
      !path.isAbsolute(filePath) ||
      !mediaTypeForPath(filePath)
    ) {
      return
    }
    if (typeof title !== 'string') throw new TypeError('O título da mídia precisa ser texto.')
    const resolvedPath = path.resolve(filePath)
    const type = mediaTypeForPath(resolvedPath)
    if (!type || type === 'image') return
    await recordListeningHistory(listeningHistoryPath(), {
      name: title.trim().slice(0, MAX_LISTENING_HISTORY_NAME_LENGTH)
        || path.basename(resolvedPath).slice(0, MAX_LISTENING_HISTORY_NAME_LENGTH),
      type,
      playedAt: Date.now(),
    })
  })
  ipcMain.handle(IPC_CHANNELS.AI_LISTENING_HISTORY_CLEAR, async (event) => {
    validateSender(event)
    await initialize()
    await clearListeningHistoryFile(listeningHistoryPath())
  })
  ipcMain.handle(IPC_CHANNELS.AI_RECOMMENDATIONS_GET, async (event, value: unknown) => {
    validateSender(event)
    await initialize()
    if (!dataPreferences.localRecommendations) {
      throw new Error('Ative as recomendações locais nas configurações do Teco para continuar.')
    }
    const favoritePaths = validateFavoritePaths(value)
    const [library, feedback] = await Promise.all([
      getLibrarySnapshot(),
      readRecommendationFeedbackFile(recommendationFeedbackPath()),
    ])
    return buildRecommendations(library.items, favoritePaths, feedback, getMediaMetadata)
  })
  ipcMain.handle(
    IPC_CHANNELS.AI_RECOMMENDATION_FEEDBACK_SET,
    async (event, value: unknown, feedback: unknown) => {
      validateSender(event)
      await initialize()
      if (!dataPreferences.localRecommendations) {
        throw new Error('Ative as recomendações locais nas configurações do Teco para continuar.')
      }
      if (
        typeof value !== 'string' ||
        !path.isAbsolute(value) ||
        (feedback !== 'like' && feedback !== 'dislike')
      ) {
        throw new TypeError('O feedback da recomendação não é válido.')
      }
      const library = await getLibrarySnapshot()
      if (!library.items.some((item) => item.path === value && item.type === 'audio')) {
        throw new Error('A faixa não está mais disponível na biblioteca.')
      }
      await saveRecommendationFeedback(
        recommendationFeedbackPath(),
        value,
        feedback,
      )
    },
  )
  ipcMain.handle(IPC_CHANNELS.AI_RECOMMENDATIONS_CLEAR, async (event) => {
    validateSender(event)
    await initialize()
    await clearRecommendationFeedbackFile(recommendationFeedbackPath())
  })
  ipcMain.handle(IPC_CHANNELS.AI_ORGANIZATION_PLAN_GET, async (event) => {
    validateSender(event)
    await initialize()
    if (!dataPreferences.fileOrganizationPreview) {
      throw new Error('Ative a prévia de organização nas configurações do Teco para continuar.')
    }
    const locale = getAppLocale()
    const plan = await buildOrganizationPlan(
      await getLibrarySnapshot(),
      getMediaMetadata,
      {
        unknownArtist: translate(locale, 'assistant.organizationUnknownArtist'),
        unknownAlbum: translate(locale, 'assistant.organizationUnknownAlbum'),
        unknownGenre: translate(locale, 'assistant.organizationUnknownGenre'),
        videoFolder: translate(locale, 'assistant.organizationVideoFolder'),
        imageFolder: translate(locale, 'assistant.organizationImageFolder'),
        organizeByGenre: dataPreferences.fileOrganizationByGenre,
        renameFiles: dataPreferences.fileOrganizationRename,
        namePattern: dataPreferences.fileOrganizationNamePattern,
      },
    )
    return { ...plan, undoAvailable: organizationUndoMoves.length > 0 }
  })
  ipcMain.handle(IPC_CHANNELS.AI_ORGANIZATION_APPLY, async (event) => {
    validateSender(event)
    await initialize()
    if (!dataPreferences.fileOrganizationPreview) {
      throw new Error('Ative a prévia de organização nas configurações do Teco para continuar.')
    }
    const locale = getAppLocale()
    const options = {
      unknownArtist: translate(locale, 'assistant.organizationUnknownArtist'),
      unknownAlbum: translate(locale, 'assistant.organizationUnknownAlbum'),
      unknownGenre: translate(locale, 'assistant.organizationUnknownGenre'),
      videoFolder: translate(locale, 'assistant.organizationVideoFolder'),
      imageFolder: translate(locale, 'assistant.organizationImageFolder'),
      organizeByGenre: dataPreferences.fileOrganizationByGenre,
      renameFiles: dataPreferences.fileOrganizationRename,
      namePattern: dataPreferences.fileOrganizationNamePattern,
    }
    const library = await getLibrarySnapshot()
    const preview = await buildOrganizationPlan(library, getMediaMetadata, options)
    if (preview.readyItems === 0) {
      throw new Error('Não há itens prontos para organizar.')
    }
    const owner = BrowserWindow.fromWebContents(event.sender)
    if (!owner) throw new Error('Não foi possível confirmar a janela da prévia.')
    const confirmation = await dialog.showMessageBox(owner, {
      type: 'warning',
      title: translate(locale, 'assistant.organizationApplyConfirmTitle'),
      message: translate(locale, 'assistant.organizationApplyConfirmMessage', {
        count: preview.readyItems,
      }),
      detail: translate(locale, 'assistant.organizationApplyConfirmDetail'),
      buttons: [
        translate(locale, 'assistant.organizationApplyConfirm'),
        translate(locale, 'assistant.organizationApplyCancel'),
      ],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    })
    if (confirmation.response !== 0) return null

    const result = await applyOrganizationPlan(library, getMediaMetadata, options)
    organizationUndoMoves = result.moves
    await writeOrganizationUndoStore(organizationUndoPath(), organizationUndoMoves)
    return {
      appliedItems: result.appliedItems,
      skippedItems: result.skippedItems,
      failedItems: result.failedItems,
      undoAvailable: result.undoAvailable,
    }
  })
  ipcMain.handle(IPC_CHANNELS.AI_ORGANIZATION_UNDO, async (event) => {
    validateSender(event)
    await initialize()
    if (organizationUndoMoves.length === 0) {
      throw new Error('Não há organização aplicada que possa ser desfeita.')
    }
    const result = await undoOrganizationMoves(organizationUndoMoves)
    organizationUndoMoves = result.moves
    await writeOrganizationUndoStore(organizationUndoPath(), organizationUndoMoves)
    return {
      appliedItems: result.appliedItems,
      skippedItems: result.skippedItems,
      failedItems: result.failedItems,
      undoAvailable: result.moves.length > 0,
    }
  })
  ipcMain.handle(IPC_CHANNELS.AI_AUDIO_MOOD_ANALYZE, (event, value: unknown) =>
    analyzeLibraryMediaWithConsent(event, value, {
      type: 'audio',
      isEnabled: () => dataPreferences.audioMoodAnalysis,
      disabledMessage: 'Ative a análise de áudio nas configurações do Teco para continuar.',
      maxBytes: MAX_AUDIO_MOOD_INPUT_BYTES,
      mimeTypeForPath: audioMoodMimeType,
      unsupportedFormatMessage: 'Formato não suportado. Use MP3, WAV, FLAC, OGG, AAC ou M4A.',
      sizeLimitMessage: 'O áudio precisa ter entre 1 byte e 10 MiB para ser analisado.',
      consent: {
        title: (locale) => translate(locale, 'assistant.audioMoodConsentTitle'),
        message: (locale, name) =>
          translate(locale, 'assistant.audioMoodConsentMessage', { name }),
        detail: (locale, sizeMiB) =>
          translate(locale, 'assistant.audioMoodConsentDetail', { sizeMiB }),
        confirm: (locale) => translate(locale, 'assistant.audioMoodConsentConfirm'),
        cancel: (locale) => translate(locale, 'assistant.audioMoodConsentCancel'),
      },
      analyze: (provider, media, signal, locale) => {
        const [audio] = media
        if (!audio) throw new Error('Nenhum áudio foi preparado para a análise.')
        return provider.analyzeAudioMood(audio.data, audio.mimeType, signal, locale)
      },
    }),
  )
  ipcMain.handle(IPC_CHANNELS.AI_AUDIO_MOOD_CANCEL, (event) => {
    validateSender(event)
    mediaAnalysisController?.abort()
  })
  ipcMain.handle(IPC_CHANNELS.AI_IMAGE_DESCRIPTION_ANALYZE, (event, value: unknown) =>
    analyzeLibraryMediaWithConsent(event, value, {
      type: 'image',
      isEnabled: () => dataPreferences.imageDescription,
      disabledMessage: 'Ative a descrição de imagem nas configurações do Teco para continuar.',
      maxBytes: MAX_IMAGE_DESCRIPTION_INPUT_BYTES,
      mimeTypeForPath: imageDescriptionMimeType,
      unsupportedFormatMessage: 'Formato não suportado. Use JPEG, PNG ou WebP.',
      sizeLimitMessage: 'A imagem precisa ter entre 1 byte e 10 MiB para ser analisada.',
      consent: {
        title: (locale) => translate(locale, 'assistant.imageDescriptionConsentTitle'),
        message: (locale, name) =>
          translate(locale, 'assistant.imageDescriptionConsentMessage', { name }),
        detail: (locale, sizeMiB) =>
          translate(locale, 'assistant.imageDescriptionConsentDetail', { sizeMiB }),
        confirm: (locale) => translate(locale, 'assistant.imageDescriptionConsentConfirm'),
        cancel: (locale) => translate(locale, 'assistant.imageDescriptionConsentCancel'),
      },
      analyze: (provider, media, signal, locale) => {
        const [image] = media
        if (!image) throw new Error('Nenhuma imagem foi preparada para a análise.')
        return provider.describeImage(image.data, image.mimeType, signal, locale)
      },
    }),
  )
  ipcMain.handle(IPC_CHANNELS.AI_IMAGE_DESCRIPTION_CANCEL, (event) => {
    validateSender(event)
    mediaAnalysisController?.abort()
  })
  ipcMain.handle(IPC_CHANNELS.AI_VIDEO_ANALYZE, (event, value: unknown) =>
    analyzeLibraryMediaWithConsent(event, value, {
      type: 'video',
      isEnabled: () => dataPreferences.videoAnalysis,
      disabledMessage: 'Ative a análise de vídeo nas configurações do Teco para continuar.',
      maxBytes: null,
      unsupportedFormatMessage: 'Selecione um formato de vídeo compatível da biblioteca.',
      sizeLimitMessage: 'O vídeo selecionado não tem um tamanho válido.',
      durationLimitMessage: (locale) =>
        translate(locale, 'assistant.videoAnalysisTooLong'),
      prepareMedia: (filePath, signal, durationSeconds) =>
        extractVideoAnalysisFrames(filePath, durationSeconds, signal),
      consent: {
        title: (locale) => translate(locale, 'assistant.videoAnalysisConsentTitle'),
        message: (locale, name) =>
          translate(locale, 'assistant.videoAnalysisConsentMessage', { name }),
        detail: (locale, sizeMiB, durationSeconds) =>
          translate(locale, 'assistant.videoAnalysisConsentDetail', {
            sizeMiB,
            durationMinutes: ((durationSeconds ?? 0) / 60).toFixed(1),
          }),
        confirm: (locale) => translate(locale, 'assistant.videoAnalysisConsentConfirm'),
        cancel: (locale) => translate(locale, 'assistant.videoAnalysisConsentCancel'),
      },
      analyze: (provider, media, signal, locale) => {
        const frames = media.map((part) => {
          if (part.timestampSeconds === undefined) {
            throw new Error('Um quadro de vídeo não tem um horário válido.')
          }
          return { data: part.data, timestampSeconds: part.timestampSeconds }
        })
        return provider.describeVideo(frames, signal, locale)
      },
    }),
  )
  ipcMain.handle(IPC_CHANNELS.AI_VIDEO_CANCEL, (event) => {
    validateSender(event)
    mediaAnalysisController?.abort()
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
  ipcMain.handle(IPC_CHANNELS.AI_SEND, async (event, value: unknown, favorites: unknown) => {
    validateSender(event)
    await initialize()
    if (typeof value !== 'string') throw new TypeError('A mensagem deve ser texto.')
    const favoritePaths = dataPreferences.allowFavorites
      ? validateFavoritePaths(favorites ?? [])
      : []
    try {
      await core.send(value, config, (chunk) => {
        event.sender.send(IPC_CHANNELS.AI_STREAM_CHUNK, chunk)
      }, { favoritePaths })
      try {
        await persistHistory()
      } catch {
        throw new AiRequestError(
          'A resposta foi gerada, mas não foi possível salvar o histórico. Verifique o espaço disponível e as permissões.',
        )
      }
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
