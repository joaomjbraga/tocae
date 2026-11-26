import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent, RefObject, WheelEvent } from 'react'

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const ZOOM_STEP = 0.25

type PanPosition = { x: number; y: number }
type PanStart = PanPosition & { pointerX: number; pointerY: number; pointerId: number }
type MediaStyle = CSSProperties & {
  '--zoom': number
  '--pan-x': string
  '--pan-y': string
}

type ZoomableMediaElement = HTMLVideoElement | HTMLImageElement

const INITIAL_PAN: PanPosition = { x: 0, y: 0 }

export function calculateWheelZoom(
  zoom: number,
  pan: PanPosition,
  pointer: PanPosition,
  deltaY: number,
): { zoom: number; pan: PanPosition } {
  const nextZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * Math.exp(-deltaY * 0.0015)))
  if (nextZoom === zoom) return { zoom, pan }

  const ratio = nextZoom / zoom
  return {
    zoom: nextZoom,
    pan: {
      x: pointer.x * (1 - ratio) + pan.x * ratio,
      y: pointer.y * (1 - ratio) + pan.y * ratio,
    },
  }
}

export function useMediaViewport(
  areaRef: RefObject<HTMLElement | null>,
  mediaRef: RefObject<ZoomableMediaElement | null>,
  source: string | null,
  fillLandscape: boolean,
) {
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [pan, setPan] = useState<PanPosition>(INITIAL_PAN)
  const [isPanning, setIsPanning] = useState(false)
  const [isPortrait, setIsPortrait] = useState(false)
  const panStartRef = useRef<PanStart | null>(null)
  const draggedMediaRef = useRef(false)

  useEffect(() => {
    setZoom(MIN_ZOOM)
    setPan(INITIAL_PAN)
    setIsPanning(false)
    setIsPortrait(false)
    panStartRef.current = null
    draggedMediaRef.current = false
  }, [source])

  useEffect(() => {
    const area = areaRef.current
    if (!area) return

    function keepPanInBounds() {
      setPan((position) => clampPan(position, zoom))
    }

    const observer = new ResizeObserver(keepPanInBounds)
    observer.observe(area)
    keepPanInBounds()
    return () => observer.disconnect()
  }, [fillLandscape, isPortrait, zoom])

  function getPanLimits(scale: number): PanPosition {
    const area = areaRef.current?.getBoundingClientRect()
    const media = mediaRef.current
    if (!area || !media) return INITIAL_PAN
    const width = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth
    const height = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight
    if (!width || !height) return INITIAL_PAN

    const fitScale =
      fillLandscape && !isPortrait
        ? Math.max(area.width / width, area.height / height)
        : Math.min(area.width / width, area.height / height)
    return {
      x: Math.max(0, (width * fitScale * scale - area.width) / 2),
      y: Math.max(0, (height * fitScale * scale - area.height) / 2),
    }
  }

  function clampPan(position: PanPosition, scale: number): PanPosition {
    const limits = getPanLimits(scale)
    return {
      x: Math.min(limits.x, Math.max(-limits.x, position.x)),
      y: Math.min(limits.y, Math.max(-limits.y, position.y)),
    }
  }

  function updateZoom(nextZoom: number) {
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom)))
  }

  function handleWheel(event: WheelEvent<HTMLElement>) {
    if (event.deltaY === 0) return
    event.preventDefault()

    const bounds = areaRef.current?.getBoundingClientRect()
    const pointer = bounds
      ? {
          x: event.clientX - (bounds.left + bounds.width / 2),
          y: event.clientY - (bounds.top + bounds.height / 2),
        }
      : INITIAL_PAN
    const transform = calculateWheelZoom(zoom, pan, pointer, event.deltaY)
    if (transform.zoom === zoom) return
    if (bounds) {
      setPan(
        clampPan(transform.pan, transform.zoom),
      )
    }
    setZoom(transform.zoom)
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (zoom === MIN_ZOOM || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    panStartRef.current = {
      ...pan,
      pointerX: event.clientX,
      pointerY: event.clientY,
      pointerId: event.pointerId,
    }
    draggedMediaRef.current = false
    setIsPanning(true)
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    const start = panStartRef.current
    if (!start || start.pointerId !== event.pointerId) return

    const deltaX = event.clientX - start.pointerX
    const deltaY = event.clientY - start.pointerY
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) draggedMediaRef.current = true
    setPan(clampPan({ x: start.x + deltaX, y: start.y + deltaY }, zoom))
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    if (panStartRef.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    panStartRef.current = null
    setIsPanning(false)
  }

  function handlePointerCancel(event: PointerEvent<HTMLElement>) {
    handlePointerUp(event)
    draggedMediaRef.current = false
  }

  const mediaStyle: MediaStyle = {
    '--zoom': zoom,
    '--pan-x': `${pan.x}px`,
    '--pan-y': `${pan.y}px`,
  }

  return {
    zoom,
    isPortrait,
    isPanning,
    draggedMediaRef,
    mediaStyle,
    setMediaDimensions: (width: number, height: number) => setIsPortrait(height > width),
    zoomIn: () => updateZoom(zoom + ZOOM_STEP),
    zoomOut: () => updateZoom(zoom - ZOOM_STEP),
    resetZoom: () => updateZoom(MIN_ZOOM),
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerCancel,
    canZoomIn: zoom < MAX_ZOOM,
    canZoomOut: zoom > MIN_ZOOM,
    canResetZoom: zoom !== MIN_ZOOM,
    isZoomable: zoom > MIN_ZOOM,
  }
}
