export type AiRole = 'system' | 'user' | 'assistant'

export interface AiMessage {
  id: string
  role: AiRole
  content: string
  createdAt: number
}

export interface AiProviderConfig {
  provider: 'openai' | 'gemini' | 'ollama' | 'openai-compatible'
  baseUrl: string
  model: string
  embeddingModel?: string
}

export interface AiModelOption {
  name: string
  displayName: string
}

export interface AiStatus {
  configured: boolean
  busy: boolean
  provider: AiProviderConfig
  messages: AiMessage[]
}

export interface AiPlayerState {
  playing: boolean
  updatedAt: number
}

export interface AiPlaylistProposal {
  id: string
  title: string
  items: { path: string; name: string }[]
  createdAt: number
}

export const DEFAULT_AI_PROVIDER_CONFIG: AiProviderConfig = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  embeddingModel: 'text-embedding-3-small',
}
