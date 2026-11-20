import { IPC_CHANNELS } from '../../shared/ipc.ts'
import type { MediaTrack } from '../../shared/mediaTracks'

export type TrackIpcHandler = (event: unknown, ...args: unknown[]) => unknown
export type TrackIpcRegistrar = (channel: string, handler: TrackIpcHandler) => void

type TrackIpcOperations = {
  getMediaTracks: (filePath: unknown) => Promise<MediaTrack[]>
  createAudioTrackPlayback: (filePath: unknown, streamIndex: unknown) => Promise<string>
  extractSubtitleTrack: (filePath: unknown, streamIndex: unknown) => Promise<string>
  releaseMediaTrackOutput: (outputPath: unknown) => Promise<void>
}

export function registerTrackIpcHandlers(
  register: TrackIpcRegistrar,
  operations: TrackIpcOperations,
): void {
  register(IPC_CHANNELS.MEDIA_TRACKS_GET, (_event, filePath) =>
    operations.getMediaTracks(filePath),
  )
  register(IPC_CHANNELS.MEDIA_TRACK_AUDIO_CREATE, (_event, filePath, streamIndex) =>
    operations.createAudioTrackPlayback(filePath, streamIndex),
  )
  register(IPC_CHANNELS.MEDIA_TRACK_SUBTITLE_EXTRACT, (_event, filePath, streamIndex) =>
    operations.extractSubtitleTrack(filePath, streamIndex),
  )
  register(IPC_CHANNELS.MEDIA_TRACK_OUTPUT_RELEASE, (_event, outputPath) =>
    operations.releaseMediaTrackOutput(outputPath),
  )
}
