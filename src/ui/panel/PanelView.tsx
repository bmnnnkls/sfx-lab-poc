import {
  type ControlDraft,
  type ModuleLibrary,
  type Patch,
  addControl,
  buildPanel,
  moveControl,
  removeControl,
  renameControl,
  resizeControl,
  setControlOrientation,
  setNodeParam,
} from '@core'
import { useMemo, useState } from 'react'
import { AddControl } from './AddControl'
import { ControlCell, type ParamChange } from './ControlCell'
import styles from './panel.module.css'
import { nodeTitles } from './panel-values'

interface PanelViewProps {
  patch: Patch
  modules: ModuleLibrary
  /** Identifies the graph, so a drag in the panel merges with a drag of the same parameter in the graph view. */
  scope: string
  /** Applies a change to the patch being shown (one undo step per merge key). */
  edit(change: (patch: Patch, modules: ModuleLibrary) => Patch, mergeKey?: string): void
}

/**
 * The front panel: the patch's parameters as knobs, sliders, pads and selectors instead of nodes and wires. In *Play* the
 * board is just the controls; *Edit* adds the tools to build it. The board is a view: turning a control sets the node's
 * parameter, exactly as the slider in the graph does.
 */
export const PanelView = ({ patch, modules, scope, edit }: PanelViewProps) => {
  const [editing, setEditing] = useState(false)
  const controls = patch.panel ?? []
  const titles = useMemo(() => nodeTitles(patch, modules), [patch, modules])

  const set = (changes: readonly ParamChange[], mergeKey: string) => {
    // A single parameter shares its undo key with the graph view's slider; a pad (two at once) has its own.
    const key = changes.length === 1 && changes[0] ? `param:${scope}:${changes[0].binding.node}:${changes[0].binding.param}` : `${mergeKey}:${scope}`
    edit(
      (current) => changes.reduce((next, change) => setNodeParam(next, change.binding.node, change.binding.param, change.value), current),
      key,
    )
  }
  const add = (draft: ControlDraft) => edit((current, library) => addControl(current, library, draft))
  const empty = controls.length === 0

  return (
    <div className={styles.panel} data-testid="front-panel" data-editing={editing || undefined}>
      <div className={styles.bar}>
        <button aria-pressed={editing} onClick={() => setEditing((on) => !on)} title={editing ? 'Back to playing' : 'Add, remove and arrange controls'}>
          {editing ? 'Done' : 'Edit panel'}
        </button>
        {editing && (
          <>
            <button
              onClick={() => edit((current, library) => buildPanel(current, library))}
              title="Add a control for every parameter that does not have one yet"
            >
              Build from graph
            </button>
            <AddControl patch={patch} modules={modules} onAdd={add} />
          </>
        )}
      </div>
      {empty ? (
        <div className={styles.empty}>
          <p>This patch has no front panel yet.</p>
          <p>
            <button onClick={() => edit((current, library) => buildPanel(current, library))}>Build from graph</button> makes a control for every
            parameter; then delete the ones you do not want, or use Edit panel to add your own knobs, sliders and XY pads.
          </p>
        </div>
      ) : (
        <div className={styles.board} role="group" aria-label="Front panel">
          {controls.map((control, index) => (
            <ControlCell
              key={control.id}
              control={control}
              patch={patch}
              modules={modules}
              titles={titles}
              editing={editing}
              first={index === 0}
              last={index === controls.length - 1}
              onSet={set}
              actions={{
                rename: (label) => edit((current) => renameControl(current, control.id, label)),
                resize: (size) => edit((current) => resizeControl(current, control.id, size)),
                setOrientation: (orientation) => edit((current) => setControlOrientation(current, control.id, orientation)),
                remove: () => edit((current) => removeControl(current, control.id)),
                move: (delta) => edit((current) => moveControl(current, control.id, index + delta)),
                dropped: (draggedId) => edit((current) => moveControl(current, draggedId, index)),
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
