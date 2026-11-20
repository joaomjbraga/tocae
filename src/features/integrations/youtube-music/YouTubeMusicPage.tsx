import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  House,
  LoaderCircle,
  Music2,
  RefreshCw,
  Square,
  TriangleAlert,
} from 'lucide-react'
import type { YouTubeMusicStatus } from '@shared/ipc'
import { useI18n } from '../../../i18n'
import styles from './YouTubeMusicPage.module.css'

type YouTubeMusicPageProps = {
  immersive: boolean
  onReturnToLibrary: () => void
}

function YouTubeMusicPage({ immersive, onReturnToLibrary }: YouTubeMusicPageProps) {
  const { t } = useI18n()
  const viewBoundsRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<YouTubeMusicStatus>({
    state: 'idle',
    canGoBack: false,
    canGoForward: false,
  })
  const api = window.tocae.youtubeMusic

  useLayoutEffect(() => {
    const element = viewBoundsRef.current
    if (!element) return

    let frame = 0
    const updateBounds = () => {
      frame = 0
      const bounds = element.getBoundingClientRect()
      void api
        .setBounds({
          x: bounds.left,
          y: bounds.top,
          width: bounds.width,
          height: bounds.height,
        })
        .catch((error: unknown) => {
          console.error('Could not update the YouTube Music view bounds', error)
          setStatus((current) => ({ ...current, state: 'error' }))
        })
    }

    const observer = new ResizeObserver(() => {
      if (frame) window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(updateBounds)
    })
    updateBounds()
    observer.observe(element)

    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [api])

  useEffect(() => {
    let active = true
    const unsubscribe = api.onStatus((nextStatus) => {
      if (active) setStatus(nextStatus)
    })

    void api
      .getStatus()
      .then((currentStatus) => {
        if (active) setStatus(currentStatus)
      })
      .catch((error: unknown) => {
        console.error('Could not read the YouTube Music status', error)
        if (active) setStatus((current) => ({ ...current, state: 'error' }))
      })

    void api.open().catch((error: unknown) => {
      console.error('Could not open YouTube Music', error)
      if (active) setStatus((current) => ({ ...current, state: 'error' }))
    })

    return () => {
      active = false
      unsubscribe()
      void api.close().catch((error: unknown) => {
        console.error('Could not close the YouTube Music view', error)
      })
    }
  }, [api])

  function run(action: () => Promise<void>): void {
    void action().catch((error: unknown) => {
      console.error('YouTube Music action failed', error)
      setStatus((current) => ({ ...current, state: 'error' }))
    })
  }

  return (
    <section
      className={`${styles.page} ${immersive ? styles.immersive : ''}`}
      aria-label={t('youtubeMusic.title')}
    >
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.logo} aria-hidden="true">
            <Music2 size={15} />
          </span>
          <h1 className={styles.title}>{t('youtubeMusic.title')}</h1>
        </div>
        <div className={styles.controls} role="group" aria-label={t('youtubeMusic.controls')}>
          <button
            type="button"
            className={styles.controlButton}
            onClick={() => run(api.goBack)}
            disabled={!status.canGoBack || status.state !== 'ready'}
            aria-label={t('youtubeMusic.back')}
            title={t('youtubeMusic.back')}
          >
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.controlButton}
            onClick={() => run(api.goForward)}
            disabled={!status.canGoForward || status.state !== 'ready'}
            aria-label={t('youtubeMusic.forward')}
            title={t('youtubeMusic.forward')}
          >
            <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.controlButton}
            onClick={() => run(api.reload)}
            disabled={status.state === 'loading'}
            aria-label={t('youtubeMusic.reload')}
            title={t('youtubeMusic.reload')}
          >
            <RefreshCw size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.controlButton}
            onClick={() => run(api.stop)}
            disabled={status.state === 'idle'}
            aria-label={t('youtubeMusic.stop')}
            title={t('youtubeMusic.stop')}
          >
            <Square size={14} aria-hidden="true" />
          </button>
          <button type="button" className={styles.returnButton} onClick={onReturnToLibrary}>
            <House size={15} aria-hidden="true" />
            {t('youtubeMusic.returnToLibrary')}
          </button>
        </div>
      </header>

      <div className={styles.surface}>
        <div ref={viewBoundsRef} className={styles.viewBounds} aria-hidden="true" />
        {status.state !== 'ready' && (
          <div className={styles.status} role={status.state === 'error' ? 'alert' : 'status'}>
            {status.state === 'idle' ? (
              <>
                <Music2 className={styles.statusIcon} size={24} aria-hidden="true" />
                <p>{t('youtubeMusic.stopped')}</p>
                <button
                  type="button"
                  className={styles.retryButton}
                  onClick={() => run(api.open)}
                >
                  <Music2 size={14} aria-hidden="true" />
                  {t('youtubeMusic.open')}
                </button>
              </>
            ) : status.state === 'error' ? (
              <>
                <TriangleAlert className={styles.statusIcon} size={24} aria-hidden="true" />
                <p>{t('youtubeMusic.loadError')}</p>
                <button
                  type="button"
                  className={styles.retryButton}
                  onClick={() => run(api.reload)}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  {t('youtubeMusic.retry')}
                </button>
              </>
            ) : (
              <>
                <LoaderCircle
                  className={`${styles.statusIcon} ${styles.spinner}`}
                  size={24}
                  aria-hidden="true"
                />
                <p>{t('youtubeMusic.loading')}</p>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

export default YouTubeMusicPage
