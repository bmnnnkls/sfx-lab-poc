import { describe, expect, it } from 'vitest'
import { Engine } from '../engine'
import { type Project, addExampleModuleUse, addModuleUse, createClip, createDemoProject, createNote } from '../project'
import { DRAWBAR_MODULE_ID, OVERTONE_MODULE_ID, exampleModules, findExampleModule } from './example-modules'
import { createDefaultFxGraph } from './default-fx-graph'
import { createDefaultNoteGraph } from './default-note-graph'
import { flattenPatch } from './flatten'
import { addNode, connect, createNode, setNodeParam } from './edit'
import { createModuleUse, pruneModuleInterface } from './group-module'
import { moduleDomain } from './node-shape'
import { moduleControls } from './module-controls'
import { topologicalOrder } from './graph'
import type { Patch } from './types'

const RATE = 48000

describe('example modules', () => {
  it('have distinct ids and names, and every inner port and parameter they point at exists', () => {
    expect(new Set(exampleModules.map((example) => example.definition.id)).size).toBe(exampleModules.length)
    for (const { definition } of exampleModules) {
      expect(pruneModuleInterface(definition, []), definition.name).toEqual(definition)
      expect(topologicalOrder(definition.patch), `${definition.name} has no cycle`).not.toBeNull()
      expect(moduleDomain(definition, [])).toBe('audio')
      expect(definition.inputs.map((port) => port.label)).toEqual(['Pitch'])
      expect(definition.outputs.map((port) => port.label)).toEqual(['Out'])
    }
  })

  it('are the same every time they are built: plain node and wire ids', () => {
    const [first] = exampleModules
    expect(first!.definition.patch.nodes.map((node) => node.id).slice(0, 4)).toEqual(['base', 'ratio0', 'sine0', 'level0'])
    expect(first!.definition.patch.connections[0]!.id).toBe(`${OVERTONE_MODULE_ID}-w0`)
  })

  it('the overtone oscillator has 8 level knobs, the drawbar organ 9, named after what they are', () => {
    expect(findExampleModule(OVERTONE_MODULE_ID)!.definition.knobs.map((knob) => knob.label)).toEqual(Array.from({ length: 8 }, (_, i) => `Partial ${i + 1}`))
    const organ = findExampleModule(DRAWBAR_MODULE_ID)!.definition.knobs
    expect(organ).toHaveLength(9)
    expect(organ[0]!.label).toBe("Drawbar 16'")
  })

  it('every one has words for the picker', () => {
    for (const example of exampleModules) {
      expect(example.description.length).toBeGreaterThan(20)
      expect(example.keywords.length).toBeGreaterThan(2)
    }
  })

  it('contain no module of their own, so using one anywhere can never make a loop', () => {
    for (const { definition } of exampleModules) expect(definition.patch.nodes.some((node) => node.type === 'module')).toBe(false)
  })
})

describe('putting an example into a project', () => {
  const target = (project: Project) => ({ trackId: project.tracks.find((track) => track.kind === 'instrument')!.id, graph: 'patch' as const })

  it('copies the definition into the library the first time and uses it, as one edit', () => {
    const project = createDemoProject()
    const example = exampleModules[0]!.definition
    const next = addExampleModuleUse(project, target(project), example, 10, 20)
    expect(next.modules.map((module) => module.id)).toEqual([...project.modules.map((module) => module.id), example.id])
    const track = next.tracks.find((candidate) => candidate.kind === 'instrument')!
    expect(track.kind === 'instrument' && track.patch.nodes.at(-1)).toMatchObject({ type: 'module', moduleId: example.id, x: 10, y: 20 })
  })

  it('the second use shares the definition rather than copying it again, even after it was edited', () => {
    const project = createDemoProject()
    const example = exampleModules[0]!.definition
    const once = addExampleModuleUse(project, target(project), example, 0, 0)
    const edited = { ...once, modules: once.modules.map((module) => (module.id === example.id ? { ...module, name: 'My oscillator' } : module)) }
    const twice = addExampleModuleUse(edited, target(project), example, 5, 5)
    expect(twice.modules.filter((module) => module.id === example.id)).toHaveLength(1)
    expect(twice.modules.find((module) => module.id === example.id)!.name).toBe('My oscillator')
  })

  it('leaves the project alone when the place to put it is gone', () => {
    const project = createDemoProject()
    expect(addExampleModuleUse(project, { trackId: 'nope', graph: 'patch' }, exampleModules[0]!.definition, 0, 0)).toBe(project)
    expect(addModuleUse(project, target(project), 'missing', 0, 0)).toBe(project)
  })
})

/** Energy at one frequency (a Goertzel filter): how much of the sound is a sine of `frequency`. */
const amplitudeAt = (samples: Float32Array, frequency: number): number => {
  const omega = (2 * Math.PI * frequency) / RATE
  const coefficient = 2 * Math.cos(omega)
  let [s1, s2] = [0, 0]
  for (const sample of samples) {
    const s0 = sample + coefficient * s1 - s2
    s2 = s1
    s1 = s0
  }
  return (2 * Math.sqrt(s1 * s1 + s2 * s2 - coefficient * s1 * s2)) / samples.length
}

