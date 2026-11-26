import { app, dialog, ipcMain } from 'electron'
import ffmpegPath from 'ffmpeg-static'
import { execFile } from 'node:child_process'
import { stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { IPC_CHANNELS } from '@shared/ipc'
import { mediaTypeForPath } from '@shared/media'
import { translate } from '@shared/i18n'
import { getAppLocale } from '../locale'
import { getMainWindow } from '../windows'

const CAPTURE_TIMEOUT_MS = 60_000
const MAX_FRAME_BYTES = 32 * 1024 * 1024

function ffmpegExecutablePath(): string {
  if (!ffmpegPath) throw new Error('FFmpeg is not available for this platform.')
  if (!app.isPackaged) return ffmpegPath
  return ffmpegPath.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`,
  )
}

function validateJpegFrame(frame: unknown): asserts frame is Buffer {
  if (
    !Buffer.isBuffer(frame) ||
    frame.length < 3 ||
    frame.length > MAX_FRAME_BYTES ||
    frame[0] !== 0xff ||
    frame[1] !== 0xd8 ||
    frame[2] !== 0xff
  ) {
    throw new Error('FFmpeg did not return a valid video frame.')
  }
}

function extractVideoFrame(filePath: string, timestamp: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegExecutablePath(),
      [
        '-nostdin',
        '-hide_banner',
        '-loglevel',
        'error',
        '-ss',
        String(timestamp),
        '-i',
        filePath,
        '-map',
        '0:v:0',
        '-frames:v',
        '1',
        '-an',
        '-sn',
        '-q:v',
        '2',
        '-f',
        'image2pipe',
        '-vcodec',
        'mjpeg',
        'pipe:1',
      ],
      {
        encoding: 'buffer',
        maxBuffer: MAX_FRAME_BYTES,
        timeout: CAPTURE_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout) => {
        if (error) {
          reject(error)
          return
        }
        try {
          validateJpegFrame(stdout)
          resolve(stdout)
        } catch (validationError) {
          reject(validationError)
        }
      },
    )
  })
}

async function captureAndSaveFrame(filePath: unknown, rawTimestamp: unknown): Promise<boolean> {
  if (typeof filePath !== 'string' || mediaTypeForPath(filePath) !== 'video') {
    throw new TypeError('A supported video file path is required.')
  }
  if (typeof rawTimestamp !== 'number' || !Number.isFinite(rawTimestamp) || rawTimestamp < 0) {
    throw new TypeError('A valid video timestamp is required.')
  }

  const resolvedPath = path.resolve(filePath)
  const fileStats = await stat(resolvedPath)
  if (!fileStats.isFile()) throw new Error(`Not a video file: "${resolvedPath}"`)

  const window = getMainWindow()
  if (!window) throw new Error('The main window is not available.')
  const locale = getAppLocale()
  const frameName = `${path.parse(resolvedPath).name}-${Math.floor(rawTimestamp)
    .toString()
    .padStart(6, '0')}.jpg`
  const result = await dialog.showSaveDialog(window, {
    title: translate(locale, 'player.captureFrameDialog'),
    defaultPath: path.join(app.getPath('pictures'), frameName),
    filters: [
      { name: translate(locale, 'player.captureFrameFormat'), extensions: ['jpg', 'jpeg'] },
    ],
  })
  if (result.canceled || !result.filePath) return false

  const frame = await extractVideoFrame(resolvedPath, rawTimestamp)
  await writeFile(result.filePath, frame)
  return true
}

export function registerVideoFrameCaptureIpc(): void {
  ipcMain.handle(IPC_CHANNELS.MEDIA_VIDEO_FRAME_CAPTURE, (_event, filePath, timestamp) =>
    captureAndSaveFrame(filePath, timestamp),
  )
}
