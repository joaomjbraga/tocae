import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownAZ,
  Check,
  ChevronDown,
  FolderOpen,
  FolderPlus,
  Image,
  LoaderCircle,
  Music2,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Trash2,
  Video,
} from 'lucide-react'
import type { MessageKey } from '@shared/i18n'
import type { LibraryFolder, LibraryMediaItem, LibrarySnapshot, StandardLibraryFolderId } from '@shared/library'
import type { MediaMetadata, MediaType } from '@shared/media'
import { useI18n } from '../../i18n'
import { toMediaUrl } from '../../lib/media'
import { summarizeMediaMetadata } from '../../lib/mediaMetadata'
import MetadataEditorDialog from './MetadataEditorDialog'
import styles from './Library.module.css'

type MediaFilter = 'all' | MediaType

type LibraryProps = {
  onPlay: (filePath: string) => void
  onMetadataSaved?: (filePath: string, metadata: MediaMetadata) => void
}

const STANDARD_FOLDER_LABELS: Record<StandardLibraryFolderId, MessageKey> = {
  desktop: 'library.folderDesktop',
  documents: 'library.folderDocuments',
  downloads: 'library.folderDownloads',
  pictures: 'library.folderPictures',
  music: 'library.folderMusic',
  videos: 'library.folderVideos',
}

const MEDIA_TYPE_LABELS: Record<MediaType, MessageKey> = {
  video: 'library.typeVideo',
  image: 'library.typeImage',
  audio: 'library.typeAudio',
}

function folderName(folder: LibraryFolder, translate: (key: MessageKey) => string): string {
  return folder.kind === 'custom' ? folder.name : translate(STANDARD_FOLDER_LABELS[folder.kind])
}

function mediaIcon(type: MediaType) {
  if (type === 'video') return Video
  if (type === 'image') return Image
  return Music2
}

function VideoPreview({
  src,
  onDimensions,
}: {
  src: string
  onDimensions?: (width: number, height: number, duration?: number) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    if (typeof IntersectionObserver === 'undefined') {
      video.src = src
      video.load()
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        observer.disconnect()
        video.src = src
        video.load()
      },
      { rootMargin: '120px' },
    )
    observer.observe(video)
    return () => observer.disconnect()
  }, [src])

  return (
    <video
      ref={videoRef}
      preload="metadata"
      muted
      playsInline
      tabIndex={-1}
      aria-hidden="true"
      onLoadedMetadata={(event) => {
        const video = event.currentTarget
        if (video.videoWidth > 0 && video.videoHeight > 0) {
          onDimensions?.(video.videoWidth, video.videoHeight, video.duration)
        }
        if (Number.isFinite(video.duration) && video.duration > 0.5) {
          video.currentTime = Math.min(1, video.duration * 0.15)
        }
      }}
      onLoadedData={(event) => {
        const video = event.currentTarget
        if (!video.seeking) video.dataset.previewReady = 'true'
      }}
      onSeeked={(event) => {
        event.currentTarget.dataset.previewReady = 'true'
      }}
      onError={(event) => {
        delete event.currentTarget.dataset.previewReady
      }}
    />
  )
}

