import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { OrganizationMove } from './organizationPlan'

const MAX_UNDO_MOVES = 500
let writeQueue: Promise<void> = Promise.resolve()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isOrganizationMove(value: unknown): value is OrganizationMove {
  if (!isRecord(value)) return false
  return (
    typeof value.sourcePath === 'string' &&
    value.sourcePath.length > 0 &&
    path.isAbsolute(value.sourcePath) &&
    typeof value.destinationPath === 'string' &&
    value.destinationPath.length > 0 &&
    path.isAbsolute(value.destinationPath)
  )
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

export async function readOrganizationUndoStore(file: string): Promise<OrganizationMove[]> {
  await writeQueue
  let raw: string
  try {
    raw = await readFile(file, 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return []
    console.warn('Could not read Teco organization undo history', error)
    return []
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.moves)) return []
    return parsed.moves.filter(isOrganizationMove).slice(-MAX_UNDO_MOVES)
  } catch (error) {
    console.warn('Could not parse Teco organization undo history', error)
    return []
  }
}

export function writeOrganizationUndoStore(
  file: string,
  moves: readonly OrganizationMove[],
): Promise<void> {
  const write = writeQueue.then(async () => {
    if (moves.length === 0) {
      await rm(file, { force: true })
      await rm(`${file}.tmp`, { force: true })
      return
    }
    const tempFile = `${file}.tmp`
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(
      tempFile,
      JSON.stringify({
        version: 1,
        moves: moves.filter(isOrganizationMove).slice(-MAX_UNDO_MOVES),
      }),
      'utf8',
    )
    await rename(tempFile, file)
  })
  writeQueue = write.catch(() => {})
  return write
}
