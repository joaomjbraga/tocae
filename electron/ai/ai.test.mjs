import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
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

test('OpenAI-compatible provider sends Chat Completions and normalizes the response', async () => {
  const originalFetch = globalThis.fetch
  let chunks = ''
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.example.test/v1/chat/completions')
    assert.equal(options.method, 'POST')
    assert.equal(options.redirect, 'error')
    assert.equal(JSON.parse(options.body).model, 'test-model')
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

test('AI read-only tools search the library and report the current playlist', () => {
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

  assert.equal(
    executeReadOnlyTool('search_library', { query: 'blue', type: 'audio' }, library, playlist).matches.length,
    1,
  )
  assert.equal(
    executeReadOnlyTool('get_playlist', {}, library, playlist).current.name,
    'Blue.mp3',
  )
  assert.equal(
    executeReadOnlyTool('get_current_media', {}, library, playlist).current.name,
    'Blue.mp3',
  )
  assert.throws(
    () => executeReadOnlyTool('remove_library', {}, library, playlist),
    /não autorizada/,
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
