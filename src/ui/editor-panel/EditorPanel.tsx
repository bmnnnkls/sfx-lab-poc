import { useLayoutStore } from '@state'
import { KeptViews } from '../layout/KeptViews'
import { views } from '../layout/views'
import styles from './EditorPanel.module.css'

/** Bottom panel: one tab per view in the panel region, showing the active one. */
export const EditorPanel = () => {
  const panel = useLayoutStore((state) => state.regions.panel)
  const revealView = useLayoutStore((state) => state.revealView)

  return (
    <div className={styles.panel}>
      <nav className={styles.tabs}>
        {panel.views.map((id) => (
          <button key={id} className={id === panel.active ? styles.active : ''} onClick={() => revealView(id)} title={views[id].tooltip}>
            {views[id].title}
          </button>
        ))}
      </nav>
      <div className={styles.body}>
        <KeptViews active={panel.active} />
      </div>
    </div>
  )
}
