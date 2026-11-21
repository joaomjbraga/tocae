import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PersistedPlaylist, PlaylistItem } from '@shared/playlist'
import {
  mergePersistedPlaylist,
  movePlaylistItem,
  removePlaylistItem,
} from '@shared/playlistState'
import type { MessageKey } from '@shared/i18n'
import { baseNameFor } from '../../lib/format'
import { isMediaFile, toMediaUrl } from '../../lib/media'

// O erro é guardado como chave de tradução, não como texto pronto: assim o
// idioma pode mudar sem que a mensagem exibida fique desatualizada.
const UNRESOLVED_ERROR: MessageKey = 'error.unresolved'
const PLAYBACK_ERROR: MessageKey = 'error.playback'

interface PlaylistState {
  items: PlaylistItem[]
  currentIndex: number
  directItem: PlaylistItem | null
  error: MessageKey | null
  loaded: boolean
  /** Ids duplicados recém-detectados, para o realce temporário das linhas. */
  pulseIds: string[]
}

/** O que "Limpar lista" remove, guardado para permitir o desfazer. */
export type PlaylistSnapshot = PersistedPlaylist

const INITIAL_STATE: PlaylistState = {
  items: [],
  currentIndex: -1,
  directItem: null,
  error: null,
  loaded: false,
  pulseIds: [],
}

/** Quanto tempo a linha duplicada fica realçada, em ms. */
const PULSE_MS = 1400
/** Teto de linhas realçadas ao mesmo tempo, para não virar um pisca-pisca. */
const PULSE_LIMIT = 8

function createEntry(filePath: string, fallbackName: string): PlaylistItem {
  return {
    id: crypto.randomUUID(),
    path: filePath,
    name: filePath ? baseNameFor(filePath) : fallbackName,
  }
}

