import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AiCore, AiRequestError } from './core.ts'
import {
  credentialForProvider,
  migrateLegacyCredential,
  validateAiProviderConfig,
  validateBaseUrl,
} from './config.ts'
import { GeminiSdkProvider, OpenAiCompatibleProvider } from './provider.ts'
import {
  clearAiHistoryFile,
  readAiHistoryFile,
  writeAiHistoryFile,
} from './historyStore.ts'
import {
  clearListeningHistoryFile,
  MAX_LISTENING_HISTORY_ENTRIES,
  MAX_LISTENING_HISTORY_NAME_LENGTH,
  readListeningHistoryForTool,
  readListeningHistoryFile,
  recordListeningHistory,
} from './listeningHistory.ts'
import {
  buildRecommendations,
  clearRecommendationFeedbackFile,
  readRecommendationFeedbackFile,
  setRecommendationFeedback,
} from './recommendations.ts'
import { executeReadOnlyTool } from './tools.ts'
import {
  cosineSimilarity,
  libraryFingerprint,
  readSemanticIndex,
  writeSemanticIndex,
} from './semanticIndex.ts'

const config = {
  provider: 'openai-compatible',
  baseUrl: 'https://api.example.test/v1',
  model: 'test-model',
}

test('provider credentials stay isolated and are never selected for Ollama', () => {
  const credentials = {
    openai: 'openai-secret',
    gemini: 'gemini-secret',
  }

  assert.equal(credentialForProvider(credentials, 'openai'), 'openai-secret')
  assert.equal(credentialForProvider(credentials, 'gemini'), 'gemini-secret')
  assert.equal(credentialForProvider(credentials, 'ollama'), null)
  assert.deepEqual(migrateLegacyCredential('gemini', 'legacy-secret'), {
    gemini: 'legacy-secret',
  })
  assert.deepEqual(migrateLegacyCredential('ollama', 'legacy-secret'), {})
})

test('remote providers require HTTPS while local HTTP endpoints remain available', () => {
  assert.equal(validateBaseUrl('http://localhost:11434/v1'), 'http://localhost:11434/v1')
  assert.equal(validateBaseUrl('http://127.0.0.1:11434/v1'), 'http://127.0.0.1:11434/v1')
  assert.equal(validateBaseUrl('http://[::1]:11434/v1'), 'http://[::1]:11434/v1')
  assert.equal(validateBaseUrl('https://api.example.test/v1'), 'https://api.example.test/v1')
  assert.throws(
    () => validateBaseUrl('http://api.example.test/v1'),
    /HTTPS para provedores remotos/,
  )
  assert.throws(
    () => validateBaseUrl('https://user:password@api.example.test/v1'),
    /Não inclua credenciais/,
  )
})

test('saved provider configuration is validated before use', () => {
  assert.throws(
    () => validateAiProviderConfig({
      provider: 'openai-compatible',
      baseUrl: 'http://api.example.test/v1',
      model: 'test-model',
    }),
    /HTTPS para provedores remotos/,
  )
  assert.equal(
    validateAiProviderConfig({
      provider: 'ollama',
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'llama3.2',
    }).provider,
    'ollama',
  )
})