function LibraryMediaCard({
  item,
  context,
  onPlay,
  onMetadataSaved,
}: {
  item: LibraryMediaItem
  context: string
  onPlay: (filePath: string) => void
  onMetadataSaved?: (filePath: string, metadata: MediaMetadata) => void
}) {
  const { locale, t } = useI18n()
  const [metadata, setMetadata] = useState<MediaMetadata | null>(null)
  const [metadataEditorOpen, setMetadataEditorOpen] = useState(false)
  const [metadataLoadFailed, setMetadataLoadFailed] = useState(false)
  const [previewDetails, setPreviewDetails] = useState<{
    width: number
    height: number
    duration?: number
  } | null>(null)
  const metadataRequestRef = useRef<Promise<MediaMetadata | null> | null>(null)
  const Icon = mediaIcon(item.type)
  const displayName = metadata?.title || item.name
  const completeMetadata =
    metadata && previewDetails
      ? {
          ...metadata,
          width: previewDetails.width,
          height: previewDetails.height,
          ...(previewDetails.duration && Number.isFinite(previewDetails.duration)
            ? { duration: previewDetails.duration }
            : {}),
        }
      : metadata
  const summary = completeMetadata
    ? summarizeMediaMetadata(item.type, completeMetadata, locale)
    : ''

  const loadMetadata = useCallback((): Promise<MediaMetadata | null> => {
    if (metadata) return Promise.resolve(metadata)
    if (metadataRequestRef.current) return metadataRequestRef.current
    const api = window.tocae
    if (!api) return Promise.resolve(null)

    const request = api
      .getMediaMetadata(item.path)
      .then((loadedMetadata) => {
        setMetadata(loadedMetadata)
        setMetadataLoadFailed(false)
        return loadedMetadata
      })
      .catch((error: unknown) => {
        setMetadataLoadFailed(true)
        console.error(`Could not load metadata for "${item.path}"`, error)
        return null
      })
      .finally(() => {
        metadataRequestRef.current = null
      })
    metadataRequestRef.current = request
    return request
  }, [item.path, metadata])

  const handleEditMetadata = useCallback(async () => {
    const loadedMetadata = await loadMetadata()
    if (loadedMetadata) setMetadataEditorOpen(true)
  }, [loadMetadata])

  return (
    <>
      <div className={styles.mediaCardShell}>
        <button
          type="button"
          className={styles.mediaCard}
          onClick={() => onPlay(item.path)}
          onMouseEnter={() => void loadMetadata()}
          onFocus={() => void loadMetadata()}
          aria-label={t('library.playItem', { name: displayName })}
          aria-description={context}
          title={summary ? `${item.path}\n${summary}` : item.path}
        >
          <span className={styles.artwork}>
            <Icon
              size={34}
              className={item.type === 'audio' ? undefined : styles.artworkFallback}
              aria-hidden="true"
            />
            {item.type === 'image' && (
              <img
                src={toMediaUrl(item.path)}
                alt=""
                loading="lazy"
                onLoad={(event) => {
                  const image = event.currentTarget
                  setPreviewDetails({ width: image.naturalWidth, height: image.naturalHeight })
                }}
                onError={(event) => {
                  event.currentTarget.style.opacity = '0'
                }}
              />
            )}
            {item.type === 'video' && (
              <VideoPreview
                src={toMediaUrl(item.path)}
                onDimensions={(width, height, duration) =>
                  setPreviewDetails({ width, height, duration })
                }
              />
            )}
            {item.type === 'audio' && metadata?.coverArt && (
              <img
                src={metadata.coverArt}
                alt=""
                loading="lazy"
                onError={(event) => {
                  event.currentTarget.style.opacity = '0'
                }}
              />
            )}
            <span className={styles.cardPlay}>
              <Play size={18} fill="currentColor" aria-hidden="true" />
            </span>
          </span>
          <span className={styles.cardTitle}>{displayName}</span>
          <span className={styles.cardContext}>{context}</span>
          {summary && <span className={styles.cardMetadata}>{summary}</span>}
          <span className={styles.mediaType}>{t(MEDIA_TYPE_LABELS[item.type])}</span>
        </button>
        <button
          type="button"
          className={styles.editMetadataButton}
          onClick={() => void handleEditMetadata()}
          onFocus={() => void loadMetadata()}
          aria-label={t('metadata.edit', { name: displayName })}
          title={t('metadata.edit', { name: displayName })}
        >
          <Pencil size={14} aria-hidden="true" />
        </button>
      </div>
      {metadataLoadFailed && (
        <span className={styles.metadataLoadError} role="alert">
          {t('library.loadError')}
        </span>
      )}
      {metadataEditorOpen && metadata && (
        <MetadataEditorDialog
          path={item.path}
          mediaType={item.type}
          metadata={metadata}
          onSaved={(updatedMetadata) => {
            setMetadata(updatedMetadata)
            onMetadataSaved?.(item.path, updatedMetadata)
          }}
          onClose={() => setMetadataEditorOpen(false)}
        />
      )}
    </>
  )
}

type LibraryFilterOption = {
  value: string
  label: string
}

type LibrarySelectProps = {
  label: string
  value: string
  options: LibraryFilterOption[]
  onChange: (value: string) => void
  disabled?: boolean
}

