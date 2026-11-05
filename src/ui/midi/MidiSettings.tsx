import { type ControlTarget, type InstrumentTrack, controlTargetKey, midiSourceKey, resolveControlTarget } from '@core'
import { type MidiInputInfo, editMidiMappings, useMidi, useMidiStore, useProjectStore, useControlStore } from '@state'
import { useEffect, useState } from 'react'
import styles from './MidiSettings.module.css'
import { formatParam } from '../shared/param-scale'
import { describeTrackInput } from './track-input'

const targetName = (target: ControlTarget, names: ReadonlyMap<string, string>) => `${target.owner.kind === 'master' ? 'Master' : target.owner.kind === 'group' ? names.get(target.owner.groupId) ?? 'Missing group' : names.get(target.owner.trackId) ?? 'Missing track'} / ${target.kind === 'graph' ? `${target.path.map((s) => s.nodeId).join('/')} ${target.nodeId} · ${target.paramId}` : target.control === 'send' ? `send to ${names.get(target.returnId) ?? 'missing return'}` : target.control}`

/** The value of the input picker: the track follows the selection, takes any input, or one input by id. */
const FOLLOW = 'follow'
const ANY = 'any'

/**
 * One instrument track's MIDI input: following the selection (the default), or its own input and channel, which it
 * always listens to. Notes matching a track's own input go only to such tracks; the rest go to the selected one.
 */
