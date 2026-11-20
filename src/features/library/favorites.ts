const STORAGE_KEY = 'tocae.library-favorites.v1'

export function readFavoritePaths(): Set<string> {
  try {
    const serialized = window.localStorage.getItem(STORAGE_KEY)
    if (!serialized) return new Set()

    const parsed: unknown = JSON.parse(serialized)
    if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== 'string')) {
      console.warn('Ignoring invalid saved library favorites')
      return new Set()
    }

    return new Set(parsed.filter((value) => value.length > 0))
  } catch (error) {
    console.error('Could not read saved library favorites', error)
    return new Set()
  }
}

export function saveFavoritePaths(paths: ReadonlySet<string>): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...paths]))
}
