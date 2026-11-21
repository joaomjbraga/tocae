import type { Locale } from './i18n'
import type { LibrarySnapshot } from './library'
import type { MediaMetadata } from './media'
import type { MediaTrack } from './mediaTracks'
import type { PersistedPlaylist, PlaylistItem, SavedPlaylist } from './playlist'
import type {
  AiModelOption,
  AiDataPreferences,
  AiPlayerState,
  AiPlaylistProposal,
  AiRecommendation,
  AiRecommendationFeedback,
  AiProviderConfig,
  AiStatus,
} from './ai'

export const IPC_CHANNELS = {
  COMMAND: 'app:command',
  PLAYLIST_READ: 'playlist:read',
  PLAYLIST_WRITE: 'playlist:write',
  SAVED_PLAYLISTS_LIST: 'saved-playlists:list',
  SAVED_PLAYLISTS_CREATE: 'saved-playlists:create',
  SAVED_PLAYLISTS_UPDATE: 'saved-playlists:update',
  SAVED_PLAYLISTS_DELETE: 'saved-playlists:delete',
  MEDIA_PICK: 'media:pick',
  MEDIA_FOLDER_PICK: 'media-folder:pick',
  MEDIA_METADATA_GET: 'media:metadata:get',
  MEDIA_SHOW_IN_FOLDER: 'media:show-in-folder',
  MEDIA_TRACKS_GET: 'media:tracks:get',
  MEDIA_TRACK_AUDIO_CREATE: 'media:track-audio:create',
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
  AI_STATUS_GET: 'ai:status:get',
  AI_CONFIG_GET: 'ai:config:get',
  AI_CONFIG_SET: 'ai:config:set',
  AI_MODELS_LIST: 'ai:models:list',
  AI_CREDENTIAL_SET: 'ai:credential:set',
  AI_CREDENTIAL_REMOVE: 'ai:credential:remove',
  AI_SEND: 'ai:send',
  AI_CANCEL: 'ai:cancel',
  AI_CLEAR: 'ai:clear',
  AI_STREAM_CHUNK: 'ai:stream:chunk',
  AI_PLAYER_STATE_SET: 'ai:player-state:set',
  AI_PLAYER_STATE_GET: 'ai:player-state:get',
  AI_DATA_PREFERENCES_SET: 'ai:data-preferences:set',
  AI_PLAYBACK_RECORD: 'ai:playback:record',
  AI_LISTENING_HISTORY_CLEAR: 'ai:listening-history:clear',
  AI_RECOMMENDATIONS_GET: 'ai:recommendations:get',
  AI_RECOMMENDATION_FEEDBACK_SET: 'ai:recommendation-feedback:set',
  AI_RECOMMENDATIONS_CLEAR: 'ai:recommendations:clear',
  AI_AUDIO_MOOD_ANALYZE: 'ai:audio-mood:analyze',
  AI_AUDIO_MOOD_CANCEL: 'ai:audio-mood:cancel',
  AI_IMAGE_DESCRIPTION_ANALYZE: 'ai:image-description:analyze',
  AI_IMAGE_DESCRIPTION_CANCEL: 'ai:image-description:cancel',
  AI_VIDEO_ANALYZE: 'ai:video:analyze',
  AI_VIDEO_CANCEL: 'ai:video:cancel',
  AI_PLAYLIST_PROPOSAL_GET: 'ai:playlist-proposal:get',
  AI_PLAYLIST_PROPOSAL_APPLY: 'ai:playlist-proposal:apply',
  AI_PLAYLIST_PROPOSAL_CLEAR: 'ai:playlist-proposal:clear',
  AI_PLAYLIST_PROPOSAL_CHANGED: 'ai:playlist-proposal:changed',
} as const

export type AppCommand =
  | { type: 'open-media'; paths: string[] }
  | { type: 'play-media'; paths: string[] }
  | { type: 'update-available'; version: string }
  | { type: 'next-video' }
  | { type: 'previous-video' }
  | { type: 'toggle-playlist' }
  | { type: 'clear-playlist' }
  | { type: 'playback-play' }
  | { type: 'playback-pause' }
  | { type: 'playback-toggle' }
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
  savedPlaylists: {
    list(): Promise<SavedPlaylist[]>
    create(name: string, items: PlaylistItem[]): Promise<SavedPlaylist>
    update(playlist: SavedPlaylist): Promise<SavedPlaylist>
    delete(id: string): Promise<boolean>
  }
  openMediaDialog(): Promise<void>
  openMediaFolderDialog(): Promise<void>
  showMediaInFolder(filePath: string): Promise<void>
  getMediaTracks(filePath: string): Promise<MediaTrack[]>
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
  ai: {
    getStatus(): Promise<AiStatus>
    getConfig(): Promise<AiProviderConfig>
    setConfig(config: AiProviderConfig): Promise<AiProviderConfig>
    listModels(): Promise<AiModelOption[]>
    setCredential(apiKey: string): Promise<void>
    removeCredential(): Promise<void>
    sendMessage(message: string, favoritePaths?: string[]): Promise<AiStatus>
    cancel(): Promise<AiStatus>
    clear(): Promise<AiStatus>
    setDataPreferences(preferences: AiDataPreferences): Promise<AiDataPreferences>
    recordPlayback(filePath: string, title: string): Promise<void>
    clearListeningHistory(): Promise<void>
    getRecommendations(favoritePaths: string[]): Promise<AiRecommendation[]>
    setRecommendationFeedback(path: string, feedback: AiRecommendationFeedback): Promise<void>
    clearRecommendations(): Promise<void>
    analyzeAudioMood(filePath: string): Promise<string | null>
    cancelAudioMoodAnalysis(): Promise<void>
    describeImage(filePath: string): Promise<string | null>
    cancelImageDescription(): Promise<void>
    analyzeVideo(filePath: string): Promise<string | null>
    cancelVideoAnalysis(): Promise<void>
    onStreamChunk(callback: (chunk: string) => void): () => void
    setPlayerState(state: AiPlayerState): Promise<AiPlayerState>
    getPlayerState(): Promise<AiPlayerState>
    getPlaylistProposal(): Promise<AiPlaylistProposal | null>
    applyPlaylistProposal(): Promise<boolean>
    clearPlaylistProposal(): Promise<void>
    onPlaylistProposalChanged(callback: (proposal: AiPlaylistProposal | null) => void): () => void
  }
}
