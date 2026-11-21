import type { AiModelOption, AiProviderConfig } from '@shared/ai'
import { AI_LIMITS } from '../../shared/ai.ts'
import {
  GoogleGenAI,
  createPartFromFunctionResponse,
  createUserContent,
} from '@google/genai'
import type { Content, FunctionCall, Part, Tool } from '@google/genai'

export interface AiProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: readonly AiToolCall[]
}

export interface AiToolDefinition {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface AiToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface AiProvider {
  embed(texts: readonly string[], signal: AbortSignal): Promise<number[][]>
  sendStream(
    messages: readonly AiProviderMessage[],
    signal: AbortSignal,
    onChunk: (chunk: string) => void,
    tools?: readonly AiToolDefinition[],
    executeTool?: (name: string, args: unknown) => Promise<unknown>,
  ): Promise<void>
}

export class GeminiSdkProvider implements AiProvider {
  private readonly ai: GoogleGenAI
  private readonly config: AiProviderConfig

  constructor(config: AiProviderConfig, apiKey: string) {
    this.config = config
    this.ai = new GoogleGenAI({ apiKey })
  }

  async listModels(): Promise<AiModelOption[]> {
    const models = await this.ai.models.list()
    const available: AiModelOption[] = []
    for await (const model of models) {
      const name = model.name?.replace(/^models\//, '')
      if (!name || !model.supportedActions?.includes('generateContent')) continue
      available.push({
        name,
        displayName: model.displayName || name,
      })
    }
    return available.sort((left, right) => left.displayName.localeCompare(right.displayName))
  }

  async embed(texts: readonly string[], signal: AbortSignal): Promise<number[][]> {
    if (texts.length === 0) return []
    const response = await this.ai.models.embedContent({
      model: this.config.embeddingModel ?? 'gemini-embedding-001',
      contents: [...texts],
      config: { abortSignal: signal },
    })

    const vectors = (response.embeddings ?? []).map((embedding) => embedding.values ?? [])
    if (vectors.length !== texts.length || vectors.some((vector) => vector.length === 0)) {
      throw new AiProviderError('O Gemini não retornou todos os vetores esperados.')
    }
    return vectors
  }

  async sendStream(
    messages: readonly AiProviderMessage[],
    signal: AbortSignal,
    onChunk: (chunk: string) => void,
    tools: readonly AiToolDefinition[] = [],
    executeTool?: (name: string, args: unknown) => Promise<unknown>,
  ): Promise<void> {
    const systemInstruction = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content)
      .join('\n\n')
    let contents = toGeminiContents(messages)

    for (let turn = 0; turn < 5; turn += 1) {
      const stream = await this.ai.models.generateContentStream({
        model: this.config.model,
        contents,
        config: {
          ...(systemInstruction ? { systemInstruction } : {}),
          abortSignal: signal,
          automaticContinuation: false,
          maxOutputTokens: AI_LIMITS.outputTokens,
          ...(tools.length > 0
            ? {
                tools: [{
                  functionDeclarations: tools.map((tool) => ({
                    name: tool.function.name,
                    description: tool.function.description,
                    parametersJsonSchema: tool.function.parameters,
                  })),
                }] as Tool[],
              }
            : {}),
        },
      })

      let receivedText = false
      const functionCalls: FunctionCall[] = []
      const modelParts: Part[] = []
      for await (const chunk of stream) {
        if (signal.aborted) throw new AiProviderError('Solicitação cancelada.')
        modelParts.push(...(chunk.candidates?.[0]?.content?.parts ?? []))
        const text = chunk.text
        if (typeof text === 'string' && text) {
          receivedText = true
          onChunk(text)
        }
        if (chunk.functionCalls) functionCalls.push(...chunk.functionCalls)
      }

      if (functionCalls.length === 0) {
        if (!receivedText) throw new AiProviderError('O Gemini não retornou uma resposta.')
        return
      }
      if (!executeTool) throw new AiProviderError('O Gemini solicitou uma ferramenta indisponível.')

      const responseParts = []
      for (const call of functionCalls) {
        if (!call.name) continue
        const result = await executeTool(call.name, call.args ?? {})
        responseParts.push(
          createPartFromFunctionResponse(
            call.id ?? call.name,
            call.name,
            { output: result },
          ),
        )
      }
      contents = [
        ...contents,
        { role: 'model', parts: modelParts },
        createUserContent(responseParts),
      ]
    }

    throw new AiProviderError('O Gemini excedeu o limite de etapas de ferramentas.')
  }
}

function toGeminiContents(messages: readonly AiProviderMessage[]): Content[] {
  return messages
    .filter((message) => message.role !== 'system' && message.role !== 'tool')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    }))
}


