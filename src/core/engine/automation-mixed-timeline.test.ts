import { expect, it } from 'vitest'
import { type AutomationLane, setAutomationSlot } from '../automation'
import type { ControlOwner, ControlTarget } from '../control'
import { noteGraphFrom } from '../patch'
import { createClip, createEmptyProject, createNote, createReturnTrack, type Project, type InstrumentTrack } from '../project'
import { diffProject } from '../sync'
import { Engine } from './engine'

const owner = (trackId: string): ControlOwner => ({ kind: 'track', trackId })
const graphTarget = (owner: ControlOwner, domain: 'patch' | 'fx' | 'notes', nodeId: string, nodeType = 'control'): ControlTarget => ({ kind: 'graph', owner, domain, path: [], nodeId, nodeType, paramId: nodeType === 'transpose' ? 'semitones' : 'value' })
const mixer = (owner: ControlOwner, control: 'volume' | 'pan' | 'send'): ControlTarget => control === 'send' ? { kind: 'mixer', owner, control, returnId: 'r' } : { kind: 'mixer', owner, control }
const lane = (id: string, target: ControlTarget, a: number, b: number): AutomationLane => ({ id, target, enabled: true, points: [{ id: 'a', beat: 0, value: a, interpolation: 'linear' }, { id: 'b', beat: 1, value: b, interpolation: 'linear' }] })
const fx = (input: string) => {
  const graph = noteGraphFrom([{ id: 'in', type: input }, { id: 'level', type: 'control', params: { value: .5 } }, { id: 'gain', type: 'gain' }, { id: 'out', type: 'trackOut' }], ['in.out>gain.in', 'level.out>gain.param:gain', 'gain.out>out.in'])
  return { ...graph, nodes: graph.nodes.map(n => n.id === 'gain' && input === 'masterIn' ? { ...n, stereo: true } : n) }
}
for (const rate of [44100, 48000, 96000]) for (const bpm of [40, 120, 240]) for (const chunk of [1, 97, 128, 173, 4096]) {
  it(`slices simultaneous patch/fx/mixer/send/return/master curves through note actions (${rate}/${bpm}/${chunk})`, () => {
    const p = createEmptyProject(), t = p.tracks[0] as InstrumentTrack
    const patch = noteGraphFrom([{ id: 'level', type: 'control', params: { value: .2 } }, { id: 'out', type: 'output' }], ['level.out>out.in'])
    const noteGraph = noteGraphFrom([{ id: 'in', type: 'clipNotes' }, { id: 'tr', type: 'transpose' }, { id: 'out', type: 'noteOut' }], ['in.out>tr.in', 'tr.out>out.in'])
    const lanes = [lane('patch', graphTarget(owner('a'), 'patch', 'level'), .2, .8), lane('fx', graphTarget(owner('a'), 'fx', 'level'), .5, 1), lane('volume', mixer(owner('a'), 'volume'), .3, .9), lane('pan', mixer(owner('a'), 'pan'), .3, .7), lane('send', mixer(owner('a'), 'send'), .2, .7), lane('notes', graphTarget(owner('a'), 'notes', 'tr', 'transpose'), .5, .5)]
    const clip = { ...createClip('actions', 4, [createNote(60, 0, .004, 1), createNote(64, .005, .004, 1)]), automation: lanes }
    let project: Project = { ...p, tempo: bpm, master: { ...p.master, fx: fx('masterIn') }, tracks: [{ ...t, id: 'a', voices: 1, patch, noteGraph, fx: fx('trackIn'), sends: { r: 0 }, clips: [clip] }, { ...createReturnTrack('R'), id: 'r' }] }
    project = setAutomationSlot(project, owner('r'), 0, { id: 'return', name: 'R', lengthBeats: 4, automation: [lane('return-volume', mixer(owner('r'), 'volume'), .4, .8)] })
    project = setAutomationSlot(project, { kind: 'master' }, 0, { id: 'master', name: 'M', lengthBeats: 4, automation: [lane('master-fx', graphTarget({ kind: 'master' }, 'fx', 'level'), .5, 1), lane('master-volume', mixer({ kind: 'master' }, 'volume'), .8, .6)] })
    const e = new Engine(rate); diffProject(null, project).forEach(c => e.apply(c)); e.apply({ type: 'scene/launch', scene: 0 })
    const frames = 1024, left = new Float32Array(frames), right = new Float32Array(frames)
    for (let offset = 0; offset < frames; offset += chunk) {
      const n = Math.min(chunk, frames - offset), l = new Float32Array(n), r = new Float32Array(n)
      e.render(l, r); left.set(l, offset); right.set(r, offset)
    }
    for (let i = 0; i < frames; i++) {
      const beat = i * bpm / 60 / rate, pan = -.4 + .8 * beat
      const signal = (.2 + .6 * beat) * (.5 + .5 * beat) * (.3 + .6 * beat)
      const sent = (.2 + .5 * beat) * (.4 + .4 * beat)
      const master = (.5 + .5 * beat) * (.8 - .2 * beat)
      expect(Math.abs(left[i]! - Math.tanh(signal * (Math.SQRT2 * Math.cos((pan + 1) * Math.PI / 4) + sent) * master)), `frame ${i}: ${left[i]}, beat ${beat}`).toBeLessThan(.00002)
      expect(Math.abs(right[i]! - Math.tanh(signal * (Math.SQRT2 * Math.sin((pan + 1) * Math.PI / 4) + sent) * master))).toBeLessThan(.00002)
    }
  })
}
