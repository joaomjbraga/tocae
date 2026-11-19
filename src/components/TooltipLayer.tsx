import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './TooltipLayer.module.css'

type TooltipPlacement = 'top' | 'bottom'

interface TooltipInfo {
  text: string
  left: number
  top: number
  placement: TooltipPlacement
}

const TOOLTIP_ID = 'app-tooltip'

function getTooltipTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  const element = target.closest<HTMLElement>('[data-tooltip]')
  return element?.dataset.tooltip?.trim() ? element : null
}

function getTooltipInfo(target: HTMLElement, text: string): TooltipInfo {
  const rect = target.getBoundingClientRect()
  const margin = Math.min(148, Math.max(8, window.innerWidth / 2 - 8))
  const center = rect.left + rect.width / 2
  const left = Math.max(margin, Math.min(center, window.innerWidth - margin))
  const prefersBottom = target.dataset.tooltipPlacement === 'bottom' || rect.top < 56
  const canPlaceBottom = rect.bottom + 64 <= window.innerHeight - 8
  const placement: TooltipPlacement = prefersBottom && canPlaceBottom ? 'bottom' : 'top'

  return {
    text,
    left,
    top: placement === 'top' ? rect.top - 10 : rect.bottom + 10,
    placement,
  }
}

export function TooltipLayer() {
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null)
  const activeTarget = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let timer: number | null = null
    let pointerDownTarget: HTMLElement | null = null
    let previousDescription: string | null = null
    let describedTarget: HTMLElement | null = null

    const restoreDescription = () => {
      if (!describedTarget) return
      if (previousDescription === null) {
        describedTarget.removeAttribute('aria-describedby')
      } else {
        describedTarget.setAttribute('aria-describedby', previousDescription)
      }
      describedTarget = null
      previousDescription = null
    }

    const hide = () => {
      if (timer !== null) {
        window.clearTimeout(timer)
        timer = null
      }
      activeTarget.current = null
      restoreDescription()
      setTooltip(null)
    }

    const show = (target: HTMLElement, delay: number) => {
      if (activeTarget.current === target) return
      hide()
      activeTarget.current = target
      timer = window.setTimeout(() => {
        timer = null
        if (activeTarget.current !== target || !target.isConnected) return

        const text = target.dataset.tooltip?.trim()
        if (!text) {
          hide()
          return
        }

        describedTarget = target
        previousDescription = target.getAttribute('aria-describedby')
        const descriptionIds = new Set((previousDescription ?? '').split(/\s+/).filter(Boolean))
        descriptionIds.add(TOOLTIP_ID)
        target.setAttribute('aria-describedby', [...descriptionIds].join(' '))
        setTooltip(getTooltipInfo(target, text))
      }, delay)
    }

    const onPointerOver = (event: PointerEvent) => {
      const target = getTooltipTarget(event.target)
      if (target && pointerDownTarget && target !== pointerDownTarget) {
        pointerDownTarget = null
      }
      if (!target || getTooltipTarget(event.relatedTarget) === target) return
      show(target, 450)
    }

    const onPointerOut = (event: PointerEvent) => {
      const target = getTooltipTarget(event.target)
      if (target === pointerDownTarget && getTooltipTarget(event.relatedTarget) !== target) {
        pointerDownTarget = null
      }
      if (
        target &&
        target === activeTarget.current &&
        getTooltipTarget(event.relatedTarget) !== target &&
        document.activeElement !== target
      ) {
        hide()
      }
    }

    const onFocusIn = (event: FocusEvent) => {
      const target = getTooltipTarget(event.target)
      if (target && target !== pointerDownTarget) show(target, 120)
    }

    const onFocusOut = (event: FocusEvent) => {
      const target = getTooltipTarget(event.target)
      if (target && getTooltipTarget(event.relatedTarget) !== target && !target.matches(':hover')) {
        hide()
      }
    }

    const refreshPosition = () => {
      const target = activeTarget.current
      if (!target || !target.isConnected) {
        hide()
        return
      }

      setTooltip((current) => (current ? getTooltipInfo(target, current.text) : current))
    }

    const onPointerDown = (event: PointerEvent) => {
      pointerDownTarget = getTooltipTarget(event.target)
      hide()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') pointerDownTarget = null
    }

    document.addEventListener('pointerover', onPointerOver)
    document.addEventListener('pointerout', onPointerOut)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    document.addEventListener('scroll', refreshPosition, true)
    window.addEventListener('resize', refreshPosition)

    return () => {
      document.removeEventListener('pointerover', onPointerOver)
      document.removeEventListener('pointerout', onPointerOut)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      document.removeEventListener('scroll', refreshPosition, true)
      window.removeEventListener('resize', refreshPosition)
      if (timer !== null) window.clearTimeout(timer)
      restoreDescription()
      activeTarget.current = null
    }
  }, [])

  if (!tooltip) return null

  return createPortal(
    <div
      id={TOOLTIP_ID}
      role="tooltip"
      className={`${styles.tooltip} ${tooltip.placement === 'bottom' ? styles.bottom : styles.top}`}
      style={{ left: tooltip.left, top: tooltip.top }}
    >
      {tooltip.text}
    </div>,
    document.body,
  )
}
