import { type MidiMapping, type MidiMessage, type Project, type ControlTarget, type ParamSpec, controlGraph, flatControlNodeId, flattenPatch, controlFromNormalized, controlToNormalized, controlTargetKey, isLearnableCC, midiSourceKey, resolveControlTarget } from '@core'
import { createControlGesture, editMidiMappings, useControlStore, useMidiStore, useProjectStore } from '@state'

const discrete = (target: ControlTarget, spec: ParamSpec): boolean => !!spec.options || target.kind === 'graph' && (target.nodeType === 'switch' || target.nodeType === 'selector')
const momentary = (project: Project, target: ControlTarget): boolean => {
  if (target.kind !== 'graph' || target.nodeType !== 'switch' || target.paramId !== 'on') return false
  const graph = controlGraph(project, target.owner, target.domain)
  return !!graph && (flattenPatch(graph, project.modules).nodes.find((node) => node.id === flatControlNodeId(target))?.params.mode ?? 0) >= 1
}

/** CC state is main-thread feedback, independent of the audio status stream. */
export const createMidiControls = () => {
  const states = new Map<string, { previous?: number; expected?: number; active: boolean; gesture: ReturnType<typeof createControlGesture>; mapping?: MidiMapping; momentary?: boolean; held?: boolean }>()
  const reset = () => { for (const state of states.values()) state.gesture.end(); states.clear(); useMidiStore.setState({ feedback: {} }) }
  const release = (deviceId?: string, channel?: number, ids?: ReadonlySet<string>) => {
    for (const [id, state] of states) {
      const mapping = state.mapping
      if (ids && !ids.has(id)) continue
      if (deviceId !== undefined && mapping?.deviceId !== deviceId || channel !== undefined && mapping?.channel !== channel) continue
      if (mapping && state.momentary && state.held) {
        const resolved = resolveControlTarget(useProjectStore.getState().project, mapping.target)
        const override = useControlStore.getState().overrides.find((e) => controlTargetKey(e.target) === controlTargetKey(mapping.target))
        if (resolved.status === 'available' && resolved.automatable && controlToNormalized(resolved.spec, override?.value ?? resolved.baseValue) === state.expected) {
          if (override) useControlStore.getState().setOverride(mapping.target, 0)
          else state.gesture.change([{ target: mapping.target, value: 0 }])
        }
      }
      state.gesture.end(); states.delete(id)
    }
    useMidiStore.setState((s) => ({ feedback: Object.fromEntries(Object.entries(s.feedback).filter(([id]) => states.has(id))) }))
  }
  const receive = (deviceId: string, deviceName: string, message: Extract<MidiMessage, { kind: 'cc' }>, timestamp = performance.now()) => {
    if (!isLearnableCC(message.cc)) return
    const channel = message.channel - 1
    const source = { deviceId, channel, cc: message.cc }
    const store = useMidiStore.getState()
    if (store.conflict && midiSourceKey(store.conflict.mapping) === midiSourceKey(source)) return
    if (store.learning) {
      const resolved = resolveControlTarget(useProjectStore.getState().project, store.learning.target)
      if (resolved.status !== 'available' || !resolved.automatable) { store.cancelLearn(); return }
      const mapping: MidiMapping = { ...source, deviceName, id: store.learning.replaceId ?? crypto.randomUUID(), target: store.learning.target, pickup: !discrete(store.learning.target, resolved.spec) }
      const existing = useProjectStore.getState().project.midiMappings?.find((m) => midiSourceKey(m) === midiSourceKey(mapping) && m.id !== store.learning?.replaceId)
      if (existing) useMidiStore.setState({ learning: undefined, conflict: { mapping, existingId: existing.id, replaceId: store.learning.replaceId } })
      else {
        editMidiMappings((mappings) => [...mappings.filter((m) => m.id !== mapping.id), mapping])
        store.cancelLearn()
      }
      // The confirming message never changes the target's value.
      return
    }
    const mapping = useProjectStore.getState().project.midiMappings?.find((m) => midiSourceKey(m) === midiSourceKey(source))
    if (!mapping) return
    const resolved = resolveControlTarget(useProjectStore.getState().project, mapping.target)
    const feedback = (state: 'pickup' | 'active' | 'unavailable', value?: number) => useMidiStore.setState((s) => ({ feedback: { ...s.feedback, [mapping.id]: { state, value } } }))
    if (resolved.status !== 'available' || !resolved.automatable) { states.delete(mapping.id); feedback('unavailable'); return }
    const override = useControlStore.getState().overrides.find((entry) => controlTargetKey(entry.target) === controlTargetKey(mapping.target))
    const playing = useControlStore.getState().playback.find((entry) => controlTargetKey(entry.target) === controlTargetKey(mapping.target))
    const current = controlToNormalized(resolved.spec, override?.value ?? playing?.value ?? resolved.baseValue)
    const position = message.value / 127
    let state = states.get(mapping.id)
    if (!state) { state = { active: false, gesture: createControlGesture() }; states.set(mapping.id, state) }
    // A manual edit, undo, recall or effective override rearms pickup.
    if (state.expected !== undefined && Math.abs(current - state.expected) > 1e-8) { state.active = false; state.previous = undefined; state.gesture.end() }
    state.mapping = mapping
    state.momentary = momentary(useProjectStore.getState().project, mapping.target)
    state.expected = current
    const crossed = state.previous !== undefined && (state.previous - current) * (position - current) <= 0
    if (!mapping.pickup || discrete(mapping.target, resolved.spec) || Math.abs(position - current) <= 0.5 / 127 || crossed) state.active = true
    state.previous = position
    if (!state.active) { feedback('pickup', override?.value ?? playing?.value ?? resolved.baseValue); return }
    const value = controlFromNormalized(resolved.spec, position)
    if (state.momentary && value >= 0.5 && !state.held) state.gesture.begin()
    state.gesture.change([{ target: mapping.target, value }], timestamp)
    if (state.momentary) {
      state.held = value >= 0.5
      if (!state.held) state.gesture.end(timestamp)
    }
    state.expected = controlToNormalized(resolved.spec, value)
    feedback('active', value)
  }
  const reconcile = (mappings: readonly MidiMapping[]) => {
    const changed = new Set<string>()
    for (const [id, state] of states) {
      const next = mappings.find((m) => m.id === id), previous = state.mapping
      if (!next || !previous || midiSourceKey(next) !== midiSourceKey(previous) || controlTargetKey(next.target) !== controlTargetKey(previous.target) || next.pickup !== previous.pickup) changed.add(id)
    }
    release(undefined, undefined, changed)
  }
  return { receive, reset, release, reconcile }
}
