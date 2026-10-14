import type { MidiBinding, Patch } from './types'

/** Binds a control node to a MIDI controller, or (`undefined`) forgets its binding. The same patch when nothing changes. */
export const setNodeMidi = (patch: Patch, id: string, binding: MidiBinding | undefined): Patch => {
  const node = patch.nodes.find((candidate) => candidate.id === id)
  if (!node) return patch
  if (node.midi?.cc === binding?.cc && node.midi?.channel === binding?.channel) return patch
  const { midi: _previous, ...rest } = node
  const next = binding === undefined ? rest : { ...rest, midi: binding.channel === undefined ? { cc: binding.cc } : { cc: binding.cc, channel: binding.channel } }
  return { ...patch, nodes: patch.nodes.map((candidate) => (candidate === node ? next : candidate)) }
}
