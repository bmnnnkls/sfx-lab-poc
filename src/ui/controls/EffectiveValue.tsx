import { type ControlTarget, controlTargetKey, resolveControlTarget } from '@core'
import { useControlStore, useMidiStore, useProjectStore } from '@state'
import { formatParam } from '../shared/param-scale'
/** Compact feedback only for an active override; the ordinary widget continues to display authored values. */
export const EffectiveValue = ({ target }: { target: ControlTarget }) => {
  const entry = useControlStore((state) => state.overrides.find((entry) => controlTargetKey(entry.target) === controlTargetKey(target)))
  const playback = useControlStore((state) => state.playback.find((entry) => controlTargetKey(entry.target) === controlTargetKey(target)))
  const project = useProjectStore((state) => state.project)
  const feedback = useMidiStore((state) => state.feedback)
  const mapping = project.midiMappings?.find((m) => controlTargetKey(m.target) === controlTargetKey(target))
  const resolved = resolveControlTarget(project, target)
  if (resolved.status !== 'available' || !resolved.automatable) return null
  if (!entry && playback) return <output title={`Base: ${formatParam(resolved.spec, resolved.baseValue)}`}>Read: {formatParam(resolved.spec, playback.value)}</output>
  if (!entry) return mapping ? <output title="Current control value">MIDI: {feedback[mapping.id]?.state ?? (mapping.pickup ? 'pickup' : 'ready')} · {formatParam(resolved.spec, resolved.baseValue)}</output> : null
  return <output data-testid="effective-value" title={`Base: ${formatParam(resolved.spec, resolved.baseValue)}`}>{playback ? 'Override' : 'Effective'}: {formatParam(resolved.spec, entry.value)} <button aria-label={playback ? "Re-enable automation" : "Release override"} onClick={() => useControlStore.getState().release(target)}>↩</button></output>
}
