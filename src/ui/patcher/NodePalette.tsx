import { nodeDefinitions } from '@core'
import styles from './Patcher.module.css'

/** One button per node type; clicking adds that node to the patch. */
export const NodePalette = ({ onAdd }: { onAdd(type: string): void }) => (
  <div className={styles.palette}>
    <span className={styles.paletteLabel}>Add</span>
    {nodeDefinitions.map((definition) => (
      <button key={definition.type} onClick={() => onAdd(definition.type)}>
        {definition.label}
      </button>
    ))}
  </div>
)