test('Gemini model discovery returns only generative models with usable model IDs', async () => {
  const provider = new GeminiSdkProvider({
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-2.5-flash',
  }, 'test-key')
  provider.ai.models.list = async () => ({
    async *[Symbol.asyncIterator]() {
      yield {
        name: 'models/gemini-2.5-pro',
        displayName: 'Gemini 2.5 Pro',
        supportedActions: ['generateContent'],
      }
      yield {
        name: 'models/text-embedding-004',
        displayName: 'Embedding model',
        supportedActions: ['embedContent'],
      }
      yield {
        name: 'gemini-2.5-flash',
        displayName: 'Gemini 2.5 Flash',
        supportedActions: ['generateContent'],
      }
    },
  })

  assert.deepEqual(await provider.listModels(), [
    { name: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash' },
    { name: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro' },
  ])
})

test('Gemini sends the system instruction separately from conversation content', async () => {
  const provider = new GeminiSdkProvider({
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-3.8-flash',
  }, 'test-key')
  let request
  provider.ai.models.generateContentStream = async (value) => {
    request = value
    return (async function* () {
      yield { text: 'Tocaê response' }
    })()
  }

  await provider.sendStream(
    [
      { role: 'system', content: 'Stay within the Tocaê app.' },
      { role: 'user', content: 'What is playing?' },
    ],
    new AbortController().signal,
    () => {},
  )

  assert.equal(request.config.systemInstruction, 'Stay within the Tocaê app.')
  assert.equal(request.config.maxOutputTokens, 2048)
  assert.deepEqual(request.contents, [{ role: 'user', parts: [{ text: 'What is playing?' }] }])
})

test('Teco Gemini flow keeps scope, executes an allowed tool, and returns the final answer', async () => {
  const provider = new GeminiSdkProvider({
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-3.8-flash',
  }, 'test-key')
  const requests = []
  provider.ai.models.generateContentStream = async (request) => {
    requests.push(request)
    const response = requests.length === 1
      ? {
          functionCalls: [{ id: 'call-1', name: 'get_player_state', args: {} }],
          candidates: [{
            content: {
              role: 'model',
              parts: [{
                functionCall: { name: 'get_player_state', args: {} },
                thoughtSignature: 'sdk-signature',
              }],
            },
          }],
        }
      : { text: 'O Tocaê está pausado.' }
    return (async function* () {
      yield response
    })()
  }
  const tool = {
    type: 'function',
    function: {
      name: 'get_player_state',
      description: 'Consulta o estado do player do Tocaê.',
      parameters: { type: 'object', properties: {} },
    },
  }
  const executedTools = []
  const core = new AiCore(
    () => provider,
    [tool],
    async (name, args) => {
      executedTools.push({ name, args })
      return { playing: false, current: 'Amostra.mp3' }
    },
  )
  let streamed = ''

  await core.send('O que está tocando?', {
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-3.8-flash',
  }, (chunk) => { streamed += chunk })

  assert.equal(requests.length, 2)
  assert.match(requests[0].config.systemInstruction, /exclusivamente o Tocaê/)
  assert.equal(requests[0].config.tools[0].functionDeclarations[0].name, 'get_player_state')
  assert.equal(requests[1].contents[1].parts[0].thoughtSignature, 'sdk-signature')
  assert.deepEqual(executedTools, [{ name: 'get_player_state', args: {} }])
  assert.equal(streamed, 'O Tocaê está pausado.')
  assert.equal(core.getHistory().at(-1).content, streamed)
})

test('AI core adds user and assistant messages to history', async () => {
  let calls = 0
  const core = new AiCore(() => ({
    async sendStream(messages, signal, onChunk) {
      calls += 1
      assert.equal(signal.aborted, false)
      assert.equal(messages.at(-1)?.content, 'Hello')
      onChunk('Hi')
    },
  }))

  await core.send(' Hello ', config)

  assert.equal(calls, 1)
  assert.deepEqual(
    core.getHistory().map(({ role, content }) => ({ role, content })),
    [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ],
  )
})

test('AI core includes Teco scope instructions without persisting them in chat history', async () => {
  let sentMessages
  const core = new AiCore(() => ({
    async sendStream(messages, _signal, onChunk) {
      sentMessages = messages
      onChunk('Use the Tocaê library.')
    },
  }))

  await core.send('What is in my queue?', config)

  assert.equal(sentMessages[0].role, 'system')
  assert.match(sentMessages[0].content, /exclusivamente o Tocaê/)
  assert.deepEqual(core.getHistory().map(({ role }) => role), ['user', 'assistant'])
})

test('AI core passes favorite paths only to the per-request tool executor', async () => {
  const favoritePaths = ['/music/favorite.mp3']
  let context
  let providerMessages
  const core = new AiCore(
    () => ({
      async sendStream(messages, _signal, _onChunk, _tools, executeTool) {
        providerMessages = messages
        await executeTool('get_favorites', {})
      },
    }),
    [],
    async (_name, _args, _signal, requestContext) => {
      context = requestContext
      return {}
    },
  )

  await core.send('List my favorites', config, () => {}, { favoritePaths })

  assert.deepEqual(context, { favoritePaths })
  assert.equal(JSON.stringify(providerMessages).includes(favoritePaths[0]), false)
})

test('AI core blocks duplicate requests', async () => {
  let resolveSend
  const core = new AiCore(() => ({
    sendStream() {
      return new Promise((resolve) => { resolveSend = resolve })
    },
  }))

  const pending = core.send('First', config)
  await assert.rejects(
    core.send('Second', config),
    (error) => error instanceof AiRequestError,
  )
  resolveSend('Done')
  await pending
})

test('AI core supports cancellation', async () => {
  const core = new AiCore(() => ({
    sendStream(_messages, signal) {
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      })
    },
  }))

  const pending = core.send('Cancel me', config)
  core.cancel()
  await assert.rejects(pending, /cancel/i)
})

