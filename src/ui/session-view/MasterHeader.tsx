import { MASTER_IN_TYPE, TRACK_OUT_TYPE, describeNode } from '@core'
import { useProjectStore, useSelectionStore } from '@state'
import styles from './SessionView.module.css'

/** The master bus at the end of the session grid: select it to edit the effects on the final mix. */
export const MasterHeader = () => {
  const modules = useProjectStore((state) => state.project.modules)
  const fx = useProjectStore((state) => state.project.master.fx)
  const selected = useSelectionStore((state) => state.master)
  const selectMaster = useSelectionStore((state) => state.selectMaster)
  const effects = fx.nodes.filter((node) => node.type !== MASTER_IN_TYPE && node.type !== TRACK_OUT_TYPE)

  return (
    <div className={`${styles.header} ${styles.masterHeader} ${selected ? styles.selected : ''}`}>
      <button className={styles.trackName} onClick={selectMaster} title="Effects on the final mix of all tracks">
        Master
      </button>
      {effects.length > 0 && (
        <button
          className={styles.fxBadge}
          title={`Effects: ${effects.map((node) => describeNode(node, modules)?.label ?? node.type).join(', ')}`}
          aria-label={`Master has ${effects.length} effect${effects.length === 1 ? '' : 's'}`}
          onClick={selectMaster}
        >
          fx {effects.length}
        </button>
      )}
    </div>
  )
}
