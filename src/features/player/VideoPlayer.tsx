import { useEffect, useRef, useState } from 'react'
import type {
  ChangeEvent,
  CSSProperties,
  DragEvent,
  PointerEvent as ReactPointerEvent,
  SyntheticEvent,
} from 'react'
import {
  FastForward,
  FolderOpen,
  Loader2,
  Maximize,
  Minimize,
  Pause,
  Play,
  Rewind,
  RotateCcw,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { formatTime } from '../../lib/format'
import { useI18n } from '../../i18n'
import { useVideoViewport } from './useVideoViewport'
import styles from './VideoPlayer.module.css'

/** Tempo parado até os controles do player se esconderem. */
const IDLE_DELAY_MS = 2500
const SEEK_STEP_SECONDS = 1

/** A timeline desenha o progresso com um custom property lido pelo CSS do trilho. */
type SeekStyle = CSSProperties & { '--progress': string }
type PreviewStyle = CSSProperties & { '--preview-position': string }

type VideoPlayerProps = {
  source: string | null
  message: string | null
  hasNext: boolean
  hasPrevious: boolean
  onNext: () => void
  onPrevious: () => void
  onEnded: () => void
  onFailed: () => void
  onFilesSelected: (files: File[]) => void
}

function VideoPlayer({
  source,
  message,
  hasNext,
  hasPrevious,
  onNext,
  onPrevious,
  onEnded,
  onFailed,
  onFilesSelected,
}: VideoPlayerProps) {
  const { t } = useI18n()
  const areaRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const failedSourceRef = useRef<string | null>(null)
  const idleTimerRef = useRef<number | null>(null)
  const previewTimeRef = useRef<number | null>(null)
  const previewSeekTimerRef = useRef<number | null>(null)
  const lastPreviewSeekRef = useRef(0)
  const viewport = useVideoViewport(areaRef, videoRef, source)
  const [playing, setPlaying] = useState(false)
  const [buffering, setBuffering] = useState(false)
  const [idle, setIdle] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [seeking, setSeeking] = useState(false)
  const [previewTime, setPreviewTime] = useState<number | null>(null)
  const [previewFrameReady, setPreviewFrameReady] = useState(false)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [volume, setVolume] = useState(1)
  const [muted, setMuted] = useState(false)

  useEffect(() => {
    const area = areaRef.current
    if (!area) return
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    area.addEventListener('fullscreenchange', onChange)
    return () => area.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    failedSourceRef.current = null
    setCurrentTime(0)
    setDuration(0)
    setPlaying(false)
    setBuffering(false)
    setIdle(false)
    previewTimeRef.current = null
    lastPreviewSeekRef.current = 0
    setPreviewTime(null)
    setPreviewFrameReady(false)
    setPreviewVisible(false)
    if (previewSeekTimerRef.current !== null) {
      window.clearTimeout(previewSeekTimerRef.current)
      previewSeekTimerRef.current = null
    }

    return () => {
      if (previewSeekTimerRef.current !== null) {
        window.clearTimeout(previewSeekTimerRef.current)
        previewSeekTimerRef.current = null
      }
    }
  }, [source])

  // Controles se escondem depois de um tempo parado durante a reprodução,
  // como em qualquer player de vídeo. Qualquer interação traz de volta.
  useEffect(() => {
    if (!playing) {
      setIdle(false)
      return
    }

    const wake = () => {
      setIdle(false)
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current)
      idleTimerRef.current = window.setTimeout(() => setIdle(true), IDLE_DELAY_MS)
    }

    wake()
    const events: (keyof WindowEventMap)[] = ['mousemove', 'keydown', 'pointerdown', 'touchstart', 'wheel']
    events.forEach((type) => window.addEventListener(type, wake, { passive: true }))
    return () => {
      events.forEach((type) => window.removeEventListener(type, wake))
      if (idleTimerRef.current !== null) window.clearTimeout(idleTimerRef.current)
    }
  }, [playing])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      const isButton = target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement
      switch (event.key) {
        case 'f':
        case 'F':
          event.preventDefault()
          toggleFullscreen()
          break
        case 'm':
        case 'M':
          event.preventDefault()
          toggleMute()
          break
        case ' ':
          if (isButton) break
          event.preventDefault()
          togglePlay()
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (files.length > 0) onFilesSelected(files)
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) onFilesSelected(files)
  }

  function togglePlay() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      void video.play()
    } else {
      video.pause()
    }
  }

  function handleEnded() {
    setPlaying(false)
    onEnded()
  }

  function handleError(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget
    const code = video.error?.code ?? 0
    // 1 = ABORTED (troca de fonte); 0 = desconhecido, sem informação útil.
    // 2 = NETWORK: arquivo ausente/ilegível precisa cair no tratamento de falha.
    if (code === 0 || code === 1) return
    if (failedSourceRef.current === source) return
    failedSourceRef.current = source
    setPlaying(false)
    onFailed()
  }

  function handleTimeUpdate(event: SyntheticEvent<HTMLVideoElement>) {
    if (!seeking) setCurrentTime(event.currentTarget.currentTime)
  }

  function handleSeek(event: ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current
    if (!video) return
    const time = Number(event.target.value)
    video.currentTime = time
    setCurrentTime(time)
  }

  function seekPreviewFrame(video: HTMLVideoElement) {
    const time = previewTimeRef.current
    if (time === null || !Number.isFinite(video.duration)) return
    const target = Math.min(video.duration, time)
    if (Math.abs(video.currentTime - target) > 0.05) {
      video.currentTime = target
    } else {
      setPreviewFrameReady(true)
    }
  }

  function handleTimelinePointerMove(event: ReactPointerEvent<HTMLInputElement>) {
    if (duration <= 0) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (bounds.width <= 0) return
    const progress = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
    const time = progress * duration
    previewTimeRef.current = time
    setPreviewTime(time)
    setPreviewVisible(true)
    setPreviewFrameReady(false)

    const elapsed = performance.now() - lastPreviewSeekRef.current
    const delay = Math.max(0, 100 - elapsed)
    if (previewSeekTimerRef.current !== null) {
      window.clearTimeout(previewSeekTimerRef.current)
    }
    previewSeekTimerRef.current = window.setTimeout(() => {
      previewSeekTimerRef.current = null
      const previewVideo = previewVideoRef.current
      if (previewVideo?.readyState >= HTMLMediaElement.HAVE_METADATA) {
        seekPreviewFrame(previewVideo)
        lastPreviewSeekRef.current = performance.now()
      }
    }, delay)
  }

  function seekBy(delta: number) {
    const video = videoRef.current
    if (!video || !Number.isFinite(video.duration)) return
    const time = Math.min(video.duration, Math.max(0, video.currentTime + delta))
    video.currentTime = time
    setCurrentTime(time)
  }

  function handleVolumeChange(event: ChangeEvent<HTMLInputElement>) {
    applyVolume(Number(event.target.value))
  }

  function applyVolume(value: number) {
    const video = videoRef.current
    if (!video) return
    const clamped = Math.min(1, Math.max(0, value))
    video.volume = clamped
    if (clamped > 0 && video.muted) {
      video.muted = false
      setMuted(false)
    }
    setVolume(clamped)
  }

  function handleVolumeSync(event: SyntheticEvent<HTMLVideoElement>) {
    setVolume(event.currentTarget.volume)
    setMuted(event.currentTarget.muted)
  }

  function toggleMute() {
    const video = videoRef.current
    if (!video) return
    video.muted = !video.muted
  }

  const volumeIcon = muted || volume === 0 ? (
    <VolumeX size={16} />
  ) : volume < 0.5 ? (
    <Volume1 size={16} />
  ) : (
    <Volume2 size={16} />
  )

  function toggleFullscreen() {
    const area = areaRef.current
    if (!area) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void area.requestFullscreen()
    }
  }

  const hasVideo = source !== null
  const paused = !playing
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0
  const previewPosition =
    duration > 0 && previewTime !== null
      ? `${Math.min(100, Math.max(0, (previewTime / duration) * 100))}%`
      : '0%'
  const previewStyle: PreviewStyle = { '--preview-position': previewPosition }

  return (
    <section
      ref={areaRef}
      className={[
        styles.videoArea,
        dragging ? styles.dragging : '',
        playing ? styles.playing : styles.paused,
        idle ? styles.idle : '',
        viewport.isPortrait ? styles.portrait : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
    >
      {hasVideo ? (
        <>
          <video
            key={source}
            ref={videoRef}
            className={[
              styles.video,
              viewport.isZoomable ? styles.zoomable : '',
              viewport.isPanning ? styles.panning : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={viewport.videoStyle}
            src={source ?? undefined}
            autoPlay
            controls={false}
            muted={muted}
            onClick={(event) => {
              if (viewport.draggedVideoRef.current) {
                viewport.draggedVideoRef.current = false
                event.preventDefault()
                return
              }
              togglePlay()
            }}
            onPointerDown={viewport.handlePointerDown}
            onPointerMove={viewport.handlePointerMove}
            onPointerUp={viewport.handlePointerUp}
            onPointerCancel={viewport.handlePointerCancel}
            onContextMenu={(event) => event.preventDefault()}
            onPlay={() => {
              setPlaying(true)
              setBuffering(false)
            }}
            onPause={() => setPlaying(false)}
            onWaiting={() => setBuffering(true)}
            onPlaying={() => setBuffering(false)}
            onCanPlay={() => setBuffering(false)}
            onSeeked={() => setBuffering(false)}
            onEnded={handleEnded}
            onError={handleError}
            onTimeUpdate={handleTimeUpdate}
            onVolumeChange={handleVolumeSync}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget
              setDuration(video.duration)
              viewport.setVideoOrientation(video.videoWidth, video.videoHeight)
            }}
            onDurationChange={(event) => setDuration(event.currentTarget.duration)}
          />
          <div className={styles.zoomControls} role="group" aria-label={t('player.zoomControls')}>
            <button
              type="button"
              className={styles.controlButton}
              onClick={viewport.zoomOut}
              disabled={!viewport.canZoomOut}
              aria-label={t('player.zoomOut')}
              title={t('player.zoomOut')}
            >
              <ZoomOut size={16} />
            </button>
            <span className={styles.zoomValue}>{Math.round(viewport.zoom * 100)}%</span>
            <button
              type="button"
              className={styles.controlButton}
              onClick={viewport.zoomIn}
              disabled={!viewport.canZoomIn}
              aria-label={t('player.zoomIn')}
              title={t('player.zoomIn')}
            >
              <ZoomIn size={16} />
            </button>
            <button
              type="button"
              className={styles.controlButton}
              onClick={viewport.resetZoom}
              disabled={!viewport.canResetZoom}
              aria-label={t('player.resetZoom')}
              title={t('player.resetZoom')}
            >
              <RotateCcw size={15} />
            </button>
          </div>
          <button
            type="button"
            className={styles.playPause}
            onClick={togglePlay}
            aria-label={t('player.play')}
            title={t('player.play')}
          >
            <Play size={24} />
          </button>
          {buffering && (
            <div className={styles.buffer} role="status" aria-live="polite">
              <Loader2 size={28} className={styles.spinner} />
              <span className="sr-only">{t('player.loadingVideo')}</span>
            </div>
          )}
          <div className={styles.controlsBar}>
            <button
              type="button"
              className={styles.controlButton}
              onClick={togglePlay}
              aria-label={paused ? t('player.play') : t('player.pause')}
              title={paused ? t('player.play') : t('player.pause')}
            >
              {paused ? <Play size={16} /> : <Pause size={16} />}
            </button>
            <button
              type="button"
              className={styles.controlButton}
              onClick={onPrevious}
              disabled={!hasPrevious}
              aria-label={t('player.previous')}
              title={t('player.previousTitle')}
            >
              <SkipBack size={16} />
            </button>
            <button
              type="button"
              className={styles.controlButton}
              onClick={onNext}
              disabled={!hasNext}
              aria-label={t('player.next')}
              title={t('player.nextTitle')}
            >
              <SkipForward size={16} />
            </button>
            <button
              type="button"
              className={styles.controlButton}
              onClick={() => seekBy(-SEEK_STEP_SECONDS)}
              disabled={duration <= 0}
              aria-label={t('player.seekBackward')}
              title={t('player.seekBackward')}
            >
              <Rewind size={16} />
            </button>
            <span className={styles.time}>{formatTime(currentTime)}</span>
            <div className={styles.timeline}>
              {previewTime !== null && (
                <div
                  className={`${styles.seekPreview} ${previewVisible ? styles.previewVisible : ''}`}
                  style={previewStyle}
                  aria-hidden="true"
                >
                  <video
                    key={`preview-${source}`}
                    ref={previewVideoRef}
                    className={`${styles.previewFrame} ${previewFrameReady ? styles.previewFrameReady : ''}`}
                    src={source ?? undefined}
                    muted
                    playsInline
                    preload="metadata"
                    aria-hidden="true"
                    tabIndex={-1}
                    onLoadedMetadata={(event) => seekPreviewFrame(event.currentTarget)}
                    onLoadedData={(event) => {
                      const video = event.currentTarget
                      const target = previewTimeRef.current
                      if (target !== null && Math.abs(video.currentTime - target) <= 0.05) {
                        setPreviewFrameReady(true)
                      }
                    }}
                    onSeeked={() => setPreviewFrameReady(true)}
                  />
                  {!previewFrameReady && <span className={styles.previewPlaceholder} />}
                  <span className={styles.previewTimestamp}>{formatTime(previewTime)}</span>
                </div>
              )}
              <input
                type="range"
                className={styles.seek}
                style={{ '--progress': `${progressPercent}%` } as SeekStyle}
                min={0}
                max={duration || 0}
                step="1"
                value={currentTime}
                onChange={handleSeek}
                onPointerEnter={handleTimelinePointerMove}
                onPointerMove={handleTimelinePointerMove}
                onPointerLeave={() => {
                  if (!seeking) setPreviewVisible(false)
                }}
                onPointerDown={(event) => {
                  setSeeking(true)
                  handleTimelinePointerMove(event)
                }}
                onPointerUp={(event) => {
                  setSeeking(false)
                  if (!event.currentTarget.matches(':hover')) setPreviewVisible(false)
                }}
                onPointerCancel={() => {
                  setSeeking(false)
                  setPreviewVisible(false)
                }}
                aria-label={t('player.timeline')}
                aria-valuetext={t('player.timelineValue', {
                  current: formatTime(currentTime),
                  total: formatTime(duration),
                })}
              />
            </div>
            <span className={styles.time}>{formatTime(duration)}</span>
            <button
              type="button"
              className={styles.controlButton}
              onClick={() => seekBy(SEEK_STEP_SECONDS)}
              disabled={duration <= 0}
              aria-label={t('player.seekForward')}
              title={t('player.seekForward')}
            >
              <FastForward size={16} />
            </button>
            <div className={styles.volume}>
              <button
                type="button"
                className={styles.controlButton}
                onClick={toggleMute}
                aria-label={muted ? t('player.unmute') : t('player.mute')}
                title={muted ? t('player.unmute') : t('player.mute')}
              >
                {volumeIcon}
              </button>
              <input
                type="range"
                className={styles.volumeSlider}
                min={0}
                max={1}
                step={0.01}
                value={muted ? 0 : volume}
                onChange={handleVolumeChange}
                aria-label={t('player.volume')}
              />
            </div>
            <button
              type="button"
              className={styles.controlButton}
              onClick={toggleFullscreen}
              aria-label={isFullscreen ? t('player.exitFullscreen') : t('player.fullscreen')}
              title={isFullscreen ? t('player.exitFullscreen') : t('player.fullscreen')}
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          </div>
        </>
      ) : (
        <div
          className={styles.placeholder}
          aria-label={t('appbar.openVideos')}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
          }}
        >
          <h2 className={styles.placeholderTitle}>{t('player.welcomeTitle')}</h2>
          <p>{message ?? t('player.dropHint')}</p>
          <span className={styles.placeholderAction}>
            <FolderOpen size={14} aria-hidden="true" />
            {t('appbar.openVideos')}
          </span>
        </div>
      )}

      <input
        ref={inputRef}
        className={styles.fileInput}
        type="file"
        accept="video/*"
        multiple
        onChange={handleFileChange}
      />
    </section>
  )
}

export default VideoPlayer