test('AI core propagates cancellation to an in-progress tool execution', async () => {
  let markStarted
  let toolSignal
  const started = new Promise((resolve) => { markStarted = resolve })
  const core = new AiCore(
    () => ({
      async sendStream(_messages, _signal, _onChunk, _tools, executeTool) {
        await executeTool('search_library_semantic', {})
      },
    }),
    [],
    async (_name, _args, signal) => new Promise((_resolve, reject) => {
      toolSignal = signal
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
      markStarted()
    }),
  )

  const pending = core.send('Search the library', config)
  await started
  core.cancel()

  await assert.rejects(pending, /cancel/i)
  assert.equal(toolSignal.aborted, true)
})

test('AI core rejects oversized user messages before calling the provider', async () => {
  let calls = 0
  const core = new AiCore(() => {
    calls += 1
    return { async sendStream() {} }
  })

  await assert.rejects(
    core.send('x'.repeat(8 * 1024 + 1), config),
    /limite de 8 KiB/,
  )
  assert.equal(calls, 0)
  assert.deepEqual(core.getHistory(), [])
})

test('AI core caps output and tool result sizes', async () => {
  const oversizedOutputCore = new AiCore(() => ({
    async sendStream(_messages, _signal, onChunk) {
      onChunk('x'.repeat(16 * 1024 + 1))
    },
  }))
  await assert.rejects(
    oversizedOutputCore.send('Respond briefly', config),
    /resposta excedeu o limite/,
  )

  const oversizedToolCore = new AiCore(
    () => ({
      async sendStream(_messages, _signal, _onChunk, _tools, executeTool) {
        await executeTool('get_playlist', {})
      },
    }),
    [{ type: 'function', function: { name: 'get_playlist', description: 'Get queue', parameters: {} } }],
    async () => ({ items: ['x'.repeat(8 * 1024)] }),
  )
  await assert.rejects(
    oversizedToolCore.send('Summarize my queue', config),
    /resultados das ferramentas excederam/,
  )

  const toolCallLimitCore = new AiCore(
    () => ({
      async sendStream(_messages, _signal, _onChunk, _tools, executeTool) {
        for (let index = 0; index < 6; index += 1) {
          await executeTool('get_playlist', {})
        }
      },
    }),
    [{ type: 'function', function: { name: 'get_playlist', description: 'Get queue', parameters: {} } }],
    async () => null,
  )
  await assert.rejects(
    toolCallLimitCore.send('Summarize my queue', config),
    /limite de chamadas de ferramentas/,
  )
})

