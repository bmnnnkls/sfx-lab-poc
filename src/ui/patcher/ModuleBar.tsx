import { type ModuleDefinition, moduleUsage } from '@core'
import { type Subject, commitRename, runAction, useProjectStore, useRenameStore } from '@state'
import { ActionMenu, useActionContext } from '../shared/menu'
import { RenameField, useRenaming } from '../shared/RenameField'
import styles from './Patcher.module.css'

interface ModuleBarProps {
  definition: ModuleDefinition
  interfaceOpen: boolean
}

/**
 * Header shown while editing a module's inside: name, where it is used, and the interface toggle. Its buttons and its
 * menu run the module's actions; a deleted module's inside closes by itself, since its path no longer leads anywhere.
 */
export const ModuleBar = ({ definition, interfaceOpen }: ModuleBarProps) => {
  const project = useProjectStore((state) => state.project)
  const context = useActionContext()
  const subject: Subject = { kind: 'module', moduleId: definition.id }
  // *Rename* from the menu selects the name in the field that is always here.
  const renaming = useRenaming(subject)
  const usage = moduleUsage(project, definition.id)

  const where = [...usage.tracks, ...usage.modules]
  return (
    <ActionMenu subject={subject}>
    <div className={styles.moduleBar}>
      <label className={styles.voices}>
        Module name
        <RenameField
          key={renaming ? 'renaming' : 'name'}
          className={styles.moduleName}
          name={definition.name}
          label="Module name"
          select={renaming}
          onCommit={(name) => commitRename(subject, name, context)}
          onDone={renaming ? () => useRenameStore.getState().stop() : undefined}
        />
      </label>
      <span className={styles.usage} data-testid="module-usage">
        {usage.uses === 0
          ? 'Not used yet.'
          : `Used ${usage.uses}× (${where.join(', ')}). Edits here change every use.`}
      </span>
      <button onClick={() => runAction('module.toggle-interface', subject, context)} aria-pressed={interfaceOpen}>
        Ports &amp; knobs
      </button>
      <button
        disabled={usage.uses > 0}
        title={usage.uses > 0 ? 'Remove or unlink every use first' : 'Delete this module'}
        onClick={() => runAction('module.delete', subject, context)}
      >
        Delete module
      </button>
    </div>
    </ActionMenu>
  )
}
