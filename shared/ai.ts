export type AiRole = 'system' | 'user' | 'assistant'

export interface AiMessage {
  id: string
  role: AiRole
  content: string
  createdAt: number
}

export interface AiProviderConfig {
  provider: 'openai-compatible'
  baseUrl: string
  model: string
}

export interface AiStatus {
  configured: boolean
  busy: boolean
  provider: AiProviderConfig
  messages: AiMessage[]
}

export const DEFAULT_AI_PROVIDER_CONFIG: AiProviderConfig = {
  provider: 'openai-compatible',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
}
