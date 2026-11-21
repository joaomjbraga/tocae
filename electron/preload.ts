import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AppCommand, TocaeApi, YouTubeMusicStatus } from '@shared/ipc'
import type { Locale } from '@shared/i18n'
import type { MediaMetadata } from '@shared/media'
import type { MediaTrack } from '@shared/mediaTracks'
import type { PlaylistItem } from '@shared/playlist'
import type {
  AiDataPreferences,
  AiModelOption,
  AiPlayerState,
  AiPlaylistProposal,
  AiProviderConfig,
  AiStatus,
} from '@shared/ai'

const api: TocaeApi = {
  onCommand(callback) {
    const listener = (_event: IpcRendererEvent, command: AppCommand) => callback(command)
    ipcRenderer.on(IPC_CHANNELS.COMMAND, listener)
    return () => ipcRenderer.off(IPC_CHANNELS.COMMAND, listener)
  },
  notifyRendererReady: () => ipcRenderer.send(IPC_CHANNELS.RENDERER_READY),
  readPlaylist: () => ipcRenderer.invoke(IPC_CHANNELS.PLAYLIST_READ),
  writePlaylist: (items: PlaylistItem[], currentIndex: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.PLAYLIST_WRITE, items, currentIndex),
  openMediaDialog: () => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_PICK),
  openMediaFolderDialog: () => ipcRenderer.invoke(IPC_CHANNELS.MEDIA_FOLDER_PICK),
  showMediaInFolder: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEDIA_SHOW_IN_FOLDER, filePath),
  getMediaTracks: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEDIA_TRACKS_GET, filePath) as Promise<MediaTrack[]>,
  createAudioTrackPlayback: (filePath: string, streamIndex: number) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.MEDIA_TRACK_AUDIO_CREATE,
      filePath,
      streamIndex,
    ) as Promise<string>,
  extractSubtitleTrack: (filePath: string, streamIndex: number) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.MEDIA_TRACK_SUBTITLE_EXTRACT,
      filePath,
      streamIndex,
    ) as Promise<string>,
  releaseMediaTrackOutput: (outputPath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEDIA_TRACK_OUTPUT_RELEASE, outputPath),
  youtubeMusic: {
    open: () => ipcRenderer.invoke(IPC_CHANNELS.YOUTUBE_MUSIC_OPEN),
    close: () => ipcRenderer.invoke(IPC_CHANNELS.YOUTUBE_MUSIC_CLOSE),
    stop: () => ipcRenderer.invoke(IPC_CHANNELS.YOUTUBE_MUSIC_STOP),
    setLocalPlaybackActive: (active) =>
      ipcRenderer.invoke(IPC_CHANNELS.YOUTUBE_MUSIC_SET_LOCAL_PLAYBACK, active),
    setBounds: (bounds) => ipcRenderer.invoke(IPC_CHANNELS.YOUTUBE_MUSIC_SET_BOUNDS, bounds),
    reload: () => ipcRenderer.invoke(IPC_CHANNELS.YOUTUBE_MUSIC_RELOAD),
    goBack: () => ipcRenderer.invoke(IPC_CHANNELS.YOUTUBE_MUSIC_GO_BACK),
    goForward: () => ipcRenderer.invoke(IPC_CHANNELS.YOUTUBE_MUSIC_GO_FORWARD),
    getStatus: () =>
      ipcRenderer.invoke(IPC_CHANNELS.YOUTUBE_MUSIC_GET_STATUS) as Promise<YouTubeMusicStatus>,
    onStatus(callback) {
      const listener = (_event: IpcRendererEvent, status: YouTubeMusicStatus) => callback(status)
      ipcRenderer.on(IPC_CHANNELS.YOUTUBE_MUSIC_STATUS, listener)
      return () => ipcRenderer.off(IPC_CHANNELS.YOUTUBE_MUSIC_STATUS, listener)
    },
  },
  getMediaMetadata: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MEDIA_METADATA_GET, filePath) as Promise<MediaMetadata>,
  getLibrary: () => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_GET),
  addLibraryFolder: () => ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_ADD_FOLDER),
  removeLibraryFolder: (folderId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.LIBRARY_REMOVE_FOLDER, folderId),
  onLibraryChanged(callback) {
    const listener = () => callback()
    ipcRenderer.on(IPC_CHANNELS.LIBRARY_CHANGED, listener)
    return () => ipcRenderer.off(IPC_CHANNELS.LIBRARY_CHANGED, listener)
  },
  getDefaultPlayerStatus: () => ipcRenderer.invoke(IPC_CHANNELS.DEFAULT_PLAYER_STATUS),
  setDefaultPlayer: () => ipcRenderer.invoke(IPC_CHANNELS.DEFAULT_PLAYER_SET),
  openReleasesPage: () => ipcRenderer.invoke(IPC_CHANNELS.RELEASES_OPEN),
  minimizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_MINIMIZE),
  toggleMaximizeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE),
  closeWindow: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_CLOSE),
  isWindowMaximized: () => ipcRenderer.invoke(IPC_CHANNELS.WINDOW_IS_MAXIMIZED),
  onWindowStateChange(callback) {
    const listener = (_event: IpcRendererEvent, isMaximized: boolean) => callback(isMaximized)
    ipcRenderer.on(IPC_CHANNELS.WINDOW_STATE, listener)
    return () => ipcRenderer.off(IPC_CHANNELS.WINDOW_STATE, listener)
  },
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  getLocale: () => ipcRenderer.invoke(IPC_CHANNELS.LOCALE_GET),
  setLocale: (locale: Locale | null) => ipcRenderer.invoke(IPC_CHANNELS.LOCALE_SET, locale),
  ai: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.AI_STATUS_GET) as Promise<AiStatus>,
    getConfig: () => ipcRenderer.invoke(IPC_CHANNELS.AI_CONFIG_GET) as Promise<AiProviderConfig>,
    setConfig: (config) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_CONFIG_SET, config) as Promise<AiProviderConfig>,
    listModels: () =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_MODELS_LIST) as Promise<AiModelOption[]>,
    setCredential: (apiKey) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_CREDENTIAL_SET, apiKey),
    removeCredential: () =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_CREDENTIAL_REMOVE),
    sendMessage: (message, favoritePaths = []) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_SEND, message, favoritePaths) as Promise<AiStatus>,
    cancel: () => ipcRenderer.invoke(IPC_CHANNELS.AI_CANCEL) as Promise<AiStatus>,
    clear: () => ipcRenderer.invoke(IPC_CHANNELS.AI_CLEAR) as Promise<AiStatus>,
    setDataPreferences: (preferences: AiDataPreferences) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_DATA_PREFERENCES_SET, preferences) as Promise<AiDataPreferences>,
    recordPlayback: (filePath: string, title: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_PLAYBACK_RECORD, filePath, title),
    clearListeningHistory: () =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_LISTENING_HISTORY_CLEAR),
    onStreamChunk(callback) {
      const listener = (_event: IpcRendererEvent, chunk: string) => callback(chunk)
      ipcRenderer.on(IPC_CHANNELS.AI_STREAM_CHUNK, listener)
      return () => ipcRenderer.off(IPC_CHANNELS.AI_STREAM_CHUNK, listener)
    },
    setPlayerState: (state) =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_PLAYER_STATE_SET, state) as Promise<AiPlayerState>,
    getPlayerState: () =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_PLAYER_STATE_GET) as Promise<AiPlayerState>,
    getPlaylistProposal: () =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_PLAYLIST_PROPOSAL_GET) as Promise<AiPlaylistProposal | null>,
    applyPlaylistProposal: () =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_PLAYLIST_PROPOSAL_APPLY) as Promise<boolean>,
    clearPlaylistProposal: () =>
      ipcRenderer.invoke(IPC_CHANNELS.AI_PLAYLIST_PROPOSAL_CLEAR),
    onPlaylistProposalChanged(callback) {
      const listener = (_event: IpcRendererEvent, proposal: AiPlaylistProposal | null) => callback(proposal)
      ipcRenderer.on(IPC_CHANNELS.AI_PLAYLIST_PROPOSAL_CHANGED, listener)
      return () => ipcRenderer.off(IPC_CHANNELS.AI_PLAYLIST_PROPOSAL_CHANGED, listener)
    },
  },
}

contextBridge.exposeInMainWorld('tocae', api)
