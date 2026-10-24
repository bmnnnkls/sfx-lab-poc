import { type ViewId, useLayoutStore } from '@state'
import { TOGGLED_REGIONS } from './regions'
import styles from './ActivityBar.module.css'
import { viewTitles } from './view-titles'

const MAIN: readonly { readonly id: ViewId; readonly glyph: string }[] = [
  { id: 'session', glyph: '▦' },
  { id: 'arrangement', glyph: '▤' },
]

/**
 * The strip beside the layout: show Session or Arrangement, hide or show the panel and the sidebars, reset the
 * layout. Text and glyphs only until round 8's icons. The Tab key moves through it rather than switching views.
 */
export const ActivityBar = () => {
  const visible = useLayoutStore((state) => state.visible)
  const hiddenRegions = useLayoutStore((state) => state.hiddenRegions)
  const { revealView, toggleRegion, resetLayout } = useLayoutStore.getState()

  return (
    <nav className={styles.bar} aria-label="Views" data-activity-bar>
      {MAIN.map(({ id, glyph }) => (
        <button
          key={id}
          className={visible.includes(id) ? styles.showing : undefined}
          onClick={() => revealView(id)}
          aria-label={viewTitles[id]}
          title={`Show ${viewTitles[id]}`}
        >
          {glyph}
        </button>
      ))}
      <hr className={styles.separator} />
      {TOGGLED_REGIONS.map(({ id, name, glyph }) => (
        <button key={id} onClick={() => toggleRegion(id)} aria-pressed={!hiddenRegions.includes(id)} aria-label={name} title={`Toggle ${name.toLowerCase()}`}>
          {glyph}
        </button>
      ))}
      <button className={styles.end} onClick={resetLayout} aria-label="Reset layout" title="Reset layout">
        ⟲
      </button>
    </nav>
  )
}
