import { type ControlTarget, resolveControlTarget } from '@core'
import { useAutomationEditor } from '../automation-store'
import { useMidiStore } from '../midi-store'
import { openClip } from '../navigation'
import { useSelectionStore } from '../selection-store'
import { project, trackOf } from './lookup'
import type { Action, SubjectOf } from './types'

type ControlSubject = SubjectOf<'control'>

/** An XY pad's axis, named in its entries when the control has more than one target. */
const axis = (target: ControlTarget) => (target.kind === 'graph' ? target.paramId.toUpperCase() : target.control)

const ownerTrack = (target: ControlTarget) => (target.owner.kind === 'track' ? trackOf(target.owner.trackId) : undefined)

/** Shows a control's lane: in a return's or the master's slot, or in the selected (or first) clip of a track. */
export const showAutomation = (target: ControlTarget) => {
  const track = ownerTrack(target)
  if (target.owner.kind === 'master' || track?.kind === 'return') {
    useAutomationEditor.getState().show(target)
    return
  }
  if (!track) return
  const selected = useSelectionStore.getState().clipId
  const clip = track.clips.find((candidate) => candidate?.id === selected) ?? track.clips.find(Boolean)
  if (clip) openClip(track.id, clip.id)
  useAutomationEditor.getState().show(target)
}

/** A control on a panel or in the mixer: one entry per target, so each XY axis has its own. */
export const controlActions: readonly Action<ControlSubject>[] = [
  {
    id: 'control.midi-learn',
    title: 'MIDI learn',
    group: 'edit',
    inline: true,
    choices: ({ targets }) =>
      targets.map((target, index) => {
        const resolved = resolveControlTarget(project(), target)
        const reason = resolved.status !== 'available' ? resolved.reason : resolved.automatable ? undefined : resolved.reason
        return {
          id: String(index),
          title: `${targets.length === 1 ? 'MIDI learn' : `MIDI learn ${axis(target)}`}${reason ? ` — ${reason}` : ''}`,
          enabled: resolved.status === 'available' && resolved.automatable,
        }
      }),
    run: ({ targets }, _context, choice) => {
      const target = targets[Number(choice ?? 0)]
      if (target) useMidiStore.getState().learn(target)
    },
  },
  {
    id: 'control.show-automation',
    title: 'Show automation',
    group: 'edit',
    inline: true,
    choices: ({ targets }) =>
      targets.map((target, index) => {
        const track = ownerTrack(target)
        return {
          id: String(index),
          // A group has no clips or slots to hold a lane: its automation comes with the arrangement's lanes.
          title: `Show automation${targets.length > 1 && target.kind === 'graph' ? ` ${target.paramId.toUpperCase()}` : ''}${target.owner.kind === 'group' ? ' — not on a group yet' : ''}`,
          enabled: target.owner.kind === 'master' || (!!track && (track.kind === 'return' || track.clips.some(Boolean))),
        }
      }),
    run: ({ targets }, _context, choice) => {
      const target = targets[Number(choice ?? 0)]
      if (target) showAutomation(target)
    },
  },
]
