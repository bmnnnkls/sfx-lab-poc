import { type ControlResolution, type MidiMapping, type MidiMessage, type Project, type ControlTarget, type ParamSpec, controlGraph, flatControlNodeId, flattenPatch, controlFromNormalized, controlToNormalized, controlTargetKey, isLearnableCC, midiSourceKey, resolveControlTarget } from '@core'
import { createControlGesture, editMidiMappings, useControlStore, useMidiStore, useProjectStore } from '@state'

const discrete = (target: ControlTarget, spec: ParamSpec): boolean => !!spec.options || target.kind === 'graph' && (target.nodeType === 'switch' || target.nodeType === 'selector')
const momentary = (project: Project, target: ControlTarget): boolean => {
  if (target.kind !== 'graph' || target.nodeType !== 'switch' || target.paramId !== 'on') return false
  const graph = controlGraph(project, target.owner, target.domain)
  return !!graph && (flattenPatch(graph, project.modules).nodes.find((node) => node.id === flatControlNodeId(target))?.params.mode ?? 0) >= 1
}

/** Runs `flush` once soon: before the next frame is drawn, or after 50 ms when frames have stopped (a hidden tab). */
export type FlushScheduler = (flush: () => void) => void

/**
 * Frames, as a pointer drag is throttled (`frame-throttle.ts`), with a timer as a fallback for a hidden tab, where frames
 * stop. Where there are no frames at all (tests, non-DOM hosts), at once.
 */
export const nextFrame: FlushScheduler = (flush) => {
  if (typeof requestAnimationFrame === 'undefined') return flush()
  let done = false
  const once = () => { if (!done) { done = true; flush() } }
  requestAnimationFrame(once)
  setTimeout(once, 50)
}

type Feedback = { state: 'pickup' | 'active' | 'unavailable'; value?: number }
type Gesture = ReturnType<typeof createControlGesture>
interface MappingState {
  previous?: number
  expected?: number
  active: boolean
  gesture: Gesture
  mapping?: MidiMapping
  /** What `resolved` and `momentary` were worked out from: resolving flattens the target's graph, so not on every message. */
  project?: Project
  resolved?: ControlResolution
  momentary?: boolean
  held?: boolean
}

/**
 * CC state is main-thread feedback, independent of the audio status stream.
 *
 * A turning knob sends tens to a hundred messages a second, and every value written to the project is an edit (history,
 * a project diff for the engine, re-rendered panels). So each message is read at once (pickup, crossing, what the value
 * would be), but a continuous value is written only once per frame, the latest one per mapping, and the feedback shown
 * with it. Switches and selectors are written at once: they change rarely and a momentary press has a begin and an end.
 */
