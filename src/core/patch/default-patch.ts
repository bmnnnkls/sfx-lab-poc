import { addNode, connect, createNode, setNodeParam } from './edit'
import type { Patch, PatchNode } from './types'

const EMPTY: Patch = { nodes: [], connections: [] }

/**
 * A classic subtractive voice: note -> oscillator -> filter -> VCA (enveloped) -> delay -> out.
 */
export const createDefaultPatch = (): Patch => {
  const note = createNode('note', 20, 120)
  const osc = createNode('oscillator', 220, 40)
  const filter = createNode('filter', 420, 40)
  const envelope = createNode('envelope', 220, 260)
  const vca = createNode('gain', 620, 120)
  const delay = createNode('delay', 820, 120)
  const output = createNode('output', 1020, 150)

  const nodes: PatchNode[] = [note, osc, filter, envelope, vca, delay, output]
  let patch = nodes.reduce(addNode, EMPTY)

  patch = setNodeParam(patch, osc.id, 'waveform', 1)
  patch = setNodeParam(patch, vca.id, 'gain', 0.3)

  const wires: Array<[PatchNode, string, PatchNode, string]> = [
    [note, 'frequency', osc, 'freq'],
    [note, 'gate', envelope, 'gate'],
    [osc, 'out', filter, 'in'],
    [filter, 'out', vca, 'in'],
    [envelope, 'out', vca, 'cv'],
    [vca, 'out', delay, 'in'],
    [delay, 'out', output, 'in'],
  ]
  for (const [source, sourcePort, target, targetPort] of wires) {
    patch = connect(
      patch,
      { node: source.id, port: sourcePort },
      { node: target.id, port: targetPort },
    )
  }
  return patch
}
