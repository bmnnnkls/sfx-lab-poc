import { useLayoutStore, useStatusStore } from '@state'
import { SaveIndicator } from '../file-menu/SaveIndicator'
import { PopupMenu } from '../shared/menu'
import { TOGGLED_REGIONS } from './regions'
import styles from './StatusBar.module.css'

/** The strip under the layout: an audio failure, whether the project is saved, and the layout menu. */
export const StatusBar = () => {
  const audioFailure = useStatusStore((state) => state.audioFailure)
  const hiddenRegions = useLayoutStore((state) => state.hiddenRegions)
  const { toggleRegion, resetLayout } = useLayoutStore.getState()

  return (
    <footer className={styles.bar}>
      {audioFailure && (
        <div className={styles.audioFailure} role="alert">
          {audioFailure}. Your project remains available; save or export your work before reloading.
        </div>
      )}
      <span className={styles.spacer} />
      <SaveIndicator />
      <PopupMenu
        entries={[
          ...TOGGLED_REGIONS.map(({ id, name }) => ({
            label: `${hiddenRegions.includes(id) ? 'Show' : 'Hide'} ${name.toLowerCase()}`,
            onSelect: () => toggleRegion(id),
          })),
          { kind: 'separator' as const },
          { label: 'Reset layout', onSelect: resetLayout },
        ]}
      >
        <button className={styles.menu} aria-label="Layout">
          Layout ▾
        </button>
      </PopupMenu>
    </footer>
  )
}