export class OpenAiCompatibleProvider implements AiProvider {
  private readonly config: AiProviderConfig
  private readonly apiKey: string

  constructor(config: AiProviderConfig, apiKey: string) {
    this.config = config
    this.apiKey = apiKey
  }

  async embed(texts: readonly string[], signal: AbortSignal): Promise<number[][]> {
    if (texts.length === 0) return []
    const baseUrl = this.config.baseUrl.replace(/\/+$/, '')
    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: this.config.embeddingModel ?? 'text-embedding-3-small',
        input: texts,
      }),
      signal,
    })

    if (!response.ok) {
      const detail = await safeResponseDetail(response)
      throw new AiProviderError(
        `O provedor rejeitou embeddings (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
      )
    }

    const payload: unknown = await response.json()
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      throw new AiProviderError('A resposta de embeddings do provedor não é válida.')
    }

    const vectors = payload.data
      .slice()
      .sort((left, right) => {
        const leftIndex = isRecord(left) && typeof left.index === 'number' ? left.index : 0
        const rightIndex = isRecord(right) && typeof right.index === 'number' ? right.index : 0
        return leftIndex - rightIndex
      })
      .map((entry) => {
        if (!isRecord(entry) || !Array.isArray(entry.embedding)) return null
        const vector = entry.embedding.filter(
          (value): value is number => typeof value === 'number' && Number.isFinite(value),
        )
        return vector.length === entry.embedding.length ? vector : null
      })

    if (vectors.length !== texts.length || vectors.some((vector) => vector === null)) {
      throw new AiProviderError('O provedor não retornou todos os vetores esperados.')
    }
    return vectors as number[][]
  }

  async sendStream(
    messages: readonly AiProviderMessage[],
    signal: AbortSignal,
    onChunk: (chunk: string) => void,
    tools: readonly AiToolDefinition[] = [],
    executeTool?: (name: string, args: unknown) => Promise<unknown>,
  ): Promise<void> {
    const conversation: AiProviderMessage[] = [...messages]

    for (let turn = 0; turn < 5; turn += 1) {
      const baseUrl = this.config.baseUrl.replace(/\/+$/, '')
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        redirect: 'error',
        headers: {
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: conversation,
          stream: true,
          max_tokens: AI_LIMITS.outputTokens,
          ...(tools.length > 0 ? { tools } : {}),
        }),
        signal,
      })

      if (!response.ok) {
        const detail = await safeResponseDetail(response)
        throw new AiProviderError(
          `O provedor rejeitou a solicitação (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
        )
      }

      if (!response.body) throw new AiProviderError('O provedor não iniciou o streaming.')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let receivedChunk = false
      let assistantText = ''
      const toolCalls = new Map<number, AiToolCall>()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        let newline = buffer.indexOf('\n')
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim()
          buffer = buffer.slice(newline + 1)
          const result = parseSseLine(line)
          if (result) {
            if (result.text) {
              assistantText += result.text
              onChunk(result.text)
              receivedChunk = true
            }
            mergeToolCallDeltas(toolCalls, result.toolCalls)
          }
          newline = buffer.indexOf('\n')
        }
      }

      const tail = buffer.trim()
      if (tail) {
        const result = parseSseLine(tail)
        if (result?.text) {
          assistantText += result.text
          onChunk(result.text)
          receivedChunk = true
        }
        if (result) mergeToolCallDeltas(toolCalls, result.toolCalls)
      }

      const calls = [...toolCalls.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, call]) => call)
        .filter((call) => call.id && call.function.name)

      if (calls.length > 0) {
        if (!executeTool) throw new AiProviderError('O provedor solicitou uma ferramenta indisponível.')
        conversation.push({
          role: 'assistant',
          content: assistantText,
          tool_calls: calls,
        })

        for (const call of calls) {
          let args: unknown = {}
          try {
            args = call.function.arguments ? JSON.parse(call.function.arguments) : {}
          } catch {
            throw new AiProviderError(`Os argumentos da ferramenta ${call.function.name} são inválidos.`)
          }
          const result = await executeTool(call.function.name, args)
          conversation.push({
            role: 'tool',
            content: JSON.stringify(result),
            tool_call_id: call.id,
          })
        }
        continue
      }

      if (!receivedChunk) throw new AiProviderError('O provedor não retornou uma resposta.')
      return
    }

    throw new AiProviderError('O provedor excedeu o limite de etapas de ferramentas.')
  }
}

