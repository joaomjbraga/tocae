const STORAGE_KEY = 'tocae.playback-progress.v1'
const MAX_SAVED_POSITIONS = 100

function readPositions(): Map<string, number> {
  try {
    const serialized = window.localStorage.getItem(STORAGE_KEY)
    if (!serialized) return new Map()

    const parsed: unknown = JSON.parse(serialized)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn('Ignoring invalid saved video positions')
      return new Map()
    }

    const positions = new Map<string, number>()
    for (const [source, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        positions.set(source, Math.floor(value))
      }
    }
    return positions
  } catch (error) {
    console.warn('Could not read saved video positions', error)
    return new Map()
  }
}

export function getPlaybackPosition(source: string): number {
  return readPositions().get(source) ?? 0
}

export function savePlaybackPosition(source: string, position: number): void {
  if (!source || !Number.isFinite(position)) return

  try {
    const positions = readPositions()
    const roundedPosition = Math.floor(position)
    positions.delete(source)

    if (roundedPosition > 0) positions.set(source, roundedPosition)

    while (positions.size > MAX_SAVED_POSITIONS) {
      const oldest = positions.keys().next()
      if (oldest.done) break
      positions.delete(oldest.value)
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(positions)))
  } catch (error) {
    console.error('Could not save video position', error)
  }
}
