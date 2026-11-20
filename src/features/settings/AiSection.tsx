import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Check, KeyRound, Trash2 } from 'lucide-react'
import type { AiProviderConfig } from '@shared/ai'
import { useI18n } from '../../i18n'
import styles from './AiSection.module.css'

function AiSection() {
  const { t } = useI18n()
  const [config, setConfig] = useState<AiProviderConfig | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [configured, setConfigured] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void window.tocae.ai.getStatus()
      .then((status) => {
        setConfig(status.provider)
        setConfigured(status.configured)
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : t('assistant.unknownError')))
  }, [t])

  async function saveConfig(event: FormEvent) {
    event.preventDefault()
    if (!config) return
    setSaving(true)
    setMessage(null)
    try {
      setConfig(await window.tocae.ai.setConfig(config))
      setMessage(t('settings.aiSaved'))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('assistant.unknownError'))
    } finally {
      setSaving(false)
    }
  }

  async function saveCredential(event: FormEvent) {
    event.preventDefault()
    if (!apiKey.trim()) return
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
            <input
              value={config.model}
              onChange={(event) => setConfig({ ...config, model: event.target.value })}
              placeholder="gpt-4o-mini"
              spellCheck={false}
            />
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

      <form className={styles.group} onSubmit={saveCredential}>
        <div className={styles.groupHeader}>
          <div>
            <h3 className={styles.settingTitle}>{t('settings.aiCredential')}</h3>
            <p className={styles.settingDescription}>
              {configured ? t('settings.aiCredentialStored') : t('settings.aiCredentialMissing')}
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
          <button type="submit" className={styles.primary} disabled={saving || !apiKey.trim()}>
            <Check size={14} aria-hidden="true" />
            {t('settings.aiSaveKey')}
          </button>
          {configured && (
            <button type="button" className={styles.danger} onClick={() => void removeCredential()} disabled={saving}>
              <Trash2 size={14} aria-hidden="true" />
              {t('settings.aiRemoveKey')}
            </button>
          )}
        </div>
      </form>

      {message && <p className={styles.feedback} role="status">{message}</p>}
    </section>
  )
}

export default AiSection
