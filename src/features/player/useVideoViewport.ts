import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent, RefObject } from 'react'

const MIN_ZOOM = 1
const MAX_ZOOM = 3
const ZOOM_STEP = 0.25

type PanPosition = { x: number; y: number }
type PanStart = PanPosition & { pointerX: number; pointerY: number; pointerId: number }
type VideoStyle = CSSProperties & {
  '--zoom': number
  '--pan-x': string
  '--pan-y': string
}

const INITIAL_PAN: PanPosition = { x: 0, y: 0 }

export function useVideoViewport(
  areaRef: RefObject<HTMLElement | null>,
  videoRef: RefObject<HTMLVideoElement | null>,
  source: string | null,
) {
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [pan, setPan] = useState<PanPosition>(INITIAL_PAN)
  const [isPanning, setIsPanning] = useState(false)
  const [isPortrait, setIsPortrait] = useState(false)
  const panStartRef = useRef<PanStart | null>(null)
  const draggedVideoRef = useRef(false)

  useEffect(() => {
    setZoom(MIN_ZOOM)
    setPan(INITIAL_PAN)
    setIsPanning(false)
    setIsPortrait(false)
    panStartRef.current = null
    draggedVideoRef.current = false
  }, [source])

  useEffect(() => {
    const area = areaRef.current
    if (!area) return

    function keepPanInBounds() {
      setPan((position) => clampPan(position, zoom))
    }

    const observer = new ResizeObserver(keepPanInBounds)
    observer.observe(area)
    return () => observer.disconnect()
  }, [zoom])

  function getPanLimits(scale: number): PanPosition {
    const area = areaRef.current?.getBoundingClientRect()
    const video = videoRef.current
    if (!area || !video?.videoWidth || !video.videoHeight) return INITIAL_PAN

    const fitScale = Math.min(area.width / video.videoWidth, area.height / video.videoHeight)
    return {
      x: Math.max(0, (video.videoWidth * fitScale * scale - area.width) / 2),
      y: Math.max(0, (video.videoHeight * fitScale * scale - area.height) / 2),
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

  function handlePointerDown(event: PointerEvent<HTMLVideoElement>) {
    if (zoom === MIN_ZOOM || event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    panStartRef.current = {
      ...pan,
      pointerX: event.clientX,
      pointerY: event.clientY,
      pointerId: event.pointerId,
    }
    draggedVideoRef.current = false
    setIsPanning(true)
  }

  function handlePointerMove(event: PointerEvent<HTMLVideoElement>) {
    const start = panStartRef.current
    if (!start || start.pointerId !== event.pointerId) return

    const deltaX = event.clientX - start.pointerX
    const deltaY = event.clientY - start.pointerY
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) draggedVideoRef.current = true
    setPan(clampPan({ x: start.x + deltaX, y: start.y + deltaY }, zoom))
  }

  function handlePointerUp(event: PointerEvent<HTMLVideoElement>) {
    if (panStartRef.current?.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    panStartRef.current = null
    setIsPanning(false)
  }

  function handlePointerCancel(event: PointerEvent<HTMLVideoElement>) {
    handlePointerUp(event)
    draggedVideoRef.current = false
  }

  const videoStyle: VideoStyle = {
    '--zoom': zoom,
    '--pan-x': `${pan.x}px`,
    '--pan-y': `${pan.y}px`,
  }

  return {
    zoom,
    isPortrait,
    isPanning,
    draggedVideoRef,
    videoStyle,
    setVideoOrientation: (width: number, height: number) => setIsPortrait(height > width),
    zoomIn: () => updateZoom(zoom + ZOOM_STEP),
    zoomOut: () => updateZoom(zoom - ZOOM_STEP),
    resetZoom: () => updateZoom(MIN_ZOOM),
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
