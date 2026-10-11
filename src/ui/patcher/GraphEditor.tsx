import {
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
  setNodeTrack,
} from '@core'
import { useProjectStore } from '@state'
import { type ReactNode, useState } from 'react'
import { ModuleBar } from './ModuleBar'
import { ModuleInterface } from './ModuleInterface'
import { NodePalette } from './NodePalette'
import { PatchCanvas } from './PatchCanvas'
import styles from './Patcher.module.css'

type PatchEdit = (patch: Patch, modules: ModuleLibrary) => Patch

/** New nodes go on a grid below the existing ones, in the first slot nothing is sitting on. */
const SLOT = { x: 196, y: 150, columns: 6, originX: 40, originY: 330 }

const spawnPoint = (patch: Patch): { x: number; y: number } => {
  for (let index = 0; index < 200; index++) {
    const x = SLOT.originX + (index % SLOT.columns) * SLOT.x
    const y = SLOT.originY + Math.floor(index / SLOT.columns) * SLOT.y
    if (!patch.nodes.some((node) => Math.abs(node.x - x) < SLOT.x - 20 && Math.abs(node.y - y) < SLOT.y - 20)) return { x, y }
  }
  return { x: SLOT.originX, y: SLOT.originY }
}
const SUFFIX: Record<TrackGraph, string> = { patch: '', fx: ' effects', notes: ' notes' }

const graphOf = (track: Track, graph: TrackGraph): Patch =>
  graph === 'fx' || track.kind !== 'instrument' ? track.fx : graph === 'notes' ? track.noteGraph : track.patch

const VOICE_OPTIONS = [1, 2, 3, 4, 6, 8, 12, 16]

/** What each kind of graph may offer in its palette: the insert graph has its own ends and no note-driven sources. */
const paletteFor = (graph: TrackGraph) => {
  if (graph === 'notes') return noteNodeDefinitions
  return nodeDefinitions.filter((definition) =>
    graph === 'fx'
      ? definition.type !== 'note' && definition.type !== 'output' && definition.usesSample !== true
      : definition.insertOnly !== true,
  )
}

interface GraphEditorProps {
  track: Track
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
export const GraphEditor = ({ track, graph, aside }: GraphEditorProps) => {
  const domain = graph === 'notes' ? 'notes' : 'audio'
  const modules = useProjectStore((state) => state.project.modules)
  const store = useProjectStore.getState
  const setTrackVoices = useProjectStore((state) => state.setTrackVoices)

  const [path, setPath] = useState<readonly string[]>([])
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [interfaceOpen, setInterfaceOpen] = useState(true)

  // A module that disappeared (undo, delete) ends the path there.
  const missing = path.findIndex((id) => !modules.some((module) => module.id === id))
  const known = missing === -1 ? path : path.slice(0, missing)
  const definition = modules.find((module) => module.id === known.at(-1))
  const target: PatchTarget = definition ? { moduleId: definition.id } : { trackId: track.id, graph }
  const patch = definition ? definition.patch : graphOf(track, graph)
  const scope = definition ? definition.id : `${track.id}:${graph}`

  const enter = (next: readonly string[]) => {
    setPath(next)
    setSelected(new Set())
  }
  const edit = (change: PatchEdit, mergeKey?: string) => {
    if (definition) store().updateModulePatch(definition.id, change, mergeKey)
    else if (graph === 'notes') store().updateNoteGraph(track.id, change, mergeKey)
    else if (graph === 'fx') store().updateFx(track.id, change, mergeKey)
    else store().updatePatch(track.id, change, mergeKey)
  }

  // Modules of the other kind (sound vs notes) cannot be placed here; an empty one fits either.
  const placeable = modules.filter((module) => {
    const kind = moduleDomain(module, modules)
    return (kind === undefined || kind === domain) && !(definition && containsModule(modules, module.id, definition.id))
  })
  const title = `${track.name}${SUFFIX[graph]}`
  const crumbs = [{ label: title, path: [] as string[] }].concat(
    known.map((id, index) => ({
      label: modules.find((module) => module.id === id)?.name ?? '',
      path: known.slice(0, index + 1) as string[],
    })),
  )
  const palette = paletteFor(graph)

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
          {!definition && graph === 'patch' && track.kind === 'instrument' && (
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
          <NodePalette
            definitions={palette}
            modules={placeable}
            onAdd={(type) =>
              edit((current) => {
                const { x, y } = spawnPoint(current)
                return addNode(current, createNode(type, x, y))
              })
            }
            onAddModule={(moduleId) => {
              const { x, y } = spawnPoint(patch)
              store().addModuleUse(target, moduleId, x, y)
            }}
          />
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
        </div>
      </div>
      <div className={styles.editorBody} data-has-aside={Boolean(aside) || (Boolean(definition) && interfaceOpen)}>
        <PatchCanvas
          patch={patch}
          modules={modules}
          selected={selected}
          ownerTrackId={track.id}
          showStages={graph === 'patch'}
          onSelectionChange={setSelected}
          onMoveNode={(id, x, y) => edit((current) => moveNode(current, id, x, y), `move:${scope}:${id}`)}
          onRemoveNode={(id) => edit((current) => removeNode(current, id))}
          onParamChange={(id, paramId, value) =>
            edit((current) => setNodeParam(current, id, paramId, value), `param:${scope}:${id}:${paramId}`)
          }
          onSampleChange={(id, sampleId) => edit((current) => setNodeSample(current, id, sampleId))}
          onTrackChange={(id, trackId) => edit((current) => setNodeTrack(current, id, trackId))}
          onBypassChange={(id, bypassed) => edit((current) => setNodeBypassed(current, id, bypassed))}
          onConnect={(from, to) => edit((current, library) => connect(current, from, to, { modules: library }))}
          onDisconnect={(id) => edit((current) => disconnect(current, id))}
          onOpenModule={(moduleId) => enter([...known, moduleId])}
          onUnlinkModule={(nodeId) => store().unlinkModule(target, nodeId)}
        />
        {aside && <div className={styles.aside}>{aside}</div>}
        {definition && interfaceOpen && <ModuleInterface definition={definition} />}
      </div>
    </div>
  )
}
