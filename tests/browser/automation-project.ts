import { type AutomationLane, type ControlTarget, type InstrumentTrack, createClip, createEmptyProject, createNote, noteGraphFrom } from '../../src/core'
export const sweepTarget: ControlTarget = { kind: 'graph', owner: { kind: 'track', trackId: 'sweep' }, domain: 'patch', path: [], nodeId: 'filter', nodeType: 'filter', paramId: 'cutoff' }
export const sweepProject = (drawn = false) => {
  const p = createEmptyProject(), t = p.tracks[0] as InstrumentTrack
  const lane: AutomationLane = { id: 'sweep-lane', target: sweepTarget, enabled: true, points: drawn ? [] : [{ id: 'start', beat: 0, value: 0.1, interpolation: 'linear' }, { id: 'end', beat: 2, value: 0.9, interpolation: 'linear' }] }
  return { ...p, name: 'Automation sweep', tempo: 120, tracks: [{ ...t, id: 'sweep', name: 'Sweep', volume: 0.2, patch: noteGraphFrom([{ id: 'osc', type: 'oscillator', params: { frequency: 440, waveform: 2 } }, { id: 'filter', type: 'filter', params: { cutoff: 2000 } }, { id: 'out', type: 'output' }], ['osc.out>filter.in', 'filter.out>out.in']), clips: [{ ...createClip('Sweep clip', 2, [createNote(60, 0, 2, 1)]), id: 'sweep-clip', automation: [lane] }, null, null, null] }] }
}
