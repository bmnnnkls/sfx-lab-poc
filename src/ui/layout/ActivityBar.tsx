import { type ViewId, useLayoutStore } from '@state'
import { useSpringLoad } from '../shared/drag'
import styles from './ActivityBar.module.css'
import { viewTitles } from './view-titles'

const VIEWS: readonly { readonly id: ViewId; readonly glyph: string }[] = [
  { id: 'session', glyph: '▦' },
  { id: 'arrangement', glyph: '▤' },
  { id: 'wave', glyph: '∿' },
  { id: 'library', glyph: '▥' },
  { id: 'tracks', glyph: '☰' },
]

/**
 * A button shows its view wherever it is docked. If the view is already the open tab of a sidebar, the button hides
 * that sidebar instead, as VS Code's activity bar does; in the editor area and the panel a second click changes
 * nothing.
 */
const activate = (id: ViewId) => {
  const { groups, visible, revealView, toggleRegion } = useLayoutStore.getState()
  const region = groups.find((group) => group.views.includes(id))?.region
  if ((region === 'primary' || region === 'secondary') && visible.includes(id)) toggleRegion(region)
  else revealView(id)
}

/**
 * The strip beside the layout: Session, Arrangement, the wave editor, the library and the tracks, each marked while
 * it shows. The region toggles sit in the panel's tab strip and the status bar's *Layout* menu, *Reset layout* only in
 * the menu. Text and glyphs only until round 13's icons. The Tab key moves through it rather than switching views.
 */
export const ActivityBar = () => {
  const visible = useLayoutStore((state) => state.visible)
  // A drag of ours held on a button shows its view, wherever it is docked.
  const springLoad = useSpringLoad(
    (element) => element.closest<HTMLElement>('[data-view-button]')?.dataset.viewButton as ViewId | undefined,
    (id) => {
      if (!useLayoutStore.getState().visible.includes(id)) useLayoutStore.getState().revealView(id)
    },
  )

  return (
    <nav className={styles.bar} aria-label="Views" data-activity-bar {...springLoad}>
      {VIEWS.map(({ id, glyph }) => (
        <button
          key={id}
          className={visible.includes(id) ? styles.showing : undefined}
          onClick={() => activate(id)}
          aria-label={viewTitles[id]}
          data-view-button={id}
          title={`Show ${viewTitles[id]}`}
        >
          {glyph}
        </button>
      ))}
    </nav>
  )
}
