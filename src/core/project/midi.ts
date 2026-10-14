import { controlValue, findNodeDefinition, fromSlider, liveSpec, snapToStep } from '../dsp'
import { MIDI_MAX, type MidiMessage } from '../midi'
import type { MidiBinding, Patch, PatchNode } from '../patch'
import type { Project, Track } from './types'

/** Whether a binding answers a controller message: the same number, and the same channel unless it takes any. */
const answers = (binding: MidiBinding | undefined, cc: number, channel: number): boolean =>
  binding !== undefined && binding.cc === cc && (binding.channel === undefined || binding.channel === channel)

/**
 * The parameter a controller value (0..127) sets on a control node, and the value: a knob or slider goes through its own range,
 * curve and step, as if its widget had been moved to that position; a switch is on from 64 up; a selector picks the position
 * that share of the way along. Undefined for a node that is not one of these.
 */
export const midiControlValue = (node: PatchNode, value: number): { readonly param: string; readonly value: number } | undefined => {
  const definition = findNodeDefinition(node.type)
  const position = Math.min(1, Math.max(0, value / MIDI_MAX))
  switch (definition?.panelKind) {
    case 'value': {
      const spec = definition.params.find((candidate) => candidate.id === 'value')
      if (!spec) return undefined
      const live = liveSpec(spec, node.params)
      const raw = snapToStep(live, fromSlider(live, position))
      return { param: 'value', value: controlValue(raw, node.params.min ?? 0, node.params.max ?? 1, node.params.step ?? 0) }
    }
    case 'switch':
      return { param: 'on', value: value >= 64 ? 1 : 0 }
    case 'selector': {
      const count = Math.max(1, Math.round(node.params.count ?? 4))
      return { param: 'index', value: Math.min(count - 1, Math.floor(position * count)) }
    }
    default:
      return undefined
  }
}

/** Whether a control of this kind can be moved by a MIDI controller (and so be learned). */
export const isMidiControllable = (node: Pick<PatchNode, 'type'>): boolean => {
  const kind = findNodeDefinition(node.type)?.panelKind
  return kind === 'value' || kind === 'switch' || kind === 'selector'
}

/** The patch with every control bound to this controller set from its value; the same patch when none is bound or nothing moves. */
const applyToPatch = (patch: Patch, cc: number, channel: number, value: number): Patch => {
  let changed = false
  const nodes = patch.nodes.map((node) => {
    if (!answers(node.midi, cc, channel)) return node
    const set = midiControlValue(node, value)
    if (!set || node.params[set.param] === set.value) return node
    changed = true
    return { ...node, params: { ...node.params, [set.param]: set.value } }
  })
  return changed ? { ...patch, nodes } : patch
}

const applyToTrack = (track: Track, cc: number, channel: number, value: number): Track => {
  const fx = applyToPatch(track.fx, cc, channel, value)
  if (track.kind !== 'instrument') return fx === track.fx ? track : { ...track, fx }
  const patch = applyToPatch(track.patch, cc, channel, value)
  const noteGraph = applyToPatch(track.noteGraph, cc, channel, value)
  return fx === track.fx && patch === track.patch && noteGraph === track.noteGraph ? track : { ...track, fx, patch, noteGraph }
}

/**
 * Moves every control bound to the controller of a CC message: in each track's graphs and the master's. Controls inside a
 * module's own patch are not reached (a module's controls are set per use, on the panel that uses it). The same project when
 * the message is not a CC, nothing is bound to it, or every bound control is already there.
 */
export const applyMidiMessage = (project: Project, message: MidiMessage): Project => {
  if (message.kind !== 'cc') return project
  const { cc, channel, value } = message
  const tracks = project.tracks.map((track) => applyToTrack(track, cc, channel, value))
  const fx = applyToPatch(project.master.fx, cc, channel, value)
  const tracksSame = tracks.every((track, index) => track === project.tracks[index])
  if (tracksSame && fx === project.master.fx) return project
  return { ...project, ...(tracksSame ? {} : { tracks }), ...(fx === project.master.fx ? {} : { master: { ...project.master, fx } }) }
}
