import { useLayoutStore } from '@state'
import type { SyntheticEvent } from 'react'
import { TOGGLED_REGIONS } from './regions'
import styles from './RegionToggles.module.css'

// Clicks on the buttons must not reach the tab strip, which starts drags and maximizes on a double-click.
const stop = (event: SyntheticEvent) => event.stopPropagation()

/**
 * Hide or show the primary sidebar, the panel and the secondary sidebar. At the right end of the panel's tab strip,
 * before its maximize button; the panel's own toggle collapses it to that strip. The status bar's *Layout* menu has
 * the same toggles for when the strip isn't on screen.
 */
export const RegionToggles = () => {
  const hiddenRegions = useLayoutStore((state) => state.hiddenRegions)
  const { toggleRegion } = useLayoutStore.getState()
  return (
    <span className={styles.toggles} data-region-toggles onPointerDown={stop} onDoubleClick={stop} onDragStart={(event) => event.preventDefault()}>
      {TOGGLED_REGIONS.map(({ id, name, glyph }) => (
        <button key={id} onClick={() => toggleRegion(id)} aria-pressed={!hiddenRegions.includes(id)} aria-label={name} title={`Toggle ${name.toLowerCase()}`}>
          {glyph}
        </button>
      ))}
    </span>
  )
}
