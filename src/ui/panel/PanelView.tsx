import {
  type ModuleLibrary,
  type Patch,
  createBlankControl,
  createControlFor,
  createXyFor,
  movePanelControl,
  nodeTitles,
  panelItems,
  removeNode,
  resizePanelControl,
  setNodeDisplay,
  setNodeName,
  setNodeParam,
  setPanelShow,
  spotBelow,
} from '@core'
import { useMemo, useState } from 'react'
import { AddControl, type AddDraft } from './AddControl'
import { ControlCell, type ParamChange } from './ControlCell'
import styles from './panel.module.css'

interface PanelViewProps {
  patch: Patch
  modules: ModuleLibrary
  /** Identifies the graph, so a drag in the panel merges with a drag of the same parameter in the property editor. */
  scope: string
  /** Applies a change to the patch being shown (one undo step per merge key). */
  edit(change: (patch: Patch, modules: ModuleLibrary) => Patch, mergeKey?: string): void
}

/**
 * The front panel: the patch's control nodes as knobs, sliders, pads and switches, arranged. In *Play* the board is just
 * the controls; *Edit* adds the tools to build and arrange it. A control here IS the node: turning it writes the node's
 * value, exactly as the property editor does (the same undo key), so there is nothing to keep in step.
 */
export const PanelView = ({ patch, modules, scope, edit }: PanelViewProps) => {
  const [editing, setEditing] = useState(false)
  const items = useMemo(() => panelItems(patch, modules), [patch, modules])
  const titles = useMemo(() => nodeTitles(patch, modules), [patch, modules])
  const shown = items.filter((item) => item.shown)
  const hidden = items.filter((item) => !item.shown)

  const set = (nodeId: string, changes: readonly ParamChange[]) => {
    // One parameter shares its undo key with the property editor's slider; a pad (two at once) has its own.
    const key = changes.length === 1 && changes[0] ? `param:${scope}:${nodeId}:${changes[0].param}` : `xy:${scope}:${nodeId}`
    edit((current) => changes.reduce((next, change) => setNodeParam(next, nodeId, change.param, change.value), current), key)
  }

  const add = (draft: AddDraft) =>
    edit((current, library) => {
      const at = spotBelow(current, panelItems(current, library).length)
      if (draft.kind === 'switch') return createBlankControl(current, 'switch', at).patch
      if (draft.kind === 'xy') {
        if (draft.x && draft.y) return createXyFor(current, library, { node: draft.x.node, port: draft.x.port }, draft.y, { at })?.patch ?? current
        return createBlankControl(current, 'xy', at).patch
      }
      if (draft.x) {
        const display = draft.kind === 'knob' ? 'knob' : draft.kind
        return createControlFor(current, library, draft.x.node, draft.x.port, { at, display })?.patch ?? current
      }
      return createBlankControl(current, draft.kind, at).patch
    })

  return (
    <div className={styles.panel} data-testid="front-panel" data-editing={editing || undefined}>
      <div className={styles.bar}>
        <button aria-pressed={editing} onClick={() => setEditing((on) => !on)} title={editing ? 'Back to playing' : 'Add, remove and arrange controls'}>
          {editing ? 'Done' : 'Edit panel'}
        </button>
        {editing && <AddControl patch={patch} modules={modules} onAdd={add} />}
      </div>
      {editing && hidden.length > 0 && (
        <div className={styles.hiddenTray} role="group" aria-label="Hidden controls">
          <span className={styles.hint}>Hidden:</span>
          {hidden.map((item) => (
            <button key={item.node.id} aria-label={`Show ${titles.get(item.node.id)}`} onClick={() => edit((current, library) => setPanelShow(current, library, item.node.id, true))}>
              {titles.get(item.node.id)}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <div className={styles.empty}>
          <p>{items.length === 0 ? 'This patch has no controls yet.' : 'Every control is hidden.'}</p>
          <p>
            A control is a node: right-click a parameter socket in the graph and choose <em>Create knob</em>, or use <em>Edit panel</em> to add a
            knob, slider, XY pad or switch here and wire it in the graph.
          </p>
        </div>
      ) : (
        <div className={styles.board} role="group" aria-label="Front panel">
          {shown.map((item, index) => {
            const id = item.node.id
            const position = items.indexOf(item)
            return (
              <ControlCell
                key={id}
                item={item}
                modules={modules}
                title={titles.get(id) ?? item.node.type}
                editing={editing}
                first={index === 0}
                last={index === shown.length - 1}
                onSet={(changes) => set(id, changes)}
                actions={{
                  rename: (name) => edit((current) => setNodeName(current, id, name)),
                  resize: (size) => edit((current, library) => resizePanelControl(current, library, id, size)),
                  setHorizontal: (horizontal) => edit((current) => setNodeDisplay(current, id, horizontal ? 'slider-horizontal' : 'slider')),
                  hide: () => edit((current, library) => setPanelShow(current, library, id, false)),
                  remove: () => edit((current) => removeNode(current, id)),
                  // Moves among the visible ones: the neighbour's place in the whole order is where it goes.
                  move: (delta) => {
                    const neighbour = shown[index + delta]
                    if (neighbour) edit((current, library) => movePanelControl(current, library, id, items.indexOf(neighbour)))
                  },
                  dropped: (draggedId) => edit((current, library) => movePanelControl(current, library, draggedId, position)),
                }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
