export interface PlaybackMarker {
  id: string
  time: number
  label: string
}

const STORAGE_KEY = 'tocae.video-markers.v1'
const MAX_SAVED_FILES = 100
const MAX_MARKERS_PER_FILE = 100
const MAX_LABEL_LENGTH = 80

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readMarkers(): Map<string, PlaybackMarker[]> {
  try {
    const serialized = window.localStorage.getItem(STORAGE_KEY)
    if (!serialized) return new Map()

    const parsed: unknown = JSON.parse(serialized)
    if (!isRecord(parsed)) {
      console.warn('Ignoring invalid saved video markers')
      return new Map()
    }

    const markers = new Map<string, PlaybackMarker[]>()
    for (const [source, value] of Object.entries(parsed)) {
      if (!Array.isArray(value)) continue
      const validMarkers = value.filter(
        (marker): marker is PlaybackMarker =>
          isRecord(marker) &&
          typeof marker.id === 'string' &&
          marker.id.length > 0 &&
          typeof marker.time === 'number' &&
          Number.isFinite(marker.time) &&
          marker.time >= 0 &&
          typeof marker.label === 'string',
      )
      if (validMarkers.length > 0) {
        markers.set(
          source,
          validMarkers
            .slice(-MAX_MARKERS_PER_FILE)
            .sort((left, right) => left.time - right.time),
        )
      }
    }
    return new Map([...markers].slice(-MAX_SAVED_FILES))
  } catch (error) {
    console.warn('Could not read saved video markers', error)
    return new Map()
  }
}

function writeMarkers(markers: Map<string, PlaybackMarker[]>): void {
  while (markers.size > MAX_SAVED_FILES) {
    const oldest = markers.keys().next()
    if (oldest.done) break
    markers.delete(oldest.value)
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(markers)))
}

export function getPlaybackMarkers(source: string): PlaybackMarker[] {
  return readMarkers().get(source) ?? []
}

export function addPlaybackMarker(source: string, time: number): PlaybackMarker[] {
  if (!source || !Number.isFinite(time) || time < 0) {
    throw new TypeError('A media source and valid marker time are required.')
  }

  const markers = readMarkers()
  const fileMarkers = markers.get(source) ?? []
  if (fileMarkers.length >= MAX_MARKERS_PER_FILE) {
    throw new RangeError('This media file already has the maximum number of markers.')
  }

  const marker = { id: crypto.randomUUID(), time, label: '' }
  markers.delete(source)
  markers.set(
    source,
    [...fileMarkers, marker].sort((left, right) => left.time - right.time),
  )
  writeMarkers(markers)
  return markers.get(source) ?? []
}

export function updatePlaybackMarkerLabel(
  source: string,
  markerId: string,
  label: string,
): PlaybackMarker[] {
  const markers = readMarkers()
  const fileMarkers = markers.get(source) ?? []
  const updatedMarkers = fileMarkers.map((marker) =>
    marker.id === markerId
      ? { ...marker, label: label.slice(0, MAX_LABEL_LENGTH) }
      : marker,
  )
  markers.delete(source)
  if (updatedMarkers.length > 0) markers.set(source, updatedMarkers)
  writeMarkers(markers)
  return updatedMarkers
}

export function removePlaybackMarker(source: string, markerId: string): PlaybackMarker[] {
  const markers = readMarkers()
  const updatedMarkers = (markers.get(source) ?? []).filter((marker) => marker.id !== markerId)
  markers.delete(source)
  if (updatedMarkers.length > 0) markers.set(source, updatedMarkers)
  writeMarkers(markers)
  return updatedMarkers
}
