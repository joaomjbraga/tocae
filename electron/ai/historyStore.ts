import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AiMessage } from '@shared/ai'
import { limitAiHistory } from './limits.ts'

export function isAiMessage(value: unknown): value is AiMessage {
  if (typeof value !== 'object' || value === null) return false
  const message = value as Partial<AiMessage>
  return (
    typeof message.id === 'string' &&
    message.id.length > 0 &&
    (message.role === 'user' || message.role === 'assistant') &&
    typeof message.content === 'string' &&
    typeof message.createdAt === 'number' &&
    Number.isFinite(message.createdAt)
  )
}

export async function readAiHistoryFile(file: string): Promise<AiMessage[]> {
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if (!isMissingFile(error)) console.warn('Could not read AI history', error)
    return []
  }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || !('messages' in parsed)) return []
    const messages = (parsed as { messages?: unknown }).messages
    if (!Array.isArray(messages)) return []
    return limitAiHistory(messages.filter(isAiMessage))
  } catch (error) {
    console.warn('Could not parse AI history; using an empty conversation', error)
    return []
  }
}

export async function writeAiHistoryFile(
  file: string,
  messages: readonly AiMessage[],
): Promise<void> {
  const tempFile = `${file}.tmp`
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(
    tempFile,
    JSON.stringify(
      { version: 1, messages: limitAiHistory(messages.filter(isAiMessage)) },
      null,
      2,
    ),
    'utf8',
  )
  await rename(tempFile, file)
}

export async function clearAiHistoryFile(file: string): Promise<void> {
  await rm(file, { force: true })
  await rm(`${file}.tmp`, { force: true })
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}
