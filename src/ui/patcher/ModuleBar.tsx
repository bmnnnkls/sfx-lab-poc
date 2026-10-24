import { type ModuleDefinition, moduleUsage } from '@core'
import { commitRename, useProjectStore } from '@state'
import { useActionContext } from '../shared/menu'
import { RenameField } from '../shared/RenameField'
import styles from './Patcher.module.css'

interface ModuleBarProps {
  definition: ModuleDefinition
  interfaceOpen: boolean
  onToggleInterface(): void
  /** Called after the module is deleted, so the editor can step out of it. */
  onDeleted(): void
}

/** Header shown while editing a module's inside: name, where it is used, and the interface toggle. */
export const ModuleBar = ({ definition, interfaceOpen, onToggleInterface, onDeleted }: ModuleBarProps) => {
  const project = useProjectStore((state) => state.project)
  const context = useActionContext()
  const deleteModule = useProjectStore((state) => state.deleteModule)
  const usage = moduleUsage(project, definition.id)

  const where = [...usage.tracks, ...usage.modules]
  return (
    <div className={styles.moduleBar}>
      <label className={styles.voices}>
        Module name
        <RenameField
          className={styles.moduleName}
          name={definition.name}
          label="Module name"
          onCommit={(name) => commitRename({ kind: 'module', moduleId: definition.id }, name, context)}
        />
      </label>
      <span className={styles.usage} data-testid="module-usage">
        {usage.uses === 0
          ? 'Not used yet.'
          : `Used ${usage.uses}× (${where.join(', ')}). Edits here change every use.`}
      </span>
      <button onClick={onToggleInterface} aria-pressed={interfaceOpen}>
        Ports &amp; knobs
      </button>
      <button
        disabled={usage.uses > 0}
        title={usage.uses > 0 ? 'Remove or unlink every use first' : 'Delete this module'}
        onClick={() => {
          deleteModule(definition.id)
          onDeleted()
        }}
      >
        Delete module
      </button>
    </div>
  )
}