/** A note at `pitch` through a use of the example, rendered; its knob values given as `{ nodeId: level }`. */
const sound = (example: (typeof exampleModules)[number], pitch: number, levels: Record<string, number> = {}): Float32Array => {
  const { definition } = example
  let patch: Patch = { nodes: [], connections: [] }
  const note = createNode('note', 0, 0)
  const use = createModuleUse(definition, 200, 0)
  const output = createNode('output', 400, 0)
  for (const node of [note, use, output]) patch = addNode(patch, node)
  patch = connect(patch, { node: note.id, port: 'frequency' }, { node: use.id, port: definition.inputs[0]!.id }, { modules: [definition] })
  patch = connect(patch, { node: use.id, port: definition.outputs[0]!.id }, { node: output.id, port: 'in' }, { modules: [definition] })
  for (const [inner, level] of Object.entries(levels)) patch = setNodeParam(patch, use.id, `${inner}:gain`, level)
  const flat = flattenPatch(patch, [definition])
  const clip = createClip('c', 4, [createNote(pitch, 0, 4, 1)])
  const engine = new Engine(RATE)
  engine.apply({ type: 'transport/setTempo', bpm: 120 })
  engine.apply({
    type: 'track/add', kind: 'instrument', trackId: 't', patch: flat,
    noteGraph: createDefaultNoteGraph(), fx: createDefaultFxGraph(),
    clips: [clip],
    volume: 1, voices: 1,
  })
  engine.apply({ type: 'clip/launch', trackId: 't', clipId: clip.id })
  const left = new Float32Array(RATE)
  engine.render(left, new Float32Array(RATE))
  return left.subarray(RATE / 2)
}

describe('the overtone oscillator, rendered', () => {
  const example = findExampleModule(OVERTONE_MODULE_ID)!
  // A4 = 440 Hz.
  it('has energy at each partial in proportion to its level, and none between them', () => {
    const heard = sound(example, 69)
    const levels = [1, 2, 3, 4, 5].map((k) => amplitudeAt(heard, 440 * k))
    expect(levels[0]!).toBeGreaterThan(0.01)
    // Levels 1, 1/2, 1/3 ...: each partial is the first one over k.
    levels.forEach((level, index) => expect(level / levels[0]!).toBeCloseTo(1 / (index + 1), 1))
    expect(amplitudeAt(heard, 440 * 1.5)).toBeLessThan(levels[0]! * 0.05)
  })

  it('turning a partial\'s knob to 0 silences exactly that one', () => {
    const heard = sound(example, 69, { level1: 0 })
    expect(amplitudeAt(heard, 880)).toBeLessThan(amplitudeAt(heard, 440) * 0.01)
    expect(amplitudeAt(heard, 1320)).toBeGreaterThan(amplitudeAt(heard, 440) * 0.2)
  })

  it('odd partials only gives a hollow tone: no even harmonics', () => {
    const odd = Object.fromEntries([1, 3, 5, 7].map((i) => [`level${i}`, 0]))
    const heard = sound(example, 69, odd)
    expect(amplitudeAt(heard, 440 * 3)).toBeGreaterThan(amplitudeAt(heard, 440) * 0.2)
    expect(amplitudeAt(heard, 440 * 2)).toBeLessThan(amplitudeAt(heard, 440) * 0.01)
    expect(amplitudeAt(heard, 440 * 4)).toBeLessThan(amplitudeAt(heard, 440) * 0.01)
  })

  it('follows the pitch it is given', () => {
    const heard = sound(example, 57) // A3, 220 Hz
    expect(amplitudeAt(heard, 220)).toBeGreaterThan(0.01)
    expect(amplitudeAt(heard, 440)).toBeGreaterThan(amplitudeAt(heard, 220) * 0.4)
    expect(amplitudeAt(heard, 330)).toBeLessThan(amplitudeAt(heard, 220) * 0.05)
  })

  it('never leaves the range of the output', () => {
    const everything = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`level${i}`, 1]))
    const heard = sound(example, 69, everything)
    expect(heard.every((value) => Number.isFinite(value) && Math.abs(value) <= 1)).toBe(true)
  })
})

describe('the drawbar organ, rendered', () => {
  const example = findExampleModule(DRAWBAR_MODULE_ID)!
  it('starts as 16, 5 1/3 and 8 foot: sub-octave, fifth above the fundamental, fundamental, and nothing at the others', () => {
    const heard = sound(example, 69)
    expect(amplitudeAt(heard, 220)).toBeGreaterThan(0.01)
    expect(amplitudeAt(heard, 440)).toBeGreaterThan(0.01)
    expect(amplitudeAt(heard, 660)).toBeGreaterThan(0.01)
    // The master soft-clips, so a trace of intermodulation (660 + 220 is 880) is left: small beside the played partials.
    expect(amplitudeAt(heard, 880)).toBeLessThan(amplitudeAt(heard, 440) * 0.15)
  })

  it('pulling a drawbar out adds its footage', () => {
    const heard = sound(example, 69, { level3: 0.8 }) // 4 foot: an octave above
    expect(amplitudeAt(heard, 880)).toBeGreaterThan(amplitudeAt(sound(example, 69), 880) * 3)
    expect(amplitudeAt(heard, 880)).toBeGreaterThan(amplitudeAt(heard, 440) * 0.5)
  })
})

it('control nodes inside are not part of the examples (their knobs are module knobs)', () => {
  for (const { definition } of exampleModules) expect(moduleControls(definition)).toEqual([])
})
