const STORAGE_KEY = 'tocae.library-favorites.v1'

type FavoriteStorage = Pick<Storage, 'getItem' | 'setItem'>

export function readFavoritePaths(storage?: FavoriteStorage): Set<string> {
  try {
    const serialized = (storage ?? window.localStorage).getItem(STORAGE_KEY)
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

export function saveFavoritePaths(
  paths: ReadonlySet<string>,
  storage?: FavoriteStorage,
): void {
  const target = storage ?? window.localStorage
  target.setItem(STORAGE_KEY, JSON.stringify([...paths]))
}

export function toggleFavoritePath(paths: ReadonlySet<string>, filePath: string): Set<string> {
  const next = new Set(paths)
  if (next.has(filePath)) next.delete(filePath)
  else next.add(filePath)
  return next
}
