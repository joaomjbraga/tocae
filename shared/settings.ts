import type { Locale } from './i18n'
import type { AiDataPreferences, AiProviderConfig } from './ai'
import { DEFAULT_AI_PROVIDER_CONFIG } from './ai'

export interface Settings {
  /**
   * Idioma escolhido pelo usuário. `null` significa "seguir o sistema", que
   * é o estado inicial de uma instalação nova.
   */
  locale: Locale | null
  ai: AiProviderConfig
  aiData: AiDataPreferences
}

export const DEFAULT_SETTINGS: Settings = {
  locale: null,
  ai: { ...DEFAULT_AI_PROVIDER_CONFIG },
  aiData: {
    allowFavorites: false,
    collectPlaybackHistory: false,
    localRecommendations: false,
    audioMoodAnalysis: false,
    imageDescription: false,
    videoAnalysis: false,
    fileOrganizationPreview: false,
  },
}
