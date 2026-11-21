import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { AiCore, AiRequestError } from './core.ts'
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
