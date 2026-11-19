export interface PlaybackPreferences {
  autoNext: boolean
  repeatCurrent: boolean
}

export const DEFAULT_PLAYBACK_PREFERENCES: PlaybackPreferences = {
  autoNext: true,
  repeatCurrent: false,
}

const STORAGE_KEY = 'tocae.playback-settings.v1'

export function readPlaybackPreferences(): PlaybackPreferences {
  try {
    const serialized = window.localStorage.getItem(STORAGE_KEY)
    if (!serialized) return { ...DEFAULT_PLAYBACK_PREFERENCES }

    const parsed: unknown = JSON.parse(serialized)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      console.warn('Ignoring invalid playback preferences')
      return { ...DEFAULT_PLAYBACK_PREFERENCES }
    }

    const stored = parsed as Partial<PlaybackPreferences>
    return {
      autoNext:
        typeof stored.autoNext === 'boolean'
          ? stored.autoNext
          : DEFAULT_PLAYBACK_PREFERENCES.autoNext,
      repeatCurrent:
        typeof stored.repeatCurrent === 'boolean'
          ? stored.repeatCurrent
          : DEFAULT_PLAYBACK_PREFERENCES.repeatCurrent,
    }
  } catch (error) {
    console.warn('Could not read playback preferences', error)
    return { ...DEFAULT_PLAYBACK_PREFERENCES }
  }
}

export function savePlaybackPreferences(preferences: PlaybackPreferences): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences))
  } catch (error) {
    console.error('Could not save playback preferences', error)
  }
}
