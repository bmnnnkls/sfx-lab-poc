import type { AutomationLane } from '../automation'
import { createId } from '../shared'
import { MAX_SCENES } from './edit'
import type { AudioClip, AutomationSlot, Clip, MasterBus, Project, Track } from './types'

/*
 * Scenes are rows of the session grid. Every list indexed by scene moves together: each track's clips, the master's
 * and the returns' automation slots (which may be shorter than the row count), and `sceneNames`.
 */

type Row<T> = readonly (T | null)[]

/** `list` with `remove` entries at `scene` replaced by `insert`. A list that ends before `scene` is only padded when something is put there. */
const spliced = <T>(list: Row<T>, scene: number, remove: number, insert: readonly (T | null)[]): (T | null)[] => {
  const next = [...list]
  if (next.length < scene) {
    if (insert.every((entry) => entry === null)) return next
    while (next.length < scene) next.push(null)
  }
  next.splice(scene, remove, ...insert)
  return next
}

type Edit = <T>(list: Row<T>, copy: (entry: T) => T) => (T | null)[]

/** Every scene-indexed list, edited the same way; `copy` gives a duplicated entry its fresh ids. */
const editRows = (project: Project, sceneCount: number, edit: Edit, names: (names: readonly string[]) => string[]): Project => {
  const master: MasterBus = project.master.automationSlots ? { ...project.master, automationSlots: edit(project.master.automationSlots, copySlot) } : project.master
  const tracks = project.tracks.map((track): Track => {
    if (track.kind === 'return') return track.automationSlots ? { ...track, automationSlots: edit(track.automationSlots, copySlot) } : track
    return { ...track, clips: edit<Clip | AudioClip>(track.clips, copyClip) } as Track
  })
  const sceneNames = project.sceneNames && names(project.sceneNames)
  while (sceneNames?.at(-1) === '') sceneNames.pop()
  const { sceneNames: _old, ...rest } = project
  return { ...rest, sceneCount, master, tracks, ...(sceneNames?.length && { sceneNames }) }
}

const copyLanes = (lanes: readonly AutomationLane[] | undefined) =>
  lanes?.map((lane) => ({ ...lane, id: createId('lane'), points: lane.points.map((point) => ({ ...point, id: createId('point') })) }))

const copyClip = <T extends Clip | AudioClip>(clip: T): T => {
  const automation = copyLanes(clip.automation)
  return {
    ...clip,
    id: createId('clip'),
    ...('notes' in clip ? { notes: clip.notes.map((note) => ({ ...note, id: createId('note') })) } : {}),
    ...(automation && { automation }),
  }
}

const copySlot = (slot: AutomationSlot): AutomationSlot => {
  const automation = copyLanes(slot.automation)
  return { ...slot, id: createId('slot'), ...(automation && { automation }) }
}

const fits = (scene: number, last: number) => Number.isInteger(scene) && scene >= 0 && scene <= last

/** Inserts an empty scene before `at` (`at` = the row count adds one at the end). The same project at 64 scenes. */
export const insertScene = (project: Project, at: number): Project => {
  if (project.sceneCount >= MAX_SCENES || !fits(at, project.sceneCount)) return project
  return editRows(project, project.sceneCount + 1, (list) => spliced(list, at, 0, [null]), (names) => spliced(names, at, 0, ['']).map((name) => name ?? ''))
}

/** Inserts a copy of a scene after it: every clip and automation slot in the row, with fresh ids, and its name. */
export const duplicateScene = (project: Project, scene: number): Project => {
  if (project.sceneCount >= MAX_SCENES || !fits(scene, project.sceneCount - 1)) return project
  return editRows(
    project,
    project.sceneCount + 1,
    (list, copy) => {
      const entry = list[scene]
      return spliced(list, scene + 1, 0, [entry ? copy(entry) : null])
    },
    (names) => spliced(names, scene + 1, 0, [names[scene] ?? '']).map((name) => name ?? ''),
  )
}

/** Removes a scene and everything in its row. A project keeps at least one scene. */
export const removeScene = (project: Project, scene: number): Project => {
  if (project.sceneCount <= 1 || !fits(scene, project.sceneCount - 1)) return project
  return editRows(project, project.sceneCount - 1, (list) => spliced(list, scene, 1, []), (names) => spliced(names, scene, 1, []).map((name) => name ?? ''))
}
