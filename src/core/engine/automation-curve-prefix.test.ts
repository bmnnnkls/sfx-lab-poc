import { expect, it } from 'vitest'
import { setAutomationSlot, type AutomationLane } from '../automation'
import type { ControlTarget } from '../control'
import { noteGraphFrom } from '../patch'
import { createClip, createEmptyProject, createNote, createReturnTrack, type InstrumentTrack, type Project } from '../project'
import { diffProject } from '../sync'
import { Engine } from './engine'

const RATE = 44100
const BAR = RATE * 2
const BEFORE = BAR - 8
const FRAMES = 128
const point = (value: number) => [{ id: 'p', beat: 0, value, interpolation: 'hold' as const }]
const lane = (id: string, target: ControlTarget, value: number): AutomationLane => ({ id, target, enabled: true, points: point(value) })
const patch = noteGraphFrom([{ id: 'dc', type: 'control', params: { value: 0.5 } }, { id: 'out', type: 'output' }], ['dc.out>out.in'])
const silence = noteGraphFrom([{ id: 'dc', type: 'control', params: { value: 0 } }, { id: 'out', type: 'output' }], ['dc.out>out.in'])
const gainGraph = (input: 'trackIn' | 'returnIn' | 'masterIn') => noteGraphFrom([
  { id: 'in', type: input }, { id: 'gain', type: 'gain', params: { gain: 0.2 } }, { id: 'out', type: 'trackOut' },
], ['in.out>gain.in', 'gain.out>out.in'])
const noteActions = [createNote(60, 4 - 6 / (RATE / 2), 2 / (RATE / 2), 1)]
const actionTrack = (source: InstrumentTrack): InstrumentTrack => ({ ...source, id: 'actions', patch: silence, clips: [createClip('Action clock', 4, noteActions)] })

const render = (engine: Engine, frames: number, chunk: number): Float32Array => {
  const result = new Float32Array(frames)
  for (let offset = 0; offset < frames; offset += chunk) {
    const left = new Float32Array(Math.min(chunk, frames - offset))
    engine.render(left, new Float32Array(left.length))
    result.set(left, offset)
  }
  return result
}

const assertBoundary = (actual: Float32Array, before: number, after: number): void => {
  for (let frame = 0; frame < FRAMES; frame++) {
    const expected = frame < 8 ? before : after
    expect(Math.abs(actual[frame]! - expected), `frame ${frame}`).toBeLessThan(0.00002)
  }
}

type TrackControl = 'volume' | 'pan' | 'send' | 'patch' | 'fx'
const trackTarget = (control: TrackControl): ControlTarget => {
  const owner = { kind: 'track' as const, trackId: 'source' }
  if (control === 'patch' || control === 'fx') return { kind: 'graph', owner, domain: control, path: [], nodeId: control === 'patch' ? 'dc' : 'gain', nodeType: control === 'patch' ? 'control' : 'gain', paramId: control === 'patch' ? 'value' : 'gain' }
  if (control === 'send') return { kind: 'mixer', owner, control, returnId: 'return' }
  return { kind: 'mixer', owner, control }
}
const trackExpected = (control: TrackControl, value: number): number => {
  if (control === 'pan') return Math.tanh(0.5 * Math.SQRT2 * Math.cos((value + 1) * Math.PI / 4))
  if (control === 'send') return Math.tanh(0.5 + 0.5 * value)
  return Math.tanh(0.5 * value)
}

