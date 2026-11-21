import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowDown, ArrowUp, Check, ListPlus, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { PlaylistItem, SavedPlaylist } from '@shared/playlist'
import {
  MAX_SAVED_PLAYLIST_ITEM_COUNT,
  MAX_SAVED_PLAYLIST_NAME_LENGTH,
} from '@shared/playlist'
import type { MessageKey } from '@shared/i18n'
import { useI18n } from '../../i18n'
import styles from './SavedPlaylistsView.module.css'

interface SavedPlaylistsViewProps {
  queueItems: PlaylistItem[]
  onAddToQueue: (items: PlaylistItem[]) => void
  onAnnounce: (key: MessageKey) => void
  active: boolean
}

function SavedPlaylistsView({
  queueItems,
  onAddToQueue,
  onAnnounce,
  active,
}: SavedPlaylistsViewProps) {
  const { t } = useI18n()
  const [playlists, setPlaylists] = useState<SavedPlaylist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<MessageKey | null>(null)
  const [name, setName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingItems, setEditingItems] = useState<PlaylistItem[]>([])
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!active) return
    let requestActive = true
    setLoading(true)
    void window.tocae.savedPlaylists
      .list()
      .then((saved) => {
        if (requestActive) {
          setPlaylists(saved)
          setError(null)
        }
      })
      .catch((reason: unknown) => {
        console.error('Could not load saved playlists', reason)
        if (requestActive) setError('playlist.savedLoadError')
      })
      .finally(() => {
        if (requestActive) setLoading(false)
      })
    return () => {
      requestActive = false
    }
  }, [active])

  async function createFromQueue(event: FormEvent) {
    event.preventDefault()
    const title = name.trim()
    if (!title || queueItems.length === 0 || busy) return
    setError(null)
    setBusy(true)
    try {
      const saved = await window.tocae.savedPlaylists.create(title, queueItems)
      setPlaylists((current) => [saved, ...current])
      setName('')
      onAnnounce('playlist.savedCreated')
    } catch (reason) {
      console.error('Could not save the current queue', reason)
      setError('playlist.savedOperationError')
    } finally {
      setBusy(false)
    }
  }

  function startEditing(playlist: SavedPlaylist) {
    setEditingId(playlist.id)
    setEditingName(playlist.name)
    setEditingItems(playlist.items.map((item) => ({ ...item })))
    setConfirmDeleteId(null)
    setError(null)
  }

  function cancelEditing() {
    setEditingId(null)
    setEditingName('')
    setEditingItems([])
  }

  async function saveEdits(event: FormEvent) {
    event.preventDefault()
    const current = playlists.find((playlist) => playlist.id === editingId)
    if (!current || !editingName.trim() || busy) return
    setError(null)
    setBusy(true)
    try {
      const updated = await window.tocae.savedPlaylists.update({
        ...current,
        name: editingName.trim(),
        items: editingItems,
      })
      setPlaylists((saved) => saved.map((playlist) => (
        playlist.id === updated.id ? updated : playlist
      )))
      cancelEditing()
      onAnnounce('playlist.savedUpdated')
    } catch (reason) {
      console.error('Could not update a saved playlist', reason)
      setError('playlist.savedOperationError')
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete(playlist: SavedPlaylist) {
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const deleted = await window.tocae.savedPlaylists.delete(playlist.id)
      if (!deleted) {
        setError('playlist.savedOperationError')
        return
      }
      setPlaylists((saved) => saved.filter((item) => item.id !== playlist.id))
      if (editingId === playlist.id) cancelEditing()
      setConfirmDeleteId(null)
      onAnnounce('playlist.savedDeleted')
    } catch (reason) {
      console.error('Could not delete a saved playlist', reason)
      setError('playlist.savedOperationError')
    } finally {
      setBusy(false)
    }
  }

  function moveItem(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= editingItems.length) return
    setEditingItems((current) => {
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }

  function addQueueToEditing() {
    const knownPaths = new Set(editingItems.map((item) => item.path))
    const additions = queueItems.filter((item) => {
      if (knownPaths.has(item.path)) return false
      knownPaths.add(item.path)
      return true
    })
    if (editingItems.length + additions.length > MAX_SAVED_PLAYLIST_ITEM_COUNT) {
      setError('playlist.savedOperationError')
      return
    }
    setEditingItems((current) => [...current, ...additions])
    setError(null)
  }

  if (editingId) {
    return (
      <form className={styles.editor} onSubmit={(event) => void saveEdits(event)}>
        <label className={styles.nameField}>
          <span>{t('playlist.savedNameLabel')}</span>
          <input
            value={editingName}
            maxLength={MAX_SAVED_PLAYLIST_NAME_LENGTH}
            disabled={busy}
            onChange={(event) => setEditingName(event.target.value)}
          />
        </label>
        <button
          type="button"
          className={styles.secondaryAction}
          onClick={addQueueToEditing}
          disabled={queueItems.length === 0 || busy}
        >
          <ListPlus size={14} aria-hidden="true" />
          {t('playlist.savedAddQueueItems')}
        </button>
        <ol className={styles.editItems}>
          {editingItems.map((item, index) => (
            <li className={styles.editItem} key={`${item.id}-${index}`}>
              <span className={styles.editItemName} title={item.name}>{item.name}</span>
              <div className={styles.itemActions}>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => moveItem(index, -1)}
                  disabled={index === 0 || busy}
                  aria-label={t('playlist.savedMoveUp', { name: item.name })}
                >
                  <ArrowUp size={13} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => moveItem(index, 1)}
                  disabled={index === editingItems.length - 1 || busy}
                  aria-label={t('playlist.savedMoveDown', { name: item.name })}
                >
                  <ArrowDown size={13} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.danger}`}
                  onClick={() => setEditingItems((current) =>
                    current.filter((entry) => entry.id !== item.id),
                  )}
                  disabled={busy}
                  aria-label={t('playlist.savedRemoveItem', { name: item.name })}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ol>
        <div className={styles.editorActions}>
          <button
            type="submit"
            className={styles.primaryAction}
            disabled={!editingName.trim() || busy}
          >
            <Check size={14} aria-hidden="true" />
            {t('playlist.savedUpdate')}
          </button>
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={cancelEditing}
            disabled={busy}
          >
            {t('playlist.savedCancel')}
          </button>
        </div>
        {error && <p className={styles.error} role="alert">{t(error)}</p>}
      </form>
    )
  }

  return (
    <div className={styles.savedView}>
      <form className={styles.createForm} onSubmit={(event) => void createFromQueue(event)}>
        <label className={styles.nameField}>
          <span>{t('playlist.savedNameLabel')}</span>
          <input
            value={name}
            maxLength={MAX_SAVED_PLAYLIST_NAME_LENGTH}
            placeholder={t('playlist.savedNamePlaceholder')}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          type="submit"
          className={styles.primaryAction}
          disabled={!name.trim() || queueItems.length === 0 || loading || busy}
        >
          <Plus size={14} aria-hidden="true" />
          {t('playlist.savedCreate')}
        </button>
      </form>
      {error && <p className={styles.error} role="alert">{t(error)}</p>}
      {loading ? (
        <p className={styles.notice} aria-busy="true">{t('playlist.loading')}</p>
      ) : playlists.length === 0 ? (
        <p className={styles.notice}>{t('playlist.savedEmpty')}</p>
      ) : (
        <ul className={styles.savedList}>
          {playlists.map((playlist) => (
            <li className={styles.savedRow} key={playlist.id}>
              <div className={styles.savedInfo}>
                <strong title={playlist.name}>{playlist.name}</strong>
                <span>{t('playlist.savedCount', { count: playlist.items.length })}</span>
              </div>
              {confirmDeleteId === playlist.id ? (
                <div className={styles.deletePrompt}>
                  <span>{t('playlist.savedDeletePrompt', { name: playlist.name })}</span>
                  <button
                    type="button"
                    className={`${styles.iconButton} ${styles.danger}`}
                    onClick={() => void confirmDelete(playlist)}
                    disabled={busy}
                    aria-label={t('playlist.savedDeleteConfirm')}
                  >
                    <Check size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => setConfirmDeleteId(null)}
                    disabled={busy}
                    aria-label={t('playlist.savedCancel')}
                  >
                    <X size={13} aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className={styles.savedActions}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => {
                      onAddToQueue(playlist.items)
                      onAnnounce('playlist.savedAddedToQueue')
                    }}
                    disabled={playlist.items.length === 0 || busy}
                    aria-label={t('playlist.savedAddToQueue', { name: playlist.name })}
                  >
                    <ListPlus size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => startEditing(playlist)}
                    disabled={busy}
                    aria-label={t('playlist.savedEdit', { name: playlist.name })}
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={`${styles.iconButton} ${styles.danger}`}
                    onClick={() => setConfirmDeleteId(playlist.id)}
                    disabled={busy}
                    aria-label={t('playlist.savedDelete', { name: playlist.name })}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default SavedPlaylistsView
