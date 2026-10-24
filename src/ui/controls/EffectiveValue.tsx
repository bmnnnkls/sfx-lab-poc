import { type ControlTarget, controlTargetKey, resolveControlTarget } from '@core'
import { useControlStore, useMidiStore, useProjectStore, useTouchStore, finishTargetTouch, touchDestination, useStatusStore } from '@state'
import { formatParam } from '../shared/param-scale'
/** Compact feedback only for an active override; the ordinary widget continues to display authored values. */
export const EffectiveValue = ({ target }: { target: ControlTarget }) => {
  const armed = useTouchStore((s) => s.armed)
  const recording = useTouchStore((s) => s.recording.includes(controlTargetKey(target)))
  const entry = useControlStore((state) => state.overrides.find((entry) => controlTargetKey(entry.target) === controlTargetKey(target)))
  const playback = useControlStore((state) => state.playback.find((entry) => controlTargetKey(entry.target) === controlTargetKey(target)))
  const project = useProjectStore((state) => state.project)
  // Whether Touch could record here right now: a boolean, so the status updates don't re-render this.
  const destination = useStatusStore((s) => armed && !!touchDestination(project, target, s.status))
  const feedback = useMidiStore((state) => state.feedback)
  const mapping = project.midiMappings?.find((m) => controlTargetKey(m.target) === controlTargetKey(target))
  const resolved = resolveControlTarget(project, target)
  if (resolved.status !== 'available' || !resolved.automatable) return null
  if (armed && !entry && !destination) return <output title="Play a clip or automation slot on this owner to record controls">Touch unavailable: no active destination</output>
  if (!entry && playback) return <output title={`Base: ${formatParam(resolved.spec, resolved.baseValue)}`}>Read: {formatParam(resolved.spec, playback.value)}</output>
  if (!entry) return mapping ? <output title="Current control value">MIDI: {feedback[mapping.id]?.state ?? (mapping.pickup ? 'pickup' : 'ready')} · {formatParam(resolved.spec, resolved.baseValue)}</output> : null
  return <output data-testid="effective-value" title={`Base: ${formatParam(resolved.spec, resolved.baseValue)}`}>{recording ? 'Touch recording' : playback ? 'Override' : 'Effective'}: {formatParam(resolved.spec, entry.value)} <button aria-label={playback ? "Re-enable automation" : "Release override"} onClick={() => { finishTargetTouch(target); useControlStore.getState().release(target) }}>↩</button></output>
}
