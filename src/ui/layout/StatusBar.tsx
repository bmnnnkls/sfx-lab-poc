import { useStatusStore } from '@state'
import { useCommandEntries } from '../commands/menu-entries'
import { LAYOUT_MENU } from '../commands/menus'
import { SaveIndicator } from '../file-menu/SaveIndicator'
import { Icon } from '../shared/icon'
import { PopupMenu } from '../shared/menu'
import styles from './StatusBar.module.css'

const layoutEntries = () => useCommandEntries(LAYOUT_MENU)

/**
 * The strip under the layout: an audio failure, whether the project is saved, and the layout menu, built from the
 * same commands as *View ▸ Layouts*: the region toggles, the layouts saved under a name (load, save, delete) and
 * *Reset layout*.
 */
export const StatusBar = () => {
  const audioFailure = useStatusStore((state) => state.audioFailure)

  return (
    <footer className={styles.bar}>
      {audioFailure && (
        <div className={styles.audioFailure} role="alert">
          {audioFailure}. Your project remains available; save or export your work before reloading.
        </div>
      )}
      <span className={styles.spacer} />
      <SaveIndicator />
      <PopupMenu entries={layoutEntries}>
        <button className={styles.menu} aria-label="Layout">
          Layout <Icon name="chevron-down" size={14} />
        </button>
      </PopupMenu>
    </footer>
  )
}
