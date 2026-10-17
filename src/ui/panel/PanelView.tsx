import {
  type ControlOwner,
  type ControlTarget,
  type ControlDomain,
  resolveControlTarget,
  type ModuleLibrary,
  type PanelItem,
  type Patch,
  createBlankControl,
  createControlFor,
  controlParamKey,
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
import { useProjectStore } from '@state'
import { useControlGesture } from '../controls/use-control-gesture'
import { EffectiveValue } from '../controls/EffectiveValue'
import { AddControl, type AddDraft } from './AddControl'
import { ControlCell, type ParamChange } from './ControlCell'
import styles from './panel.module.css'

interface PanelViewProps {
  patch: Patch
  controlOwner?: ControlOwner
  controlDomain?: ControlDomain
  modules: ModuleLibrary
  /** Identifies shared-definition edits; instance controls use explicit gesture transactions. */
  scope: string
  /** The track whose engine reports the live values of indicators (`master` for the master bus); absent inside a module, where there are none. */
  readoutTrack?: string
  /** Applies a change to the patch being shown (one undo step per merge key). */
  edit(change: (patch: Patch, modules: ModuleLibrary) => Patch, mergeKey?: string): void
}

/**
 * The front panel: the patch's control nodes as knobs, sliders, pads and switches, arranged. In *Play* the board is just
 * the controls; *Edit* adds the tools to build and arrange it. A control here IS the node: turning it writes the node's
 * base value through the shared control transaction. Shared-definition edits use the graph editor's edit path.
 */
export const PanelView = ({ patch, modules, scope, readoutTrack, edit, controlOwner, controlDomain }: PanelViewProps) => {
  const gesture = useControlGesture()
  const project = useProjectStore((state) => state.project)
  const controlTarget = (item: PanelItem, paramId: string): ControlTarget | undefined => {
    if (!controlOwner || !controlDomain) return undefined
    const use = item.via && patch.nodes.find((node) => node.id === item.via?.use)
    return { kind: 'graph', owner: controlOwner, domain: controlDomain, path: item.via && use?.moduleId ? [{ nodeId: use.id, moduleId: use.moduleId }] : [], nodeId: item.via?.inner ?? item.node.id, nodeType: item.node.type, paramId }
  }
  const valueParams = (item: PanelItem): readonly string[] => item.kind === 'xy' ? ['x', 'y'] : item.kind === 'switch' ? ['on'] : item.kind === 'selector' ? ['index'] : item.kind === 'knob' || item.kind === 'slider' ? ['value'] : []
  const [editing, setEditing] = useState(false)
  const items = useMemo(() => panelItems(patch, modules), [patch, modules])
  const titles = useMemo(() => nodeTitles(patch, modules), [patch, modules])
  const shown = items.filter((item) => item.shown)
  const hidden = items.filter((item) => !item.shown)
  const ownShown = shown.filter((item) => item.via === undefined)

  const set = (item: PanelItem, changes: readonly ParamChange[]) => {
    const changesWithTargets = changes.flatMap((change) => {
      const target = controlTarget(item, change.param)
      return target ? [{ target, value: change.value }] : []
    })
    if (changesWithTargets.length === changes.length) { gesture.change(changesWithTargets); return }
    // A control inside a module is set on the use of the module (`<inner>:<param>`, as a module knob is); its own value is the default.
    const target = item.via?.use ?? item.node.id
    const name = (param: string) => (item.via ? controlParamKey(item.via.inner, param) : param)
    // One parameter shares its undo key with the property editor's slider; a pad (two at once) has its own.
    const key = changes.length === 1 && changes[0] ? `param:${scope}:${target}:${name(changes[0].param)}` : `xy:${scope}:${target}:${item.via?.inner ?? ''}`
    edit((current) => changes.reduce((next, change) => setNodeParam(next, target, name(change.param), change.value), current), key)
  }

  const add = (draft: AddDraft) =>
    edit((current, library) => {
      const at = spotBelow(current, panelItems(current, library).length)
      if (draft.kind !== 'knob' && draft.kind !== 'slider' && draft.kind !== 'slider-horizontal' && draft.kind !== 'xy') return createBlankControl(current, draft.kind, at).patch
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
    <div {...gesture.events} className={styles.panel} data-testid="front-panel" data-editing={editing || undefined}>
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
          {shown.map((item) => {
            const id = item.node.id
            const position = items.indexOf(item)
            const ownIndex = ownShown.indexOf(item)
            return (
              <ControlCell
                key={id}
                midiTargets={valueParams(item).flatMap((param) => { const target = controlTarget(item, param); return target ? [target] : [] })}
                item={(() => {
                  const params = { ...item.node.params }
                  for (const param of valueParams(item)) {
                    const target = controlTarget(item, param)
                    const resolved = target && resolveControlTarget(project, target)
                    if (resolved?.status === 'available') params[param] = resolved.baseValue
                  }
                  return { ...item, node: { ...item.node, params } }
                })()}
                feedback={valueParams(item).map((param) => {
                  const target = controlTarget(item, param)
                  return target ? <EffectiveValue key={param} target={target} /> : null
                })}
                modules={modules}
                title={item.title ?? titles.get(id) ?? item.node.type}
                editing={editing}
                readoutTrack={readoutTrack}
                first={ownIndex === 0}
                last={ownIndex === ownShown.length - 1}
                onSet={(changes) => set(item, changes)}
                actions={{
                  rename: (name) => edit((current) => setNodeName(current, id, name)),
                  resize: (size) => edit((current, library) => resizePanelControl(current, library, id, size)),
                  setHorizontal: (horizontal) => edit((current) => setNodeDisplay(current, id, horizontal ? 'slider-horizontal' : 'slider')),
                  hide: () => edit((current, library) => setPanelShow(current, library, id, false)),
                  remove: () => edit((current) => removeNode(current, id)),
                  // Moves among the visible ones: the neighbour's place in the whole order is where it goes.
                  move: (delta) => {
                    const neighbour = ownShown[ownIndex + delta]
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
