import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ListVideo } from 'lucide-react'
import type { MessageKey, TranslationParams } from '@shared/i18n'
import { mediaTypeForPath } from '@shared/media'
import AppBar from '../../components/AppBar'
import Toast from '../../components/Toast'
import PlaylistPanel from '../playlist/PlaylistPanel'
import VideoPlayer from './VideoPlayer'
import { readPlaybackPreferences, savePlaybackPreferences } from './playbackPreferences'
import SettingsPage from '../settings/SettingsPage'
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

type PlayerScreenProps = {
  accentColor: string
  onAccentColorChange: (color: string) => void
  onImmersiveModeChange: (immersive: boolean) => void
}

function PlayerScreen({
  accentColor,
  onAccentColorChange,
  onImmersiveModeChange,
}: PlayerScreenProps) {
  const playlist = usePlaylist()
  const { t } = useI18n()
  const api = window.tocae
  const [activePage, setActivePage] = useState<'player' | 'settings'>('player')
  const [playlistVisible, setPlaylistVisible] = useState(false)
  // O painel fica montado durante a saída para poder animar; `panelLeaving`
  // marca o estado intermediário.
  const [panelLeaving, setPanelLeaving] = useState(false)
  const panelTimerRef = useRef<number | null>(null)
  const hasOpenedPanelRef = useRef(false)
  // Uma única região viva para tudo que muda sozinho: item tocando, erro e
  // resultado de um reordenamento pelo teclado.
  const [announcement, setAnnouncement] = useState<Announcement | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [playerControlsVisible, setPlayerControlsVisible] = useState(true)
  const [playbackPreferences, setPlaybackPreferences] = useState(readPlaybackPreferences)
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

  const handlePlaylistItemPlay = useCallback(
    (index: number) => {
      playlist.playIndex(index)
      setPlaylistVisible(false)
    },
    [playlist.playIndex],
  )

  const togglePlaylist = useCallback(() => {
    setPlaylistVisible((visible) => !visible)
  }, [])

  const handleAutoNextChange = useCallback(
    (autoNext: boolean) => {
      const next = { ...playbackPreferences, autoNext }
      setPlaybackPreferences(next)
      savePlaybackPreferences(next)
    },
    [playbackPreferences],
  )

  const handleRepeatCurrentChange = useCallback(
    (repeatCurrent: boolean) => {
      const next = { ...playbackPreferences, repeatCurrent }
      setPlaybackPreferences(next)
      savePlaybackPreferences(next)
    },
    [playbackPreferences],
  )

  const handlePlaybackEnded = useCallback(() => {
    if (playbackPreferences.autoNext) playlist.next()
  }, [playbackPreferences.autoNext, playlist.next])

  useEffect(() => {
    if (!api) return

    return api.onCommand((command) => {
      switch (command.type) {
        case 'open-media':
          playlist.addPaths(command.paths)
          setActivePage('player')
          break
        case 'play-media':
          playlist.openPaths(command.paths)
          setActivePage('player')
          break
        case 'update-available':
          setUpdateVersion(command.version)
          break
        case 'next-video':
          playlist.next()
          break
        case 'previous-video':
          playlist.previous()
          break
        case 'toggle-playlist':
          togglePlaylist()
          break
        case 'clear-playlist':
          handleClear()
          break
      }
    })
  }, [api, playlist, handleClear, togglePlaylist])

  useEffect(() => {
    if (api && playlist.loaded) api.notifyRendererReady()
  }, [api, playlist.loaded])

  // Mantém o painel montado durante a animação de saída e cancela a saída se
  // ele for reaberto no meio do caminho.
  useEffect(() => {
    if (playlistVisible) {
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
  }, [playlistVisible])

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

      if (
        (event.ctrlKey || event.metaKey) &&
        (event.key === 'o' || event.key === 'O')
      ) {
        event.preventDefault()
        if (event.shiftKey) {
          void api?.openMediaFolderDialog()
        } else {
          void api?.openMediaDialog()
        }
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
          togglePlaylist()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [api, playlist, togglePlaylist])

  const announcementText = useMemo(
    () => (announcement ? t(announcement.key, announcement.params) : ''),
    [announcement, t],
  )

  const errorMessage = playlist.error ? t(playlist.error) : null
  const mediaType = playlist.current ? mediaTypeForPath(playlist.current.path) : null
  const immersiveMedia =
    activePage === 'player' &&
    (mediaType === 'video' || mediaType === 'image' || mediaType === 'audio')
  useEffect(() => {
    onImmersiveModeChange(immersiveMedia)
    return () => onImmersiveModeChange(false)
  }, [immersiveMedia, onImmersiveModeChange])

  function handleOpenReleases() {
    void api.openReleasesPage().catch((error: unknown) => {
      console.error('Could not open the Tocaê releases page', error)
    })
  }

  return (
    <div
      className={`${styles.screen} ${activePage === 'player' ? styles.playerMode : styles.settingsMode}`}
    >
      <AppBar
        activePage={activePage}
        onOpenMedia={() => void api?.openMediaDialog()}
        onOpenMediaFolder={() => void api?.openMediaFolderDialog()}
        onOpenPlayer={() => setActivePage('player')}
        onOpenSettings={() => setActivePage('settings')}
      />

      <section
        className={`${styles.workspace} ${
          activePage === 'player' ? styles.playerWorkspace : ''
        } ${immersiveMedia ? styles.immersiveMediaWorkspace : ''}`}
      >
        <div className={styles.pageStack}>
          <div
            className={`${styles.playbackPage} ${activePage === 'player' ? '' : styles.playbackPageHidden}`}
            aria-hidden={activePage !== 'player'}
          >
            <header
              className={`${styles.workspaceHeader} ${
                playerControlsVisible ? '' : styles.workspaceHeaderHidden
              }`}
            >
              <div className={styles.mediaHeading}>
                <h1 className={styles.mediaTitle}>
                  {playlist.current?.name ?? t('player.sessionTitle')}
                </h1>
              </div>
            </header>

            <div className={styles.layout}>
              <div className={styles.stage}>
                <p className="sr-only" role="status" aria-live="polite">
                  {announcementText}
                </p>
                <VideoPlayer
                  source={playlist.source}
                  mediaType={mediaType}
                  title={playlist.current?.name ?? ''}
                  immersive={immersiveMedia}
                  autoNext={playbackPreferences.autoNext}
                  onAutoNextChange={handleAutoNextChange}
                  loopCurrent={playbackPreferences.repeatCurrent}
                  onLoopCurrentChange={handleRepeatCurrentChange}
                  message={errorMessage}
                  hasNext={playlist.hasNext}
                  hasPrevious={playlist.hasPrevious}
                  onNext={playlist.next}
                  onPrevious={playlist.previous}
                  onEnded={handlePlaybackEnded}
                  onFailed={playlist.failCurrent}
                  onFilesSelected={playlist.addFiles}
                  onControlsVisibilityChange={setPlayerControlsVisible}
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

              <div
                className={`${styles.playlistHoverRegion} ${
                  playlistVisible || panelLeaving ? styles.playlistHoverRegionOpen : ''
                } ${immersiveMedia ? styles.playlistHoverRegionImmersive : ''}`}
                onMouseEnter={() => setPlaylistVisible(true)}
                onMouseLeave={(event) => {
                  if (!event.currentTarget.matches(':focus-within')) {
                    setPlaylistVisible(false)
                  }
                }}
                onFocusCapture={() => setPlaylistVisible(true)}
                onBlurCapture={(event) => {
                  const next = event.relatedTarget
                  if (next instanceof Node && event.currentTarget.contains(next)) return
                  setPlaylistVisible(false)
                }}
              >
                <button
                  type="button"
                  className={`${styles.queueButton} ${
                    !playerControlsVisible && !playlistVisible ? styles.queueButtonHidden : ''
                  }`}
                  onClick={() => setPlaylistVisible(true)}
                  aria-label={t('playlist.label')}
                  aria-expanded={playlistVisible}
                  aria-controls="playlist-panel"
                >
                  <ListVideo size={15} aria-hidden="true" />
                  <span>{t('playlist.title')}</span>
                  <span className={styles.queueCount}>{playlist.items.length}</span>
                </button>

                {(playlistVisible || panelLeaving) && (
                  <PlaylistPanel
                    items={playlist.items}
                    currentIndex={playlist.currentIndex}
                    immersive={immersiveMedia}
                    closing={!playlistVisible}
                    loading={!playlist.loaded}
                    pulseIds={playlist.pulseIds}
                    onPlay={handlePlaylistItemPlay}
                    onMove={playlist.move}
                    onRemove={playlist.remove}
                    onClear={handleClear}
                    onFilesSelected={playlist.addFiles}
                    onAnnounce={announce}
                  />
                )}
              </div>
            </div>
          </div>

          {activePage === 'settings' && (
            <SettingsPage
              accentColor={accentColor}
              onAccentColorChange={onAccentColorChange}
              autoNext={playbackPreferences.autoNext}
              repeatCurrent={playbackPreferences.repeatCurrent}
              onAutoNextChange={handleAutoNextChange}
              onRepeatCurrentChange={handleRepeatCurrentChange}
            />
          )}
        </div>
        {updateVersion && (
          <Toast
            message={t('updates.available', { version: updateVersion })}
            actionLabel={t('updates.viewRelease')}
            actionIcon="external"
            onAction={handleOpenReleases}
            onDismiss={() => setUpdateVersion(null)}
            durationMs={12000}
          />
        )}
      </section>
    </div>
  )
}

export default PlayerScreen
