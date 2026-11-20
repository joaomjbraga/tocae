import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { IpcRendererEvent } from 'electron'
import { IPC_CHANNELS } from '@shared/ipc'
import type { AppCommand, TocaeApi } from '@shared/ipc'
import type { Locale } from '@shared/i18n'
import type { MediaMetadata } from '@shared/media'
import type { PlaylistItem } from '@shared/playlist'

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
}

contextBridge.exposeInMainWorld('tocae', api)
