import { type ModuleLibrary, nodeDefinitions } from '@core'
import styles from './Patcher.module.css'

interface NodePaletteProps {
  /** Modules that may be placed in the patch being edited. */
  modules: ModuleLibrary
  onAdd(type: string): void
  onAddModule(moduleId: string): void
}

/** One button per node type, then one per module; clicking adds that node to the patch. */
export const NodePalette = ({ modules, onAdd, onAddModule }: NodePaletteProps) => (
  <div className={styles.palette}>
    <span className={styles.paletteLabel}>Add</span>
    {nodeDefinitions.map((definition) => (
      <button key={definition.type} onClick={() => onAdd(definition.type)}>
        {definition.label}
      </button>
    ))}
    {modules.length > 0 && <span className={styles.paletteLabel}>Modules</span>}
    {modules.map((module) => (
      <button key={module.id} onClick={() => onAddModule(module.id)} title="Add a use of this module">
        {module.name}
      </button>
    ))}
  </div>
)
