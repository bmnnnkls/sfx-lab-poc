import { type ViewId, useLayoutStore } from '@state'
import styles from './ActivityBar.module.css'
import { viewTitles } from './view-titles'

const MAIN: readonly { readonly id: ViewId; readonly glyph: string }[] = [
  { id: 'session', glyph: '▦' },
  { id: 'arrangement', glyph: '▤' },
]

/**
 * The strip beside the layout: show Session or Arrangement. The region toggles sit in the panel's tab strip and the
 * status bar's *Layout* menu, *Reset layout* only in the menu. Text and glyphs only until round 13's icons. The Tab
 * key moves through it rather than switching views.
 */
export const ActivityBar = () => {
  const visible = useLayoutStore((state) => state.visible)
  const { revealView } = useLayoutStore.getState()

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
    </nav>
  )
}
