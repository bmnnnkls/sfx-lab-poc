import { addNode, connect, createNode, setNodeParam, setNodeSample } from './edit'
import type { Patch } from './types'

const EMPTY: Patch = { nodes: [], connections: [] }

/** note -> sampler -> gain -> output: plays `sampleId` one-shot whenever a note arrives. */
export const createSamplerPatch = (sampleId: string): Patch => {
  const note = createNode('note', 20, 100)
  const sampler = createNode('sampler', 240, 80)
  const gain = createNode('gain', 480, 100)
  const output = createNode('output', 700, 130)

  let patch = [note, sampler, gain, output].reduce(addNode, EMPTY)
  patch = setNodeSample(patch, sampler.id, sampleId)
  patch = setNodeParam(patch, gain.id, 'gain', 0.8)

  const wires: Array<[string, string, string, string]> = [
    [note.id, 'frequency', sampler.id, 'freq'],
    [note.id, 'gate', sampler.id, 'gate'],
    [sampler.id, 'out', gain.id, 'in'],
    [gain.id, 'out', output.id, 'in'],
  ]
  for (const [fromNode, fromPort, toNode, toPort] of wires) {
    patch = connect(patch, { node: fromNode, port: fromPort }, { node: toNode, port: toPort })
  }
  return patch
}