export function usePlaylist() {
  const [state, setState] = useState<PlaylistState>(INITIAL_STATE)
  // Espelho sempre atual do estado: clear() precisa devolver os itens removidos
  // de forma síncrona, e setState não oferece esse retorno.
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    if (state.pulseIds.length === 0) return
    const timer = window.setTimeout(() => {
      setState((prev) => (prev.pulseIds.length === 0 ? prev : { ...prev, pulseIds: [] }))
    }, PULSE_MS)
    return () => window.clearTimeout(timer)
  }, [state.pulseIds])

  useEffect(() => {
    let active = true
    const api = window.tocae
    if (!api) {
      setState((prev) => ({ ...prev, loaded: true }))
      return
    }

    api
      .readPlaylist()
      .then(({ items, currentIndex }) => {
        if (active) {
          setState((prev) => ({
            ...prev,
            ...mergePersistedPlaylist({ items, currentIndex }, prev),
            loaded: true,
          }))
        }
      })
      .catch((error: unknown) => {
        console.error('Could not load the saved playlist', error)
        if (active) setState((prev) => ({ ...prev, loaded: true }))
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!state.loaded) return
    const api = window.tocae
    if (!api) return
    void api
      .writePlaylist(state.items, state.currentIndex)
      .catch((error: unknown) => console.error('Could not save the playlist', error))
  }, [state.items, state.currentIndex, state.loaded])

  const addEntries = useCallback((entries: PlaylistItem[], activatePath?: string) => {
    if (entries.length === 0) return

    setState((prev) => {
      const known = new Map(prev.items.map((item) => [item.path, item.id]))
      const fresh: PlaylistItem[] = []
      const duplicates: string[] = []
      for (const entry of entries) {
        const existingId = known.get(entry.path)
        if (existingId) {
          // Já está na lista: realça a linha existente em vez de ignorar em silêncio.
          duplicates.push(existingId)
          continue
        }
        known.set(entry.path, entry.id)
        fresh.push(entry)
      }
      if (fresh.length === 0 && duplicates.length === 0) return prev

      const pulseIds = [...new Set([...prev.pulseIds, ...duplicates])].slice(-PULSE_LIMIT)
      const items = fresh.length > 0 ? [...prev.items, ...fresh] : prev.items
      const activatedIndex = activatePath
        ? items.findIndex((item) => item.path === activatePath)
        : -1

      return {
        ...prev,
        items,
        currentIndex:
          activatedIndex >= 0
            ? activatedIndex
            : fresh.length === 0
              ? prev.currentIndex
              : prev.currentIndex === -1
                ? prev.items.length
                : prev.currentIndex,
        directItem: activatedIndex >= 0 ? null : prev.directItem,
        error: fresh.length > 0 || activatedIndex >= 0 ? null : prev.error,
        pulseIds,
      }
    })
  }, [])

  const addPaths = useCallback(
    (paths: string[]) => {
      addEntries(
        paths
          .filter((filePath) => filePath.length > 0)
          .map((filePath) => createEntry(filePath, filePath)),
      )
    },
    [addEntries],
  )

  const openPaths = useCallback(
    (paths: string[]) => {
      const entries = paths
        .filter((filePath) => filePath.length > 0)
        .map((filePath) => createEntry(filePath, filePath))
      addEntries(entries, entries[0]?.path)
    },
    [addEntries],
  )

  const playDirect = useCallback((filePath: string) => {
    if (!filePath) return
    setState((prev) => ({
      ...prev,
      directItem: createEntry(filePath, filePath),
      error: null,
    }))
  }, [])

  const addFiles = useCallback(
    (files: File[]) => {
      const api = window.tocae
      const entries: PlaylistItem[] = []
      let unresolved = 0

      for (const file of files) {
        if (!isMediaFile(file)) {
          unresolved += 1
          continue
        }
        const filePath = api ? api.getPathForFile(file) : ''
        if (!filePath) {
          unresolved += 1
          continue
        }
        entries.push(createEntry(filePath, file.name))
      }

      if (entries.length === 0) {
        if (unresolved > 0) setState((prev) => ({ ...prev, error: UNRESOLVED_ERROR }))
        return
      }

      addEntries(entries)
    },
    [addEntries],
  )

  const playIndex = useCallback((index: number) => {
    setState((prev) =>
      index >= 0 && index < prev.items.length
        ? { ...prev, currentIndex: index, directItem: null, error: null }
        : prev,
    )
  }, [])

  const step = useCallback((delta: number) => {
    setState((prev) => {
      if (prev.directItem) return prev
      const target = prev.currentIndex + delta
      if (target < 0 || target >= prev.items.length) return prev
      return { ...prev, currentIndex: target, error: null }
    })
  }, [])

  const next = useCallback(() => step(1), [step])
  const previous = useCallback(() => step(-1), [step])

  const failCurrent = useCallback(() => {
    setState((prev) => {
      if (prev.directItem) return { ...prev, error: PLAYBACK_ERROR }
      const hasNextItem = prev.currentIndex >= 0 && prev.currentIndex + 1 < prev.items.length
      if (hasNextItem) return { ...prev, currentIndex: prev.currentIndex + 1 }
      return { ...prev, currentIndex: -1, error: PLAYBACK_ERROR }
    })
  }, [])

  const move = useCallback((from: number, to: number) => {
    setState((prev) => {
      const next = movePlaylistItem(prev, from, to)
      return next === prev ? prev : { ...prev, ...next }
    })
  }, [])

  const remove = useCallback((id: string) => {
    setState((prev) => {
      const next = removePlaylistItem(prev, id)
      return next ? { ...prev, ...next, error: null } : prev
    })
  }, [])

  /** Limpa a lista devolvendo o que foi removido, ou null se já estava vazia. */
  const clear = useCallback((): PlaylistSnapshot | null => {
    const prev = stateRef.current
    if (prev.items.length === 0) return null

    const snapshot: PlaylistSnapshot = { items: prev.items, currentIndex: prev.currentIndex }
    setState((s) =>
      s.items.length === 0 && s.currentIndex === -1
        ? s
        : { ...s, items: [], currentIndex: -1, error: null, pulseIds: [] },
    )
    return snapshot
  }, [])

  const restore = useCallback((snapshot: PlaylistSnapshot) => {
    setState((prev) => {
      const items = [...snapshot.items]
      const currentIndex =
        snapshot.currentIndex >= 0 && snapshot.currentIndex < items.length ? snapshot.currentIndex : -1
      return { ...prev, items, currentIndex, error: null, pulseIds: [] }
    })
  }, [])

  const pulseIds = useMemo(() => new Set(state.pulseIds), [state.pulseIds])

  return useMemo(
    () => ({
      items: state.items,
      pulseIds,
      current:
        state.directItem ??
        (state.currentIndex >= 0 ? (state.items[state.currentIndex] ?? null) : null),
      currentIndex: state.directItem ? -1 : state.currentIndex,
      source:
        state.directItem
          ? toMediaUrl(state.directItem.path)
          : state.currentIndex >= 0 && state.items[state.currentIndex]
            ? toMediaUrl(state.items[state.currentIndex].path)
            : null,
      error: state.error,
      loaded: state.loaded,
      hasNext:
        !state.directItem && state.currentIndex >= 0 && state.currentIndex + 1 < state.items.length,
      hasPrevious: !state.directItem && state.currentIndex > 0,
      addPaths,
      addEntries,
      openPaths,
      playDirect,
      addFiles,
      playIndex,
      next,
      previous,
      move,
      remove,
      clear,
      restore,
      failCurrent,
    }),
    [
      state.items,
      pulseIds,
      state.currentIndex,
      state.directItem,
      state.error,
      state.loaded,
      addPaths,
      addEntries,
      openPaths,
      playDirect,
      addFiles,
      playIndex,
      next,
      previous,
      move,
      remove,
      clear,
      restore,
      failCurrent,
    ],
  )
}
