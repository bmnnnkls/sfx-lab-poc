import type { ModuleLibrary } from '@core'
import styles from './Patcher.module.css'

interface NodePaletteProps {
  /** The kinds of node that can be added to the graph being edited. */
  definitions: readonly { type: string; label: string; description?: string }[]
  /** Modules that may be placed in the graph being edited. */
  modules: ModuleLibrary
  onAdd(type: string): void
  onAddModule(moduleId: string): void
}

/** One button per node type, then one per module; clicking adds that node to the graph. */
export const NodePalette = ({ definitions, modules, onAdd, onAddModule }: NodePaletteProps) => (
  <div className={styles.palette}>
    <span className={styles.paletteLabel}>Add</span>
    {definitions.map((definition) => (
      <button key={definition.type} onClick={() => onAdd(definition.type)} data-tooltip={definition.description}>
        {definition.label}
      </button>
    ))}
    {modules.length > 0 && <span className={styles.paletteLabel}>Modules</span>}
    {modules.map((module) => (
      <button key={module.id} onClick={() => onAddModule(module.id)} data-tooltip="Add a use of this module.">
        {module.name}
      </button>
    ))}
  </div>
)