test('AI core omits older messages when the provider context reaches its byte limit', async () => {
  let sentMessages
  const core = new AiCore(() => ({
    async sendStream(messages, _signal, onChunk) {
      sentMessages = messages
      onChunk('Done')
    },
  }))
  core.restoreHistory(Array.from({ length: 20 }, (_, index) => ({
    id: String(index),
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `message-${index} ${'x'.repeat(4 * 1024)}`,
    createdAt: index,
  })))

  await core.send('Latest request', config)

  assert.equal(sentMessages.at(-1).content, 'Latest request')
  assert.ok(sentMessages[0].content.includes('Mensagens antigas foram omitidas'))
  assert.ok(sentMessages.length < 21)
  assert.ok(Buffer.byteLength(JSON.stringify(sentMessages), 'utf8') <= 48 * 1024)
  assert.ok(
    core.getHistory().reduce(
      (total, message) => total + Buffer.byteLength(JSON.stringify(message), 'utf8'),
      0,
    ) <= 64 * 1024,
  )
})

test('OpenAI-compatible provider sends Chat Completions and normalizes the response', async () => {
  const originalFetch = globalThis.fetch
  let chunks = ''
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.example.test/v1/chat/completions')
    assert.equal(options.method, 'POST')
    assert.equal(options.redirect, 'error')
    assert.equal(JSON.parse(options.body).model, 'test-model')
    assert.equal(JSON.parse(options.body).max_tokens, 2048)
    const body =
      'data: {"choices":[{"delta":{"content":"Real provider "}}]}\n' +
      'data: {"choices":[{"delta":{"content":"response"}}]}\n' +
      'data: [DONE]\n'
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    })
  }

  try {
    const provider = new OpenAiCompatibleProvider(config, 'test-key')
    await provider.sendStream(
      [{ role: 'user', content: 'Hello' }],
      new AbortController().signal,
      (chunk) => { chunks += chunk },
    )
    assert.equal(chunks, 'Real provider response')
  } finally {
    globalThis.fetch = originalFetch
  }
})
test('AI core restores a validated in-memory history', () => {
  const core = new AiCore(() => null)
  core.restoreHistory([
    { id: '1', role: 'user', content: 'Hello', createdAt: 1 },
    { id: '2', role: 'assistant', content: 'Hi', createdAt: 2 },
  ])

  assert.deepEqual(
    core.getHistory().map(({ role, content }) => ({ role, content })),
    [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi' },
    ],
  )
})

test('AI history file persists, filters invalid entries, and clears', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tocae-ai-history-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'ai-history.json')
  const messages = [
    { id: '1', role: 'user', content: 'Hello', createdAt: 1 },
    { id: '2', role: 'assistant', content: 'Hi', createdAt: 2 },
  ]

  await writeAiHistoryFile(file, [...messages, { id: '', role: 'user', content: 'bad', createdAt: 3 }])

  assert.deepEqual(await readAiHistoryFile(file), messages)

  await clearAiHistoryFile(file)
  assert.deepEqual(await readAiHistoryFile(file), [])
})

test('AI history persistence failures reject to the caller', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tocae-ai-history-failure-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const blockedFile = path.join(directory, 'history')
  await mkdir(blockedFile)

  await assert.rejects(writeAiHistoryFile(blockedFile, []))
})

