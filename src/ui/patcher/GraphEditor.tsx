import {
  type ModuleLibrary,
  type Patch,
  type PortRef,
  type PatchTarget,
  type Track,
  type TrackGraph,
  addNode,
  connect,
  containsModule,
  createControlFor,
  createModuleUse,
  createNode,
  describeNode,
  disconnect,
  moduleDomain,
  moveNode,
  removeNode,
  setNodeParam,
  exampleModules,
  findExampleModule,
  randomizeParams,
} from '@core'
import { useProjectStore } from '@state'
import { type ReactNode, useRef, useState } from 'react'
import { PanelView } from '../panel/PanelView'
import type { MenuEntry } from '../shared/menu'
import { useStoredState } from '../shared/use-stored-state'
import { ModuleBar } from './ModuleBar'
import { ModuleInterface } from './ModuleInterface'
import { type Catalog, buildCatalog } from './node-catalog'
import { paletteFor } from './palette'
import { PatchCanvas, type PatchCanvasHandle } from './PatchCanvas'
import { QuickAdd } from './QuickAdd'
import { NODE_WIDTH, type Point } from './geometry'
import { RandomizeBar } from './RandomizeBar'
import { PropertyEditor } from './PropertyEditor'
import { centredOn, freeSpot } from './placement'
import { targetInput } from './wire-drop'
import styles from './Patcher.module.css'

type PatchEdit = (patch: Patch, modules: ModuleLibrary) => Patch

const SUFFIX: Record<TrackGraph, string> = { patch: '', fx: ' effects', notes: ' notes' }

const graphOf = (track: Track, graph: TrackGraph): Patch =>
  graph === 'fx' || track.kind !== 'instrument' ? track.fx : graph === 'notes' ? track.noteGraph : track.patch

const VOICE_OPTIONS = [1, 2, 3, 4, 6, 8, 12, 16]

const isFlag = (value: unknown): value is boolean => typeof value === 'boolean'

type View = 'graph' | 'panel'
const isView = (value: unknown): value is View => value === 'graph' || value === 'panel'

interface GraphEditorProps {
  /** The track whose graph is edited, or `master` for the master bus's. */
  owner: Track | 'master'
  /**
   * `patch`: the instrument's sound patch. `fx`: the track's insert graph (any track). `notes`: the note graph
   * between the clips and the instrument.
   */
  graph: TrackGraph
  /** Shown beside the canvas (the notes tab puts its preview here). */
  aside?: ReactNode
}

/**
 * Node editor for one track's sound patch or note graph, or (one level at a time) the inside of a module it uses.
 * Both kinds of graph share everything: selecting, wiring, grouping into modules, editing modules in place.
 */