const TrackInputRow = ({ track, inputs }: { track: InstrumentTrack; inputs: readonly MidiInputInfo[] }) => {
  const input = track.midiInput
  const set = useProjectStore((s) => s.setTrackMidiInput)
  const device = input === undefined ? FOLLOW : input.deviceId ?? ANY
  const missing = input?.deviceId !== undefined && !inputs.some((i) => i.id === input.deviceId)
  return <div className={styles.mapping} data-testid="midi-track-input">
    <span>{track.name}</span>
    <label>Input <select aria-label={`MIDI input of ${track.name}`} value={device} onChange={(e) => {
      const value = e.target.value
      if (value === FOLLOW) set(track.id, undefined)
      else set(track.id, { ...(value !== ANY && { deviceId: value, deviceName: inputs.find((i) => i.id === value)?.name ?? value }), ...(input?.channel !== undefined && { channel: input.channel }) })
    }}>
      <option value={FOLLOW}>Follows the selection</option>
      <option value={ANY}>Any input</option>
      {missing && <option value={input.deviceId}>{input.deviceName ?? input.deviceId} (unavailable)</option>}
      {inputs.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
    </select></label>
    <label>Channel <select aria-label={`MIDI channel of ${track.name}`} disabled={input === undefined} value={input?.channel ?? ANY} onChange={(e) => {
      if (!input) return
      const { channel: _previous, ...rest } = input
      set(track.id, e.target.value === ANY ? rest : { ...rest, channel: Number(e.target.value) })
    }}>
      <option value={ANY}>Any channel</option>{Array.from({ length: 16 }, (_, ch) => <option key={ch} value={ch}>{ch + 1}</option>)}
    </select></label>
    {input && <output>Always listens: {describeTrackInput(input, inputs.find((i) => i.id === input.deviceId)?.name)}</output>}
  </div>
}

export const MidiSettings = () => {
  const [open, setOpen] = useState(false)
  const midi = useMidi()
  const state = useMidiStore()
  const project = useProjectStore((s) => s.project)
  const overrides = useControlStore((s) => s.overrides)
  const mappings = project.midiMappings ?? []
  const names = new Map([...project.tracks.map((t) => [t.id, t.name] as const), ...(project.groups ?? []).map((g) => [g.id, g.name] as const)])
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { useMidiStore.getState().cancelLearn(); setOpen(false) }
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [])
  return <>
    <button aria-expanded={open} onClick={() => setOpen(!open)}>MIDI</button>
    <button onClick={midi.panic}>Panic</button>
    {(state.learning || state.conflict) && <div className={styles.notice} role="status">
      {state.learning ? 'MIDI learn: move a CC control. Escape cancels.' : 'This CC is already assigned. Reassign it to this target?'}{' '}
      {state.conflict && <button onClick={state.confirmReassign}>Reassign</button>}{' '}
      <button onClick={state.cancelLearn}>Cancel MIDI learn</button>
    </div>}
    {open && <section className={styles.overlay} aria-label="MIDI settings">
      <h2>MIDI input</h2>
      <button onClick={() => setOpen(false)} aria-label="Close MIDI settings">Close</button>{' '}
      {state.status === 'enabled' || state.status === 'requesting' ? <button onClick={midi.disable}>Disable MIDI</button> : <button onClick={() => void midi.enable()}>Enable MIDI</button>}
      <p role="status">MIDI: {state.status}{state.error ? ` — ${state.error}` : ''}</p>
      <label>Selection channel <select aria-label="MIDI channel" value={state.channel ?? 'all'} onChange={(e) => useMidiStore.setState({ channel: e.target.value === 'all' ? null : Number(e.target.value) })}>
        <option value="all">All channels</option>{Array.from({ length: 16 }, (_, ch) => <option key={ch} value={ch}>{ch + 1}</option>)}
      </select></label>
      <label>Destination <select aria-label="MIDI destination" value={state.pinnedTrackId ?? ''} onChange={(e) => useMidiStore.setState({ pinnedTrackId: e.target.value || null })}>
        <option value="">Selected instrument</option>{project.tracks.filter((t) => t.kind === 'instrument').map((t) => <option key={t.id} value={t.id}>Pin: {t.name}</option>)}
      </select></label>
      <p>Inputs</p>
      {state.inputs.length === 0 && <p>No inputs available.</p>}
      {state.inputs.map((input) => <label key={input.id}><input type="checkbox" checked={!state.disabledInputs.includes(input.id)} onChange={(e) => useMidiStore.setState({ disabledInputs: e.target.checked ? state.disabledInputs.filter((id) => id !== input.id) : [...state.disabledInputs, input.id] })} />{input.name} — {input.connected ? 'connected' : 'disconnected'}</label>)}
      <h3>Track inputs</h3>
      <p>An instrument follows the selection: it plays while it is selected (or pinned as the destination). Give it an input of its own to have it always listen to that input and channel; notes that match a track's own input go only to it, and the rest to the selected instrument.</p>
      {project.tracks.filter((t): t is InstrumentTrack => t.kind === 'instrument').map((track) => <TrackInputRow key={track.id} track={track} inputs={state.inputs} />)}
      <h3>Mappings</h3>
      <p>Right-click a panel control or mixer value to learn. Continuous controls wait for pickup; movements within 800 ms undo together. Sustain and channel-mode CCs are reserved.</p>
      {mappings.length === 0 && <p>No MIDI mappings.</p>}
      {mappings.map((mapping) => {
        const resolved = resolveControlTarget(project, mapping.target)
        const input = state.inputs.find((i) => i.id === mapping.deviceId)
        const status = resolved.status !== 'available' ? resolved.reason : !resolved.automatable ? resolved.reason : state.status !== 'enabled' || !input?.connected || state.disabledInputs.includes(input.id) ? 'Device unavailable' : state.feedback[mapping.id]?.state ?? (mapping.pickup ? 'pickup' : 'ready')
        return <div className={styles.mapping} key={mapping.id} data-testid="midi-mapping">
          <span>{targetName(mapping.target, names)} · ch {mapping.channel + 1} CC {mapping.cc}</span>
          <label>Input <select aria-label={`Input for CC ${mapping.cc}`} value={mapping.deviceId} onChange={(e) => {
            const deviceId = e.target.value
            const candidate = { ...mapping, deviceId, deviceName: state.inputs.find((i) => i.id === deviceId)?.name ?? deviceId }
            const existing = mappings.find((m) => m.id !== mapping.id && midiSourceKey(m) === midiSourceKey(candidate))
            if (existing) useMidiStore.setState({ conflict: { mapping: candidate, existingId: existing.id, replaceId: mapping.id } })
            else editMidiMappings((ms) => ms.map((m) => m.id === mapping.id ? candidate : m))
          }}>
            {!state.inputs.some((i) => i.id === mapping.deviceId) && <option value={mapping.deviceId}>{mapping.deviceName} (unavailable)</option>}
            {state.inputs.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select></label>
          <label><input type="checkbox" checked={mapping.pickup} onChange={(e) => editMidiMappings((ms) => ms.map((m) => m.id === mapping.id ? { ...m, pickup: e.target.checked } : m))} />Pickup</label>
          <output>{status}{resolved.status === 'available' ? ` · ${formatParam(resolved.spec, overrides.find((e) => controlTargetKey(e.target) === controlTargetKey(mapping.target))?.value ?? resolved.baseValue)}` : ''}</output>
          <button onClick={() => state.learn(mapping.target, mapping.id)}>Learn again</button>
          <button onClick={() => editMidiMappings((ms) => ms.filter((m) => m.id !== mapping.id))}>Remove mapping</button>
        </div>
      })}
    </section>}
  </>
}