test('Teco listening history is bounded, ordered by recent play, and clearable', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tocae-listening-history-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'history.json')
  const oldEntries = Array.from({ length: MAX_LISTENING_HISTORY_ENTRIES }, (_, index) => ({
    name: `Track ${index}`.slice(0, MAX_LISTENING_HISTORY_NAME_LENGTH),
    type: 'audio',
    playedAt: index,
    path: `/private/music/track-${index}.mp3`,
  }))
  await writeFile(file, JSON.stringify({ version: 1, entries: oldEntries }))

  await recordListeningHistory(file, {
    name: 'Newest',
    type: 'audio',
    playedAt: MAX_LISTENING_HISTORY_ENTRIES,
  })

  const entries = await readListeningHistoryFile(file)
  assert.equal(entries.length, MAX_LISTENING_HISTORY_ENTRIES)
  assert.equal(entries[0].name, 'Newest')
  assert.equal(entries.at(-1).name, `Track ${MAX_LISTENING_HISTORY_ENTRIES - 2}`)
  const stored = JSON.parse(await readFile(file, 'utf8'))
  assert.ok(stored.entries.every((entry) => !('path' in entry)))

  await assert.rejects(
    readListeningHistoryForTool(file, {}, false, new AbortController().signal),
    /Ative a coleta/,
  )
  const historyToolResult = await readListeningHistoryForTool(
    file,
    { limit: 1 },
    true,
    new AbortController().signal,
  )
  assert.equal(historyToolResult.total, MAX_LISTENING_HISTORY_ENTRIES)
  assert.deepEqual(historyToolResult.entries, [{
    name: 'Newest',
    type: 'audio',
    playedAt: new Date(MAX_LISTENING_HISTORY_ENTRIES).toISOString(),
  }])
  const cappedHistoryToolResult = await readListeningHistoryForTool(
    file,
    { limit: MAX_LISTENING_HISTORY_ENTRIES },
    true,
    new AbortController().signal,
  )
  assert.equal(cappedHistoryToolResult.entries.length, 20)

  await clearListeningHistoryFile(file)
  assert.deepEqual(await readListeningHistoryFile(file), [])
})

test('local recommendations explain favorite and liked-track signals', async () => {
  const items = [
    { path: '/music/favorite.mp3', name: 'Favorite.mp3', type: 'audio' },
    { path: '/music/artist-match.mp3', name: 'Artist match.mp3', type: 'audio' },
    { path: '/music/album-match.mp3', name: 'Album match.mp3', type: 'audio' },
    { path: '/music/liked.mp3', name: 'Liked.mp3', type: 'audio' },
    { path: '/music/liked-match.mp3', name: 'Liked match.mp3', type: 'audio' },
    { path: '/music/disliked.mp3', name: 'Disliked.mp3', type: 'audio' },
    { path: '/music/video.mp4', name: 'Video.mp4', type: 'video' },
  ]
  const metadata = new Map([
    ['/music/favorite.mp3', { title: 'Favorita', artist: 'Beyoncé', album: 'Lemonade', genres: ['Pop'] }],
    ['/music/artist-match.mp3', { title: 'Outra faixa', artist: 'Beyonce', album: 'Other', genres: [] }],
    ['/music/album-match.mp3', { title: 'Faixa do álbum', artist: 'Outro', album: 'Lemonade', genres: [] }],
    ['/music/liked.mp3', { title: 'Curtida', artist: 'The Weeknd', album: 'Dawn FM', genres: ['R&B'] }],
    ['/music/liked-match.mp3', { title: 'Relacionado à curtida', artist: 'The Weeknd', album: 'Other', genres: [] }],
    ['/music/disliked.mp3', { title: 'Não sugerir', artist: 'Beyoncé', album: 'Other', genres: [] }],
    ['/music/video.mp4', { title: 'Vídeo', artist: 'Beyoncé', album: 'Lemonade', genres: ['Pop'] }],
  ])
  const recommendations = await buildRecommendations(
    items,
    ['/music/favorite.mp3'],
    [
      { path: '/music/liked.mp3', feedback: 'like', updatedAt: 1 },
      { path: '/music/disliked.mp3', feedback: 'dislike', updatedAt: 2 },
    ],
    async (filePath) => ({
      fileSize: 1,
      modifiedAt: 1,
      ...metadata.get(filePath),
    }),
  )

  assert.deepEqual(
    recommendations.map(({ path: filePath }) => filePath),
    ['/music/artist-match.mp3', '/music/liked-match.mp3', '/music/album-match.mp3'],
  )
  assert.equal(recommendations[0].reason.kind, 'artist')
  assert.equal(recommendations[0].reason.signal, 'favorite')
  assert.equal(recommendations[1].reason.signal, 'liked')
  assert.equal(recommendations[2].reason.kind, 'album')

  let metadataCalls = 0
  assert.deepEqual(
    await buildRecommendations(items, [], [], async () => {
      metadataCalls += 1
      throw new Error('Metadata should not be read without signals')
    }),
    [],
  )
  assert.equal(metadataCalls, 0)
})

