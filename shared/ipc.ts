import type { Locale } from './i18n'
import type { LibrarySnapshot } from './library'
import type { MediaMetadata } from './media'
import type { MediaTrack } from './mediaTracks'
import type { PersistedPlaylist, PlaylistItem } from './playlist'

export const IPC_CHANNELS = {
  COMMAND: 'app:command',
  PLAYLIST_READ: 'playlist:read',
  PLAYLIST_WRITE: 'playlist:write',
  MEDIA_PICK: 'media:pick',
  MEDIA_FOLDER_PICK: 'media-folder:pick',
  MEDIA_METADATA_GET: 'media:metadata:get',
  MEDIA_SHOW_IN_FOLDER: 'media:show-in-folder',
  MEDIA_TRACKS_GET: 'media:tracks:get',
  MEDIA_TRACK_AUDIO_CREATE: 'media:track-audio:create',
  MEDIA_MOV_PLAYBACK_CREATE: 'media:mov-playback:create',
  MEDIA_TRACK_SUBTITLE_EXTRACT: 'media:track-subtitle:extract',
  MEDIA_TRACK_OUTPUT_RELEASE: 'media:track-output:release',
  YOUTUBE_MUSIC_OPEN: 'youtube-music:open',
  YOUTUBE_MUSIC_CLOSE: 'youtube-music:close',
  YOUTUBE_MUSIC_STOP: 'youtube-music:stop',
  YOUTUBE_MUSIC_SET_LOCAL_PLAYBACK: 'youtube-music:set-local-playback',
  YOUTUBE_MUSIC_SET_BOUNDS: 'youtube-music:set-bounds',
  YOUTUBE_MUSIC_RELOAD: 'youtube-music:reload',
  YOUTUBE_MUSIC_GO_BACK: 'youtube-music:go-back',
  YOUTUBE_MUSIC_GO_FORWARD: 'youtube-music:go-forward',
  YOUTUBE_MUSIC_GET_STATUS: 'youtube-music:get-status',
  YOUTUBE_MUSIC_STATUS: 'youtube-music:status',
  LIBRARY_GET: 'library:get',
  LIBRARY_ADD_FOLDER: 'library:add-folder',
  LIBRARY_REMOVE_FOLDER: 'library:remove-folder',
  LIBRARY_CHANGED: 'library:changed',
  DEFAULT_PLAYER_STATUS: 'default-player:status',
  DEFAULT_PLAYER_SET: 'default-player:set',
  RELEASES_OPEN: 'releases:open',
  RENDERER_READY: 'renderer:ready',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggle-maximize',
  WINDOW_CLOSE: 'window:close',
  WINDOW_IS_MAXIMIZED: 'window:is-maximized',
  WINDOW_STATE: 'window:state',
  LOCALE_GET: 'locale:get',
  LOCALE_SET: 'locale:set',
} as const

export type AppCommand =
  | { type: 'open-media'; paths: string[] }
  | { type: 'play-media'; paths: string[] }
  | { type: 'update-available'; version: string }
  | { type: 'next-video' }
  | { type: 'previous-video' }
  | { type: 'toggle-playlist' }
  | { type: 'clear-playlist' }
  | { type: 'locale-changed'; locale: Locale; source: LocaleSource }

/** De onde veio o idioma em uso. */
export type LocaleSource = 'user' | 'system'

export interface LocaleInfo {
  /** Idioma em uso agora. */
  locale: Locale
  /** Idioma detectado do sistema operacional. */
  system: Locale
  /** `user` quando há escolha manual; `system` quando segue o sistema. */
  source: LocaleSource
}

export interface DefaultPlayerStatus {
  supported: boolean
  isDefault: boolean
}

export interface YouTubeMusicBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface YouTubeMusicStatus {
  state: 'idle' | 'loading' | 'ready' | 'error'
  canGoBack: boolean
  canGoForward: boolean
}

export interface TocaeApi {
  onCommand(callback: (command: AppCommand) => void): () => void
  notifyRendererReady(): void
  readPlaylist(): Promise<PersistedPlaylist>
  writePlaylist(items: PlaylistItem[], currentIndex: number): Promise<void>
  openMediaDialog(): Promise<void>
  openMediaFolderDialog(): Promise<void>
  showMediaInFolder(filePath: string): Promise<void>
  getMediaTracks(filePath: string): Promise<MediaTrack[]>
  createMovPlayback(filePath: string): Promise<string>
  createAudioTrackPlayback(filePath: string, streamIndex: number): Promise<string>
  extractSubtitleTrack(filePath: string, streamIndex: number): Promise<string>
  releaseMediaTrackOutput(outputPath: string): Promise<void>
  youtubeMusic: {
    open(): Promise<void>
    close(): Promise<void>
    stop(): Promise<void>
    setLocalPlaybackActive(active: boolean): Promise<void>
    setBounds(bounds: YouTubeMusicBounds): Promise<void>
    reload(): Promise<void>
    goBack(): Promise<void>
    goForward(): Promise<void>
    getStatus(): Promise<YouTubeMusicStatus>
    onStatus(callback: (status: YouTubeMusicStatus) => void): () => void
  }
  getLibrary(): Promise<LibrarySnapshot>
  addLibraryFolder(): Promise<LibrarySnapshot | null>
  removeLibraryFolder(folderId: string): Promise<LibrarySnapshot>
  onLibraryChanged(callback: () => void): () => void
  getMediaMetadata(filePath: string): Promise<MediaMetadata>
  getDefaultPlayerStatus(): Promise<DefaultPlayerStatus>
  setDefaultPlayer(): Promise<void>
  openReleasesPage(): Promise<void>
  minimizeWindow(): Promise<void>
  toggleMaximizeWindow(): Promise<void>
  closeWindow(): Promise<void>
  isWindowMaximized(): Promise<boolean>
  onWindowStateChange(callback: (isMaximized: boolean) => void): () => void
  getPathForFile(file: File): string
  /** Idioma em uso, o do sistema e a origem da escolha. */
  getLocale(): Promise<LocaleInfo>
  /**
   * Troca o idioma. `null` volta para "seguir o sistema". A troca é
   * persistida e propagada para as outras janelas.
   */
  setLocale(locale: Locale | null): Promise<LocaleInfo>
}
