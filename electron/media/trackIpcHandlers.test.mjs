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

  assert.deepEqual([...handlers.keys()], [
    IPC_CHANNELS.MEDIA_TRACKS_GET,
    IPC_CHANNELS.MEDIA_TRACK_AUDIO_CREATE,
    IPC_CHANNELS.MEDIA_TRACK_SUBTITLE_EXTRACT,
    IPC_CHANNELS.MEDIA_TRACK_OUTPUT_RELEASE,
  ])
  await handlers.get(IPC_CHANNELS.MEDIA_TRACKS_GET)({}, '/media/video.mp4')
  assert.equal(
    await handlers.get(IPC_CHANNELS.MEDIA_TRACK_AUDIO_CREATE)(
      {},
      '/media/video.mp4',
      3,
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
    ['createAudioTrackPlayback', '/media/video.mp4', 3],
    ['extractSubtitleTrack', '/media/video.mp4', 4],
    ['releaseMediaTrackOutput', '/tmp/audio.mkv'],
  ])
})
