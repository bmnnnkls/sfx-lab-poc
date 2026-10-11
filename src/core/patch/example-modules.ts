import { type NoteGraphNodeSpec, noteGraphFrom } from './note-graph-builder'
import { type ModuleDefinition, exposedKnobId, exposedPortId } from './module-types'
import type { Patch } from './types'

/** A module that ships with the app, offered in the picker under Examples and copied into the project when it is first used. */
export interface ExampleModule {
  readonly definition: ModuleDefinition
  readonly description: string
  readonly keywords: readonly string[]
}

interface Partial {
  /** The partial's frequency as a multiple of the input pitch. */
  readonly ratio: number
  /** Its level until a knob is turned. */
  readonly level: number
  readonly label: string
}

const COLUMN = 220
const ROW = 70

/**
 * An additive voice: one sine oscillator per partial at `ratio` times the pitch, each through its own level, summed. Every level is a
 * knob of the module, so a use of it can be a sawtooth-like stack, a hollow odd-only tone or an organ registration. The input is the
 * pitch in Hz (wire a Note's frequency here; 220 Hz until something is wired), the output is the sum.
 */
const additive = (id: string, name: string, partials: readonly Partial[], outputGain: number): ModuleDefinition => {
  const specs: NoteGraphNodeSpec[] = [
    // The pitch comes in here once and fans out to every partial.
    { id: 'base', type: 'multiply', params: { a: 220, b: 1 } },
    ...partials.flatMap((partial, index): NoteGraphNodeSpec[] => [
      { id: `ratio${index}`, type: 'multiply', params: { b: partial.ratio } },
      { id: `sine${index}`, type: 'oscillator', params: { waveform: 0 } },
      { id: `level${index}`, type: 'gain', params: { gain: partial.level } },
    ]),
    { id: 'sum', type: 'gain', params: { gain: outputGain } },
  ]
  const wires = [
    ...partials.flatMap((_, index) => [`base.out>ratio${index}.a`, `ratio${index}.out>sine${index}.freq`, `sine${index}.out>level${index}.in`, `level${index}.out>sum.in`]),
  ]
  const built = noteGraphFrom(specs, wires)
  // Laid out in columns (pitch, ratio, oscillator, level) with one row per partial, and plain ids for the wires, so the definition is the same every time.
  const columnOf = (nodeId: string): number => (nodeId === 'base' ? 0 : nodeId === 'sum' ? 4 : ['ratio', 'sine', 'level'].indexOf(nodeId.replace(/\d+$/, '')) + 1)
  const rowOf = (nodeId: string): number => (/\d+$/.test(nodeId) ? Number(nodeId.match(/\d+$/)?.[0]) : (partials.length - 1) / 2)
  const patch: Patch = {
    nodes: built.nodes.map((node) => ({ ...node, x: 20 + columnOf(node.id) * COLUMN, y: 20 + rowOf(node.id) * ROW })),
    connections: built.connections.map((connection, index) => ({ ...connection, id: `${id}-w${index}` })),
  }
  return {
    id,
    name,
    patch,
    inputs: [{ id: exposedPortId({ node: 'base', port: 'a' }), label: 'Pitch', inner: { node: 'base', port: 'a' } }],
    outputs: [{ id: exposedPortId({ node: 'sum', port: 'out' }), label: 'Out', inner: { node: 'sum', port: 'out' } }],
    knobs: partials.map((partial, index) => ({ id: exposedKnobId(`level${index}`, 'gain'), label: partial.label, node: `level${index}`, param: 'gain' })),
  }
}

const harmonics = Array.from({ length: 8 }, (_, index): Partial => ({ ratio: index + 1, level: 1 / (index + 1), label: `Partial ${index + 1}` }))

/** A Hammond-style set of nine drawbars: the footages of 16', 5 1/3', 8', 4', 2 2/3', 2', 1 3/5', 1 1/3' and 1'. */
const DRAWBARS: ReadonlyArray<readonly [string, number]> = [
  ["16'", 0.5],
  ["5 1/3'", 1.5],
  ["8'", 1],
  ["4'", 2],
  ["2 2/3'", 3],
  ["2'", 4],
  ["1 3/5'", 5],
  ["1 1/3'", 6],
  ["1'", 8],
]
// A usual first registration: 16', 5 1/3' and 8' out, the rest in, so the module is an organ tone straight away.
const drawbars = DRAWBARS.map(([label, ratio], index): Partial => ({ ratio, level: index < 3 ? 0.8 : 0, label: `Drawbar ${label}` }))

export const OVERTONE_MODULE_ID = 'example-overtone-oscillator'
export const DRAWBAR_MODULE_ID = 'example-drawbar-organ'

export const exampleModules: readonly ExampleModule[] = [
  {
    definition: additive(OVERTONE_MODULE_ID, 'Overtone oscillator', harmonics, 0.35),
    description: 'Eight sine partials at 1x to 8x the pitch, each with its own level knob: a saw-like stack, a hollow odd-only tone, or anything between.',
    keywords: ['additive', 'harmonics', 'partials', 'overtone', 'synth', 'oscillator', 'spectrum', 'timbre'],
  },
  {
    definition: additive(DRAWBAR_MODULE_ID, 'Drawbar organ', drawbars, 0.4),
    description: 'Nine drawbars at the footages of a tonewheel organ (16 foot to 1 foot): pull them out for the registration you want.',
    keywords: ['organ', 'hammond', 'drawbar', 'additive', 'tonewheel', 'keys', 'synth'],
  },
]

export const findExampleModule = (id: string): ExampleModule | undefined => exampleModules.find((example) => example.definition.id === id)
