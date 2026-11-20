import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, DragEvent, KeyboardEvent } from 'react'
import {
  ChevronRight,
  Folder,
  FolderOpen,
  GripVertical,
  List,
  ListVideo,
  Play,
  Trash2,
} from 'lucide-react'
import type { MessageKey, TranslationParams } from '@shared/i18n'
import { useI18n } from '../../i18n'
import styles from './PlaylistPanel.module.css'

/** `--i` alimenta o atraso em cascata da animação de entrada das linhas. */
type RowStyle = CSSProperties & { '--i': number }
type DepthStyle = CSSProperties & { '--depth': string }

type PlaylistPanelProps = {
  items: { id: string; name: string; path: string }[]
  currentIndex: number
  view: 'queue' | 'folders'
  onViewChange: (view: 'queue' | 'folders') => void
  immersive: boolean
  /** `closing` marca a saída animada (o painel segue montado). */
  closing: boolean
  loading: boolean
  /** Vídeos que o usuário tentou adicionar e já estavam na lista. */
  pulseIds: ReadonlySet<string>
  onPlay: (index: number) => void
  onMove: (from: number, to: number) => void
  onRemove: (id: string) => void
  onClear: () => void
  onFilesSelected: (files: File[]) => void
  onAnnounce: (key: MessageKey, params?: TranslationParams) => void
}

type FolderItem = { item: PlaylistPanelProps['items'][number]; index: number }

interface FolderNode {
  key: string
  name: string
  children: Map<string, FolderNode>
  items: FolderItem[]
  count: number
}

function createFolderTree(
  items: PlaylistPanelProps['items'],
  rootLabel: string,
): FolderNode[] {
  const directories = items.map(({ path }) => {
    const segments = path.replace(/\\/g, '/').split('/').filter(Boolean)
    segments.pop()
    return segments
  })

  const commonLength = directories.length
    ? directories.slice(1).reduce((common, segments) => {
        let length = 0
        while (
          length < common &&
          length < segments.length &&
          directories[0][length] === segments[length]
        ) {
          length += 1
        }
        return length
      }, directories[0].length)
    : 0
  const trimLength = Math.max(0, commonLength - 1)
  const roots = new Map<string, FolderNode>()

  for (const [index, item] of items.entries()) {
    const segments = directories[index].slice(trimLength)
    const visibleSegments =
      segments.length > 0
        ? segments.map((name) => ({ key: name, name }))
        : [{ key: '\0root', name: rootLabel }]
    let children = roots
    let parentKey = ''
    let node: FolderNode | undefined

    for (const segment of visibleSegments) {
      const key = `${parentKey}/${segment.key}`
      node = children.get(key)
      if (!node) {
        node = { key, name: segment.name, children: new Map(), items: [], count: 0 }
        children.set(key, node)
      }
      parentKey = key
      children = node.children
    }

    if (node) node.items.push({ item, index })
  }

  function countItems(node: FolderNode): number {
    node.count = node.items.length
    for (const child of node.children.values()) node.count += countItems(child)
    return node.count
  }

  const sortedRoots = [...roots.values()].sort(compareFolders)
  for (const root of sortedRoots) countItems(root)
  return sortedRoots
}

function compareFolders(left: FolderNode, right: FolderNode): number {
  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
}

