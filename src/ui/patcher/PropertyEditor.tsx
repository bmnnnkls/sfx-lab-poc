import {
  CONTROL_DISPLAYS,
  CONTROL_SIZES,
  type ControlSize,
  type ControlDisplay,
  MAX_NODE_NAME,
  MAX_UNIT,
  type ModuleLibrary,
  type Patch,
  type PatchNode,
  describeNode,
  defaultPanelSize,
  nodeTitles,
  panelItems,
  resizePanelControl,
  setPanelShow,
  setNodeBypassed,
  setNodeDisplay,
  setNodeName,
  setNodeParam,
  setNodeSample,
  setNodeStereo,
  setNodeTrack,
  setNodeUnit,
} from '@core'
import { useMemo } from 'react'
import { ParamRow } from './ParamRow'
import { SamplePicker } from './SamplePicker'
import { TextField } from './TextField'
import { TrackPicker } from './TrackPicker'
import { drivenParams } from './visible-shape'
import { rowsOf } from './property-rows'
import styles from './PropertyEditor.module.css'

type Edit = (change: (patch: Patch, modules: ModuleLibrary) => Patch, mergeKey?: string) => void

interface PropertyEditorProps {
  patch: Patch
  modules: ModuleLibrary
  selected: ReadonlySet<string>
  /** Names the graph being edited, so a drag of one slider merges into one undo step. */
  scope: string
  /** The track whose graph this is (for the track picker). */
  ownerTrackId: string
  edit: Edit
  onCreateControl(nodeId: string, paramId: string, display: 'knob' | 'slider'): void
  onUnwire(nodeId: string, paramId: string): void
}

const DISPLAY_LABELS: Record<ControlDisplay, string> = { knob: 'Knob', slider: 'Slider', 'slider-horizontal': 'Slider, horizontal' }

/**
 * The settings of the selected node: its name, its switches and pickers, and one row per parameter. The cards carry
 * none of this, so the editor is where a value is set; a parameter with a wire into its socket shows by what it is driven.
 */
export const PropertyEditor = ({ patch, modules, selected, scope, ownerTrackId, edit, onCreateControl, onUnwire }: PropertyEditorProps) => {
  const chosen = patch.nodes.filter((node) => selected.has(node.id))
  return (
    <aside className={styles.properties} aria-label="Properties" data-testid="properties">
      {chosen.length === 0 ? (
        <p className={styles.hint}>Select a node to see and change its settings.</p>
      ) : chosen.length > 1 ? (
        <p className={styles.hint}>{chosen.length} nodes selected. Select one to change its settings.</p>
      ) : (
        <NodeProperties
          key={chosen[0]!.id}
          node={chosen[0]!}
          patch={patch}
          modules={modules}
          scope={scope}
          ownerTrackId={ownerTrackId}
          edit={edit}
          onCreateControl={onCreateControl}
          onUnwire={onUnwire}
        />
      )}
    </aside>
  )
}

interface NodePropertiesProps extends Omit<PropertyEditorProps, 'selected'> {
  node: PatchNode
}