test('recommendation feedback persists, replaces prior ratings, and can be cleared', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tocae-recommendations-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'feedback.json')

  await setRecommendationFeedback(file, '/music/track.mp3', 'like')
  await setRecommendationFeedback(file, '/music/track.mp3', 'dislike')
  const [storedFeedback] = await readRecommendationFeedbackFile(file)
  assert.equal(storedFeedback.path, '/music/track.mp3')
  assert.equal(storedFeedback.feedback, 'dislike')
  assert.ok(Number.isFinite(storedFeedback.updatedAt))
  assert.throws(
    () => setRecommendationFeedback(file, 'track.mp3', 'like'),
    /caminho.*não é válido/i,
  )
  await clearRecommendationFeedbackFile(file)
  assert.deepEqual(await readRecommendationFeedbackFile(file), [])
})

test('AI read-only tools search the library and report the current playlist', async () => {
  const library = {
    folders: [],
    unavailableFolderIds: [],
    items: [
      {
        path: '/music/Blue.mp3',
        name: 'Blue.mp3',
        relativePath: 'Blue.mp3',
        folderId: 'music',
        type: 'audio',
      },
      {
        path: '/videos/Blue Clip.mp4',
        name: 'Blue Clip.mp4',
        relativePath: 'Blue Clip.mp4',
        folderId: 'videos',
        type: 'video',
      },
    ],
  }
  const playlist = {
    items: [{ id: '1', path: '/music/Blue.mp3', name: 'Blue.mp3' }],
    currentIndex: 0,
  }
  const metadataByPath = {
    '/music/Blue.mp3': {
      fileSize: 1,
      modifiedAt: 1,
      title: 'Noite Azul',
      artist: 'Beyoncé',
      album: 'Cores',
      genres: ['MPB', 'Pop'],
    },
  }
  const getMediaMetadata = async (filePath) => metadataByPath[filePath] ?? {
    fileSize: 1,
    modifiedAt: 1,
  }

  assert.equal(
    (await executeReadOnlyTool(
      'search_library',
      { query: 'blue', type: 'audio' },
      library,
      playlist,
    )).matches.length,
    1,
  )
  assert.equal(
    (await executeReadOnlyTool('get_playlist', {}, library, playlist)).current.name,
    'Blue.mp3',
  )
  assert.equal(
    (await executeReadOnlyTool('get_current_media', {}, library, playlist)).current.name,
    'Blue.mp3',
  )
  await assert.rejects(
    executeReadOnlyTool('remove_library', {}, library, playlist),
    /não autorizada/,
  )
  await assert.rejects(
    executeReadOnlyTool('get_favorites', {}, library, undefined),
    /desativado/,
  )
  const favorites = await executeReadOnlyTool('get_favorites', {}, library, undefined, {
    favoritesEnabled: true,
    favoritePaths: ['/music/Blue.mp3', '/outside/not-in-library.mp3'],
  })
  assert.deepEqual(favorites, {
    total: 1,
    matches: [{ name: 'Blue.mp3', type: 'audio' }],
  })

  const taggedMatches = await executeReadOnlyTool(
    'search_library',
    { artist: 'beyonce', album: 'cores', genre: 'mpb' },
    library,
    playlist,
    { getMediaMetadata },
  )
  assert.equal(taggedMatches.matches.length, 1)
  assert.equal(taggedMatches.matches[0].metadata.artist, 'Beyoncé')

  const titleMatches = await executeReadOnlyTool(
    'search_library',
    { title: 'noite azul' },
    library,
    playlist,
    { getMediaMetadata },
  )
  assert.equal(titleMatches.matches[0].metadata.title, 'Noite Azul')

  await assert.rejects(
    executeReadOnlyTool('search_library', {}, library, playlist),
    /Informe um texto ou metadado/,
  )
})

