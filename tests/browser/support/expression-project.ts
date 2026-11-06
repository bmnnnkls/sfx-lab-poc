import { type AutomationLane, type InstrumentTrack, type Patch, type Project, createClip, createDefaultFxGraph, createEmptyProject, createNote } from '../../../src/core'

/**
 * A sound that is a level, not a tone, so the audio tap's peak reads it: how far the held note's (bent) frequency is
 * from A4, 0.01 per semitone. Gated by the note, so a released voice is silent and is freed (with no envelope, the
 * voices of a looping clip would otherwise sound on together and add up).
 */
export const pitchLevelPatch: Patch = {
  nodes: [
    { id: 'n', type: 'note', x: 0, y: 0, params: {} },
    { id: 'midi', type: 'hzToMidi', x: 0, y: 0, params: {} },
    { id: 'less', type: 'subtract', x: 0, y: 0, params: { b: 69 } },
    { id: 'scale', type: 'multiply', x: 0, y: 0, params: { b: 0.01 } },
    { id: 'gated', type: 'multiply', x: 0, y: 0, params: {} },
    { id: 'o', type: 'output', x: 0, y: 0, params: {} },
  ],
  connections: [
    { id: 'w1', from: { node: 'n', port: 'frequency' }, to: { node: 'midi', port: 'hz' } },
    { id: 'w2', from: { node: 'midi', port: 'out' }, to: { node: 'less', port: 'a' } },
    { id: 'w3', from: { node: 'less', port: 'out' }, to: { node: 'scale', port: 'a' } },
    { id: 'w4', from: { node: 'scale', port: 'out' }, to: { node: 'gated', port: 'a' } },
    { id: 'w5', from: { node: 'n', port: 'gate' }, to: { node: 'gated', port: 'b' } },
    { id: 'w6', from: { node: 'gated', port: 'out' }, to: { node: 'o', port: 'in' } },
  ],
}

/** A bend lane on Bender, held at `value` (normalized: 0.5 is the wheel at rest, 1 all the way up). */
export const bendLane = (value: number): AutomationLane => ({
  id: 'bend-lane', enabled: true, target: { kind: 'expression', owner: { kind: 'track', trackId: 'bender' }, control: 'pitchBend' },
  points: [{ id: 'held', beat: 0, value, interpolation: 'hold' }],
})

/** Two instrument tracks at 120 BPM: Bender, whose clip *Held* holds A4 for a bar with `lanes`, and an empty Other. */
export const expressionProject = (lanes: readonly AutomationLane[] = []): Project => {
  const base = createEmptyProject(), track = base.tracks[0] as InstrumentTrack
  const clip = { ...createClip('Held', 4, [createNote(69, 0, 4, 1)]), id: 'held', ...(lanes.length && { automation: lanes }) }
  return {
    ...base, name: 'Expression lanes', tempo: 120,
    tracks: [
      { ...track, id: 'bender', name: 'Bender', patch: pitchLevelPatch, fx: createDefaultFxGraph(), clips: track.clips.map((_, i) => (i === 0 ? clip : null)) },
      { ...track, id: 'other', name: 'Other', patch: pitchLevelPatch, fx: createDefaultFxGraph(), clips: track.clips.map(() => null) },
    ],
  }
}
