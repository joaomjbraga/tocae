import { useEffect, useState } from 'react'
import { Copy, Minus, Square, X } from 'lucide-react'
import { useI18n } from '../i18n'
import styles from './WindowTitleBar.module.css'

type WindowTitleBarProps = {
  compact?: boolean
}

function WindowTitleBar({ compact = false }: WindowTitleBarProps) {
  const { t } = useI18n()
  const api = window.tocae
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (isMaximized) {
      document.documentElement.dataset.windowMaximized = 'true'
      return () => {
        delete document.documentElement.dataset.windowMaximized
      }
    }

    delete document.documentElement.dataset.windowMaximized
  }, [isMaximized])

  useEffect(() => {
    let active = true
    const unsubscribe = api.onWindowStateChange(setIsMaximized)

    api
      .isWindowMaximized()
      .then((maximized) => {
        if (active) setIsMaximized(maximized)
      })
      .catch((error: unknown) => console.error('Could not read the window state', error))

    return () => {
      active = false
      unsubscribe()
    }
  }, [api])

  function runWindowAction(action: () => Promise<void>) {
    void action().catch((error: unknown) => console.error('Window control action failed', error))
  }

  function toggleMaximize() {
    runWindowAction(api.toggleMaximizeWindow)
  }

  return (
    <div className={`${styles.titleBar} ${compact ? styles.compact : ''}`}>
      <div className={styles.brand}>
        <span>Tocaê Reprodutor</span>
      </div>
      <div className={styles.dragRegion} onDoubleClick={toggleMaximize} aria-hidden="true" />
      <div className={styles.controls} role="group" aria-label={t('appbar.windowControls')}>
        <button
          type="button"
          className={styles.control}
          onClick={() => runWindowAction(api.minimizeWindow)}
          aria-label={t('appbar.minimizeWindow')}
          data-tooltip={t('appbar.minimizeWindow')}
          data-tooltip-placement="bottom"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          className={styles.control}
          onClick={toggleMaximize}
          aria-label={isMaximized ? t('appbar.restoreWindow') : t('appbar.maximizeWindow')}
          data-tooltip={isMaximized ? t('appbar.restoreWindow') : t('appbar.maximizeWindow')}
          data-tooltip-placement="bottom"
        >
          {isMaximized ? <Copy size={12} /> : <Square size={12} />}
        </button>
        <button
          type="button"
          className={`${styles.control} ${styles.close}`}
          onClick={() => runWindowAction(api.closeWindow)}
          aria-label={t('appbar.closeWindow')}
          data-tooltip={t('appbar.closeWindow')}
          data-tooltip-placement="bottom"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  )
}

export default WindowTitleBar
