import { useLayoutStore, useStatusStore } from '@state'
import { useState } from 'react'
import { SaveIndicator } from '../file-menu/SaveIndicator'
import { type MenuEntry, PopupMenu } from '../shared/menu'
import { TOGGLED_REGIONS } from './regions'
import { SaveLayoutDialog } from './SaveLayoutDialog'
import styles from './StatusBar.module.css'
import type { LayoutPersistence } from './use-layout-persistence'

/**
 * The strip under the layout: an audio failure, whether the project is saved, and the layout menu: the region
 * toggles, the layouts saved under a name (load, save, delete) and *Reset layout*.
 */
export const StatusBar = ({ persistence }: { persistence: LayoutPersistence }) => {
  const audioFailure = useStatusStore((state) => state.audioFailure)
  const hiddenRegions = useLayoutStore((state) => state.hiddenRegions)
  const { toggleRegion, resetLayout, loadLayout, saveLayoutAs } = useLayoutStore.getState()
  // Only this menu changes the saved names, so it reads them once and after each change.
  const [names, setNames] = useState(() => persistence.names())
  const [saving, setSaving] = useState(false)

  const entries: MenuEntry[] = [
    ...TOGGLED_REGIONS.map(({ id, name }) => ({
      label: `${hiddenRegions.includes(id) ? 'Show' : 'Hide'} ${name.toLowerCase()}`,
      onSelect: () => toggleRegion(id),
    })),
    { kind: 'separator' },
    ...names.map((name) => ({ label: name, onSelect: () => loadLayout(name) })),
    { label: 'Save layout as…', onSelect: () => setSaving(true) },
    ...(names.length > 0
      ? [{
          kind: 'submenu' as const,
          label: 'Delete…',
          entries: names.map((name) => ({
            label: name,
            danger: true,
            onSelect: () => {
              persistence.deleteNamed(name)
              setNames(persistence.names())
            },
          })),
        }]
      : []),
    { kind: 'separator' },
    { label: 'Reset layout', onSelect: resetLayout },
  ]

  return (
    <footer className={styles.bar}>
      {audioFailure && (
        <div className={styles.audioFailure} role="alert">
          {audioFailure}. Your project remains available; save or export your work before reloading.
        </div>
      )}
      <span className={styles.spacer} />
      <SaveIndicator />
      <PopupMenu entries={entries}>
        <button className={styles.menu} aria-label="Layout">
          Layout ▾
        </button>
      </PopupMenu>
      {saving && (
        <SaveLayoutDialog
          names={names}
          onSave={(name) => {
            saveLayoutAs(name)
            setNames(persistence.names())
          }}
          onClose={() => setSaving(false)}
        />
      )}
    </footer>
  )
}
