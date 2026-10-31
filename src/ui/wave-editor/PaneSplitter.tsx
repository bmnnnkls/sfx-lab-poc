import { useWavePanesStore } from '@state'
import { type KeyboardEvent, type PointerEvent, type RefObject, useRef } from 'react'
import styles from './WaveEditor.module.css'

/** What ↑ and ↓ move the splitter by, as a share of the height. */
const KEY_STEP = 0.05

/** The least height a pane's lanes keep while the editor is split, in pixels (the CSS says the same). */
export const LANES_MIN_PX = 24

/**
 * The first pane's share of `total` pixels, kept so each pane has at least its minimum (`minFirst`, `minSecond`). When
 * the two minimums don't fit, they share what there is in proportion, so neither pane is hidden.
 */
export const clampShare = (share: number, total: number, minFirst: number, minSecond: number): number => {
  if (total <= 0) return share
  if (minFirst + minSecond >= total) return minFirst / (minFirst + minSecond)
  return Math.min(1 - minSecond / total, Math.max(minFirst / total, share))
}

/** A pane's smallest height: what it has besides its lanes, and the lanes at their least. */
const minHeightOf = (pane: Element | undefined) => {
  if (!pane) return 0
  const lanes = pane.querySelector('[data-testid="wave-detail"]')
  return pane.clientHeight - (lanes?.clientHeight ?? 0) + LANES_MIN_PX
}

/**
 * The bar between the editor's two panes: a drag sets the first pane's share of the height, ↑ and ↓ move it by 5 %, and
 * a double-click returns it to half. A `separator`, like the docking shell's splitters, so Tab passes it as chrome.
 */
export const PaneSplitter = ({ panes }: { panes: RefObject<HTMLDivElement | null> }) => {
  const share = useWavePanesStore((state) => state.second.share)
  const drag = useRef<{ top: number; total: number } | null>(null)

  /** Sets the share, kept inside what the panes' minimums allow. */
  const setShare = (next: number) => {
    const element = panes.current
    const [first, , second] = element ? Array.from(element.children) : []
    const total = element ? element.clientHeight - (element.children[1]?.clientHeight ?? 0) : 0
    useWavePanesStore.getState().setSecond({ share: clampShare(next, total, minHeightOf(first), minHeightOf(second)) })
  }

  return (
    <div
      className={styles.splitter}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the panes"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(share * 100)}
      tabIndex={0}
      title="Drag to resize the panes; double-click for half and half"
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || !panes.current) return
        const box = panes.current.getBoundingClientRect()
        drag.current = { top: box.top, total: box.height }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const current = drag.current
        if (current) setShare((event.clientY - current.top) / current.total)
      }}
      onPointerUp={(event) => {
        drag.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => void (drag.current = null)}
      onDoubleClick={() => setShare(0.5)}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
        event.preventDefault()
        setShare(share + (event.key === 'ArrowUp' ? -KEY_STEP : KEY_STEP))
      }}
    />
  )
}
