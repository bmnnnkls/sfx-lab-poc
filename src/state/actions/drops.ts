import { type ControlOwner, type LibraryCatalog, type SnapshotScope, type TrackItem, type TrackPlace, canMoveGroup, canMoveTrack, duplicateLibraryFolder, libraryItemDuplicate, moveLibraryEntry } from '@core'
import { useLibraryStore } from '../library-store'
import { useProjectStore } from '../project-store'
import { canRunAction, runAction, type RunOptions, settle } from '.'
import { canPasteClipOnLane, pasteClipOnLane } from './lane'
import { editLibrary, graphFitsOwner, insertionScope, insertLibraryClipAt, libraryClipFitsSlot, replaceGraph } from './library'
import { type LibrarySource, routingRefusal, saveToLibrary } from './library-save'
import { project, sessionClipOf, trackOf } from './lookup'
import { canPasteClipInSlot, pasteClipInSlot } from './slot'
import { canRecallPresetOn, recallPresetOn } from './sound'
import type { ActionContext, ActionReport, SubjectOf } from './types'

/** What is dragged: the subject of the thing picked up. It holds ids, read when it lands. */
export type DragPayload = SubjectOf<'clip' | 'sample' | 'sound' | 'library-item' | 'library-folder' | 'track' | 'group'>

/**
 * Where it lands: the subject of the place under the pointer. A lane carries the beat, a canvas the point, a track or
 * a group the side a dragged track or group lands on.
 */
export type DropTarget = SubjectOf<'slot' | 'lane' | 'track' | 'master' | 'canvas' | 'group' | 'library-folder' | 'library-root'>

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
  /** Why it can't land here now, when that is worth saying (*Uses Track audio from Kick*): the target's tooltip. */
  refusal?(payload: P, target: T, context: ActionContext): string | undefined
  /** The cursor: a move, or a copy (Alt held, or a drop that always copies). */
  effect(payload: P, target: T, modifiers: DropModifiers): 'copy' | 'move'
  /** An asynchronous drop resolves with a message to show (and a toast button), or throws one. */
  run(payload: P, target: T, context: ActionContext, modifiers: DropModifiers): void | Promise<string | ActionReport | void>
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

/** A library folder or root that something dragged in the Library's tree lands in: a folder's id, or null for the top level. */
type LibraryPlace = SubjectOf<'library-folder' | 'library-root'>
const destinationOf = (place: LibraryPlace): string | null => (place.kind === 'library-folder' ? place.folderId : null)
const libraryCatalog = (): LibraryCatalog => useLibraryStore.getState().catalog
const libraryFolderOf = ({ folderId }: SubjectOf<'library-folder'>) => libraryCatalog().folders.find((folder) => folder.id === folderId)

/** Whether a folder is `ancestor` or inside it. */
const isWithin = (folderId: string, ancestor: string): boolean => {
  const folders = libraryCatalog().folders
  for (let id: string | null = folderId, seen = 0; id !== null && seen <= folders.length; seen++) {
    if (id === ancestor) return true
    id = folders.find((folder) => folder.id === id)?.parentId ?? null
  }
  return false
}

/** Whether a place is a live folder, or a root that takes things (*My library*). */
const livePlace = (place: LibraryPlace) => (place.kind === 'library-root' ? place.root === 'mine' : !!libraryFolderOf(place) && !libraryFolderOf(place)!.trashed)

/** Copies with Alt; restoring from the trash or moving otherwise. */
const altCopies = (_payload: unknown, _place: unknown, { alt }: DropModifiers) => (alt ? 'copy' : 'move') as 'copy' | 'move'

/**
 * Library items and folders dragged in the Library's tree: onto a folder or *My library* they move there (Alt copies,
 * and a trashed one is restored there), onto the trash they are trashed. A preset goes where its sound goes, so it
 * only goes to the trash. Dropping where it already is does nothing, so it is refused.
 */
const libraryMoves = (['library-folder', 'library-root'] as const).flatMap((target) => [
  define<'library-item', typeof target>({
    id: `drop.library-item-on-${target === 'library-folder' ? 'folder' : 'root'}`,
    payload: 'library-item',
    target,
    accepts: (payload, place) => {
      const item = libraryItemOf(payload)
      if (!item || item.content.kind === 'preset' || !livePlace(place)) return false
      return !!item.trashed || item.folderId !== destinationOf(place)
    },
    effect: (payload, place, modifiers) => (libraryItemOf(payload)?.trashed ? 'move' : altCopies(payload, place, modifiers)),
    run: (payload, place, context, { alt }) => {
      const trashed = !!libraryItemOf(payload)?.trashed
      if (alt && !trashed) return editLibrary(context, (value) => libraryItemDuplicate(value, payload.itemId, destinationOf(place)), 'Copied')
      return editLibrary(context, (value) => moveLibraryEntry(value, payload.itemId, destinationOf(place)), trashed ? 'Restored' : 'Moved')
    },
  }),
  define<'library-folder', typeof target>({
    id: `drop.library-folder-on-${target === 'library-folder' ? 'folder' : 'root'}`,
    payload: 'library-folder',
    target,
    // Never into itself or a folder inside it.
    accepts: (payload, place) => {
      const folder = libraryFolderOf(payload), destination = destinationOf(place)
      if (!folder || !livePlace(place) || (destination !== null && isWithin(destination, folder.id))) return false
      return !!folder.trashed || folder.parentId !== destination
    },
    effect: (payload, place, modifiers) => (libraryFolderOf(payload)?.trashed ? 'move' : altCopies(payload, place, modifiers)),
    run: (payload, place, context, { alt }) => {
      const trashed = !!libraryFolderOf(payload)?.trashed
      if (alt && !trashed) return editLibrary(context, (value) => duplicateLibraryFolder(value, payload.folderId, destinationOf(place)), 'Copied')
      return editLibrary(context, (value) => moveLibraryEntry(value, payload.folderId, destinationOf(place)), trashed ? 'Restored' : 'Moved')
    },
  }),
])