for (const control of ['volume', 'pan', 'send', 'patch', 'fx'] as const) for (const chunk of [1, 97, 128]) {
  it(`keeps the disabled track ${control} override until the queued clip launches (${chunk}-frame partition)`, () => {
    const p = createEmptyProject(), source = p.tracks[0] as InstrumentTrack, target = trackTarget(control)
    const first = { ...createClip('A', 4, []), automation: [lane('old', target, 0.3)] }
    const second = { ...createClip('B', 4, []), automation: [lane('new', target, 0.4)] }
    const track: InstrumentTrack = { ...source, id: 'source', patch, volume: control === 'volume' ? 0.2 : control === 'patch' ? 0.5 : 1,
      pan: control === 'pan' ? 0.2 : 0, sends: control === 'send' ? { return: 0.2 } : source.sends,
      fx: control === 'fx' ? gainGraph('trackIn') : source.fx, clips: [first, second] }
    const project: Project = { ...p, tracks: control === 'send' ? [track, actionTrack(source), { ...createReturnTrack('Return'), id: 'return', volume: 1 }] : [track, actionTrack(source)] }
    const engine = new Engine(RATE)
    diffProject(null, project).forEach(command => engine.apply(command))
    engine.apply({ type: 'scene/launch', scene: 0 })
    engine.apply({ type: 'track/noteOn', trackId: 'source', note: { sourceId: 'held', channel: 0, noteId: 'dc' }, pitch: 60, velocity: 1 })
    render(engine, BEFORE, 128)
    engine.apply({ type: 'automation/overrides', values: [{ target, value: 0.7 }] })
    const disabled: Project = { ...project, tracks: [{ ...track, clips: [{ ...first, automation: [{ ...first.automation[0]!, enabled: false }] }, second] }, ...project.tracks.slice(1)] }
    diffProject(project, disabled).forEach(command => engine.apply(command))
    expect(engine.status().automationOverrides).toEqual([{ target, value: 0.7 }])
    engine.apply({ type: 'clip/launch', trackId: 'source', clipId: second.id })
    const actual = render(engine, FRAMES, chunk)
    assertBoundary(actual, trackExpected(control, 0.7), trackExpected(control, control === 'pan' ? -0.2 : control === 'fx' ? 0.8 : 0.4))
    expect(engine.status().automationOverrides).toEqual([])
  })
}

type DedicatedControl = 'master-volume' | 'master-fx' | 'return-volume' | 'return-fx'
const dedicatedTarget = (control: DedicatedControl): ControlTarget => {
  const owner = control.startsWith('master') ? { kind: 'master' as const } : { kind: 'track' as const, trackId: 'return' }
  return control.endsWith('fx')
    ? { kind: 'graph', owner, domain: 'fx', path: [], nodeId: 'gain', nodeType: 'gain', paramId: 'gain' }
    : { kind: 'mixer', owner, control: 'volume' }
}

for (const control of ['master-volume', 'master-fx', 'return-volume', 'return-fx'] as const) for (const chunk of [97, 128]) {
  it(`keeps the disabled ${control} slot override until its queued slot launches (${chunk}-frame partition)`, () => {
    const p = createEmptyProject(), source = p.tracks[0] as InstrumentTrack, target = dedicatedTarget(control)
    const projectWithSource: Project = { ...p, sceneCount: 2,
      master: { ...p.master, volume: control === 'master-volume' ? 0.2 : 1, fx: control === 'master-fx' ? gainGraph('masterIn') : p.master.fx },
      tracks: [{ ...source, id: 'source', patch, volume: 1, sends: control.startsWith('return') ? { return: 1 } : source.sends,
        clips: [{ ...createClip('A', 4, []), id: 'clip' }] }, actionTrack(source),
        { ...createReturnTrack('Return'), id: 'return', volume: control === 'return-volume' ? 0.2 : 1,
          fx: control === 'return-fx' ? gainGraph('returnIn') : createReturnTrack('Return').fx }],
    }
    const owner = target.owner
    const first = { id: 'first', name: 'First', lengthBeats: 4, automation: [lane('old', target, 0.3)] }
    const second = { id: 'second', name: 'Second', lengthBeats: 4, automation: [lane('new', target, 0.4)] }
    const withFirst = setAutomationSlot(projectWithSource, owner, 0, first)
    const project = setAutomationSlot(withFirst, owner, 1, second)
    const engine = new Engine(RATE)
    diffProject(null, project).forEach(command => engine.apply(command))
    engine.apply({ type: 'scene/launch', scene: 0 })
    engine.apply({ type: 'track/noteOn', trackId: 'source', note: { sourceId: 'held', channel: 0, noteId: 'dc' }, pitch: 60, velocity: 1 })
    render(engine, BEFORE, 128)
    engine.apply({ type: 'automation/overrides', values: [{ target, value: 0.7 }] })
    const disabled = setAutomationSlot(project, owner, 0, { ...first, automation: [{ ...first.automation[0]!, enabled: false }] })
    diffProject(project, disabled).forEach(command => engine.apply(command))
    expect(engine.status().automationOverrides).toEqual([{ target, value: 0.7 }])
    engine.apply({ type: 'automation/launch', owner, slotId: second.id })
    const actual = render(engine, FRAMES, chunk)
    const expected = (value: number) => control.startsWith('master') ? Math.tanh(0.5 * value) : Math.tanh(0.5 + 0.5 * value)
    assertBoundary(actual, expected(0.7), expected(control.endsWith('fx') ? 0.8 : 0.4))
    expect(engine.status().automationOverrides).toEqual([])
  })
}
