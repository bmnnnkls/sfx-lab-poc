import {
  MASTER_IN_TYPE,
  RETURN_IN_TYPE,
  SEND_TYPE,
  TRACK_AUDIO_TYPE,
  TRACK_IN_TYPE,
  type ModuleLibrary,
  type Patch,
  type PatchTarget,
  type Track,
  type TrackGraph,
  addNode,
  connect,
  containsModule,
  createNode,
  disconnect,
  moduleDomain,
  moveNode,
  noteNodeDefinitions,
  nodeDefinitions,
  removeNode,
  setNodeBypassed,
  setNodeParam,
  setNodeSample,
  setNodeStereo,
  setNodeTrack,
} from '@core'
import { useProjectStore } from '@state'
import { type ReactNode, useState } from 'react'
import { PanelView } from '../panel/PanelView'
import { useStoredState } from '../shared/use-stored-state'
import { ModuleBar } from './ModuleBar'
import { ModuleInterface } from './ModuleInterface'
import { NodePalette } from './NodePalette'
import { PatchCanvas } from './PatchCanvas'
import styles from './Patcher.module.css'

type PatchEdit = (patch: Patch, modules: ModuleLibrary) => Patch

/**
 * New nodes go on a grid below the existing ones, in the first slot nothing is sitting on. An insert graph starts with
 * just its two ends in one row, so its grid starts right under them and a new node is in view; the others have a patch
 * several rows high to clear.
 */
const SLOT = { x: 196, y: 150, columns: 6, originX: 40 }
const GRID_TOP = { patch: 330, notes: 330, fx: 130 } as const

const spawnPoint = (patch: Patch, graph: TrackGraph): { x: number; y: number } => {
  const originY = GRID_TOP[graph]
  for (let index = 0; index < 200; index++) {
    const x = SLOT.originX + (index % SLOT.columns) * SLOT.x
    const y = originY + Math.floor(index / SLOT.columns) * SLOT.y
    if (!patch.nodes.some((node) => Math.abs(node.x - x) < SLOT.x - 20 && Math.abs(node.y - y) < SLOT.y - 20)) return { x, y }
  }
  return { x: SLOT.originX, y: originY }
}
const SUFFIX: Record<TrackGraph, string> = { patch: '', fx: ' effects', notes: ' notes' }

const graphOf = (track: Track, graph: TrackGraph): Patch =>
  graph === 'fx' || track.kind !== 'instrument' ? track.fx : graph === 'notes' ? track.noteGraph : track.patch

const VOICE_OPTIONS = [1, 2, 3, 4, 6, 8, 12, 16]

const isFlag = (value: unknown): value is boolean => typeof value === 'boolean'

type View = 'graph' | 'panel'
const isView = (value: unknown): value is View => value === 'graph' || value === 'panel'

/** Where an insert graph starts: a return track at Return in, the master at Master in, every other track at Track in. */
const START: Record<Track['kind'] | 'master', string> = {
  instrument: TRACK_IN_TYPE,
  audio: TRACK_IN_TYPE,
  return: RETURN_IN_TYPE,
  master: MASTER_IN_TYPE,
}
const STARTS = new Set(Object.values(START))

/** What each kind of graph may offer in its palette: the insert graph has its own ends and no note-driven sources. */
const paletteFor = (graph: TrackGraph, kind: Track['kind'] | 'master') => {
  if (graph === 'notes') return noteNodeDefinitions
  return nodeDefinitions.filter((definition) => {
    if (graph !== 'fx') return definition.insertOnly !== true
    if (STARTS.has(definition.type)) return definition.type === START[kind]
    // The master graph runs on the whole block, after the tracks: nothing to send to, and no tracks to read one by one.
    if (kind === 'master' && (definition.type === SEND_TYPE || definition.type === TRACK_AUDIO_TYPE)) return false
    return definition.type !== 'note' && definition.type !== 'output' && definition.usesSample !== true
  })
}

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
            <NodePalette
              definitions={palette}
              modules={placeable}
              onAdd={(type) =>
                edit((current) => {
                  const { x, y } = spawnPoint(current, graph)
                  return addNode(current, createNode(type, x, y))
                })
              }
              onAddModule={(moduleId) => {
                const { x, y } = spawnPoint(patch, graph)
                store().addModuleUse(target, moduleId, x, y)
              }}
            />
          )}
          {view === 'graph' && graph !== 'notes' && (
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
        </div>
      </div>
      <div className={styles.editorBody} data-has-aside={Boolean(aside) || (Boolean(definition) && interfaceOpen && view === 'graph')}>
        {view === 'panel' ? (
          <div className={styles.panelHost}>
            <PanelView patch={patch} modules={modules} scope={scope} edit={edit} />
          </div>
        ) : (
          <PatchCanvas
            patch={patch}
            modules={modules}
            selected={selected}
            ownerTrackId={track?.id ?? ''}
            showStages={graph === 'patch'}
            showSockets={showSockets && graph !== 'notes'}
            onSelectionChange={setSelected}
            onMoveNode={(id, x, y) => edit((current) => moveNode(current, id, x, y), `move:${scope}:${id}`)}
            onRemoveNode={(id) => edit((current) => removeNode(current, id))}
            onParamChange={(id, paramId, value) =>
              edit((current) => setNodeParam(current, id, paramId, value), `param:${scope}:${id}:${paramId}`)
            }
            onSampleChange={(id, sampleId) => edit((current) => setNodeSample(current, id, sampleId))}
            onTrackChange={(id, trackId) => edit((current) => setNodeTrack(current, id, trackId))}
            onBypassChange={(id, bypassed) => edit((current) => setNodeBypassed(current, id, bypassed))}
            onStereoChange={(id, stereo) => edit((current, library) => setNodeStereo(current, id, stereo, library))}
            onConnect={(from, to) => edit((current, library) => connect(current, from, to, { modules: library }))}
            onDisconnect={(id) => edit((current) => disconnect(current, id))}
            onOpenModule={(moduleId) => enter([...known, moduleId])}
            onUnlinkModule={(nodeId) => store().unlinkModule(target, nodeId)}
          />
        )}
        {aside && <div className={styles.aside}>{aside}</div>}
        {definition && interfaceOpen && view === 'graph' && <ModuleInterface definition={definition} />}
      </div>
    </div>
  )
}