/** Onto the trash: *Trash*, with its presets or contents. A trashed one is already there. */
const libraryTrash = [
  define<'library-item', 'library-root'>({
    id: 'drop.library-item-on-trash',
    payload: 'library-item',
    target: 'library-root',
    accepts: (payload, root, context) => root.root === 'trash' && canRunAction('library-item.trash', payload, context),
    effect: moves,
    run: (payload, _root, context) => runAction('library-item.trash', payload, context),
  }),
  define<'library-folder', 'library-root'>({
    id: 'drop.library-folder-on-trash',
    payload: 'library-folder',
    target: 'library-root',
    accepts: (payload, root, context) => root.root === 'trash' && canRunAction('library-folder.trash', payload, context),
    effect: moves,
    run: (payload, _root, context) => runAction('library-folder.trash', payload, context),
  }),
]

/** Payloads from the project that a library folder takes: saved there. */
type SavedPayload = SubjectOf<'track' | 'group' | 'clip' | 'sample' | 'sound'>

/**
 * What dropping `payload` on the library saves, or why it can't: an instrument track's *Instrument + notes*, an audio
 * or return track's or a bus's effects, a session clip, a sample, or a project preset on its own. Nothing to say
 * when the thing is gone (a snapshot, a deleted clip).
 */
const savedSourceOf = (payload: SavedPayload): { readonly source: LibrarySource } | { readonly reason?: string } => {
  const graph = (scope: SnapshotScope) => {
    const reason = routingRefusal(scope)
    return reason ? { reason } : { source: { kind: 'asset', scope } as const }
  }
  switch (payload.kind) {
    case 'track': {
      const track = trackOf(payload.trackId)
      if (!track) return {}
      return graph({ owner: trackOwner(track.id), domain: track.kind === 'instrument' ? 'patch' : 'fx' })
    }
    case 'group': {
      const group = project().groups?.find((candidate) => candidate.id === payload.groupId)
      if (!group) return {}
      return group.bus ? graph({ owner: groupOwner(group.id), domain: 'fx' }) : { reason: 'Sum the group to a bus first' }
    }
    case 'clip':
      return sessionClipOf(payload.trackId, payload.clipId) ? { source: { kind: 'clip', trackId: payload.trackId, clipId: payload.clipId } } : {}
    case 'sample':
      return project().samples.some((sample) => sample.id === payload.sampleId) ? { source: { kind: 'sample', sampleId: payload.sampleId } } : {}
    case 'sound':
      return presetOf(payload) ? { source: { kind: 'preset', presetId: payload.soundId } } : {}
  }
}

/**
 * Tracks, groups, session clips, samples and project presets dragged onto a library folder or *My library*: saved
 * there, always as a copy, the toast's *Show* revealing the new item. The trash takes none of them. External routing
 * is refused up front, with the reason as the target's tooltip.
 */
const librarySaves = (['library-folder', 'library-root'] as const).flatMap((target) =>
  (['track', 'group', 'clip', 'sample', 'sound'] as const).map((payload) =>
    define<SavedPayload['kind'], typeof target>({
      id: `drop.${payload}-on-library-${target === 'library-folder' ? 'folder' : 'root'}`,
      payload,
      target,
      accepts: (dragged, place) => livePlace(place) && 'source' in savedSourceOf(dragged),
      refusal: (dragged, place) => {
        if (!livePlace(place)) return undefined
        const saved = savedSourceOf(dragged)
        return 'reason' in saved ? saved.reason : undefined
      },
      effect: copies,
      run: (dragged, place, context) => {
        const saved = savedSourceOf(dragged)
        if ('source' in saved) return saveToLibrary(saved.source, context, destinationOf(place))
      },
    }),
  ),
)

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
  ...libraryMoves,
  ...libraryTrash,
  ...librarySaves,
]

/**
 * Why nothing takes `payload` on `target` now, when a drop of that kind says (*Sum the group to a bus first*); undefined
 * when a drop accepts it, or none has a reason.
 */
export const refusalFor = (payload: DragPayload, target: DropTarget, context: ActionContext): string | undefined => {
  if (dropFor(payload, target, context)) return undefined
  for (const drop of drops) {
    if (drop.payload !== payload.kind || drop.target !== target.kind) continue
    const reason = drop.refusal?.(payload, target, context)
    if (reason) return reason
  }
  return undefined
}

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
