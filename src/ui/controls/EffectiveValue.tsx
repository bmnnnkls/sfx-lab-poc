import { type ControlTarget, controlTargetKey, resolveControlTarget } from '@core'
import { useControlStore, useMidiStore, useProjectSelect, useProjectStore, useTouchStore, finishTargetTouch, touchDestination, useStatusStore } from '@state'
import { formatParam } from '../shared/param-scale'
/** Compact feedback only for an active override; the ordinary widget continues to display authored values. */
export const EffectiveValue = ({ target }: { target: ControlTarget }) => {
  const armed = useTouchStore((s) => s.armed)
  const recording = useTouchStore((s) => s.recording.includes(controlTargetKey(target)))
  const entry = useControlStore((state) => state.overrides.find((entry) => controlTargetKey(entry.target) === controlTargetKey(target)))
  const playback = useControlStore((state) => state.playback.find((entry) => controlTargetKey(entry.target) === controlTargetKey(target)))
  // What it shows of the project, so an edit elsewhere (another panel's knob) doesn't re-render it.
  const { resolved, mapping } = useProjectSelect(
    (project) => ({ resolved: resolveControlTarget(project, target), mapping: project.midiMappings?.find((m) => controlTargetKey(m.target) === controlTargetKey(target)) }),
    (a, b) => JSON.stringify(a) === JSON.stringify(b),
  )
  // Whether Touch could record here right now: a boolean, so the status updates don't re-render this.
  const destination = useStatusStore((s) => armed && !!touchDestination(useProjectStore.getState().project, target, s.status))
  const feedback = useMidiStore((state) => state.feedback)
  if (resolved.status !== 'available' || !resolved.automatable) return null
  if (armed && !entry && !destination) return <output title="Play a clip, an automation slot or the arrangement to record controls">Touch unavailable: no active destination</output>
  if (!entry && playback) return <output title={`Base: ${formatParam(resolved.spec, resolved.baseValue)}`}>Read: {formatParam(resolved.spec, playback.value)}</output>
  if (!entry) return mapping ? <output title="Current control value">MIDI: {feedback[mapping.id]?.state ?? (mapping.pickup ? 'pickup' : 'ready')} · {formatParam(resolved.spec, resolved.baseValue)}</output> : null
  return <output data-testid="effective-value" title={`Base: ${formatParam(resolved.spec, resolved.baseValue)}`}>{recording ? 'Touch recording' : playback ? 'Override' : 'Effective'}: {formatParam(resolved.spec, entry.value)} <button aria-label={playback ? "Re-enable automation" : "Release override"} onClick={() => { finishTargetTouch(target); useControlStore.getState().release(target) }}>↩</button></output>
}
