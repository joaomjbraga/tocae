import type { LibraryMediaItem } from '@shared/library'
import type { SavedPlaybackPosition } from '../player/playbackProgress'

const CONTINUE_PLAYBACK_LIMIT = 6

export interface ContinuePlaybackItem {
  item: LibraryMediaItem
  position: number
  duration?: number
}

export function selectContinuePlaybackItems(
  items: readonly LibraryMediaItem[],
  savedPositions: readonly SavedPlaybackPosition[],
  sourceForPath: (path: string) => string,
): ContinuePlaybackItem[] {
  const itemsBySource = new Map(
    items
      .filter((item) => item.type === 'video' || item.type === 'audio')
      .map((item) => [sourceForPath(item.path), item]),
  )

  return savedPositions
    .flatMap(({ source, position, duration }) => {
      const item = itemsBySource.get(source)
      return item && position > 0
        ? [{ item, position, ...(duration ? { duration } : {}) }]
        : []
    })
    .slice(0, CONTINUE_PLAYBACK_LIMIT)
}
