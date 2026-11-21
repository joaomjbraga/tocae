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

export interface AiDataPreferences {
  allowFavorites: boolean
  collectPlaybackHistory: boolean
  localRecommendations: boolean
  audioMoodAnalysis: boolean
}

export interface AiRequestContext {
  favoritePaths: string[]
}

export interface AiRecommendation {
  path: string
  name: string
  title: string
  artist?: string
  reason: {
    kind: 'artist' | 'album' | 'genre'
    value: string
    basedOn: string
    signal: 'favorite' | 'liked'
  }
}

export type AiRecommendationFeedback = 'like' | 'dislike'

export const AI_LIMITS = {
  userMessageBytes: 8 * 1024,
  contextBytes: 48 * 1024,
  historyBytes: 64 * 1024,
  historyMessages: 50,
  toolResultBytes: 8 * 1024,
  toolResultsBytes: 16 * 1024,
  toolCalls: 5,
  responseBytes: 16 * 1024,
  outputTokens: 2048,
} as const

export interface AiModelOption {
  name: string
  displayName: string
}

export interface AiStatus {
  configured: boolean
  busy: boolean
  provider: AiProviderConfig
  dataPreferences: AiDataPreferences
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
