import { randomUUID } from 'node:crypto'
import type { AiMessage, AiProviderConfig } from '@shared/ai'
import type { AiProvider, AiToolDefinition } from './provider'

const MAX_HISTORY_MESSAGES = 50
const REQUEST_TIMEOUT_MS = 60_000

export class AiCore {
  private messages: AiMessage[] = []
  private controller: AbortController | null = null
  private busy = false
  private readonly providerFactory: (config: AiProviderConfig) => AiProvider | null
  private readonly tools: readonly AiToolDefinition[]
  private readonly executeTool: ((name: string, args: unknown) => Promise<unknown>) | undefined

  constructor(
    providerFactory: (config: AiProviderConfig) => AiProvider | null,
    tools: readonly AiToolDefinition[] = [],
    executeTool?: (name: string, args: unknown) => Promise<unknown>,
  ) {
    this.providerFactory = providerFactory
    this.tools = tools
    this.executeTool = executeTool
  }

  getHistory(): AiMessage[] {
    return this.messages.map((message) => ({ ...message }))
  }

  restoreHistory(messages: AiMessage[]): void {
    if (this.busy) throw new AiRequestError('Não é possível restaurar o histórico durante uma solicitação.')
    this.messages = messages.slice(-MAX_HISTORY_MESSAGES).map((message) => ({ ...message }))
  }

  isBusy(): boolean {
    return this.busy
  }

  clear(): void {
    this.messages = []
  }

  cancel(): void {
    if (this.controller) this.controller.abort()
  }

  async send(
    content: string,
    config: AiProviderConfig,
    onChunk: (chunk: string) => void = () => {},
  ): Promise<AiMessage> {
    if (this.busy) throw new AiRequestError('Uma solicitação já está em andamento.')
    const normalized = content.trim()
    if (!normalized) throw new AiRequestError('Digite uma mensagem.')

    const provider = this.providerFactory(config)
    if (!provider) throw new AiRequestError('Configure uma chave de API válida.')

    const userMessage: AiMessage = {
      id: randomUUID(),
      role: 'user',
      content: normalized,
      createdAt: Date.now(),
    }
    this.messages = [...this.messages, userMessage].slice(-MAX_HISTORY_MESSAGES)
    this.busy = true
    this.controller = new AbortController()
    const timeout = setTimeout(() => this.controller?.abort(), REQUEST_TIMEOUT_MS)

    try {
      let text = ''
      await provider.sendStream(
        this.messages
          .filter((message) => message.role !== 'system')
          .map((message) => ({ role: message.role, content: message.content })),
        this.controller.signal,
        (chunk) => {
          text += chunk
          onChunk(chunk)
        },
        this.tools,
        this.executeTool,
      )
      if (this.controller.signal.aborted) throw new AiRequestError('Solicitação cancelada.')

      const assistantMessage: AiMessage = {
        id: randomUUID(),
        role: 'assistant',
        content: text,
        createdAt: Date.now(),
      }
      this.messages = [...this.messages, assistantMessage].slice(-MAX_HISTORY_MESSAGES)
      return assistantMessage
    } catch (error) {
      if (this.controller.signal.aborted) {
        throw new AiRequestError('Solicitação cancelada ou excedeu o tempo limite.')
      }
      throw error
    } finally {
      clearTimeout(timeout)
      this.controller = null
      this.busy = false
    }
  }
}

export class AiRequestError extends Error {}
