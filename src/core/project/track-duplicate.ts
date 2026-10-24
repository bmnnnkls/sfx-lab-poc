import type { AutomationLane } from '../automation'
import type { ControlTarget } from '../control'
import { createId } from '../shared'
import { MAX_TRACKS } from './edit'
import { NAME_LIMITS } from './rename'
import type { AutomationSlot, Project, Track } from './types'

/** A target of `from`'s controls, moved to `to`; anyone else's stays. */
const moveOwner = <T extends Pick<ControlTarget, 'owner'>>(target: T, from: string, to: string): T =>
  target.owner.kind === 'track' && target.owner.trackId === from ? { ...target, owner: { kind: 'track', trackId: to } } : target

const ownedBy = (target: Pick<ControlTarget, 'owner'>, trackId: string) => target.owner.kind === 'track' && target.owner.trackId === trackId

/** Lanes with fresh lane and point ids, moved to the copy. */
const copyLanes = (lanes: readonly AutomationLane[] | undefined, from: string, to: string) =>
  lanes?.map((lane) => ({ ...lane, id: createId('lane'), target: moveOwner(lane.target, from, to), points: lane.points.map((point) => ({ ...point, id: createId('point') })) }))

const copySlot = (slot: AutomationSlot | null, from: string, to: string): AutomationSlot | null => {
  if (!slot) return null
  const automation = copyLanes(slot.automation, from, to)
  return { ...slot, id: createId('slot'), ...(automation && { automation }) }
}

/**
 * Adds a copy of a track right after it, named "*name* copy": its graphs (with their module uses), clips (fresh clip,
 * note and lane ids, their lanes moved to the copy), mixer settings, a return's automation slots, and the authored
 * values and sample choices of its controls, so it sounds the same. It leaves out what belongs to the original: MIDI
 * mappings, snapshots and presets, arrangement regions, other tracks' sends to a return, and other note graphs' "notes
 * from this track" inputs. The same project at the file format's track limit, or for an unknown track.
 */
export const duplicateTrack = (project: Project, trackId: string): { project: Project; trackId: string | null } => {
  const index = project.tracks.findIndex((track) => track.id === trackId)
  const original = project.tracks[index]
  if (!original || project.tracks.length >= MAX_TRACKS) return { project, trackId: null }
  const id = createId('track')
  const base = { ...original, id, name: `${original.name} copy`.slice(0, NAME_LIMITS.track) }
  const copy: Track =
    base.kind === 'return'
      ? { ...base, ...(base.automationSlots && { automationSlots: base.automationSlots.map((slot) => copySlot(slot, trackId, id)) }) }
      : ({
          ...base,
          clips: base.clips.map((clip) => {
            if (!clip) return null
            const automation = copyLanes(clip.automation, trackId, id)
            return {
              ...clip,
              id: createId('clip'),
              ...('notes' in clip ? { notes: clip.notes.map((note) => ({ ...note, id: createId('note') })) } : {}),
              ...(automation && { automation }),
            }
          }),
        } as Track)
  const tracks = [...project.tracks.slice(0, index + 1), copy, ...project.tracks.slice(index + 1)]
  const controlValues = project.controlValues?.filter((entry) => ownedBy(entry.target, trackId)).map((entry) => ({ ...entry, target: moveOwner(entry.target, trackId, id) }))
  const sampleBindings = project.sampleBindings?.filter((entry) => ownedBy(entry.target, trackId)).map((entry) => ({ ...entry, target: moveOwner(entry.target, trackId, id) }))
  return {
    trackId: id,
    project: {
      ...project,
      tracks,
      ...(controlValues?.length && { controlValues: [...project.controlValues!, ...controlValues] }),
      ...(sampleBindings?.length && { sampleBindings: [...project.sampleBindings!, ...sampleBindings] }),
    },
  }
}
