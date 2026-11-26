import assert from 'node:assert/strict'
import test from 'node:test'
import { IPC_CHANNELS } from '../../shared/ipc.ts'
import { registerTrackIpcHandlers } from './trackIpcHandlers.ts'

test('registers track IPC channels and forwards arguments to their operations', async () => {
  const calls = []
  const handlers = new Map()
  const operations = {
    getMediaTracks: async (...args) => {
      calls.push(['getMediaTracks', ...args])
      return []
    },
    createMovPlayback: async (...args) => {
      const onProgress = args.pop()
      calls.push(['createMovPlayback', ...args])
      onProgress(0.5)
      return '/tmp/compatible-video.mp4'
    },
    createAudioTrackPlayback: async (...args) => {
      calls.push(['createAudioTrackPlayback', ...args])
      return '/tmp/audio.mkv'
    },
    extractSubtitleTrack: async (...args) => {
      calls.push(['extractSubtitleTrack', ...args])
      return '/tmp/subtitle.vtt'
    },
    releaseMediaTrackOutput: async (...args) => {
      calls.push(['releaseMediaTrackOutput', ...args])
    },
  }

  registerTrackIpcHandlers((channel, handler) => handlers.set(channel, handler), operations)
  const progressEvents = []
  const movEvent = {
    sender: {
      isDestroyed: () => false,
      send: (...args) => progressEvents.push(args),
    },
  }

  assert.deepEqual([...handlers.keys()], [
    IPC_CHANNELS.MEDIA_TRACKS_GET,
    IPC_CHANNELS.MEDIA_MOV_PLAYBACK_CREATE,
    IPC_CHANNELS.MEDIA_TRACK_AUDIO_CREATE,
    IPC_CHANNELS.MEDIA_TRACK_SUBTITLE_EXTRACT,
    IPC_CHANNELS.MEDIA_TRACK_OUTPUT_RELEASE,
  ])
  await handlers.get(IPC_CHANNELS.MEDIA_TRACKS_GET)({}, '/media/video.mp4')
  assert.equal(
    await handlers.get(IPC_CHANNELS.MEDIA_MOV_PLAYBACK_CREATE)(
      movEvent,
      '/media/video.mov',
      'request-1',
      true,
    ),
    '/tmp/compatible-video.mp4',
  )
  assert.equal(
    await handlers.get(IPC_CHANNELS.MEDIA_TRACK_AUDIO_CREATE)(
      {},
      '/media/video.mp4',
      3,
      false,
    ),
    '/tmp/audio.mkv',
  )
  assert.equal(
    await handlers.get(IPC_CHANNELS.MEDIA_TRACK_SUBTITLE_EXTRACT)(
      {},
      '/media/video.mp4',
      4,
    ),
    '/tmp/subtitle.vtt',
  )
  await handlers.get(IPC_CHANNELS.MEDIA_TRACK_OUTPUT_RELEASE)({}, '/tmp/audio.mkv')

  assert.deepEqual(calls, [
    ['getMediaTracks', '/media/video.mp4'],
    ['createMovPlayback', '/media/video.mov', 'request-1', true],
    ['createAudioTrackPlayback', '/media/video.mp4', 3, false],
    ['extractSubtitleTrack', '/media/video.mp4', 4],
    ['releaseMediaTrackOutput', '/tmp/audio.mkv'],
  ])
  assert.deepEqual(progressEvents, [
    [IPC_CHANNELS.MEDIA_MOV_PLAYBACK_PROGRESS, { requestId: 'request-1', progress: 0.5 }],
  ])
})
