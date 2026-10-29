import { type ControlOwner, type TrackItem, type TrackPlace, canMoveGroup, canMoveTrack } from '@core'
import { useLibraryStore } from '../library-store'
import { useProjectStore } from '../project-store'
import { canRunAction, runAction, type RunOptions, settle } from '.'
import { canPasteClipOnLane, pasteClipOnLane } from './lane'
import { graphFitsOwner, insertionScope, insertLibraryClipAt, libraryClipFitsSlot, replaceGraph } from './library'
import { project, sessionClipOf } from './lookup'
import { canPasteClipInSlot, pasteClipInSlot } from './slot'
import { canRecallPresetOn, recallPresetOn } from './sound'
import type { ActionContext, SubjectOf } from './types'

/** What is dragged: the subject of the thing picked up. It holds ids, read when it lands. */
export type DragPayload = SubjectOf<'clip' | 'sample' | 'sound' | 'library-item' | 'track' | 'group'>

/**
 * Where it lands: the subject of the place under the pointer. A lane carries the beat, a canvas the point, a track or
 * a group the side a dragged track or group lands on.
 */
export type DropTarget = SubjectOf<'slot' | 'lane' | 'track' | 'master' | 'canvas' | 'group'>

export interface DropModifiers {
  readonly alt: boolean
}

/** Something dragged onto something it fits: a round-5 action, or the body of its *Paste*, run with the dragged thing. */
export interface Drop<P extends DragPayload = DragPayload, T extends DropTarget = DropTarget> {
  /** 'drop.clip-on-lane'. */
  readonly id: string
  readonly payload: P['kind']
  readonly target: T['kind']
  /** Whether it can land here now. Refused drops show the "no drop" cursor. */
  accepts(payload: P, target: T, context: ActionContext): boolean
  /** The cursor: a move, or a copy (Alt held, or a drop that always copies). */
  effect(payload: P, target: T, modifiers: DropModifiers): 'copy' | 'move'
  /** An asynchronous drop resolves with a message to show, or throws one. */
  run(payload: P, target: T, context: ActionContext, modifiers: DropModifiers): void | Promise<string | void>
}

const define = <P extends DragPayload['kind'], T extends DropTarget['kind']>(drop: Drop<SubjectOf<P>, SubjectOf<T>>): Drop => drop as unknown as Drop

const copies = () => 'copy' as const
const presetOf = ({ soundId, preset }: SubjectOf<'sound'>) => (preset ? project().presets?.find((candidate) => candidate.id === soundId) : undefined)
const libraryItemOf = ({ itemId }: SubjectOf<'library-item'>) => useLibraryStore.getState().catalog.items.find((item) => item.id === itemId)
const trackOwner = (trackId: string): ControlOwner => ({ kind: 'track', trackId })
const MASTER: ControlOwner = { kind: 'master' }
const groupOwner = (groupId: string): ControlOwner => ({ kind: 'group', groupId })

/** The owner of a canvas's graph and which of its graphs it is, at the top level only: never inside a module. */
const canvasGraph = ({ target, path }: SubjectOf<'canvas'>): { owner: ControlOwner; domain: 'patch' | 'notes' | 'fx' } | undefined => {
  if (path.length > 0 || 'moduleId' in target) return undefined
  if ('groupId' in target) return { owner: groupOwner(target.groupId), domain: 'fx' }
  return 'trackId' in target ? { owner: trackOwner(target.trackId), domain: target.graph ?? 'patch' } : { owner: MASTER, domain: 'fx' }
}

const moves = () => 'move' as const

/** Where a track or group target's edge puts what is dropped on it; undefined without an edge. */
const placeAt = (target: SubjectOf<'track' | 'group'>): TrackPlace | undefined => {
  const item: TrackItem = target.kind === 'track' ? { kind: 'track', id: target.trackId } : { kind: 'group', id: target.groupId }
  switch (target.edge) {
    case 'before':
      return { before: item }
    case 'after':
      return { after: item }
    case 'inside':
      return target.kind === 'group' ? { inside: target.groupId } : undefined
    default:
      return undefined
  }
}

