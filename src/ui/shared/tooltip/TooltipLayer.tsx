import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { placeTooltip } from './tooltip-position'
import styles from './TooltipLayer.module.css'

/** How long the pointer rests on something before its tooltip shows. Keyboard focus shows it at once. */
const DELAY_MS = 350
const TOOLTIP_ID = 'app-tooltip'

interface Shown {
  readonly target: Element
  readonly text: string
}

const tooltipOf = (node: EventTarget | null): Element | null => (node instanceof Element ? node.closest('[data-tooltip]') : null)

/**
 * The one tooltip of the app. Anything with a `data-tooltip` attribute gets it (one line of the text per row), so a
 * component needs no wrapper and no state: it states its words and this layer shows them under the pointer or the focus.
 * It hides when the pointer leaves, on press, on scroll and on Escape, and links itself to its target with
 * `aria-describedby` while it shows. Touch does not hover, so it is left alone.
 */
export const TooltipLayer = () => {
  const [shown, setShown] = useState<Shown | null>(null)
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let timer: number | undefined
    const hide = () => {
      window.clearTimeout(timer)
      setShown(null)
    }
    const show = (target: Element, after: number) => {
      window.clearTimeout(timer)
      const text = target.getAttribute('data-tooltip')
      if (!text) return
      timer = window.setTimeout(() => setShown({ target, text }), after)
    }
    const over = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const target = tooltipOf(event.target)
      if (!target) return hide()
      show(target, DELAY_MS)
    }
    const out = (event: PointerEvent) => {
      const target = tooltipOf(event.target)
      if (target && !target.contains(event.relatedTarget as Node | null)) hide()
    }
    const focus = (event: FocusEvent) => {
      const target = tooltipOf(event.target)
      if (target && (event.target as Element).matches(':focus-visible')) show(target, 0)
    }
    const keys = (event: KeyboardEvent) => event.key === 'Escape' && hide()

    document.addEventListener('pointerover', over)
    document.addEventListener('pointerout', out)
    document.addEventListener('pointerdown', hide, true)
    document.addEventListener('focusin', focus)
    document.addEventListener('focusout', hide)
    document.addEventListener('keydown', keys)
    document.addEventListener('scroll', hide, true)
    window.addEventListener('blur', hide)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerover', over)
      document.removeEventListener('pointerout', out)
      document.removeEventListener('pointerdown', hide, true)
      document.removeEventListener('focusin', focus)
      document.removeEventListener('focusout', hide)
      document.removeEventListener('keydown', keys)
      document.removeEventListener('scroll', hide, true)
      window.removeEventListener('blur', hide)
    }
  }, [])

  // Link the target to the tooltip while it shows; undone when it hides or the target goes away.
  useEffect(() => {
    if (!shown) return
    const previous = shown.target.getAttribute('aria-describedby')
    shown.target.setAttribute('aria-describedby', TOOLTIP_ID)
    return () => {
      if (previous === null) shown.target.removeAttribute('aria-describedby')
      else shown.target.setAttribute('aria-describedby', previous)
    }
  }, [shown])

  // Measured after it renders (hidden until then), so it can be placed by its real size.
  useLayoutEffect(() => {
    if (!shown || !box.current || !shown.target.isConnected) {
      setPosition(null)
      return
    }
    const target = shown.target.getBoundingClientRect()
    const size = box.current.getBoundingClientRect()
    setPosition(placeTooltip(target, size, { width: window.innerWidth, height: window.innerHeight }))
  }, [shown])

  if (!shown) return null
  return (
    <div
      ref={box}
      id={TOOLTIP_ID}
      role="tooltip"
      className={styles.tooltip}
      style={position ? { left: position.x, top: position.y } : { visibility: 'hidden' }}
    >
      {shown.text.split('\n').map((line, index) => (
        <div key={index} className={index === 0 ? styles.first : styles.row}>
          {line}
        </div>
      ))}
    </div>
  )
}
