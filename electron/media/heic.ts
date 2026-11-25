import { app } from 'electron'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import { Worker } from 'node:worker_threads'
import { APP_ROOT } from '../paths'

const MAX_CACHE_BYTES = 32 * 1024 * 1024
const CONVERSION_TIMEOUT_MS = 60_000

type CachedJpeg = {
  buffer: Buffer
  size: number
}

type WorkerResult = {
  error?: string
}

const jpegCache = new Map<string, CachedJpeg>()
const pendingConversions = new Map<string, Promise<Buffer>>()
let cachedBytes = 0
let conversionQueue: Promise<void> = Promise.resolve()

function cacheKey(filePath: string, fileSize: number, modifiedAt: number): string {
  const resolvedPath = path.resolve(filePath)
  const normalizedPath = process.platform === 'win32' ? resolvedPath.toLowerCase() : resolvedPath
  return `${normalizedPath}\u0000${fileSize}\u0000${modifiedAt}`
}

function getCachedJpeg(key: string): Buffer | undefined {
  const cached = jpegCache.get(key)
  if (!cached) return undefined

  jpegCache.delete(key)
  jpegCache.set(key, cached)
  return cached.buffer
}

function cacheJpeg(key: string, buffer: Buffer): void {
  if (buffer.byteLength > MAX_CACHE_BYTES) return

  while (cachedBytes + buffer.byteLength > MAX_CACHE_BYTES) {
    const oldestKey = jpegCache.keys().next().value
    if (oldestKey === undefined) break
    const oldest = jpegCache.get(oldestKey)
    if (oldest) cachedBytes -= oldest.size
    jpegCache.delete(oldestKey)
  }

  jpegCache.set(key, { buffer, size: buffer.byteLength })
  cachedBytes += buffer.byteLength
}

function workerPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'heicWorker.cjs')
    : path.join(APP_ROOT, 'electron', 'media', 'heicWorker.cjs')
}

function runWorker(filePath: string): Promise<Buffer> {
  const worker = new Worker(workerPath(), {
    workerData: { filePath, requireFrom: import.meta.url },
  })

  return new Promise((resolve, reject) => {
    let settled = false
    const timeout = setTimeout(
      () => finish(new Error('HEIC conversion timed out.')),
      CONVERSION_TIMEOUT_MS,
    )

    function finish(error?: Error, jpeg?: Buffer): void {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      if (error) {
        void worker.terminate().catch((terminationError: unknown) => {
          console.error('Could not stop the HEIC conversion worker', terminationError)
        })
        reject(error)
      } else if (jpeg) {
        resolve(jpeg)
      } else {
        reject(new Error('HEIC conversion worker returned no image.'))
      }
    }

    worker.once('message', (message: unknown) => {
      if (message instanceof ArrayBuffer) {
        finish(undefined, Buffer.from(message))
        return
      }

      if (
        typeof message === 'object' &&
        message !== null &&
        'error' in message &&
        typeof (message as WorkerResult).error === 'string'
      ) {
        finish(new Error((message as WorkerResult).error))
        return
      }

      finish(new Error('HEIC conversion worker returned an invalid response.'))
    })
    worker.once('error', (error) => finish(error))
    worker.once('exit', (code) => {
      if (!settled) finish(new Error(`HEIC conversion worker exited with code ${code}.`))
    })
  })
}

export function convertHeicToJpeg(
  filePath: string,
  fileSize: number,
  modifiedAt: number,
): Promise<Buffer> {
  const key = cacheKey(filePath, fileSize, modifiedAt)
  const cached = getCachedJpeg(key)
  if (cached) return Promise.resolve(cached)

  const pending = pendingConversions.get(key)
  if (pending) return pending

  const conversion = conversionQueue.then(() => runWorker(filePath))
  pendingConversions.set(key, conversion)
  conversionQueue = conversion.then(
    () => undefined,
    () => undefined,
  )

  void conversion.then(
    (jpeg) => {
      cacheJpeg(key, jpeg)
      if (pendingConversions.get(key) === conversion) pendingConversions.delete(key)
    },
    () => {
      if (pendingConversions.get(key) === conversion) pendingConversions.delete(key)
    },
  )

  return conversion
}
