import type { MediaType } from './media'

export const STANDARD_LIBRARY_FOLDERS = [
  'desktop',
  'documents',
  'downloads',
  'pictures',
  'music',
  'videos',
] as const

export type StandardLibraryFolderId = (typeof STANDARD_LIBRARY_FOLDERS)[number]
export type LibraryFolderKind = StandardLibraryFolderId | 'custom'

export interface LibraryFolder {
  id: string
  kind: LibraryFolderKind
  name: string
  path: string
}

export interface LibraryMediaItem {
  path: string
  name: string
  relativePath: string
  folderId: string
  type: MediaType
}

export interface LibrarySnapshot {
  folders: LibraryFolder[]
  items: LibraryMediaItem[]
  unavailableFolderIds: string[]
}
