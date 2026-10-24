import { type ControlTarget, resolveControlTarget } from '@core'
import { openClip, useMidiStore, useProjectStore, useSelectionStore, useAutomationEditor } from '@state'
import type { ReactElement } from 'react'
import { ContextMenu } from '../shared/menu'

/** Each XY axis has its own explicit learn action. */
export const MidiTargetMenu = ({ targets, children }: { targets: readonly ControlTarget[]; children: ReactElement }) => {
  const project = useProjectStore((s) => s.project)
  if (!targets.length) return children
  return <ContextMenu entries={[...targets.map((target) => {
    const resolved = resolveControlTarget(project, target)
    const reason = resolved.status !== 'available' ? resolved.reason : resolved.automatable ? undefined : resolved.reason
    return {
      label: `${targets.length === 1 ? 'MIDI learn' : `MIDI learn ${target.kind === 'graph' ? target.paramId.toUpperCase() : target.control}`}${reason ? ` — ${reason}` : ''}`,
      disabled: resolved.status !== 'available' || !resolved.automatable,
      onSelect: () => useMidiStore.getState().learn(target),
    }
  }), ...targets.map((target) => ({
    label: `Show automation${targets.length > 1 && target.kind === 'graph' ? ` ${target.paramId.toUpperCase()}` : ''}`,
    disabled: target.owner.kind === 'track' && !project.tracks.some((track) => track.id === (target.owner.kind === 'track' ? target.owner.trackId : '') && (track.kind === 'return' || track.clips.some(Boolean))),
    onSelect: () => {
      if (target.owner.kind === 'master' || project.tracks.find((t) => t.id === (target.owner.kind === 'track' ? target.owner.trackId : ''))?.kind === 'return') { useAutomationEditor.getState().show(target); return }
      if (target.owner.kind !== 'track') return
      const trackId = target.owner.trackId
      const track = project.tracks.find((track) => track.id === trackId)
      if (!track || track.kind === 'return') return
      const selected = useSelectionStore.getState().clipId
      const clip = track.clips.find((clip) => clip?.id === selected) ?? track.clips.find(Boolean)
      if (clip) openClip(trackId, clip.id)
      useAutomationEditor.getState().show(target)
    },
  }))]}>{children}</ContextMenu>
}
