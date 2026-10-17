import { type ControlTarget, controlTargetKey, resolveControlTarget } from '@core'
import { useControlStore, useProjectStore } from '@state'
import { formatParam } from '../shared/param-scale'
/** Compact feedback only for an active override; the ordinary widget continues to display authored values. */
export const EffectiveValue = ({ target }: { target: ControlTarget }) => {
  const entry = useControlStore((state) => state.overrides.find((entry) => controlTargetKey(entry.target) === controlTargetKey(target)))
  const project = useProjectStore((state) => state.project)
  if (!entry) return null
  const resolved = resolveControlTarget(project, target)
  if (resolved.status !== 'available' || !resolved.automatable) return null
  return <output data-testid="effective-value" title={`Base: ${formatParam(resolved.spec, resolved.baseValue)}`}>Effective: {formatParam(resolved.spec, entry.value)} <button aria-label="Release override" onClick={() => useControlStore.getState().release(target)}>↩</button></output>
}
