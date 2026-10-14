import { describe, expect, it } from 'vitest'
import { createBlankControl, setNodeMidi } from '../patch'
import { parseProject, serializeProject } from '../persistence'
import { applyMidiMessage, createDemoProject, editPatchAt, isMidiControllable, midiControlValue, patchAt } from './index'

const demo = createDemoProject()
const firstTrack = demo.tracks[0]!.id

/** The demo with a blank control of this kind on the first track's instrument, its params set, bound to a controller. */
const withControl = (kind: 'knob' | 'switch' | 'selector', params: Record<string, number>, binding = { cc: 21 }) => {
  let id = ''
  const project = editPatchAt(demo, { trackId: firstTrack }, (patch) => {
    const made = createBlankControl(patch, kind, { x: 0, y: 0 })
    id = made.controlId
    const node = made.patch.nodes.find((candidate) => candidate.id === id)!
    const tuned = { ...made.patch, nodes: made.patch.nodes.map((candidate) => (candidate === node ? { ...node, params: { ...node.params, ...params } } : candidate)) }
    return setNodeMidi(tuned, id, binding)
  })
  const node = () => patchAt(project, { trackId: firstTrack })!.nodes.find((candidate) => candidate.id === id)!
  return { project, id, node, read: (next: typeof project) => patchAt(next, { trackId: firstTrack })!.nodes.find((candidate) => candidate.id === id)! }
}

const cc = (value: number, number = 21, channel = 1) => ({ kind: 'cc' as const, cc: number, value, channel })

describe('MIDI controllers on controls', () => {
  it('a knob goes through its own range: 0 is min, 127 is max', () => {
    const { project, read } = withControl('knob', { min: 100, max: 200, value: 150 })
    expect(read(applyMidiMessage(project, cc(0))).params.value).toBe(100)
    expect(read(applyMidiMessage(project, cc(127))).params.value).toBe(200)
  })

  it('and its curve and step, as its widget would', () => {
    const { node } = withControl('knob', { min: 20, max: 20000, curve: 1, step: 0 })
    expect(midiControlValue(node(), 127 / 2)!.value).toBeCloseTo(Math.sqrt(20 * 20000), 0) // halfway on a log knob
    const stepped = withControl('knob', { min: 0, max: 10, step: 1 })
    expect(Number.isInteger(midiControlValue(stepped.node(), 50)!.value)).toBe(true)
  })

  it('a switch is on from 64 up; a selector picks the share of its positions', () => {
    expect(midiControlValue(withControl('switch', {}).node(), 64)).toEqual({ param: 'on', value: 1 })
    expect(midiControlValue(withControl('switch', {}).node(), 63)).toEqual({ param: 'on', value: 0 })
    const selector = withControl('selector', { count: 4 }).node()
    expect([0, 40, 80, 127].map((value) => midiControlValue(selector, value)!.value)).toEqual([0, 1, 2, 3])
  })

  it('only the bound controller on the bound channel moves it; any channel when none is set', () => {
    const { project, read } = withControl('knob', { min: 0, max: 1, value: 0.5 }, { cc: 21, channel: 2 } as { cc: number })
    expect(applyMidiMessage(project, cc(127, 22, 2))).toBe(project)
    expect(applyMidiMessage(project, cc(127, 21, 1))).toBe(project)
    expect(read(applyMidiMessage(project, cc(127, 21, 2))).params.value).toBe(1)
    const any = withControl('knob', { min: 0, max: 1, value: 0.5 })
    expect(any.read(applyMidiMessage(any.project, cc(127, 21, 9))).params.value).toBe(1)
  })

  it('returns the same project for notes, unbound controllers, or a value it already has', () => {
    const { project } = withControl('knob', { min: 0, max: 1, value: 1 })
    expect(applyMidiMessage(project, { kind: 'noteOn', channel: 1, note: 60, velocity: 1 })).toBe(project)
    expect(applyMidiMessage(project, cc(127))).toBe(project)
  })

  it('knobs, sliders, switches and selectors can be learned; indicators and pads cannot', () => {
    expect(['control', 'switch', 'selector'].every((type) => isMidiControllable({ type }))).toBe(true)
    expect(['xyPad', 'led', 'oscillator'].some((type) => isMidiControllable({ type }))).toBe(false)
  })

  it('a binding is saved and loaded; a malformed one is dropped', () => {
    const { project, id } = withControl('knob', {}, { cc: 74, channel: 3 } as { cc: number })
    const loaded = parseProject(serializeProject(project))
    expect(loaded.ok && patchAt(loaded.project, { trackId: firstTrack })!.nodes.find((node) => node.id === id)!.midi).toEqual({ cc: 74, channel: 3 })
    const broken = serializeProject(project).replace('"cc":74', '"cc":300')
    const reloaded = parseProject(broken)
    expect(reloaded.ok && patchAt(reloaded.project, { trackId: firstTrack })!.nodes.find((node) => node.id === id)!.midi).toBeUndefined()
  })

  it('forgetting a binding leaves no field', () => {
    const { project, id } = withControl('knob', {})
    const forgotten = editPatchAt(project, { trackId: firstTrack }, (patch) => setNodeMidi(patch, id, undefined))
    expect('midi' in patchAt(forgotten, { trackId: firstTrack })!.nodes.find((node) => node.id === id)!).toBe(false)
  })
})
