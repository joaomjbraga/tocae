import { protocol } from 'electron'
import { createReadStream } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { Readable } from 'node:stream'
import path from 'node:path'
import { mimeTypeFor } from './mime'
import { convertHeicToJpeg } from './heic'

export function registerMediaSchemes(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'media',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true,
      },
    },
  ])
}

export function registerMediaProtocol(): void {
  protocol.handle('media', handleMediaRequest)
}

async function handleMediaRequest(request: Request): Promise<Response> {
  let filePath: string
  try {
    filePath = decodeURIComponent(new URL(request.url).pathname.slice(1))
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  let size: number
  try {
    const result = await stat(filePath)
    if (!result.isFile()) return new Response('Not found', { status: 404 })
    size = result.size
  } catch {
    return new Response('Not found', { status: 404 })
  }

  if (path.extname(filePath).toLowerCase() === '.heic') {
    try {
      // Chromium does not decode HEIC consistently across supported platforms.
      const jpeg = await convertHeicToJpeg(await readFile(filePath))
      return streamResponse(
        Readable.from([jpeg]),
        {
          'Content-Type': 'image/jpeg',
          'Content-Length': String(jpeg.length),
        },
      )
    } catch (error) {
      console.error(`Could not decode HEIC image "${filePath}"`, error)
      return new Response('Could not decode HEIC image', { status: 422 })
    }
  }

  const baseHeaders = { 'Content-Type': mimeTypeFor(filePath) }
  if (size === 0) return streamResponse(createReadStream(filePath), baseHeaders)

  // Formatos: `bytes=start-end`, `bytes=start-` e `bytes=-suffix`.
  const rangeMatch = /^bytes=(\d*)-(\d*)$/.exec((request.headers.get('Range') ?? '').trim())
  if (rangeMatch?.[1] || rangeMatch?.[2]) {
    const start = rangeMatch[1]
      ? Number(rangeMatch[1])
      : Math.max(0, size - Number(rangeMatch[2]))
    const end = rangeMatch[1] && rangeMatch[2] ? Number(rangeMatch[2]) : size - 1

    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start > end ||
      start >= size
    ) {
      return new Response('Range Not Satisfiable', {
        status: 416,
        headers: { 'Content-Range': `bytes */${size}` },
      })
    }

    const lastByte = Math.min(end, size - 1)
    return streamResponse(
      createReadStream(filePath, { start, end: lastByte }),
      {
        ...baseHeaders,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(lastByte - start + 1),
        'Content-Range': `bytes ${start}-${lastByte}/${size}`,
      },
      206,
    )
  }

  return streamResponse(createReadStream(filePath), {
    ...baseHeaders,
    'Accept-Ranges': 'bytes',
    'Content-Length': String(size),
  })
}

function streamResponse(
  stream: Readable,
  headers: Record<string, string>,
  status = 200,
): Response {
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, { status, headers })
}