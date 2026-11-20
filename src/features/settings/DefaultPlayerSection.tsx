import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import type { DefaultPlayerStatus } from '@shared/ipc'
import { useI18n } from '../../i18n'
import styles from './DefaultPlayerSection.module.css'

function DefaultPlayerSection() {
  const { t } = useI18n()
  const api = window.tocae
  const [status, setStatus] = useState<DefaultPlayerStatus | null>(null)
  const [isSettingDefault, setIsSettingDefault] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    let active = true
    api
      .getDefaultPlayerStatus()
      .then((nextStatus) => {
        if (active) setStatus(nextStatus)
      })
      .catch(() => {
        if (active) setHasError(true)
      })

    return () => {
      active = false
    }
  }, [api])

  async function handleSetDefault() {
    setIsSettingDefault(true)
    setHasError(false)
    try {
      await api.setDefaultPlayer()
      setStatus(await api.getDefaultPlayerStatus())
    } catch {
      setHasError(true)
    } finally {
      setIsSettingDefault(false)
    }
  }

  const statusMessage = hasError
    ? t('defaultPlayer.error')
    : !status
      ? t('defaultPlayer.checking')
      : !status.supported
        ? t('defaultPlayer.unsupported')
        : status.isDefault
          ? t('defaultPlayer.isDefault')
          : t('defaultPlayer.notDefault')

  const showDefaultCheck = Boolean(status?.isDefault) && !hasError

  return (
    <section className={styles.section} aria-labelledby="default-player-title">
      <header className={styles.header}>
        <h2 id="default-player-title" className={styles.title}>
          {t('defaultPlayer.title')}
        </h2>
        <p className={styles.description}>{t('defaultPlayer.description')}</p>
      </header>

      <div className={styles.group}>
        <div className={styles.row}>
          <div className={styles.statusCopy}>
            <p className={styles.statusMessage} role="status" aria-live="polite">
              {showDefaultCheck && (
                <Check
                  size={15}
                  strokeWidth={2.5}
                  className={styles.statusIcon}
                  aria-hidden="true"
                />
              )}
              {statusMessage}
            </p>
            <p className={styles.hint}>{t('defaultPlayer.hint')}</p>
          </div>

          {status?.supported && !status.isDefault && (
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => void handleSetDefault()}
              disabled={isSettingDefault}
            >
              {isSettingDefault ? t('defaultPlayer.setting') : t('defaultPlayer.set')}
            </button>
          )}
        </div>
      </div>

      {hasError && (
        <p className={styles.error} role="alert">
          {t('defaultPlayer.errorDetail')}
        </p>
      )}
    </section>
  )
}

export default DefaultPlayerSection