function PlaylistPanel({
  items,
  currentIndex,
  view,
  onViewChange,
  immersive,
  closing,
  loading,
  pulseIds,
  onPlay,
  onMove,
  onRemove,
  onClear,
  onFilesSelected,
  onAnnounce,
}: PlaylistPanelProps) {
  const { t } = useI18n()
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set())
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [droppingFiles, setDroppingFiles] = useState(false)
  // entered/leave disparam em cascata nos filhos; o contador evita o piscar.
  const fileDragDepthRef = useRef(0)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [focusIndex, setFocusIndex] = useState<number | null>(null)

  // Depois de mover com o teclado, o foco precisa seguir o item, senão o
  // próximo Alt+↓ opera sobre o índice antigo.
  useEffect(() => {
    if (focusIndex === null) return
    itemRefs.current[focusIndex]?.focus()
    setFocusIndex(null)
  }, [focusIndex, items])

  function resetDrag() {
    setDragIndex(null)
    setDropIndex(null)
  }

  function hasFiles(event: DragEvent) {
    return event.dataTransfer.types.includes('Files')
  }

  function handleDragStart(event: DragEvent<HTMLLIElement>, index: number) {
    setDragIndex(index)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(index))
  }

  function handleDragOver(event: DragEvent<HTMLLIElement>, index: number) {
    if (hasFiles(event)) return
    if (dragIndex === null || index === dragIndex) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    const bounds = event.currentTarget.getBoundingClientRect()
    const below = event.clientY > bounds.top + bounds.height / 2
    setDropIndex(below ? index + 1 : index)
  }

  function handleDrop(event: DragEvent<HTMLOListElement>) {
    event.preventDefault()
    if (hasFiles(event)) return
    if (dragIndex !== null && dropIndex !== null) {
      const target = dropIndex > dragIndex ? dropIndex - 1 : dropIndex
      onMove(dragIndex, target)
    }
    resetDrag()
  }

  function handleDragLeave(event: DragEvent<HTMLOListElement>) {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    setDropIndex(null)
  }

  // Arrastar arquivos do sistema sobre o painel: antes o <ol> chamava
  // preventDefault e engolia o drop sem adicionar nada.
  function handleFileDragEnter(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event)) return
    event.preventDefault()
    fileDragDepthRef.current += 1
    setDroppingFiles(true)
  }

  function handleFileDragOver(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleFileDragLeave() {
    fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1)
    if (fileDragDepthRef.current === 0) setDroppingFiles(false)
  }

  function handleFileDrop(event: DragEvent<HTMLElement>) {
    if (!hasFiles(event)) return
    event.preventDefault()
    fileDragDepthRef.current = 0
    setDroppingFiles(false)
    const files = Array.from(event.dataTransfer.files)
    if (files.length > 0) onFilesSelected(files)
  }

  function handleItemKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!event.altKey) return
    const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
    if (delta === 0) return
    const target = index + delta
    if (target < 0 || target >= items.length) return
    event.preventDefault()
    onMove(index, target)
    setFocusIndex(target)
    onAnnounce('playlist.moved', { position: target + 1, total: items.length })
  }

  function toggleFolder(key: string) {
    setCollapsedFolders((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function renderFolder(node: FolderNode, depth: number) {
    const collapsed = collapsedFolders.has(node.key)
    const children = [...node.children.values()].sort(compareFolders)

    return (
      <li key={node.key}>
        <button
          type="button"
          className={styles.folderHeading}
          style={{ '--depth': `${depth * 12}px` } as DepthStyle}
          onClick={() => toggleFolder(node.key)}
          aria-expanded={!collapsed}
          aria-label={t(
            node.count === 1 ? 'playlist.folderOneItem' : 'playlist.folderItems',
            { name: node.name, count: node.count },
          )}
        >
          <ChevronRight
            size={13}
            className={`${styles.folderChevron} ${collapsed ? '' : styles.folderChevronOpen}`}
            aria-hidden="true"
          />
          {collapsed ? (
            <Folder size={14} aria-hidden="true" />
          ) : (
            <FolderOpen size={14} aria-hidden="true" />
          )}
          <span className={styles.folderName}>{node.name}</span>
          <span className={styles.folderCount}>{node.count}</span>
        </button>
        {!collapsed && (
          <ul className={styles.folderContents}>
            {node.items.map(({ item, index }) => {
              const isActive = index === currentIndex
              return (
                <li
                  key={item.id}
                  className={`${styles.row} ${styles.folderItemRow} ${isActive ? styles.active : ''} ${pulseIds.has(item.id) ? styles.pulse : ''}`}
                  style={
                    {
                      '--i': index,
                      '--depth': `${(depth + 1) * 12}px`,
                    } as RowStyle & DepthStyle
                  }
                >
                  <button
                    type="button"
                    className={styles.item}
                    onClick={() => onPlay(index)}
                    aria-description={item.path}
                    aria-current={isActive ? 'true' : undefined}
                  >
                    {isActive ? (
                      <Play size={12} className={styles.playingIcon} aria-hidden="true" />
                    ) : (
                      <span className={styles.index} aria-hidden="true">
                        {index + 1}
                      </span>
                    )}
                    <span className={styles.name}>{item.name}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.remove}
                    onClick={() => onRemove(item.id)}
                    aria-label={t('playlist.remove', { name: item.name })}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              )
            })}
            {children.map((child) => renderFolder(child, depth + 1))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <aside
      className={`${styles.panel} ${immersive ? styles.immersive : ''} ${closing ? styles.closing : ''} ${droppingFiles ? styles.dropping : ''}`}
      id="playlist-panel"
      aria-label={t('playlist.label')}
      inert={closing ? true : undefined}
      onDragEnter={handleFileDragEnter}
      onDragOver={handleFileDragOver}
      onDragLeave={handleFileDragLeave}
      onDrop={handleFileDrop}
    >
      <header className={styles.header}>
        <h2 className={styles.title}>
          <ListVideo size={14} />
          {t('playlist.title')}
          {items.length > 0 && <span className={styles.count}>{items.length}</span>}
        </h2>
        <div className={styles.viewToggle} role="group" aria-label={t('playlist.viewMode')}>
          <button
            type="button"
            className={`${styles.viewButton} ${view === 'queue' ? styles.viewButtonActive : ''}`}
            onClick={() => onViewChange('queue')}
            aria-label={t('playlist.queueView')}
            aria-pressed={view === 'queue'}
            title={t('playlist.queueView')}
          >
            <List size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={`${styles.viewButton} ${view === 'folders' ? styles.viewButtonActive : ''}`}
            onClick={() => onViewChange('folders')}
            aria-label={t('playlist.folderView')}
            aria-pressed={view === 'folders'}
            title={t('playlist.folderView')}
          >
            <Folder size={14} aria-hidden="true" />
          </button>
        </div>
      </header>

      {loading ? (
        <ul className={styles.skeleton} aria-label={t('playlist.loading')} aria-busy="true">
          {[0, 1, 2].map((slot) => (
            <li key={slot} className={styles.skeletonRow}>
              <span className={styles.skeletonBlock} />
            </li>
          ))}
        </ul>
      ) : items.length === 0 ? (
        <p className={styles.empty}>
          <ListVideo size={28} className={styles.emptyIcon} aria-hidden="true" />
          {t('playlist.empty')}
        </p>
      ) : view === 'folders' ? (
        <ul className={styles.folderTree}>
          {createFolderTree(items, t('playlist.rootFolder')).map((folder) =>
            renderFolder(folder, 0),
          )}
        </ul>
      ) : (
        <ol
          className={styles.list}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          onDragLeave={handleDragLeave}
        >
          {items.map((item, index) => {
            const isActive = index === currentIndex
            const showLineBefore = dropIndex === index && dragIndex !== index
            const showLineAfter =
              dropIndex === index + 1 && dragIndex !== index && index === items.length - 1

            return (
              <li
                key={item.id}
                style={{ '--i': index } as RowStyle}
                draggable
                onDragStart={(event) => handleDragStart(event, index)}
                onDragEnd={resetDrag}
                onDragOver={(event) => handleDragOver(event, index)}
                className={[
                  styles.row,
                  isActive ? styles.active : '',
                  dragIndex === index ? styles.dragging : '',
                  pulseIds.has(item.id) ? styles.pulse : '',
                  showLineBefore ? styles.dropBefore : '',
                  showLineAfter ? styles.dropAfter : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <button
                  type="button"
                  className={styles.item}
                  ref={(node) => {
                    itemRefs.current[index] = node
                  }}
                  onClick={() => onPlay(index)}
                  onKeyDown={(event) => handleItemKeyDown(event, index)}
                  aria-description={t('playlist.itemTitle', { name: item.name })}
                  aria-current={isActive ? 'true' : undefined}
                >
                  <span className={styles.handle} aria-hidden="true">
                    <GripVertical size={12} />
                  </span>
                  {isActive ? (
                    <Play size={12} className={styles.playingIcon} aria-hidden="true" />
                  ) : (
                    <span className={styles.index} aria-hidden="true">
                      {index + 1}
                    </span>
                  )}
                  <span className={styles.name}>{item.name}</span>
                </button>
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => onRemove(item.id)}
                  aria-label={t('playlist.remove', { name: item.name })}
                >
                  <Trash2 size={14} />
                </button>
              </li>
            )
          })}
        </ol>
      )}

      {items.length > 0 && (
        <footer className={styles.footer}>
          <button type="button" className={styles.clear} onClick={onClear}>
            <Trash2 size={14} />
            {t('playlist.clear')}
          </button>
        </footer>
      )}
    </aside>
  )
}

export default PlaylistPanel