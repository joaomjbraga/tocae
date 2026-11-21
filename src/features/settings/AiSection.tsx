import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, KeyRound, Trash2 } from 'lucide-react'
import type { AiDataPreferences, AiModelOption, AiProviderConfig } from '@shared/ai'
import { useI18n } from '../../i18n'
import styles from './AiSection.module.css'

function AiSection() {
  const { t } = useI18n()
  const [config, setConfig] = useState<AiProviderConfig | null>(null)
  const [dataPreferences, setDataPreferences] = useState<AiDataPreferences | null>(null)
  const [savedProvider, setSavedProvider] = useState<AiProviderConfig['provider'] | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [configured, setConfigured] = useState(false)
  const [models, setModels] = useState<AiModelOption[]>([])
  const [modelsLoaded, setModelsLoaded] = useState(false)
  const [modelsLoading, setModelsLoading] = useState(false)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const [customModel, setCustomModel] = useState(false)
  const [modelRefresh, setModelRefresh] = useState(0)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void window.tocae.ai.getStatus()
      .then((status) => {
        setConfig(status.provider)
        setDataPreferences(status.dataPreferences)
        setSavedProvider(status.provider.provider)
        setConfigured(status.configured)
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : t('assistant.unknownError')))
  }, [t])

  useEffect(() => {
    if (config?.provider !== 'gemini' || !configured || savedProvider !== config.provider) {
      setModels([])
      setModelsLoaded(false)
      return
    }

    let active = true
    setModelsLoaded(false)
    setModelsLoading(true)
    setModelsError(null)
    window.tocae.ai.listModels()
      .then((availableModels) => {
        if (active) {
          setModels(availableModels)
          setModelsLoaded(true)
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setModelsError(error instanceof Error ? error.message : t('assistant.unknownError'))
        }
      })
      .finally(() => {
        if (active) setModelsLoading(false)
      })

    return () => {
      active = false
    }
  }, [config?.provider, configured, modelRefresh, savedProvider, t])

  async function saveConfig(event: FormEvent) {
    event.preventDefault()
    if (!config) return
    setSaving(true)
    setMessage(null)
    try {
      const savedConfig = await window.tocae.ai.setConfig(config)
      setConfig(savedConfig)
      setSavedProvider(savedConfig.provider)
      const status = await window.tocae.ai.getStatus()
      setConfigured(status.configured)
      setMessage(t('settings.aiSaved'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('assistant.unknownError'))
    } finally {
      setSaving(false)
    }
  }

  async function saveCredential(event: FormEvent) {
    event.preventDefault()
    if (!apiKey.trim() || !config || savedProvider !== config.provider) return
    setSaving(true)
    setMessage(null)
    try {
      await window.tocae.ai.setCredential(apiKey)
      setApiKey('')
      setConfigured(true)
      setMessage(t('settings.aiKeySaved'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('assistant.unknownError'))
    } finally {
      setSaving(false)
    }
  }

  async function removeCredential() {
    if (!config || savedProvider !== config.provider) return
    setSaving(true)
    setMessage(null)
    try {
      await window.tocae.ai.removeCredential()
      setConfigured(false)
      setMessage(t('settings.aiKeyRemoved'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('assistant.unknownError'))
    } finally {
      setSaving(false)
    }
  }

  async function saveDataPreferences(nextPreferences: AiDataPreferences) {
    setSaving(true)
    setMessage(null)
    try {
      setDataPreferences(await window.tocae.ai.setDataPreferences(nextPreferences))
      setMessage(t('settings.aiDataPreferencesSaved'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('assistant.unknownError'))
    } finally {
      setSaving(false)
    }
  }

  async function clearListeningHistory() {
    setSaving(true)
    setMessage(null)
    try {
      await window.tocae.ai.clearListeningHistory()
      setMessage(t('settings.aiListeningHistoryCleared'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('assistant.unknownError'))
    } finally {
      setSaving(false)
    }
  }

  async function clearRecommendations() {
    setSaving(true)
    setMessage(null)
    try {
      await window.tocae.ai.clearRecommendations()
      setMessage(t('settings.aiRecommendationsCleared'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('assistant.unknownError'))
    } finally {
      setSaving(false)
    }
  }

  function changeProvider(provider: AiProviderConfig['provider']) {
    if (!config) return
    setCustomModel(false)
    if (provider === 'openai') {
      setConfig({
        provider,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        embeddingModel: 'text-embedding-3-small',
      })
    } else if (provider === 'gemini') {
      setConfig({
        provider,
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        model: 'gemini-3.8-flash',
        embeddingModel: 'gemini-embedding-001',
      })
    } else if (provider === 'ollama') {
      setConfig({
        provider,
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'llama3.2',
        embeddingModel: 'nomic-embed-text',
      })
    } else {
      setConfig({
        provider,
        baseUrl: '',
        model: '',
        embeddingModel: '',
      })
    }
  }

  return (
    <section className={styles.section} aria-labelledby="ai-title">
      <header className={styles.header}>
        <h2 id="ai-title" className={styles.title}>{t('assistant.title')}</h2>
        <p className={styles.description}>{t('settings.aiDescription')}</p>
      </header>

      {config && (
        <form className={styles.group} onSubmit={saveConfig}>
          <div className={styles.groupHeader}>
            <div>
              <h3 className={styles.settingTitle}>{t('settings.aiProvider')}</h3>
              <p className={styles.settingDescription}>{t('settings.aiProviderDescription')}</p>
            </div>
            <label className={styles.field}>
              <span>{t('settings.aiProviderType')}</span>
              <select
                value={config.provider}
                onChange={(event) => changeProvider(event.target.value as AiProviderConfig['provider'])}
              >
                <option value="openai">{t('settings.aiProviderOpenAI')}</option>
                <option value="gemini">{t('settings.aiProviderGemini')}</option>
                <option value="ollama">{t('settings.aiProviderOllama')}</option>
                <option value="openai-compatible">{t('settings.aiProviderCompatible')}</option>
              </select>
            </label>
          </div>
          <label className={styles.field}>
            <span>{t('settings.aiBaseUrl')}</span>
            <input
              type="url"
              value={config.baseUrl}
              onChange={(event) => setConfig({ ...config, baseUrl: event.target.value })}
              placeholder="https://api.openai.com/v1"
              spellCheck={false}
            />
          </label>
          <label className={styles.field}>
            <span>{t('settings.aiModel')}</span>
            {config.provider === 'gemini' && models.length > 0 ? (
              <>
                <select
                  value={customModel ? '__custom__' : config.model}
                  onChange={(event) => {
                    if (event.target.value === '__custom__') {
                      setCustomModel(true)
                    } else {
                      setCustomModel(false)
                      setConfig({ ...config, model: event.target.value })
                    }
                  }}
                >
                  {!customModel && !models.some((model) => model.name === config.model) && (
                    <option value={config.model}>
                      {t('settings.aiModelNotListed', { model: config.model })}
                    </option>
                  )}
                  {models.map((model) => (
                    <option key={model.name} value={model.name}>{model.displayName}</option>
                  ))}
                  <option value="__custom__">{t('settings.aiCustomModel')}</option>
                </select>
                {customModel && (
                  <input
                    aria-label={t('settings.aiCustomModel')}
                    value={config.model}
                    onChange={(event) => setConfig({ ...config, model: event.target.value })}
                    placeholder="gemini-3.8-flash"
                    spellCheck={false}
                  />
                )}
              </>
            ) : (
              <input
                value={config.model}
                onChange={(event) => setConfig({ ...config, model: event.target.value })}
                placeholder="gpt-4o-mini"
                spellCheck={false}
              />
            )}
            {config.provider === 'gemini' && (
              <>
                <div className={styles.modelActions}>
                  <button
                    type="button"
                    className={styles.secondary}
                    onClick={() => setModelRefresh((refresh) => refresh + 1)}
                    disabled={saving || modelsLoading || !configured}
                  >
                    {modelsLoading ? t('settings.aiModelsLoading') : t('settings.aiLoadModels')}
                  </button>
                  {models.length > 0 && (
                    <span className={styles.modelCount}>
                      {t('settings.aiModelsAvailable', { count: models.length })}
                    </span>
                  )}
                  {modelsLoaded && !models.some((model) => model.name === config.model) && !customModel && (
                    <span className={styles.modelError}>{t('settings.aiModelUnavailable')}</span>
                  )}
                  {!configured && (
                    <span className={styles.modelCount}>{t('settings.aiModelRequiresKey')}</span>
                  )}
                </div>
                {modelsError && <span className={styles.modelError} role="status">{modelsError}</span>}
              </>
            )}
          </label>
          <label className={styles.field}>
            <span>{t('settings.aiEmbeddingModel')}</span>
            <input
              value={config.embeddingModel ?? 'text-embedding-3-small'}
              onChange={(event) => setConfig({ ...config, embeddingModel: event.target.value })}
              placeholder="text-embedding-3-small"
              spellCheck={false}
            />
          </label>
          <button type="submit" className={styles.primary} disabled={saving}>
            <Check size={14} aria-hidden="true" />
            {t('settings.aiSave')}
          </button>
        </form>
      )}

      {config?.provider !== 'ollama' && (
      <form className={styles.group} onSubmit={saveCredential}>
        <div className={styles.groupHeader}>
          <div>
            <h3 className={styles.settingTitle}>{t('settings.aiCredential')}</h3>
            <p className={styles.settingDescription}>
              {savedProvider !== config?.provider
                ? t('settings.aiSaveProviderFirst')
                : configured
                  ? t('settings.aiCredentialStored')
                  : t('settings.aiCredentialMissing')}
            </p>
          </div>
          <KeyRound size={16} className={styles.keyIcon} aria-hidden="true" />
        </div>
        <label className={styles.field}>
          <span>{t('settings.aiApiKey')}</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-..."
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className={styles.actions}>
          <button
            type="submit"
            className={styles.primary}
            disabled={saving || !apiKey.trim() || savedProvider !== config?.provider}
          >
            <Check size={14} aria-hidden="true" />
            {t('settings.aiSaveKey')}
          </button>
          {configured && (
            <button
              type="button"
              className={styles.danger}
              onClick={() => void removeCredential()}
              disabled={saving || savedProvider !== config?.provider}
            >
              <Trash2 size={14} aria-hidden="true" />
              {t('settings.aiRemoveKey')}
            </button>
          )}
        </div>
      </form>
      )}

      {dataPreferences && (
        <section className={styles.group} aria-labelledby="ai-data-title">
          <header className={styles.groupHeader}>
            <div>
              <h3 id="ai-data-title" className={styles.settingTitle}>
                {t('settings.aiDataTitle')}
              </h3>
              <p className={styles.settingDescription}>
                {t('settings.aiDataDescription')}
              </p>
            </div>
          </header>
          <label className={styles.toggleField}>
            <input
              type="checkbox"
              checked={dataPreferences.allowFavorites}
              disabled={saving}
              onChange={(event) => void saveDataPreferences({
                ...dataPreferences,
                allowFavorites: event.target.checked,
              })}
            />
            <span className={styles.toggleCopy}>
              <strong>{t('settings.aiFavoritesAccess')}</strong>
              <small>{t('settings.aiFavoritesAccessDescription')}</small>
            </span>
          </label>
          <label className={styles.toggleField}>
            <input
              type="checkbox"
              checked={dataPreferences.localRecommendations}
              disabled={saving}
              onChange={(event) => void saveDataPreferences({
                ...dataPreferences,
                localRecommendations: event.target.checked,
              })}
            />
            <span className={styles.toggleCopy}>
              <strong>{t('settings.aiLocalRecommendations')}</strong>
              <small>{t('settings.aiLocalRecommendationsDescription')}</small>
            </span>
          </label>
          <label className={styles.toggleField}>
            <input
              type="checkbox"
              checked={dataPreferences.collectPlaybackHistory}
              disabled={saving}
              onChange={(event) => void saveDataPreferences({
                ...dataPreferences,
                collectPlaybackHistory: event.target.checked,
              })}
            />
            <span className={styles.toggleCopy}>
              <strong>{t('settings.aiPlaybackHistory')}</strong>
              <small>{t('settings.aiPlaybackHistoryDescription')}</small>
            </span>
          </label>
          <p className={styles.privacyNote}>{t('settings.aiDataPrivacyNote')}</p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.danger}
              onClick={() => void clearListeningHistory()}
              disabled={saving}
            >
              <Trash2 size={14} aria-hidden="true" />
              {t('settings.aiClearListeningHistory')}
            </button>
            <button
              type="button"
              className={styles.danger}
              onClick={() => void clearRecommendations()}
              disabled={saving}
            >
              <Trash2 size={14} aria-hidden="true" />
              {t('settings.aiClearRecommendations')}
            </button>
          </div>
        </section>
      )}

      {message && <p className={styles.feedback} role="status">{message}</p>}
    </section>
  )
}

export default AiSection