export const GraphEditor = ({ owner, graph, aside }: GraphEditorProps) => {
  const track = owner === 'master' ? undefined : owner
  const masterFx = useProjectStore((state) => state.project.master.fx)
  const domain = graph === 'notes' ? 'notes' : 'audio'
  const modules = useProjectStore((state) => state.project.modules)
  const store = useProjectStore.getState
  const setTrackVoices = useProjectStore((state) => state.setTrackVoices)

  const [path, setPath] = useState<readonly string[]>([])
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [interfaceOpen, setInterfaceOpen] = useState(true)
  // The node picker: where it opens (window pixels) and where the node goes (canvas coordinates).
  const [picker, setPicker] = useState<{ anchor: Point; at: Point; fromButton: boolean; from?: PortRef } | null>(null)
  const canvas = useRef<PatchCanvasHandle>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  // Remembered per kind of graph (instrument, effects, notes), not per track: it is a way of looking, not part of the project.
  const [view, setView] = useStoredState<View>(`sfxlab.view.${graph}`, 'graph', isView)
  // Parameter sockets are drawn only when wired, unless this is on; also a way of looking, so not in the project.
  const [showSockets, setShowSockets] = useStoredState<boolean>('sfxlab.sockets', false, isFlag)

  // A module that disappeared (undo, delete) ends the path there.
  const missing = path.findIndex((id) => !modules.some((module) => module.id === id))
  const known = missing === -1 ? path : path.slice(0, missing)
  const definition = modules.find((module) => module.id === known.at(-1))
  const target: PatchTarget = definition ? { moduleId: definition.id } : track ? { trackId: track.id, graph } : { master: true }
  const patch = definition ? definition.patch : track ? graphOf(track, graph) : masterFx
  const scope = definition ? definition.id : `${track?.id ?? 'master'}:${graph}`
  // Indicators show live values reported per track (the master bus is `master`); a module's inside has no track of its own.
  const readoutTrack = definition ? undefined : (track?.id ?? 'master')

  const enter = (next: readonly string[]) => {
    setPath(next)
    setSelected(new Set())
  }
  const edit = (change: PatchEdit, mergeKey?: string) => {
    if (definition) store().updateModulePatch(definition.id, change, mergeKey)
    else if (!track) store().updateMasterFx(change, mergeKey)
    else if (graph === 'notes') store().updateNoteGraph(track.id, change, mergeKey)
    else if (graph === 'fx') store().updateFx(track.id, change, mergeKey)
    else store().updatePatch(track.id, change, mergeKey)
  }

  // Modules of the other kind (sound vs notes) cannot be placed here; an empty one fits either.
  const placeable = modules.filter((module) => {
    const kind = moduleDomain(module, modules)
    return (kind === undefined || kind === domain) && !(definition && containsModule(modules, module.id, definition.id))
  })
  const title = track ? `${track.name}${SUFFIX[graph]}` : 'Master effects'
  const crumbs = [{ label: title, path: [] as string[] }].concat(
    known.map((id, index) => ({
      label: modules.find((module) => module.id === id)?.name ?? '',
      path: known.slice(0, index + 1) as string[],
    })),
  )
  const palette = paletteFor(graph, track?.kind ?? 'master')
  // A wire dropped on empty canvas: the picker offers only what can take it, and wires the new node in.
  const dropped = picker?.from
  const droppedNode = dropped && patch.nodes.find((node) => node.id === dropped.node)
  const droppedKind = droppedNode && describeNode(droppedNode, modules)?.outputs.find((port) => port.id === dropped.port)?.kind
  const droppedLabel = droppedNode && `${describeNode(droppedNode, modules)?.label ?? ''} ${describeNode(droppedNode, modules)?.outputs.find((port) => port.id === dropped?.port)?.label ?? ''}`.trim()
  const accepts = (shape: ReturnType<typeof describeNode>) => dropped === undefined || (shape !== undefined && targetInput(shape, droppedKind) !== undefined)
  const catalog: Catalog | null = picker
    ? buildCatalog(
        palette.filter((definition) => accepts(describeNode(createNode(definition.type, 0, 0), modules))),
        placeable.filter((module) => accepts(describeNode(createModuleUse(module, 0, 0), modules))),
        // Examples ship with the app; they are sound modules, and a dropped wire is not offered them (a use is placed, then wired by hand).
        domain === 'audio' && dropped === undefined ? exampleModules : [],
      )
    : null

  const closePicker = () => {
    if (picker?.fromButton) addButton.current?.focus()
    setPicker(null)
  }
  /** Adds what the picker chose where it was asked for, selects it and, for a dropped wire, wires it in. */
  const addFromPicker = (entry: { kind: 'node' | 'module' | 'example'; ref: string }) => {
    if (!picker) return
    const wanted = picker.from ? { x: picker.at.x + 16, y: Math.max(0, picker.at.y - 40) } : centredOn(picker.at)
    const { x, y } = freeSpot(patch, modules, wanted)
    if (entry.kind === 'example') {
      const example = findExampleModule(entry.ref)
      if (example) store().addExampleModule(target, example.definition, x, y)
      setPicker(null)
      return
    }
    const module = entry.kind === 'module' ? modules.find((candidate) => candidate.id === entry.ref) : undefined
    if (entry.kind === 'module' && !module) return
    if (module && !picker.from) {
      store().addModuleUse(target, entry.ref, x, y)
    } else {
      const node = module ? createModuleUse(module, x, y) : createNode(entry.ref, x, y)
      const from = picker.from
      edit((current, library) => {
        const added = addNode(current, node)
        const input = from && targetInput(describeNode(node, library)!, droppedKind)
        return from && input ? connect(added, from, { node: node.id, port: input.id }, { modules: library }) : added
      })
      setSelected(new Set([node.id]))
    }
    setPicker(null)
  }

  /** "Create knob / slider" on a parameter: a control to the left of the node, set up from the parameter and wired in. */
  const createControl = (nodeId: string, paramId: string, display: 'knob' | 'slider') => {
    const node = patch.nodes.find((candidate) => candidate.id === nodeId)
    if (!node) return
    const at = freeSpot(patch, modules, { x: Math.max(0, node.x - NODE_WIDTH - 40), y: node.y })
    const made = createControlFor(patch, modules, nodeId, paramId, { at, display })
    if (!made) return
    edit(() => made.patch)
    setSelected(new Set([made.controlId]))
  }
  /** Removes every wire into one port (a socket may have several). */
  const disconnectPort = (nodeId: string, portId: string) =>
    edit((current) =>
      current.connections
        .filter((connection) => connection.to.node === nodeId && connection.to.port === portId)
        .reduce((next, connection) => disconnect(next, connection.id), current),
    )
  const inputMenu = (nodeId: string, portId: string): readonly MenuEntry[] => {
    const node = patch.nodes.find((candidate) => candidate.id === nodeId)
    const port = node && describeNode(node, modules)?.inputs.find((candidate) => candidate.id === portId)
    if (!port) return []
    const wired = patch.connections.some((connection) => connection.to.node === nodeId && connection.to.port === portId)
    const entries: MenuEntry[] = []
    // A parameter that is already wired has its value; a second wire would add to it, so the menu offers no new control.
    if (port.param !== undefined && !wired) {
      entries.push({ label: 'Create knob', onSelect: () => createControl(nodeId, port.param!, 'knob') })
      entries.push({ label: 'Create slider', onSelect: () => createControl(nodeId, port.param!, 'slider') })
    }
    if (wired) entries.push({ label: 'Disconnect', danger: true, onSelect: () => disconnectPort(nodeId, portId) })
    return entries
  }

  return (
    <div className={styles.patcher} data-editing={definition ? 'module' : 'track'} data-domain={domain} data-graph={graph}>
      <div className={styles.header}>
        {known.length > 0 && (
          <nav className={styles.breadcrumb} aria-label="Patch location">
            {crumbs.map((crumb, index) => (
              <span key={crumb.path.join('/')}>
                {index > 0 && ' ▸ '}
                {index === crumbs.length - 1 ? (
                  <strong className={styles.crumbCurrent}>{crumb.label}</strong>
                ) : (
                  <button className={styles.crumb} onClick={() => enter(crumb.path)}>
                    {crumb.label}
                  </button>
                )}
              </span>
            ))}
          </nav>
        )}
        {definition && (
          <ModuleBar
            definition={definition}
            interfaceOpen={interfaceOpen}
            onToggleInterface={() => setInterfaceOpen((open) => !open)}
            onDeleted={() => enter(known.slice(0, -1))}
          />
        )}
        <div className={styles.toolbar}>
          {!definition && <strong>{title}</strong>}
          {!definition && graph === 'patch' && track?.kind === 'instrument' && (
            <label className={styles.voices} title="Maximum simultaneous notes for this instrument">
              Voices
              <select value={track.voices} onChange={(event) => setTrackVoices(track.id, Number(event.target.value))}>
                {VOICE_OPTIONS.map((count) => (
                  <option key={count} value={count}>
                    {count}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className={styles.viewSwitch} role="group" aria-label="View">
            <button aria-pressed={view === 'graph'} onClick={() => setView('graph')} title="Nodes and wires">
              Graph
            </button>
            <button aria-pressed={view === 'panel'} onClick={() => setView('panel')} title="Knobs, sliders and XY pads for the parameters">
              Panel
            </button>
          </div>
          {view === 'graph' && (
            <button
              ref={addButton}
              aria-haspopup="listbox"
              aria-expanded={picker !== null}
              data-tooltip="Add a node. You can also double-click the canvas, or press Shift+A over it."
              onClick={() => {
                const rect = addButton.current?.getBoundingClientRect()
                setPicker({
                  anchor: { x: rect?.left ?? 40, y: (rect?.bottom ?? 40) + 4 },
                  at: canvas.current?.visibleCenter() ?? { x: 300, y: 200 },
                  fromButton: true,
                })
              }}
            >
              Add
            </button>
          )}
          {view === 'graph' && (
            <label className={styles.socketsToggle} title="Show a socket for every parameter, so a wire can drive it (the wire replaces the parameter's value)">
              <input type="checkbox" checked={showSockets} onChange={(event) => setShowSockets(event.target.checked)} />
              Sockets
            </label>
          )}
          {view === 'graph' && (
            <button
              disabled={selected.size === 0}
              title="Turn the selected nodes into a reusable module (Shift-click or drag a box to select)"
              onClick={() => {
                store().groupNodes(target, [...selected])
                setSelected(new Set())
              }}
            >
              Group into module{selected.size > 0 ? ` (${selected.size})` : ''}
            </button>
          )}
          <RandomizeBar onRoll={(seed, amount) => edit((current, library) => randomizeParams(current, library, { seed, amount }))} />
        </div>
      </div>
      <div className={styles.editorBody} data-has-aside={Boolean(aside) || (Boolean(definition) && interfaceOpen && view === 'graph')}>
        {view === 'panel' ? (
          <div className={styles.panelHost}>
            <PanelView patch={patch} modules={modules} scope={scope} readoutTrack={readoutTrack} edit={edit} />
          </div>
        ) : (
          <PatchCanvas
            ref={canvas}
            patch={patch}
            modules={modules}
            selected={selected}
            showStages={graph === 'patch'}
            showSockets={showSockets}
            readoutTrack={readoutTrack}
            onSelectionChange={setSelected}
            onSetNodeParams={(id, changes) =>
              // The same undo keys as the panel and the property editor, so a drag of one value is one step wherever it is made.
              edit(
                (current) => changes.reduce((next, change) => setNodeParam(next, id, change.param, change.value), current),
                changes.length === 1 && changes[0] ? `param:${scope}:${id}:${changes[0].param}` : `xy:${scope}:${id}:`,
              )
            }
            onMoveNode={(id, x, y) => edit((current) => moveNode(current, id, x, y), `move:${scope}:${id}`)}
            onRemoveNode={(id) => edit((current) => removeNode(current, id))}
            inputMenu={inputMenu}
            onConnect={(from, to) => edit((current, library) => connect(current, from, to, { modules: library }))}
            onDisconnect={(id) => edit((current) => disconnect(current, id))}
            onOpenModule={(moduleId) => enter([...known, moduleId])}
            onUnlinkModule={(nodeId) => store().unlinkModule(target, nodeId)}
            onRequestAdd={({ anchor, at, from }) => setPicker({ anchor, at, fromButton: false, from })}
          />
        )}
        {aside && <div className={styles.aside}>{aside}</div>}
        {view === 'graph' && (
          <PropertyEditor
            patch={patch}
            modules={modules}
            selected={selected}
            scope={scope}
            ownerTrackId={track?.id ?? ''}
            edit={edit}
            onCreateControl={createControl}
            onUnwire={(nodeId, paramId) => disconnectPort(nodeId, `param:${paramId}`)}
          />
        )}
        {definition && interfaceOpen && view === 'graph' && <ModuleInterface definition={definition} />}
      </div>
      {picker && catalog && (
        <QuickAdd catalog={catalog} anchor={picker.anchor} heading={droppedLabel ? `Can take ${droppedLabel}` : undefined} onPick={addFromPicker} onClose={closePicker} />
      )}
    </div>
  )
}
