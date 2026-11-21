export interface PlaylistItem {
  id: string
  path: string
  name: string
}

/** Estado da playlist persistido em `playlist.json`. */
export interface PersistedPlaylist {
  items: PlaylistItem[]
  /** `-1` quando nenhum item está selecionado. */
  currentIndex: number
}

export interface SavedPlaylist {
  id: string
  name: string
  items: PlaylistItem[]
  createdAt: number
  updatedAt: number
}

export const MAX_SAVED_PLAYLIST_NAME_LENGTH = 80
export const MAX_SAVED_PLAYLIST_ITEM_COUNT = 1000
