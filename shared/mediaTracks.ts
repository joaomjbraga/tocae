export type MediaTrackKind = 'audio' | 'subtitle'

export interface MediaTrack {
  streamIndex: number
  kind: MediaTrackKind
  codec: string
  language?: string
  title?: string
  isDefault: boolean
}
