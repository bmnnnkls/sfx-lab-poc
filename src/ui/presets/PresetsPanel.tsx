import { useState } from 'react'
import { useControlGesture } from '../controls/use-control-gesture'
import { captureSnapshot, putSnapshot, saveProjectPreset, enumerateSampleTargets, resolveSampleTarget, sampleTargetKey, editSampleBinding, inSnapshotScope, morphSnapshots, type SnapshotScope, type Snapshot } from '@core'
import { useProjectStore, useSelectionStore, editPresetProject, recallPresetOn, runAction } from '@state'
import { ActionMenu, useActionContext } from '../shared/menu'
import { InPlaceRename } from '../shared/RenameField'
import styles from './PresetsPanel.module.css'

export const PresetsPanel = () => {
  const project = useProjectStore(s => s.project)
  const trackId = useSelectionStore(s => s.trackId), master = useSelectionStore(s => s.master)
  const [domain, setDomain] = useState<SnapshotScope['domain']>('patch')
  const [name, setName] = useState('Sound 1'), [message, setMessage] = useState('')
  const [a, setA] = useState(''), [b, setB] = useState(''), [amount, setAmount] = useState(0)
  const gesture = useControlGesture()
  const context = useActionContext()
  const owner = master ? { kind: 'master' as const } : { kind: 'track' as const, trackId: trackId ?? project.tracks[0]?.id ?? '' }
  const scope: SnapshotScope = { owner, domain: master ? (domain === 'track' ? 'track' : 'fx') : domain }
  const act = (run: () => string | void) => { try { setMessage(run() ?? 'Sound saved') } catch (error) { setMessage(error instanceof Error ? error.message : 'Sound action failed') } }
  const snapshots = project.snapshots ?? []
  const scopeNames = { patch: 'Instrument', notes: 'Note effects', fx: 'Audio effects', track: 'Whole track + mixer' }
  const label = (snapshot: Snapshot) => `${snapshot.name} · ${snapshot.scope.owner.kind === 'master' ? 'Master' : project.tracks.find(t => t.id === (snapshot.scope.owner.kind === 'track' ? snapshot.scope.owner.trackId : ''))?.name ?? 'Missing owner'} / ${scopeNames[snapshot.scope.domain]}`
  /** Runs a sound's action from its row, with its message on the status line. */
  const run = (id: string, snapshot: Snapshot, preset: boolean) => runAction(id, { kind: 'sound', soundId: snapshot.id, preset }, context, { report: (_kind, text) => setMessage(text) })
  const labelled = (snapshot: Snapshot, preset: boolean) => <InPlaceRename subject={{ kind: 'sound', soundId: snapshot.id, preset }} name={snapshot.name} label={`Name of ${snapshot.name}`}><span>{label(snapshot)}</span></InPlaceRename>
  return <section className={styles.panel} aria-label="Snapshots and presets">
    <div className={styles.toolbar}>
      <strong>{master ? 'Master' : project.tracks.find(t => t.id === owner.trackId)?.name ?? 'Select a track'}</strong>
      <label>Scope <select aria-label="Sound scope" value={scope.domain} onChange={e => setDomain(e.target.value as SnapshotScope['domain'])}>
        {!master && <><option value="patch">Instrument + notes (presets)</option><option value="notes">Note effects</option></>}
        <option value="fx">Audio effects</option><option value="track">Whole track + mixer (snapshots)</option>
      </select></label>
      <input aria-label="Sound name" value={name} maxLength={80} onChange={e => setName(e.target.value)} />
      <button onClick={() => act(() => editPresetProject(p => putSnapshot(p, captureSnapshot(p, scope, name))))}>Save snapshot</button>
      <button disabled={scope.domain === 'track'} onClick={() => act(() => editPresetProject(p => saveProjectPreset(p, scope, name)))}>Save as preset</button>
    </div>
    <p>Snapshots capture authored controls in the selected scope. Instrument presets also include notes, voices and sample choices. Read remains active on recall; armed Touch writes steps into playing clips/slots.</p>
    <output role="status">{message}</output>
    <div className={styles.columns}>
      <section><h3>Project snapshots</h3>{snapshots.map(s => <ActionMenu key={s.id} subject={{ kind: 'sound', soundId: s.id, preset: false }}><div className={styles.row}>
        {labelled(s, false)}
        <button onClick={() => run('sound.recall', s, false)}>Recall {s.name}</button>
        <button onClick={() => run('sound.update', s, false)}>Update</button>
        <button onClick={() => run('sound.rename', s, false)}>Rename</button>
        <button onClick={() => run('sound.duplicate', s, false)}>Duplicate</button>
        <button onClick={() => run('sound.delete', s, false)}>Delete</button>
      </div></ActionMenu>)}</section>
      <section><h3>Embedded presets</h3>{(project.presets ?? []).map(s => <ActionMenu key={s.id} subject={{ kind: 'sound', soundId: s.id, preset: true }}><div className={styles.row}>
        {labelled(s, true)}<small title={s.revisionId}>Revision {s.revisionId.slice(-8)}</small>
        {/* These two act on the scope chosen above, the menu's on the preset's own. */}
        <button onClick={() => act(() => recallPresetOn(s, scope.owner, scope.domain))}>Recall preset {s.name}</button>
        <button onClick={() => act(() => editPresetProject(p => {
          return saveProjectPreset(p, scope, s.name, s.id)
        }))}>Update</button>
        <button onClick={() => run('sound.rename', s, true)}>Rename</button>
        <button onClick={() => run('sound.duplicate', s, true)}>Duplicate</button>
        <button onClick={() => run('sound.delete', s, true)}>Delete</button>
      </div></ActionMenu>)}</section>
    </div>
    <fieldset><legend>A/B snapshot morph</legend>
      <label>A <select aria-label="Snapshot A" value={a} onChange={e => setA(e.target.value)}><option value="">Choose A</option>{snapshots.map(s => <option key={s.id} value={s.id}>{label(s)}</option>)}</select></label>
      <label>B <select aria-label="Snapshot B" value={b} onChange={e => setB(e.target.value)}><option value="">Choose B</option>{snapshots.map(s => <option key={s.id} value={s.id}>{label(s)}</option>)}</select></label>
      <input type="range" aria-label="Snapshot morph" min={0} max={1} step={0.001} value={amount} disabled={!a || !b}
        {...gesture.events} onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)}
        onChange={e => act(() => { const value = Number(e.target.value); const left = snapshots.find(s => s.id === a), right = snapshots.find(s => s.id === b); if (!left || !right) return; const morphed = morphSnapshots(project, left, right, value); gesture.change(morphed.values); setAmount(value); return `Morph ${Math.round(value * 100)}% · discrete controls switch at 50%` })} />
    </fieldset>
    <section><h3>Instance sample choices</h3><p>Bindings here affect this use only. Shared node samples remain defaults. Presets capture explicit silence too.</p>
      {enumerateSampleTargets(project).filter(t => inSnapshotScope(t, scope)).map(target => {
        const key = sampleTargetKey(target), binding = project.sampleBindings?.find(b => sampleTargetKey(b.target) === key), resolved = resolveSampleTarget(project, target)
        return <label className={styles.row} key={key}>{[...target.path.map(s => s.nodeId), target.nodeId].join(' / ')}
          <select aria-label={`Sample binding ${[...target.path.map(s => s.nodeId), target.nodeId].join('/')}`} value={binding ? binding.sampleId ?? '' : '__default'} onChange={e => act(() => editPresetProject(p => e.target.value === '__default' ? { ...p, sampleBindings: p.sampleBindings?.filter(b => sampleTargetKey(b.target) !== key) } : editSampleBinding(p, { target, sampleId: e.target.value || null })))}>
            <option value="__default">Use shared default{resolved.status === 'available' && !binding ? ` (${project.samples.find(s => s.id === resolved.sampleId)?.name ?? 'silence'})` : ''}</option><option value="">Silence</option>
            {project.samples.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      })}
    </section>
  </section>
}