test('semantic index persists and cosine similarity ranks vectors', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'tocae-semantic-index-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = path.join(directory, 'ai-library-index.json')
  const library = {
    folders: [],
    unavailableFolderIds: [],
    items: [{
      path: '/music/Blue.mp3',
      name: 'Blue.mp3',
      relativePath: 'Blue.mp3',
      folderId: 'music',
      type: 'audio',
    }],
  }

  await writeSemanticIndex(file, libraryFingerprint(library), [{
    path: '/music/Blue.mp3',
    name: 'Blue.mp3',
    relativePath: 'Blue.mp3',
    type: 'audio',
    text: 'Blue.mp3 | Blue.mp3 | audio',
    vector: [1, 0],
  }])

  assert.equal(
    cosineSimilarity([1, 0], [1, 0]),
    1,
  )
  assert.equal(
    (await readSemanticIndex(file)).fingerprint,
    libraryFingerprint(library),
  )
})

test('OpenAI-compatible provider creates embeddings through the embeddings endpoint', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.example.test/v1/embeddings')
    assert.equal(options.redirect, 'error')
    assert.equal(JSON.parse(options.body).model, 'text-embedding-3-small')
    return new Response(JSON.stringify({
      data: [
        { index: 1, embedding: [0, 1] },
        { index: 0, embedding: [1, 0] },
      ],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  try {
    const provider = new OpenAiCompatibleProvider(config, 'test-key')
    assert.deepEqual(
      await provider.embed(['first', 'second'], new AbortController().signal),
      [[1, 0], [0, 1]],
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('embedding requests retry only transient failures with a bounded attempt count', async (t) => {
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    if (calls === 1) return new Response('temporary outage', { status: 503 })
    if (calls === 2) return new Response('rate limited', { status: 429 })
    return new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 0] }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const provider = new OpenAiCompatibleProvider(config, 'test-key')
  assert.deepEqual(
    await provider.embed(['retry-safe input'], new AbortController().signal),
    [[1, 0]],
  )
  assert.equal(calls, 3)
})

test('embedding retries stop after two retries when the provider remains unavailable', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response('temporary outage', { status: 503 })
  }

  try {
    const provider = new OpenAiCompatibleProvider(config, 'test-key')
    await assert.rejects(
      provider.embed(['retry limit'], new AbortController().signal),
      /HTTP 503/,
    )
    assert.equal(calls, 3)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('embedding retry stops immediately when the request is cancelled', async () => {
  const originalFetch = globalThis.fetch
  const controller = new AbortController()
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    controller.abort()
    return new Response('temporary outage', { status: 503 })
  }

  try {
    const provider = new OpenAiCompatibleProvider(config, 'test-key')
    await assert.rejects(provider.embed(['cancel retry'], controller.signal), /cancel/i)
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Gemini embedding retries transient SDK errors and preserves the cancellation signal', async () => {
  const provider = new GeminiSdkProvider({
    provider: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    model: 'gemini-3.8-flash',
  }, 'test-key')
  const controller = new AbortController()
  let calls = 0
  let receivedSignal
  provider.ai.models.embedContent = async (request) => {
    calls += 1
    receivedSignal = request.config.abortSignal
    if (calls === 1) throw Object.assign(new Error('Temporary service error'), { status: 503 })
    return { embeddings: [{ values: [1, 0] }] }
  }

  assert.deepEqual(await provider.embed(['retry-safe input'], controller.signal), [[1, 0]])
  assert.equal(calls, 2)
  assert.equal(receivedSignal, controller.signal)
})

test('chat generation is not retried after a transient server response', async () => {
  const originalFetch = globalThis.fetch
  let calls = 0
  globalThis.fetch = async () => {
    calls += 1
    return new Response('temporary outage', { status: 503 })
  }

  try {
    const provider = new OpenAiCompatibleProvider(config, 'test-key')
    await assert.rejects(
      provider.sendStream([{ role: 'user', content: 'Do not replay tools' }], new AbortController().signal, () => {}),
      /HTTP 503/,
    )
    assert.equal(calls, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})