const NodeProperties = ({ node, patch, modules, scope, ownerTrackId, edit, onCreateControl, onUnwire }: NodePropertiesProps) => {
  const shape = describeNode(node, modules)
  const titles = useMemo(() => nodeTitles(patch, modules), [patch, modules])
  // What the node would be called without a name of its own: the hint in an empty name field.
  const defaultTitle = useMemo(() => {
    const { name: _name, ...unnamed } = node
    return nodeTitles({ ...patch, nodes: patch.nodes.map((candidate) => (candidate.id === node.id ? unnamed : candidate)) }, modules).get(node.id) ?? ''
  }, [patch, modules, node])
  if (!shape) return null

  const driven = drivenParams(node.id, shape, patch, (id) => titles.get(id) ?? '')
  const rows = rowsOf(node, shape, driven)
  const set = (paramId: string, value: number) => edit((current) => setNodeParam(current, node.id, paramId, value), `param:${scope}:${node.id}:${paramId}`)

  return (
    <div className={styles.node}>
      <div className={styles.heading}>
        <span className={styles.kind}>{shape.label}</span>
        <label className={styles.field}>
          <span>Name</span>
          <TextField
            label="Name"
            value={node.name ?? ''}
            placeholder={defaultTitle}
            maxLength={MAX_NODE_NAME}
            onCommit={(text) => edit((current) => setNodeName(current, node.id, text))}
          />
        </label>
      </div>

      {(shape.stereoCapable || shape.bypassable) && (
        <div className={styles.switches}>
          {shape.stereoCapable && (
            <label data-tooltip="Run one copy of the node per channel, so it works on a left and a right signal.">
              <input
                type="checkbox"
                checked={node.stereo === true}
                onChange={(event) => edit((current, library) => setNodeStereo(current, node.id, event.target.checked, library))}
              />
              Stereo
            </label>
          )}
          {shape.bypassable && (
            <label data-tooltip="Let notes through unchanged.">
              <input type="checkbox" checked={node.bypassed === true} onChange={(event) => edit((current) => setNodeBypassed(current, node.id, event.target.checked))} />
              Bypass
            </label>
          )}
        </div>
      )}

      {shape.usesSample && <SamplePicker sampleId={node.sampleId} onChange={(sampleId) => edit((current) => setNodeSample(current, node.id, sampleId))} />}
      {shape.usesTrack && (
        <TrackPicker pick={shape.usesTrack} ownerTrackId={ownerTrackId} trackId={node.trackId} onChange={(trackId) => edit((current) => setNodeTrack(current, node.id, trackId))} />
      )}

      {shape.panelKind === 'value' && (
        <div className={styles.group}>
          <label className={styles.field}>
            <span>Unit</span>
            <TextField label="Unit" value={node.unit ?? ''} maxLength={MAX_UNIT} placeholder="none" onCommit={(text) => edit((current) => setNodeUnit(current, node.id, 'unit', text))} />
          </label>
          <label className={styles.field}>
            <span>Display</span>
            <select
              aria-label="Display"
              value={node.display ?? 'knob'}
              onChange={(event) => edit((current) => setNodeDisplay(current, node.id, event.target.value as ControlDisplay))}
            >
              {CONTROL_DISPLAYS.map((display) => (
                <option key={display} value={display}>
                  {DISPLAY_LABELS[display]}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
      {shape.panelKind === 'xy' && (
        <div className={styles.group}>
          {(['unit', 'unitY'] as const).map((field) => (
            <label key={field} className={styles.field}>
              <span>{field === 'unit' ? 'X unit' : 'Y unit'}</span>
              <TextField
                label={field === 'unit' ? 'X unit' : 'Y unit'}
                value={node[field] ?? ''}
                maxLength={MAX_UNIT}
                placeholder="none"
                onCommit={(text) => edit((current) => setNodeUnit(current, node.id, field, text))}
              />
            </label>
          ))}
        </div>
      )}

      {shape.panelKind !== undefined && <PanelSettings node={node} modules={modules} edit={edit} />}

      <div className={styles.params}>
        {rows.length === 0 && <p className={styles.hint}>Nothing to set on this node.</p>}
        {rows.map((row) => (
          <ParamRow
            key={row.spec.id}
            row={row}
            onChange={(value) => set(row.spec.id, value)}
            onCreateControl={(display) => onCreateControl(node.id, row.spec.id, display)}
            onUnwire={() => onUnwire(node.id, row.spec.id)}
          />
        ))}
      </div>
    </div>
  )
}

/** Where a control sits on the front panel: whether it shows, and how big. (Its place in the order is set on the panel.) */
const PanelSettings = ({ node, modules, edit }: { node: PatchNode; modules: ModuleLibrary; edit: Edit }) => {
  const item = panelItems({ nodes: [node], connections: [] }, modules)[0]
  if (!item) return null
  return (
    <div className={styles.group}>
      <label className={styles.switches} data-tooltip="Show this control on the front panel. It keeps working in the graph either way.">
        <input
          type="checkbox"
          checked={item.shown}
          onChange={(event) => edit((current, library) => setPanelShow(current, library, node.id, event.target.checked))}
        />
        Show on panel
      </label>
      <label className={styles.field}>
        <span>Size</span>
        <select
          aria-label="Panel size"
          value={item.size}
          onChange={(event) => edit((current, library) => resizePanelControl(current, library, node.id, event.target.value as ControlSize))}
        >
          {CONTROL_SIZES.map((size) => (
            <option key={size} value={size}>
              {size === defaultPanelSize(item.kind) ? `${size} (default)` : size}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
