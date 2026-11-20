import type { Locale } from './i18n'
import type { PersistedPlaylist, PlaylistItem } from './playlist'

export const IPC_CHANNELS = {
  COMMAND: 'app:command',
  PLAYLIST_READ: 'playlist:read',
  PLAYLIST_WRITE: 'playlist:write',
  MEDIA_PICK: 'media:pick',
  MEDIA_FOLDER_PICK: 'media-folder:pick',
  DEFAULT_PLAYER_STATUS: 'default-player:status',
  DEFAULT_PLAYER_SET: 'default-player:set',
  STREAMING_SERVICE_VIEW_SET: 'streaming-service:view:set',
  STREAMING_SERVICE_VIEW_HIDE: 'streaming-service:view:hide',
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

export type StreamingService = 'netflix' | 'spotify'

export interface StreamingServiceViewBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface TocaeApi {
  onCommand(callback: (command: AppCommand) => void): () => void
  notifyRendererReady(): void
  readPlaylist(): Promise<PersistedPlaylist>
  writePlaylist(items: PlaylistItem[], currentIndex: number): Promise<void>
  openMediaDialog(): Promise<void>
  openMediaFolderDialog(): Promise<void>
  getDefaultPlayerStatus(): Promise<DefaultPlayerStatus>
  setDefaultPlayer(): Promise<void>
  setStreamingServiceView(
    service: StreamingService,
    bounds: StreamingServiceViewBounds,
  ): Promise<void>
  hideStreamingServiceView(): Promise<void>
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
