import type { Locale } from './i18n'
import type { AiProviderConfig } from './ai'
import { DEFAULT_AI_PROVIDER_CONFIG } from './ai'

export interface Settings {
  /**
   * Idioma escolhido pelo usuário. `null` significa "seguir o sistema", que
   * é o estado inicial de uma instalação nova.
   */
  locale: Locale | null
  ai: AiProviderConfig
}

export const DEFAULT_SETTINGS: Settings = {
  locale: null,
  ai: { ...DEFAULT_AI_PROVIDER_CONFIG },
}
