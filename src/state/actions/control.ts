import { type ControlTarget, resolveControlTarget, timelineOwnerAllowed } from '@core'
import { showTimelineAutomation, useAutomationEditor } from '../automation-store'
import { useMidiStore } from '../midi-store'
import { openClip } from '../navigation'
import { useSelectionStore } from '../selection-store'
import { project, trackOf } from './lookup'
import type { Action, SubjectOf } from './types'

type ControlSubject = SubjectOf<'control'>

/** An XY pad's axis, named in its entries when the control has more than one target. */
const axis = (target: ControlTarget) => (target.kind === 'graph' ? target.paramId.toUpperCase() : target.control)

/** An XY pad's axis after an entry's title, when the control has more than one target. */
const axisSuffix = (targets: readonly ControlTarget[], target: ControlTarget) => (targets.length > 1 && target.kind === 'graph' ? ` ${target.paramId.toUpperCase()}` : '')

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
    title: 'Show automation in clip',
    group: 'edit',
    inline: true,
    // A group has no clips or slots to hold a lane: its lanes are on the timeline only.
    applies: ({ targets }) => targets.some((target) => target.owner.kind !== 'group'),
    choices: ({ targets }) =>
      targets.flatMap((target, index) => {
        if (target.owner.kind === 'group') return []
        const track = ownerTrack(target)
        return [{
          id: String(index),
          title: `Show automation in clip${axisSuffix(targets, target)}`,
          enabled: target.owner.kind === 'master' || (!!track && (track.kind === 'return' || track.clips.some(Boolean))),
        }]
      }),
    run: ({ targets }, _context, choice) => {
      const target = targets[Number(choice ?? 0)]
      if (target) showAutomation(target)
    },
  },
  {
    id: 'control.show-timeline-automation',
    title: 'Show automation on timeline',
    group: 'edit',
    inline: true,
    // The lane takes the focus: the menu mustn't give it back to the control.
    takesFocus: true,
    choices: ({ targets }) =>
      targets.map((target, index) => {
        const resolved = resolveControlTarget(project(), target)
        return {
          id: String(index),
          title: `Show automation on timeline${axisSuffix(targets, target)}`,
          enabled: timelineOwnerAllowed(project(), target.owner) && resolved.status === 'available' && resolved.automatable,
        }
      }),
    run: ({ targets }, _context, choice) => {
      const target = targets[Number(choice ?? 0)]
      if (target) showTimelineAutomation(target)
    },
  },
]