function LibrarySelect({ label, value, options, onChange, disabled = false }: LibrarySelectProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const summaryRef = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)
  const selectedOption = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return

    const close = (restoreFocus = false) => {
      if (detailsRef.current) detailsRef.current.open = false
      setOpen(false)
      if (restoreFocus) summaryRef.current?.focus()
    }
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !detailsRef.current?.contains(event.target)) {
        close()
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(true)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  if (!selectedOption) return null

  return (
    <details
      ref={detailsRef}
      className={styles.folderSelect}
      aria-label={label}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary
        ref={summaryRef}
        className={styles.folderSelectTrigger}
        aria-label={`${label}: ${selectedOption.label}`}
        aria-disabled={disabled}
        onClick={(event) => {
          if (disabled) event.preventDefault()
        }}
      >
        <span className={styles.folderSelectValue}>{selectedOption.label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      {open && !disabled && (
        <div className={styles.folderSelectMenu} role="group" aria-label={label}>
          {options.map((option) => {
            const selected = option.value === value
            return (
              <button
                key={option.value}
                type="button"
                className={`${styles.folderSelectOption} ${selected ? styles.folderSelectOptionSelected : ''}`}
                onClick={() => {
                  onChange(option.value)
                  if (detailsRef.current) detailsRef.current.open = false
                  setOpen(false)
                  summaryRef.current?.focus()
                }}
                aria-pressed={selected}
              >
                <span className={styles.folderSelectOptionText}>{option.label}</span>
                {selected && <Check size={14} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      )}
    </details>
  )
}

function Library({ onPlay, onMetadataSaved }: LibraryProps) {
  const { t } = useI18n()
  const api = window.tocae
  const [snapshot, setSnapshot] = useState<LibrarySnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<MessageKey | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [selectedSubfolder, setSelectedSubfolder] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const refresh = useCallback(
    async (showLoading = false) => {
      if (!api) {
        setError('library.loadError')
        setLoading(false)
        return
      }

      if (showLoading) setLoading(true)
      try {
        setSnapshot(await api.getLibrary())
        setError(null)
      } catch (cause) {
        console.error('Could not load the media library', cause)
        setError('library.loadError')
      } finally {
        if (showLoading) setLoading(false)
      }
    },
    [api],
  )

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!api) {
        setError('library.loadError')
        setLoading(false)
        return
      }
      try {
        const nextSnapshot = await api.getLibrary()
        if (active) {
          setSnapshot(nextSnapshot)
          setError(null)
        }
      } catch (cause) {
        console.error('Could not load the media library', cause)
        if (active) setError('library.loadError')
      } finally {
        if (active) setLoading(false)
      }
    }

    const unsubscribe = api?.onLibraryChanged(() => {
      if (active) void refresh()
    })
    void load()
    return () => {
      active = false
      unsubscribe?.()
    }
  }, [api, refresh])

  const handleAddFolder = useCallback(async () => {
    if (!api) return
    setBusy(true)
    try {
      const previousIds = new Set(snapshot?.folders.map((folder) => folder.id) ?? [])
      const nextSnapshot = await api.addLibraryFolder()
      if (!nextSnapshot) return
      const addedFolder = nextSnapshot.folders.find((folder) => !previousIds.has(folder.id))
      setSnapshot(nextSnapshot)
      if (addedFolder) {
        setSelectedFolderId(addedFolder.id)
        setSelectedSubfolder(null)
      }
      setError(null)
    } catch (cause) {
      console.error('Could not add a media library folder', cause)
      setError('library.updateError')
    } finally {
      setBusy(false)
    }
  }, [api, snapshot?.folders])

  const handleRemoveFolder = useCallback(
    async (folder: LibraryFolder) => {
      if (!api) return
      setBusy(true)
      try {
        setSnapshot(await api.removeLibraryFolder(folder.id))
        setSelectedFolderId((current) => (current === folder.id ? null : current))
        setSelectedSubfolder(null)
        setError(null)
      } catch (cause) {
        console.error('Could not remove a media library folder', cause)
        setError('library.updateError')
      } finally {
        setBusy(false)
      }
    },
    [api],
  )

  const counts = useMemo(() => {
    const values = new Map<string, number>()
    for (const item of snapshot?.items ?? []) {
      values.set(item.folderId, (values.get(item.folderId) ?? 0) + 1)
    }
    return values
  }, [snapshot?.items])

  const subfolders = useMemo(() => {
    if (!snapshot || !selectedFolderId) return []
    const directories = new Set<string>()
    for (const item of snapshot.items) {
      if (item.folderId !== selectedFolderId) continue
      const parts = item.relativePath.split('/').slice(0, -1)
      for (let depth = 1; depth <= parts.length; depth += 1) {
        directories.add(parts.slice(0, depth).join('/'))
      }
    }
    return [...directories].sort((left, right) =>
      left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }),
    )
  }, [selectedFolderId, snapshot?.items])

  useEffect(() => {
    if (selectedSubfolder && !subfolders.includes(selectedSubfolder)) {
      setSelectedSubfolder(null)
    }
  }, [selectedSubfolder, subfolders])

  const visibleItems = useMemo(() => {
    if (!snapshot) return []
    const query = search.trim().toLocaleLowerCase()
    return snapshot.items
      .filter((item) => {
        if (selectedFolderId && item.folderId !== selectedFolderId) return false
        if (selectedSubfolder) {
          const itemDirectory = item.relativePath.split('/').slice(0, -1).join('/')
          if (
            itemDirectory !== selectedSubfolder &&
            !itemDirectory.startsWith(`${selectedSubfolder}/`)
          ) {
            return false
          }
        }
        if (mediaFilter !== 'all' && item.type !== mediaFilter) return false
        if (!query) return true

        const folder = snapshot.folders.find((entry) => entry.id === item.folderId)
        const folderLabel = folder ? folderName(folder, t) : ''
        return `${item.name} ${item.relativePath} ${folderLabel}`
          .toLocaleLowerCase()
          .includes(query)
      })
      .sort(
        (left, right) =>
          left.name.localeCompare(right.name, undefined, {
            numeric: true,
            sensitivity: 'base',
          }) * (sortOrder === 'asc' ? 1 : -1),
      )
  }, [mediaFilter, search, selectedFolderId, selectedSubfolder, snapshot, sortOrder, t])

  const filters: { value: MediaFilter; label: MessageKey }[] = [
    { value: 'all', label: 'library.typeAll' },
    { value: 'video', label: 'library.typeVideo' },
    { value: 'image', label: 'library.typeImage' },
    { value: 'audio', label: 'library.typeAudio' },
  ]

  const mediaGroups = useMemo(() => {
    const groups = new Map<string, typeof visibleItems>()
    for (const item of visibleItems) {
      const letter = item.name.trim().charAt(0).toLocaleUpperCase() || '#'
      const group = groups.get(letter) ?? []
      group.push(item)
      groups.set(letter, group)
    }
    return [...groups.entries()].sort(([left], [right]) =>
      left.localeCompare(right, undefined, { numeric: true, sensitivity: 'base' }) *
        (sortOrder === 'asc' ? 1 : -1),
    )
  }, [sortOrder, visibleItems])

  return (
    <section className={styles.page} aria-labelledby="library-title">
      <header className={styles.pageHeader}>
        <div className={styles.heading}>
          <h1 id="library-title" className={styles.title}>
            {t('library.title')}
          </h1>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => void refresh(true)}
            disabled={loading || busy}
            aria-label={t('library.refresh')}
            title={t('library.refresh')}
          >
            <RefreshCw size={15} className={loading ? styles.spinning : ''} />
          </button>
          <button
            type="button"
            className={styles.addButton}
            onClick={() => void handleAddFolder()}
            disabled={busy}
          >
            <FolderPlus size={15} aria-hidden="true" />
            {t('library.addFolder')}
          </button>
        </div>
      </header>

      <div className={styles.toolbar}>
        <nav className={styles.filters} aria-label={t('library.filterType')}>
          {filters.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={`${styles.filterButton} ${mediaFilter === value ? styles.filterActive : ''}`}
              onClick={() => setMediaFilter(value)}
              aria-pressed={mediaFilter === value}
            >
              {t(label)}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {t(error)}
        </p>
      )}
      {snapshot && snapshot.unavailableFolderIds.length > 0 && (
        <p className={styles.warning} role="status">
          {t('library.scanWarning')}
        </p>
      )}

      <div className={styles.libraryControls}>
        <label className={styles.searchBox}>
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('library.searchPlaceholder')}
            aria-label={t('library.search')}
          />
        </label>
        <div className={styles.folderSelectLabel}>
          <span>{t('library.locationFilter')}</span>
          <LibrarySelect
            label={t('library.locationFilter')}
            value={selectedFolderId ?? ''}
            options={[
              { value: '', label: t('library.allFolders') },
              ...(snapshot?.folders.map((folder) => ({
                value: folder.id,
                label: `${folderName(folder, t)} ${folder.path}`,
              })) ?? []),
            ]}
            onChange={(value) => {
              setSelectedFolderId(value || null)
              setSelectedSubfolder(null)
            }}
          />
        </div>
        {selectedFolderId && (
          <div className={styles.folderSelectLabel}>
            <span>{t('library.subfolderFilter')}</span>
            <LibrarySelect
              label={t('library.subfolderFilter')}
              value={selectedSubfolder ?? ''}
              onChange={(value) => setSelectedSubfolder(value || null)}
              options={[
                { value: '', label: t('library.allSubfolders') },
                ...subfolders.map((subfolder) => {
                  const parts = subfolder.split('/')
                  return {
                    value: subfolder,
                    label: `${'\u00a0'.repeat(parts.length - 1)}${parts[parts.length - 1]}`,
                  }
                }),
              ]}
              disabled={subfolders.length === 0}
            />
          </div>
        )}
        <details className={styles.locations} aria-label={t('library.folders')}>
          <summary>
            <FolderOpen size={14} aria-hidden="true" />
            {t('library.manageLocations', { count: snapshot?.folders.length ?? 0 })}
          </summary>
          <ul className={styles.locationList}>
            {snapshot?.folders.map((folder) => (
              <li key={folder.id}>
                <span className={styles.locationCopy}>
                  <strong>{folderName(folder, t)}</strong>
                  <small title={folder.path}>{folder.path}</small>
                </span>
                <span className={styles.locationCount}>{counts.get(folder.id) ?? 0}</span>
                <button
                  type="button"
                  className={styles.removeFolder}
                  onClick={() => void handleRemoveFolder(folder)}
                  disabled={busy}
                  aria-label={t('library.removeFolder', { name: folderName(folder, t) })}
                  title={t('library.removeFolder', { name: folderName(folder, t) })}
                >
                  <Trash2 size={13} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </details>
      </div>

      <div className={styles.resultsHeader}>
        <h2>
          {t(
            visibleItems.length === 1 ? 'library.itemCountOne' : 'library.itemCount',
            { count: visibleItems.length },
          )}
        </h2>
        <button
          type="button"
          className={styles.sortButton}
          onClick={() => setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'))}
          aria-label={t(sortOrder === 'asc' ? 'library.sortAZ' : 'library.sortZA')}
          title={t(sortOrder === 'asc' ? 'library.sortAZ' : 'library.sortZA')}
        >
          <ArrowDownAZ
            size={13}
            className={sortOrder === 'desc' ? styles.sortDescending : ''}
            aria-hidden="true"
          />
          {t(sortOrder === 'asc' ? 'library.sortAZ' : 'library.sortZA')}
        </button>
        {selectedFolderId === null && snapshot?.folders.length === 0 && (
          <span className={styles.noLocations}>{t('library.noFolders')}</span>
        )}
      </div>

      {loading && !snapshot ? (
        <div className={styles.status} role="status">
          <LoaderCircle size={20} className={styles.spinning} />
          {t('library.loading')}
        </div>
      ) : !snapshot?.folders.length ? (
        <div className={styles.status}>
          <FolderOpen size={24} aria-hidden="true" />
          <span>{t('library.noFolders')}</span>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className={styles.status}>
          <FolderOpen size={24} aria-hidden="true" />
          <span>{t('library.empty')}</span>
        </div>
      ) : (
        <div className={styles.mediaGroups} aria-label={t('library.mediaResults')}>
          {mediaGroups.map(([letter, group]) => (
            <section
              className={styles.mediaGroup}
              key={letter}
              aria-labelledby={`library-group-${letter}`}
            >
              <h2 className={styles.groupLetter} id={`library-group-${letter}`}>
                {letter}
              </h2>
              <ul className={styles.mediaGrid}>
                {group.map((item) => {
                  const folder = snapshot.folders.find((entry) => entry.id === item.folderId)
                  const parentDirectory = item.relativePath.split('/').slice(0, -1).join('/')
                  const context = [folder ? folderName(folder, t) : '', parentDirectory]
                    .filter(Boolean)
                    .join(' / ')

                  return (
                    <li key={item.path}>
                      <LibraryMediaCard
                        item={item}
                        context={context}
                        onPlay={onPlay}
                        onMetadataSaved={onMetadataSaved}
                      />
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}

export default Library
