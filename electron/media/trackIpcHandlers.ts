import { IPC_CHANNELS } from '../../shared/ipc.ts'
import type { MediaTrack } from '../../shared/mediaTracks'

export type TrackIpcHandler = (event: unknown, ...args: unknown[]) => unknown
export type TrackIpcRegistrar = (channel: string, handler: TrackIpcHandler) => void

type TrackIpcEvent = {
  sender: {
    isDestroyed: () => boolean
    send: (channel: string, ...args: unknown[]) => void
  }
}

function isTrackIpcEvent(event: unknown): event is TrackIpcEvent {
  if (typeof event !== 'object' || event === null || !('sender' in event)) return false
  const { sender } = event
  return (
    typeof sender === 'object' &&
    sender !== null &&
    'send' in sender &&
    typeof sender.send === 'function' &&
    'isDestroyed' in sender &&
    typeof sender.isDestroyed === 'function'
  )
}

type TrackIpcOperations = {
  getMediaTracks: (filePath: unknown) => Promise<MediaTrack[]>
  createMovPlayback: (
    filePath: unknown,
    requestId: unknown,
    onProgress: (progress: number) => void,
  ) => Promise<string>
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
  register(IPC_CHANNELS.MEDIA_MOV_PLAYBACK_CREATE, (event, filePath, requestId) => {
    if (!isTrackIpcEvent(event)) {
      throw new TypeError('A valid media playback request is required.')
    }

    return operations.createMovPlayback(filePath, requestId, (progress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.MEDIA_MOV_PLAYBACK_PROGRESS, { requestId, progress })
      }
    })
  })
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
