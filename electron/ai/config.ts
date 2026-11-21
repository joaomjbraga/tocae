import type { AiProviderConfig } from '@shared/ai'

export type CredentialProvider = Exclude<AiProviderConfig['provider'], 'ollama'>
export type AiCredentials = Partial<Record<CredentialProvider, string>>

export function credentialForProvider(
  credentials: AiCredentials,
  provider: AiProviderConfig['provider'],
): string | null {
  if (provider === 'ollama') return null
  return credentials[provider] ?? null
}

export function migrateLegacyCredential(
  provider: AiProviderConfig['provider'],
  credential: string,
): AiCredentials {
  return provider === 'ollama' ? {} : { [provider]: credential }
}

export function validateBaseUrl(value: string): string {
  const baseUrl = value.trim().replace(/\/+$/, '')
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new TypeError('A URL base do provedor é inválida.')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new TypeError('Use uma URL HTTP ou HTTPS.')
  }
  if (url.username || url.password) {
    throw new TypeError('Não inclua credenciais na URL base do provedor.')
  }
  if (url.protocol === 'http:' && !isLoopbackHostname(url.hostname)) {
    throw new TypeError('Use HTTPS para provedores remotos. HTTP é permitido apenas para servidores locais.')
  }

  return url.toString().replace(/\/+$/, '')
}

export function validateAiProviderConfig(value: unknown): AiProviderConfig {
  if (!isRecord(value)) {
    throw new TypeError('Configuração de IA inválida.')
  }
  if (
    value.provider !== 'openai' &&
    value.provider !== 'gemini' &&
    value.provider !== 'ollama' &&
    value.provider !== 'openai-compatible'
  ) {
    throw new TypeError('Provedor de IA inválido.')
  }
  if (typeof value.baseUrl !== 'string' || typeof value.model !== 'string') {
    throw new TypeError('URL base e modelo são obrigatórios.')
  }
  const model = value.model.trim()
  if (!model) throw new TypeError('Informe o modelo.')
  return {
    provider: value.provider,
    baseUrl: validateBaseUrl(value.baseUrl),
    model,
    embeddingModel:
      typeof value.embeddingModel === 'string' && value.embeddingModel.trim()
        ? value.embeddingModel.trim()
        : value.provider === 'gemini'
          ? 'gemini-embedding-001'
          : 'text-embedding-3-small',
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost' || normalized === '::1' || /^127(?:\.\d{1,3}){3}$/.test(normalized)
}
