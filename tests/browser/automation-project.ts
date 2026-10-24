import { createReturnTrack, setAutomationSlot, type Project, type AutomationLane, type ControlTarget, type InstrumentTrack, createClip, createEmptyProject, createNote, noteGraphFrom } from '../../src/core'
export const sweepTarget: ControlTarget = { kind: 'graph', owner: { kind: 'track', trackId: 'sweep' }, domain: 'patch', path: [], nodeId: 'filter', nodeType: 'filter', paramId: 'cutoff' }
export const sweepProject = (drawn = false) => {
  const p = createEmptyProject(), t = p.tracks[0] as InstrumentTrack
  const lane: AutomationLane = { id: 'sweep-lane', target: sweepTarget, enabled: true, points: drawn ? [] : [{ id: 'start', beat: 0, value: 0.1, interpolation: 'linear' }, { id: 'end', beat: 2, value: 0.9, interpolation: 'linear' }] }
  return { ...p, name: 'Automation sweep', tempo: 120, tracks: [{ ...t, id: 'sweep', name: 'Sweep', volume: 0.2, patch: noteGraphFrom([{ id: 'osc', type: 'oscillator', params: { frequency: 440, waveform: 2 } }, { id: 'filter', type: 'filter', params: { cutoff: 2000 } }, { id: 'out', type: 'output' }], ['osc.out>filter.in', 'filter.out>out.in']), clips: [{ ...createClip('Sweep clip', 2, [createNote(60, 0, 2, 1)]), id: 'sweep-clip', automation: [lane] }, null, null, null] }] }
}

export const slotSweepProject = (): Project => {
  const p = sweepProject()
  const target: ControlTarget = { kind: 'graph', owner: { kind: 'master' }, domain: 'fx', path: [], nodeId: 'master-filter', nodeType: 'filter', paramId: 'cutoff' }
  const fx = noteGraphFrom([{ id: 'in', type: 'masterIn' }, { id: 'master-filter', type: 'filter', params: { cutoff: 2000 } }, { id: 'out', type: 'trackOut' }], ['in.out>master-filter.in', 'master-filter.out>out.in'])
  let result: Project = { ...p, master: { ...p.master, fx: { ...fx, nodes: fx.nodes.map((n) => n.id === 'master-filter' ? { ...n, stereo: true } : n) } }, tracks: [...p.tracks.map((t) => ({ ...t, sends: { throw: 0.5 } })), { ...createReturnTrack('Throw'), id: 'throw' }] }
  result = setAutomationSlot(result, target.owner, 0, { id: 'master-slot', name: 'Master sweep', lengthBeats: 3, automation: [{ id: 'master-lane', target, enabled: true, points: [{ id: 'a', beat: 0, value: 0.1, interpolation: 'linear' }, { id: 'b', beat: 3, value: 0.9, interpolation: 'linear' }] }] })
  return setAutomationSlot(result, { kind: 'track', trackId: 'throw' }, 0, { id: 'throw-slot', name: 'Return throw', lengthBeats: 1, automation: [{ id: 'throw-lane', target: { kind: 'mixer', owner: { kind: 'track', trackId: 'throw' }, control: 'volume' }, enabled: true, points: [{ id: 'a', beat: 0, value: 0, interpolation: 'hold' }, { id: 'b', beat: 0.5, value: 0.8, interpolation: 'hold' }] }] })
}

/** Note/helper automation plus a filter curve; deterministic pitch signal makes note actions audible. */
export const noteSweepProject = (): Project => {
  const p = sweepProject()
  return { ...p, tracks: p.tracks.map(t => ({ ...t,
    patch: noteGraphFrom([{ id: 'note', type: 'note' }, { id: 'gain', type: 'gain', params: { gain: .001 } }, { id: 'filter', type: 'filter', params: { cutoff: 2000 } }, { id: 'out', type: 'output' }], ['note.frequency>gain.in', 'gain.out>filter.in', 'filter.out>out.in']),
    noteGraph: noteGraphFrom([{ id: 'in', type: 'clipNotes' }, { id: 'amount', type: 'control', params: { value: 0, min: 0, max: 12 } }, { id: 'smooth', type: 'smooth', params: { time: .02 } }, { id: 'tr', type: 'transpose' }, { id: 'out', type: 'noteOut' }], ['in.out>tr.in', 'tr.out>out.in', 'amount.out>smooth.in', 'smooth.out>tr.param:semitones']),
    clips: t.clips.map(c => c && ({ ...c, notes: [createNote(60, 0, .5, 1), createNote(60, 1, .5, 1)], automation: [...c.automation!, { id: 'notes', enabled: true, target: { kind: 'graph' as const, owner: { kind: 'track' as const, trackId: t.id }, domain: 'notes' as const, path: [], nodeId: 'amount', nodeType: 'control', paramId: 'value' }, points: [{ id: 'a', beat: 0, value: 0, interpolation: 'hold' as const }, { id: 'b', beat: .75, value: 1, interpolation: 'hold' as const }] }] })),
  })) }
}
