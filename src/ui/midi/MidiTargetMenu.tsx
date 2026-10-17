import { type ControlTarget, resolveControlTarget } from '@core'
import { useMidiStore, useProjectStore } from '@state'
import type { ReactElement } from 'react'
import { ContextMenu } from '../shared/menu'

/** Each XY axis has its own explicit learn action. */
export const MidiTargetMenu = ({ targets, children }: { targets: readonly ControlTarget[]; children: ReactElement }) => {
  const project = useProjectStore((s) => s.project)
  if (!targets.length) return children
  return <ContextMenu entries={targets.map((target) => {
    const resolved = resolveControlTarget(project, target)
    const reason = resolved.status !== 'available' ? resolved.reason : resolved.automatable ? undefined : resolved.reason
    return {
      label: `${targets.length === 1 ? 'MIDI learn' : `MIDI learn ${target.kind === 'graph' ? target.paramId.toUpperCase() : target.control}`}${reason ? ` — ${reason}` : ''}`,
      disabled: resolved.status !== 'available' || !resolved.automatable,
      onSelect: () => useMidiStore.getState().learn(target),
    }
  })}>{children}</ContextMenu>
}