export const createMidiControls = (schedule: FlushScheduler = nextFrame) => {
  const states = new Map<string, MappingState>()
  /** The value each continuous mapping will write at the next flush. */
  const writes = new Map<string, { state: MappingState; target: ControlTarget; value: number; at: number }>()
  const feedbacks = new Map<string, Feedback>()
  let scheduled = false
  const flush = () => {
    scheduled = false
    const batch = [...writes.values()]
    writes.clear()
    for (const write of batch) write.state.gesture.change([{ target: write.target, value: write.value }], write.at)
    if (feedbacks.size === 0) return
    const shown = Object.fromEntries(feedbacks)
    feedbacks.clear()
    useMidiStore.setState((s) => ({ feedback: { ...s.feedback, ...shown } }))
  }
  const later = () => {
    if (scheduled) return
    scheduled = true
    schedule(() => { if (scheduled) flush() })
  }
  /** Writes a mapping's waiting value now, before its gesture ends. */
  const writeNow = (id: string) => {
    const write = writes.get(id)
    if (!write) return
    writes.delete(id)
    write.state.gesture.change([{ target: write.target, value: write.value }], write.at)
  }
  const reset = () => {
    writes.clear(); feedbacks.clear(); scheduled = false
    for (const state of states.values()) state.gesture.end()
    states.clear(); useMidiStore.setState({ feedback: {} })
  }
  const release = (deviceId?: string, channel?: number, ids?: ReadonlySet<string>) => {
    for (const [id, state] of states) {
      const mapping = state.mapping
      if (ids && !ids.has(id)) continue
      if (deviceId !== undefined && mapping?.deviceId !== deviceId || channel !== undefined && mapping?.channel !== channel) continue
      // A source that goes away keeps the last value it sent.
      writeNow(id)
      if (mapping && state.momentary && state.held) {
        const resolved = resolveControlTarget(useProjectStore.getState().project, mapping.target)
        const override = useControlStore.getState().overrides.find((e) => controlTargetKey(e.target) === controlTargetKey(mapping.target))
        if (resolved.status === 'available' && resolved.automatable && controlToNormalized(resolved.spec, override?.value ?? resolved.baseValue) === state.expected) {
          if (override) useControlStore.getState().setOverride(mapping.target, 0)
          else state.gesture.change([{ target: mapping.target, value: 0 }])
        }
      }
      state.gesture.end(); states.delete(id); feedbacks.delete(id)
    }
    useMidiStore.setState((s) => ({ feedback: Object.fromEntries(Object.entries(s.feedback).filter(([id]) => states.has(id))) }))
  }
  /**
   * Acts on a CC that is mapped, or confirms one during MIDI learn. Returns whether it used the message: one it did not
   * is free to be expression on the tracks the keyboard plays.
   */
  const receive = (deviceId: string, deviceName: string, message: Extract<MidiMessage, { kind: 'cc' }>, timestamp = performance.now()): boolean => {
    if (!isLearnableCC(message.cc)) return false
    const channel = message.channel - 1
    const source = { deviceId, channel, cc: message.cc }
    const store = useMidiStore.getState()
    if (store.conflict && midiSourceKey(store.conflict.mapping) === midiSourceKey(source)) return true
    if (store.learning) {
      const resolved = resolveControlTarget(useProjectStore.getState().project, store.learning.target)
      if (resolved.status !== 'available' || !resolved.automatable) { store.cancelLearn(); return true }
      const mapping: MidiMapping = { ...source, deviceName, id: store.learning.replaceId ?? crypto.randomUUID(), target: store.learning.target, pickup: !discrete(store.learning.target, resolved.spec) }
      const existing = useProjectStore.getState().project.midiMappings?.find((m) => midiSourceKey(m) === midiSourceKey(mapping) && m.id !== store.learning?.replaceId)
      if (existing) useMidiStore.setState({ learning: undefined, conflict: { mapping, existingId: existing.id, replaceId: store.learning.replaceId } })
      else {
        editMidiMappings((mappings) => [...mappings.filter((m) => m.id !== mapping.id), mapping])
        store.cancelLearn()
      }
      // The confirming message never changes the target's value.
      return true
    }
    const project = useProjectStore.getState().project
    const mapping = project.midiMappings?.find((m) => midiSourceKey(m) === midiSourceKey(source))
    if (!mapping) return false
    let state = states.get(mapping.id)
    const fresh = state?.project !== project || state.mapping !== mapping
    const resolved = !fresh && state?.resolved ? state.resolved : resolveControlTarget(project, mapping.target)
    const feedback = (shown: Feedback['state'], value?: number) => { feedbacks.set(mapping.id, { state: shown, value }); later() }
    if (resolved.status !== 'available' || !resolved.automatable) { writes.delete(mapping.id); states.delete(mapping.id); feedback('unavailable'); return true }
    const override = useControlStore.getState().overrides.find((entry) => controlTargetKey(entry.target) === controlTargetKey(mapping.target))
    const playing = useControlStore.getState().playback.find((entry) => controlTargetKey(entry.target) === controlTargetKey(mapping.target))
    // A value still waiting to be written is where the control already is, as far as this source is concerned.
    const waiting = writes.get(mapping.id)?.value
    const current = controlToNormalized(resolved.spec, waiting ?? override?.value ?? playing?.value ?? resolved.baseValue)
    const position = message.value / 127
    if (!state) { state = { active: false, gesture: createControlGesture() }; states.set(mapping.id, state) }
    // A manual edit, undo, recall or effective override rearms pickup.
    if (state.expected !== undefined && Math.abs(current - state.expected) > 1e-8) { state.active = false; state.previous = undefined; state.gesture.end() }
    state.mapping = mapping
    if (fresh || state.resolved === undefined) {
      state.project = project
      state.resolved = resolved
      state.momentary = momentary(project, mapping.target)
    }
    state.expected = current
    const stepped = discrete(mapping.target, resolved.spec)
    const crossed = state.previous !== undefined && (state.previous - current) * (position - current) <= 0
    if (!mapping.pickup || stepped || Math.abs(position - current) <= 0.5 / 127 || crossed) state.active = true
    state.previous = position
    if (!state.active) { feedback('pickup', override?.value ?? playing?.value ?? resolved.baseValue); return true }
    const value = controlFromNormalized(resolved.spec, position)
    if (stepped) {
      if (state.momentary && value >= 0.5 && !state.held) state.gesture.begin()
      state.gesture.change([{ target: mapping.target, value }], timestamp)
      if (state.momentary) {
        state.held = value >= 0.5
        if (!state.held) state.gesture.end(timestamp)
      }
    } else {
      writes.set(mapping.id, { state, target: mapping.target, value, at: timestamp })
    }
    state.expected = controlToNormalized(resolved.spec, value)
    feedback('active', value)
    return true
  }
  const reconcile = (mappings: readonly MidiMapping[]) => {
    const changed = new Set<string>()
    for (const [id, state] of states) {
      const next = mappings.find((m) => m.id === id), previous = state.mapping
      if (!next || !previous || midiSourceKey(next) !== midiSourceKey(previous) || controlTargetKey(next.target) !== controlTargetKey(previous.target) || next.pickup !== previous.pickup) changed.add(id)
    }
    release(undefined, undefined, changed)
  }
  return { receive, reset, release, reconcile, flush }
}
