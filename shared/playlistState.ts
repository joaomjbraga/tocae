import type { PlaylistItem } from './playlist'

export interface PlaylistListState {
  items: PlaylistItem[]
  currentIndex: number
}

export function mergePersistedPlaylist(
  persisted: PlaylistListState,
  pending: PlaylistListState,
): PlaylistListState {
  if (pending.items.length === 0) return persisted

  const knownPaths = new Set(persisted.items.map((item) => item.path))
  const items = [...persisted.items]
  for (const item of pending.items) {
    if (knownPaths.has(item.path)) continue
    knownPaths.add(item.path)
    items.push(item)
  }
  const pendingCurrentPath = pending.items[pending.currentIndex]?.path
  const pendingCurrentIndex = pendingCurrentPath
    ? items.findIndex((item) => item.path === pendingCurrentPath)
    : -1

  return {
    items,
    currentIndex: pendingCurrentIndex >= 0 ? pendingCurrentIndex : persisted.currentIndex,
  }
}

export function movePlaylistItem(
  state: PlaylistListState,
  from: number,
  to: number,
): PlaylistListState {
  if (
    from === to ||
    from < 0 ||
    from >= state.items.length ||
    to < 0 ||
    to >= state.items.length
  ) {
    return state
  }

  const currentId = state.items[state.currentIndex]?.id
  const items = [...state.items]
  const [moved] = items.splice(from, 1)
  items.splice(to, 0, moved)

  return {
    items,
    currentIndex: currentId ? items.findIndex((item) => item.id === currentId) : -1,
  }
}

export function removePlaylistItem(
  state: PlaylistListState,
  id: string,
): PlaylistListState | null {
  const index = state.items.findIndex((item) => item.id === id)
  if (index === -1) return null

  const items = state.items.filter((item) => item.id !== id)
  if (items.length === 0) return { items, currentIndex: -1 }

  let currentIndex = state.currentIndex
  if (index < state.currentIndex) currentIndex -= 1
  else if (index === state.currentIndex) currentIndex = Math.min(state.currentIndex, items.length - 1)

  return { items, currentIndex }
}
