import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'
import type {
  MediaMetadata,
  MediaMetadataUpdate,
  MediaType,
} from '@shared/media'
import { useI18n } from '../../i18n'
import styles from './Library.module.css'

type MetadataEditorDialogProps = {
  path: string
  mediaType: MediaType
  metadata: MediaMetadata
  onSaved: (metadata: MediaMetadata) => void
  onClose: () => void
}

type MetadataDraft = {
  title: string
  artist: string
  album: string
  year: string
  genre: string
  description: string
  date: string
}

function dateInputValue(timestamp?: number): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function draftFromMetadata(metadata: MediaMetadata): MetadataDraft {
  return {
    title: metadata.title ?? '',
    artist: metadata.artist ?? '',
    album: metadata.album ?? '',
    year: metadata.year ? String(metadata.year) : '',
    genre: metadata.genres?.join(', ') ?? '',
    description: metadata.description ?? '',
    date: dateInputValue(metadata.capturedAt),
  }
}

function dateTimestamp(value: string): number | null {
  if (!value) return null
  const timestamp = new Date(`${value}T12:00:00`).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function MetadataEditorDialog({
  path,
  mediaType,
  metadata,
  onSaved,
  onClose,
}: MetadataEditorDialogProps) {
  const { t } = useI18n()
  const titleRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const [draft, setDraft] = useState(() => draftFromMetadata(metadata))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    titleRef.current?.focus()
  }, [])

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    event.stopPropagation()
    if (event.key === 'Escape' && !saving) {
      event.preventDefault()
      onClose()
      return
    }

    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled)',
    )
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    setWarnings([])

    try {
      const api = window.tocae
      if (!api) throw new Error('The metadata editing service is unavailable.')

      const updates: MediaMetadataUpdate =
        mediaType === 'audio'
          ? {
              mediaType,
              title: draft.title,
              artist: draft.artist,
              album: draft.album,
              year: draft.year.trim() ? Number(draft.year) : null,
              genre: draft.genre,
            }
          : {
              mediaType,
              title: draft.title,
              description: draft.description,
              capturedAt: dateTimestamp(draft.date),
            }

      const result = await api.updateMediaMetadata(path, updates)
      onSaved(result.metadata)
      if (result.warnings.length > 0) {
        setWarnings(result.warnings)
        setDraft(draftFromMetadata(result.metadata))
      } else {
        onClose()
      }
    } catch (saveError) {
      const detail = saveError instanceof Error ? saveError.message : String(saveError)
      setError(detail)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={styles.metadataOverlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose()
      }}
    >
      <section
        ref={dialogRef}
        className={styles.metadataDialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="metadata-dialog-title"
        onKeyDown={handleKeyDown}
      >
        <header className={styles.metadataDialogHeader}>
          <div className={styles.metadataDialogHeading}>
            <h2 id="metadata-dialog-title">{t('metadata.editTitle')}</h2>
            <p title={path}>{path}</p>
          </div>
          <button
            type="button"
            className={styles.metadataClose}
            onClick={onClose}
            disabled={saving}
            aria-label={t('metadata.cancel')}
          >
            <X size={17} aria-hidden="true" />
          </button>
        </header>

        <form className={styles.metadataForm} onSubmit={(event) => void handleSubmit(event)}>
          <label className={styles.metadataField}>
            <span>{t('metadata.title')}</span>
            <input
              ref={titleRef}
              type="text"
              maxLength={512}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </label>

          {mediaType === 'audio' ? (
            <>
              <label className={styles.metadataField}>
                <span>{t('metadata.artist')}</span>
                <input
                  type="text"
                  maxLength={512}
                  value={draft.artist}
                  onChange={(event) => setDraft({ ...draft, artist: event.target.value })}
                />
              </label>
              <label className={styles.metadataField}>
                <span>{t('metadata.album')}</span>
                <input
                  type="text"
                  maxLength={512}
                  value={draft.album}
                  onChange={(event) => setDraft({ ...draft, album: event.target.value })}
                />
              </label>
              <div className={styles.metadataFieldRow}>
                <label className={styles.metadataField}>
                  <span>{t('metadata.year')}</span>
                  <input
                    type="number"
                    min={1000}
                    max={9999}
                    step={1}
                    value={draft.year}
                    onChange={(event) => setDraft({ ...draft, year: event.target.value })}
                  />
                </label>
                <label className={styles.metadataField}>
                  <span>{t('metadata.genre')}</span>
                  <input
                    type="text"
                    maxLength={256}
                    value={draft.genre}
                    onChange={(event) => setDraft({ ...draft, genre: event.target.value })}
                  />
                </label>
              </div>
            </>
          ) : (
            <>
              <label className={styles.metadataField}>
                <span>{t('metadata.description')}</span>
                <textarea
                  rows={3}
                  maxLength={4096}
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                />
              </label>
              <label className={styles.metadataField}>
                <span>{t('metadata.date')}</span>
                <input
                  type="date"
                  value={draft.date}
                  onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                />
              </label>
            </>
          )}

          <p className={styles.metadataNote}>{t('metadata.formatNote')}</p>
          <p className={styles.metadataNote}>{t('metadata.backupNote')}</p>
          {error && (
            <p className={styles.metadataError} role="alert">
              {t('metadata.saveError')} {error}
            </p>
          )}
          {warnings.length > 0 && (
            <div className={styles.metadataWarning} role="status">
              <strong>{t('metadata.saveWarning')}</strong>
              <ul>
                {warnings.map((warning, index) => (
                  <li key={`${warning}-${index}`}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          <footer className={styles.metadataActions}>
            <button type="button" className={styles.metadataCancel} onClick={onClose} disabled={saving}>
              {t('metadata.cancel')}
            </button>
            <button type="submit" className={styles.metadataSave} disabled={saving}>
              {t(saving ? 'metadata.saving' : 'metadata.save')}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}

export default MetadataEditorDialog