/** A track or a group dragged next to, or into, a track or a group: moved there, as *Move up* and *Move down* move it. */
const trackMoves = (['track', 'group'] as const).flatMap((target) => [
  define<'track', typeof target>({
    id: `drop.track-on-${target}`,
    payload: 'track',
    target,
    accepts: (payload, at) => {
      const place = placeAt(at)
      return !!place && canMoveTrack(project(), payload.trackId, place)
    },
    effect: moves,
    run: (payload, at) => useProjectStore.getState().moveTrack(payload.trackId, placeAt(at)!),
  }),
  define<'group', typeof target>({
    id: `drop.group-on-${target}`,
    payload: 'group',
    target,
    accepts: (payload, at) => {
      const place = placeAt(at)
      return !!place && canMoveGroup(project(), payload.groupId, place)
    },
    effect: moves,
    run: (payload, at) => useProjectStore.getState().moveGroup(payload.groupId, placeAt(at)!),
  }),
])

/** Every drop, by what is dragged and where it lands. Nothing else decides what a drop does. */
export const drops: readonly Drop[] = [
  define<'clip', 'slot'>({
    id: 'drop.clip-on-slot',
    payload: 'clip',
    target: 'slot',
    accepts: (clip, slot) => {
      const found = sessionClipOf(clip.trackId, clip.clipId)
      return !!found && canPasteClipInSlot(found.clip, slot.trackId, slot.scene)
    },
    // Moves it, as *Cut* then *Paste* would but keeping its id; Alt copies it, as *Paste* does.
    effect: (_clip, _slot, { alt }) => (alt ? 'copy' : 'move'),
    run: (clip, slot, _context, { alt }) => {
      const found = sessionClipOf(clip.trackId, clip.clipId)
      if (!found) return
      if (alt) pasteClipInSlot(found.clip, slot.trackId, slot.scene)
      else useProjectStore.getState().moveClip(clip.trackId, clip.clipId, slot.trackId, slot.scene)
    },
  }),
  define<'clip', 'lane'>({
    id: 'drop.clip-on-lane',
    payload: 'clip',
    target: 'lane',
    // On its own track it is *Add clip*, so the region keeps the source's id; on another track it is *Paste*.
    accepts: (clip, lane, context) => {
      const found = sessionClipOf(clip.trackId, clip.clipId)
      if (!found) return false
      return clip.trackId === lane.trackId ? canRunAction('lane.add-clip', lane, context, clip.clipId) : canPasteClipOnLane(found.clip, lane.trackId)
    },
    effect: copies,
    run: (clip, lane, context) => {
      const found = sessionClipOf(clip.trackId, clip.clipId)
      if (!found) return
      if (clip.trackId === lane.trackId) return runAction('lane.add-clip', lane, context, { choice: clip.clipId })
      pasteClipOnLane(found.clip, lane.trackId, lane.beat)
    },
  }),
  define<'sample', 'slot'>({
    id: 'drop.sample-on-slot',
    payload: 'sample',
    target: 'slot',
    accepts: (sample, slot, context) => canRunAction('slot.add-audio-clip', slot, context, sample.sampleId),
    effect: copies,
    run: (sample, slot, context) => runAction('slot.add-audio-clip', slot, context, { choice: sample.sampleId }),
  }),
  define<'sample', 'lane'>({
    id: 'drop.sample-on-lane',
    payload: 'sample',
    target: 'lane',
    accepts: (sample, lane, context) => canRunAction('lane.add-audio-clip', lane, context, sample.sampleId),
    effect: copies,
    run: (sample, lane, context) => runAction('lane.add-audio-clip', lane, context, { choice: sample.sampleId }),
  }),
  define<'sample', 'canvas'>({
    id: 'drop.sample-on-canvas',
    payload: 'sample',
    target: 'canvas',
    accepts: (sample, canvas, context) => canRunAction('canvas.add-sampler', canvas, context, sample.sampleId),
    effect: copies,
    run: (sample, canvas, context) => runAction('canvas.add-sampler', canvas, context, { choice: sample.sampleId }),
  }),
  define<'sound', 'track'>({
    id: 'drop.sound-on-track',
    payload: 'sound',
    target: 'track',
    accepts: (sound, track) => {
      const preset = presetOf(sound)
      return !!preset && canRecallPresetOn(preset, trackOwner(track.trackId))
    },
    effect: copies,
    run: async (sound, track) => recallPresetOn(presetOf(sound)!, trackOwner(track.trackId)),
  }),
  define<'sound', 'master'>({
    id: 'drop.sound-on-master',
    payload: 'sound',
    target: 'master',
    accepts: (sound) => {
      const preset = presetOf(sound)
      return !!preset && canRecallPresetOn(preset, MASTER)
    },
    effect: copies,
    run: async (sound) => recallPresetOn(presetOf(sound)!, MASTER),
  }),
  // A group with a bus takes effects presets and Group in effects; a folder has no graph to take them.
  define<'sound', 'group'>({
    id: 'drop.sound-on-group',
    payload: 'sound',
    target: 'group',
    accepts: (sound, group) => {
      const preset = presetOf(sound)
      return !!preset && canRecallPresetOn(preset, groupOwner(group.groupId))
    },
    effect: copies,
    run: async (sound, group) => recallPresetOn(presetOf(sound)!, groupOwner(group.groupId)),
  }),
  define<'library-item', 'slot'>({
    id: 'drop.library-item-on-slot',
    payload: 'library-item',
    target: 'slot',
    accepts: (payload, slot) => {
      const item = libraryItemOf(payload)
      return !!item && libraryClipFitsSlot(item, slot.trackId, slot.scene)
    },
    effect: copies,
    run: (payload, slot, context) => insertLibraryClipAt(libraryItemOf(payload)!, trackOwner(slot.trackId), slot.scene, context),
  }),
  define<'library-item', 'track'>({
    id: 'drop.library-item-on-track',
    payload: 'library-item',
    target: 'track',
    accepts: (payload, track) => {
      const item = libraryItemOf(payload)
      return !!item && graphFitsOwner(item, trackOwner(track.trackId))
    },
    effect: copies,
    run: (payload, track, context) => {
      const item = libraryItemOf(payload)!
      return replaceGraph(item, insertionScope(item, 'patch', trackOwner(track.trackId)), context)
    },
  }),
  define<'library-item', 'master'>({
    id: 'drop.library-item-on-master',
    payload: 'library-item',
    target: 'master',
    accepts: (payload) => {
      const item = libraryItemOf(payload)
      return !!item && graphFitsOwner(item, MASTER)
    },
    effect: copies,
    run: (payload, _master, context) => {
      const item = libraryItemOf(payload)!
      return replaceGraph(item, insertionScope(item, 'fx', MASTER), context)
    },
  }),
  define<'library-item', 'group'>({
    id: 'drop.library-item-on-group',
    payload: 'library-item',
    target: 'group',
    accepts: (payload, group) => {
      const item = libraryItemOf(payload)
      return !!item && graphFitsOwner(item, groupOwner(group.groupId))
    },
    effect: copies,
    run: (payload, group, context) => {
      const item = libraryItemOf(payload)!
      return replaceGraph(item, insertionScope(item, 'fx', groupOwner(group.groupId)), context)
    },
  }),
  define<'library-item', 'canvas'>({
    id: 'drop.library-item-on-canvas',
    payload: 'library-item',
    target: 'canvas',
    // Into this graph when it is the kind the item belongs to.
    accepts: (payload, canvas) => {
      const item = libraryItemOf(payload), graph = canvasGraph(canvas)
      return !!item && !!graph && graphFitsOwner(item, graph.owner) && insertionScope(item, graph.domain, graph.owner).domain === graph.domain
    },
    effect: copies,
    run: (payload, canvas, context) => {
      const item = libraryItemOf(payload)!, graph = canvasGraph(canvas)!
      return replaceGraph(item, insertionScope(item, graph.domain, graph.owner), context)
    },
  }),
  ...trackMoves,
]

/** The drop that would land `payload` on `target` now, or undefined when nothing accepts it there. */
export const dropFor = (payload: DragPayload, target: DropTarget, context: ActionContext): Drop | undefined =>
  drops.find((drop) => drop.payload === payload.kind && drop.target === target.kind && drop.accepts(payload, target, context))

/**
 * Lands `payload` on `target`, unless nothing accepts it there. An asynchronous drop's message, or the error it
 * throws, is reported when it settles, the toasts by default; the returned promise settles after that.
 */
export const runDrop = (payload: DragPayload, target: DropTarget, context: ActionContext, modifiers: DropModifiers, report?: RunOptions['report']): void | Promise<void> => {
  const drop = dropFor(payload, target, context)
  if (drop) return settle(drop.run(payload, target, context, modifiers), report)
}
