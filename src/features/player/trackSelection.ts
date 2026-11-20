import type { MediaTrack, MediaTrackKind } from '@shared/mediaTracks'

export function findMediaTrack(
  tracks: readonly MediaTrack[],
  kind: MediaTrackKind,
  streamIndex: number,
): MediaTrack | null {
  if (!Number.isSafeInteger(streamIndex) || streamIndex < 0) return null
  return tracks.find((track) => track.kind === kind && track.streamIndex === streamIndex) ?? null
}

export function preferredMediaTrack(
  tracks: readonly MediaTrack[],
  kind: MediaTrackKind,
): MediaTrack | null {
  const available = tracks.filter((track) => track.kind === kind)
  return available.find((track) => track.isDefault) ?? available[0] ?? null
}