export class AiProviderError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function safeResponseDetail(response: Response): Promise<string | null> {
  try {
    const payload: unknown = await response.clone().json()
    if (!isRecord(payload)) return null
    if (isRecord(payload.error) && typeof payload.error.message === 'string') {
      return payload.error.message.slice(0, 300)
    }
  } catch {
    return null
  }
  return null
}

interface SseResult {
  text?: string
  toolCalls: Array<{ index: number; call: Partial<AiToolCall> }>
}

function parseSseLine(line: string): SseResult | null {
  if (!line.startsWith('data:')) return null
  const data = line.slice(5).trim()
  if (!data || data === '[DONE]') return null

  try {
    const payload: unknown = JSON.parse(data)
    if (!isRecord(payload) || !Array.isArray(payload.choices)) return null
    const choice = payload.choices[0]
    if (!isRecord(choice)) return null

    const delta = isRecord(choice.delta) ? choice.delta : null
    const message = isRecord(choice.message) ? choice.message : null
    const content = delta?.content ?? message?.content
    const toolCalls: unknown = delta?.tool_calls
    const parsedToolCalls: Array<{ index: number; call: Partial<AiToolCall> }> = []

    if (Array.isArray(toolCalls)) {
      for (const item of toolCalls) {
        if (!isRecord(item)) continue
        if (typeof item.index !== 'number') continue
        const functionValue = isRecord(item.function) ? item.function : null
        parsedToolCalls.push({
          index: item.index,
          call: {
            id: typeof item.id === 'string' ? item.id : undefined,
            type: 'function',
            function: {
              name: typeof functionValue?.name === 'string' ? functionValue.name : '',
              arguments: typeof functionValue?.arguments === 'string' ? functionValue.arguments : '',
            },
          },
        })
      }
    }

    return typeof content === 'string'
      ? { text: content, toolCalls: parsedToolCalls }
      : { toolCalls: parsedToolCalls }
  } catch {
    throw new AiProviderError('A resposta de streaming do provedor não é válida.')
  }
}

function mergeToolCallDeltas(
  calls: Map<number, AiToolCall>,
  deltas: readonly { index: number; call: Partial<AiToolCall> }[],
): void {
  for (const delta of deltas) {
    const existing = calls.get(delta.index)
    const name = delta.call.function?.name ?? ''
    const argumentsPart = delta.call.function?.arguments ?? ''
    if (existing) {
      existing.function.name += name
      existing.function.arguments += argumentsPart
      if (delta.call.id) existing.id = delta.call.id
    } else {
      calls.set(delta.index, {
        id: delta.call.id ?? '',
        type: 'function',
        function: {
          name,
          arguments: argumentsPart,
        },
      })
    }
  }
}
