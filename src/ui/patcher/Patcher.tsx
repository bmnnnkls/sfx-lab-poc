import {
  type InstrumentTrack,
  type ModuleLibrary,
  type Patch,
  type PatchTarget,
  addNode,
  connect,
  containsModule,
  createNode,
  disconnect,
  moveNode,
  removeNode,
  setNodeParam,
  setNodeSample,
} from '@core'
import { useProjectStore, useSelectionStore } from '@state'
import { useState } from 'react'
import { ModuleBar } from './ModuleBar'
import { ModuleInterface } from './ModuleInterface'
import { NodePalette } from './NodePalette'
import { PatchCanvas } from './PatchCanvas'
import styles from './Patcher.module.css'

type PatchEdit = (patch: Patch, modules: ModuleLibrary) => Patch

const SPAWN_OFFSET = { x: 40, y: 330 }
const VOICE_OPTIONS = [1, 2, 3, 4, 6, 8, 12, 16]

/** Node-based editor for the selected track's instrument patch. */
export const Patcher = () => {
  const tracks = useProjectStore((state) => state.project.tracks)
  const selectedId = useSelectionStore((state) => state.trackId)

  // Fall back to the first instrument track when nothing (or an audio track) is selected.
  const track =
    tracks.find((candidate) => candidate.id === selectedId) ?? tracks.find((candidate) => candidate.kind === 'instrument')
  if (!track) return <p className={styles.empty}>Add an instrument track to edit its instrument.</p>
  if (track.kind === 'audio') {
    return (
      <p className={styles.empty}>
        “{track.name}” is an audio track: it plays samples directly and has no instrument. Select an instrument
        track to edit its patch, or open one of this track’s clips to edit it.
      </p>
    )
  }
  return <TrackPatcher key={track.id} track={track} />
}

/** The patcher for one track: its own patch, or (one level at a time) the inside of a module it uses. */
const TrackPatcher = ({ track }: { track: InstrumentTrack }) => {
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
  const target: PatchTarget = definition ? { moduleId: definition.id } : { trackId: track.id }
  const patch = definition ? definition.patch : track.patch
  const scope = definition ? definition.id : track.id

  const enter = (next: readonly string[]) => {
    setPath(next)
    setSelected(new Set())
  }
  const edit = (change: PatchEdit, mergeKey?: string) =>
    definition
      ? store().updateModulePatch(definition.id, change, mergeKey)
      : store().updatePatch(track.id, change, mergeKey)

  const placeable = definition ? modules.filter((module) => !containsModule(modules, module.id, definition.id)) : modules
  const crumbs = [{ label: track.name, path: [] as string[] }].concat(
    known.map((id, index) => ({ label: modules.find((module) => module.id === id)?.name ?? '', path: known.slice(0, index + 1) as string[] })),
  )

  return (
    <div className={styles.patcher} data-editing={definition ? 'module' : 'track'}>
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
          {!definition && <strong>{track.name}</strong>}
          {!definition && (
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
            modules={placeable}
            onAdd={(type) =>
              edit((current) => addNode(current, createNode(type, SPAWN_OFFSET.x + current.nodes.length * 12, SPAWN_OFFSET.y)))
            }
            onAddModule={(moduleId) => store().addModuleUse(target, moduleId, SPAWN_OFFSET.x + patch.nodes.length * 12, SPAWN_OFFSET.y)}
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
      <div className={definition && interfaceOpen ? styles.editorBody : styles.editorBodySingle}>
        <PatchCanvas
          patch={patch}
          modules={modules}
          selected={selected}
          onSelectionChange={setSelected}
          onMoveNode={(id, x, y) => edit((current) => moveNode(current, id, x, y), `move:${scope}:${id}`)}
          onRemoveNode={(id) => edit((current) => removeNode(current, id))}
          onParamChange={(id, paramId, value) =>
            edit((current) => setNodeParam(current, id, paramId, value), `param:${scope}:${id}:${paramId}`)
          }
          onSampleChange={(id, sampleId) => edit((current) => setNodeSample(current, id, sampleId))}
          onConnect={(from, to) => edit((current, library) => connect(current, from, to, { modules: library }))}
          onDisconnect={(id) => edit((current) => disconnect(current, id))}
          onOpenModule={(moduleId) => enter([...known, moduleId])}
          onUnlinkModule={(nodeId) => store().unlinkModule(target, nodeId)}
        />
        {definition && interfaceOpen && <ModuleInterface definition={definition} />}
      </div>
    </div>
  )
}
