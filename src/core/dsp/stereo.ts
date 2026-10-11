import { MAX_BLOCK_FRAMES } from './block'
import type { NodeDefinition, PortSpec } from './types'

/**
 * A stereo port carries one buffer laid out planar: the left channel in the first `MAX_BLOCK_FRAMES` samples, the
 * right channel in the next. Sums, seeding and allocation therefore work on it like on any buffer; only the
 * stereo-aware code (the sum into a stereo input, the nodes that make or read stereo) looks inside.
 */
export const STEREO_FRAMES = 2 * MAX_BLOCK_FRAMES

/** Where the right channel starts in a stereo buffer: `buffer[i]` is left, `buffer[RIGHT + i]` is right. */
export const RIGHT = MAX_BLOCK_FRAMES

export const isStereoBuffer = (buffer: Float32Array): boolean => buffer.length === STEREO_FRAMES

/** The left channel of a stereo buffer, as a view (allocates: for compiling and tests, not for per-block code). */
export const leftOf = (buffer: Float32Array): Float32Array => buffer.subarray(0, MAX_BLOCK_FRAMES)

/** The right channel of a stereo buffer, as a view (allocates: for compiling and tests, not for per-block code). */
export const rightOf = (buffer: Float32Array): Float32Array => buffer.subarray(RIGHT, STEREO_FRAMES)

const lifted = (ports: readonly PortSpec[]): PortSpec[] =>
  // Notes never become stereo, and a modulation input stays one signal that both channels follow.
  ports.map((port) => (port.control === true || (port.kind ?? 'signal') !== 'signal' ? port : { ...port, kind: 'stereo' }))

/**
 * The ports a node has when it runs in stereo: its signal ports become stereo, its modulation (`control`) ports stay
 * mono. Only for nodes that opt in with `stereoCapable`; the compiler runs one copy of the node per channel.
 */
export const stereoPorts = (definition: Pick<NodeDefinition, 'inputs' | 'outputs'>) => ({
  inputs: lifted(definition.inputs),
  outputs: lifted(definition.outputs),
})
