import type { MediaTrack, MediaTrackKind } from '../../shared/mediaTracks'

export function parseTrackIndex(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('A valid media stream index is required.')
  }
  return value
}

export function assertTrackAvailable(
  tracks: readonly MediaTrack[],
  streamIndex: number,
  kind: MediaTrackKind,
): void {
  if (!tracks.some((track) => track.streamIndex === streamIndex && track.kind === kind)) {
    throw new TypeError(`The requested ${kind} stream was not found.`)
  }
}
