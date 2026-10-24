import { useLayoutStore } from '@state'
import styles from './ActivityBar.module.css'

/** The strip beside the layout. Text and glyphs only until round 8's icons. */
export const ActivityBar = () => {
  const resetLayout = useLayoutStore((state) => state.resetLayout)
  return (
    <nav className={styles.bar} aria-label="Views">
      <button className={styles.end} onClick={resetLayout} aria-label="Reset layout" title="Reset layout">
        ⟲
      </button>
    </nav>
  )
}
