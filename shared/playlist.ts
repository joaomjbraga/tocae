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
