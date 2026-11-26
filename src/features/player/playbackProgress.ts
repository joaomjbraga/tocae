const STORAGE_KEY = 'tocae.playback-progress.v1'
const MAX_SAVED_POSITIONS = 100
export const PLAYBACK_PROGRESS_CHANGED_EVENT = 'tocae:playback-progress-changed'

export interface SavedPlaybackPosition {
  source: string
  position: number
  duration?: number
}

interface StoredPlaybackPosition {
  position: number
  duration?: number
}

function readPositions(): Map<string, StoredPlaybackPosition> {
  try {
    const serialized = window.localStorage.getItem(STORAGE_KEY)
    if (!serialized) return new Map()

    const parsed: unknown = JSON.parse(serialized)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn('Ignoring invalid saved video positions')
      return new Map()
    }

    const positions = new Map<string, StoredPlaybackPosition>()
    for (const [source, value] of Object.entries(parsed)) {
      if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        positions.set(source, { position: Math.floor(value) })
      } else if (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        'position' in value &&
        typeof value.position === 'number' &&
        Number.isFinite(value.position) &&
        value.position > 0
      ) {
        const duration =
          'duration' in value &&
          typeof value.duration === 'number' &&
          Number.isFinite(value.duration) &&
          value.duration > 0
            ? value.duration
            : undefined
        positions.set(source, {
          position: Math.floor(value.position),
          ...(duration ? { duration } : {}),
        })
      }
    }
    return positions
  } catch (error) {
    console.warn('Could not read saved video positions', error)
    return new Map()
  }
}

export function getPlaybackPosition(source: string): number {
  return readPositions().get(source)?.position ?? 0
}

export function getSavedPlaybackPositions(): SavedPlaybackPosition[] {
  return [...readPositions()]
    .reverse()
    .map(([source, position]) => ({ source, ...position }))
}

export function savePlaybackPosition(source: string, position: number, duration?: number): void {
  if (!source || !Number.isFinite(position)) return

  try {
    const positions = readPositions()
    const roundedPosition = Math.floor(position)
    const savedDuration =
      duration !== undefined && Number.isFinite(duration) && duration > 0
        ? duration
        : positions.get(source)?.duration
    positions.delete(source)

    if (roundedPosition > 0) {
      positions.set(source, {
        position: roundedPosition,
        ...(savedDuration ? { duration: savedDuration } : {}),
      })
    }

    while (positions.size > MAX_SAVED_POSITIONS) {
      const oldest = positions.keys().next()
      if (oldest.done) break
      positions.delete(oldest.value)
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(positions)))
    window.dispatchEvent(new Event(PLAYBACK_PROGRESS_CHANGED_EVENT))
  } catch (error) {
    console.error('Could not save video position', error)
  }
}
