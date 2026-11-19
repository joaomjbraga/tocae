import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ListVideo, Music2 } from 'lucide-react'
import type { MessageKey, TranslationParams } from '@shared/i18n'
import AppBar from '../../components/AppBar'
import Toast from '../../components/Toast'
import PlaylistPanel from '../playlist/PlaylistPanel'
import VideoPlayer from './VideoPlayer'
import { usePlaylist } from '../playlist/usePlaylist'
import type { PlaylistSnapshot } from '../playlist/usePlaylist'
import { useI18n } from '../../i18n'
import styles from './PlayerScreen.module.css'

/** Deve cobrir a saída animada do painel (--duration-exit) antes de desmontar. */
const PANEL_EXIT_MS = 160

/** Guarda a chave, não o texto, para o toast acompanhar a troca de idioma. */
type ToastState = { key: MessageKey; snapshot: PlaylistSnapshot }

/** Mensagem viva: guarda a chave para poder ser retraduzida na troca de idioma. */
type Announcement = { key: MessageKey; params?: TranslationParams }

function PlayerScreen() {
  const playlist = usePlaylist()
  const { t } = useI18n()
  const api = window.tocae
  // O painel fica montado durante a saída para poder animar; `panelLeaving`
  // marca o estado intermediário.
  const [panelLeaving, setPanelLeaving] = useState(false)
  const panelTimerRef = useRef<number | null>(null)
  const hasOpenedPanelRef = useRef(false)
  // Uma única região viva para tudo que muda sozinho: item tocando, erro e
  // resultado de um reordenamento pelo teclado.
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const announcedIdRef = useRef<string | null>(null)

  const announce = useCallback(
    (key: MessageKey, params?: TranslationParams) => setAnnouncement({ key, params }),
    [],
  )

  // "Limpar" passa pelo mesmo caminho vindo da barra, do painel ou do atalho do
  // processo principal, para que o desfazer exista nos três casos.
  const handleClear = useCallback(() => {
    const snapshot = playlist.clear()
    if (snapshot) setToast({ key: 'player.listCleared', snapshot })
  }, [playlist, t])

  const handleUndoClear = useCallback(() => {
    if (toast) playlist.restore(toast.snapshot)
    setToast(null)
  }, [playlist, toast])

  useEffect(() => {
    if (!api) return

    return api.onCommand((command) => {
      switch (command.type) {
        case 'open-videos':
          playlist.addPaths(command.paths)
          break
        case 'next-video':
          playlist.next()
          break
        case 'previous-video':
          playlist.previous()
          break
        case 'toggle-playlist':
          playlist.togglePanel()
          break
        case 'clear-playlist':
          handleClear()
          break
      }
    })
  }, [api, playlist, handleClear])

  // Mantém o painel montado durante a animação de saída e cancela a saída se
  // ele for reaberto no meio do caminho.
  useEffect(() => {
    if (playlist.panelVisible) {
      hasOpenedPanelRef.current = true
      setPanelLeaving(false)
      if (panelTimerRef.current !== null) {
        window.clearTimeout(panelTimerRef.current)
        panelTimerRef.current = null
      }
      return
    }

    if (!hasOpenedPanelRef.current) return

    setPanelLeaving(true)
    panelTimerRef.current = window.setTimeout(() => setPanelLeaving(false), PANEL_EXIT_MS)
    return () => {
      if (panelTimerRef.current !== null) window.clearTimeout(panelTimerRef.current)
    }
  }, [playlist.panelVisible])

  // Anuncia o item em reprodução uma vez por item (voltar para o anterior
  // anuncia de novo, porque o id muda).
  useEffect(() => {
    const current = playlist.current
    if (!current) {
      announcedIdRef.current = null
      return
    }
    if (announcedIdRef.current === current.id) return
    announcedIdRef.current = current.id
    announce('player.nowPlaying', {
      current: playlist.currentIndex + 1,
      total: playlist.items.length,
      name: current.name,
    })
  }, [announce, playlist.current, playlist.currentIndex, playlist.items.length])

  useEffect(() => {
    if (playlist.error) announce(playlist.error)
  }, [announce, playlist.error])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (target instanceof HTMLInputElement && target.type !== 'range') return

      if ((event.ctrlKey || event.metaKey) && (event.key === 'o' || event.key === 'O')) {
        event.preventDefault()
        void api?.openVideoDialog()
        return
      }

      switch (event.key) {
        case 'n':
        case 'N':
          event.preventDefault()
          playlist.next()
          break
        case 'p':
        case 'P':
          event.preventDefault()
          playlist.previous()
          break
        case 'l':
        case 'L':
          event.preventDefault()
          playlist.togglePanel()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [api, playlist])

  const announcementText = useMemo(
    () => (announcement ? t(announcement.key, announcement.params) : ''),
    [announcement, t],
  )

  const errorMessage = playlist.error ? t(playlist.error) : null

  return (
    <div className={styles.screen}>
      <AppBar
        hasItems={playlist.items.length > 0}
        onOpenVideos={() => void api?.openVideoDialog()}
        onClear={handleClear}
        onOpenShortcuts={() => void api?.openWindow('shortcuts')}
        onOpenAbout={() => void api?.openWindow('about')}
      />

      <section className={styles.workspace}>
        <header className={styles.workspaceHeader}>
          <div className={styles.mediaHeading}>
            <span className={styles.mediaIcon} aria-hidden="true">
              <Music2 size={16} />
            </span>
            <div className={styles.mediaCopy}>
              <span className={styles.eyebrow}>
                {playlist.current ? t('player.nowPlayingLabel') : t('player.sessionLabel')}
              </span>
              <h1 className={styles.mediaTitle}>
                {playlist.current?.name ?? t('player.sessionTitle')}
              </h1>
            </div>
            {playlist.current && (
              <span className={styles.mediaPosition}>
                {String(playlist.currentIndex + 1).padStart(2, '0')} /{' '}
                {String(playlist.items.length).padStart(2, '0')}
              </span>
            )}
          </div>

          {!(playlist.panelVisible || panelLeaving) && (
            <button
              type="button"
              className={styles.queueButton}
              onClick={playlist.togglePanel}
              title={t('appbar.togglePlaylistTitle')}
              aria-label={t('appbar.togglePlaylist')}
              aria-pressed={playlist.panelVisible}
            >
              <ListVideo size={15} aria-hidden="true" />
              <span>{t('playlist.title')}</span>
              <span className={styles.queueCount}>{playlist.items.length}</span>
            </button>
          )}
        </header>

        <div className={styles.layout}>
          <div className={styles.stage}>
            <p className="sr-only" role="status" aria-live="polite">
              {announcementText}
            </p>
            <VideoPlayer
              source={playlist.source}
              message={errorMessage}
              hasNext={playlist.hasNext}
              hasPrevious={playlist.hasPrevious}
              onNext={playlist.next}
              onPrevious={playlist.previous}
              onEnded={playlist.next}
              onFailed={playlist.failCurrent}
              onFilesSelected={playlist.addFiles}
            />
            {toast && (
              <Toast
                message={t(toast.key)}
                actionLabel={t('player.undo')}
                onAction={handleUndoClear}
                onDismiss={() => setToast(null)}
              />
            )}
          </div>

          {(playlist.panelVisible || panelLeaving) && (
            <PlaylistPanel
              items={playlist.items}
              currentIndex={playlist.currentIndex}
              closing={!playlist.panelVisible}
              loading={!playlist.loaded}
              pulseIds={playlist.pulseIds}
              onPlay={playlist.playIndex}
              onMove={playlist.move}
              onRemove={playlist.remove}
              onClear={handleClear}
              onClose={playlist.togglePanel}
              onFilesSelected={playlist.addFiles}
              onAnnounce={announce}
            />
          )}
        </div>
      </section>
    </div>
  )
}

export default PlayerScreen
