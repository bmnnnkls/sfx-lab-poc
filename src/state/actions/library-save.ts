import type { ControlOwner, SnapshotScope } from '@core'
import { useLibraryStore } from '../library-store'
import { project, sessionClipOf, trackOf } from './lookup'
import { startRename } from './rename'
import type { Action, ActionContext, ActionReport, Subject } from './types'

/** What is saved: a graph of an owner, a session clip, or a project sample. */
export type LibrarySource =
  | { readonly kind: 'asset'; readonly scope: SnapshotScope }
  | { readonly kind: 'clip'; readonly trackId: string; readonly clipId: string }
  | { readonly kind: 'sample'; readonly sampleId: string }

const ownerName = (owner: ControlOwner) =>
  owner.kind === 'master' ? 'Master' : owner.kind === 'group' ? (project().groups?.find((group) => group.id === owner.groupId)?.name ?? 'Group') : (trackOf(owner.trackId)?.name ?? 'Track')

/**
 * The name a save gives the new item, after its source: *Bass* for an instrument, *Bass effects*, *Bass notes*,
 * *Master effects*, a clip's or a sample's own name.
 */
export const libraryNameOf = (source: LibrarySource): string => {
  switch (source.kind) {
    case 'asset': {
      const name = ownerName(source.scope.owner)
      return source.scope.domain === 'fx' ? `${name} effects` : source.scope.domain === 'notes' ? `${name} notes` : name
    }
    case 'clip':
      return sessionClipOf(source.trackId, source.clipId)?.clip.name || 'Clip'
    case 'sample':
      return project().samples.find((sample) => sample.id === source.sampleId)?.name ?? 'Sample'
  }
}

/**
 * Saves `source` into the folder open in the Library (the top level when there is none, or it is gone), named after
 * the source. Resolves with "Saved *Bass* to *Drums*" and a *Show* button, which shows the new item in the Library
 * and starts renaming it. A refused capture (a graph with a track's audio in it) throws its reason.
 */
export const saveToLibrary = async (source: LibrarySource, context: ActionContext): Promise<ActionReport> => {
  const { library } = context
  const name = libraryNameOf(source)
  const before = await library.read()
  const open = useLibraryStore.getState().openFolder
  const folder = before.folders.find((candidate) => candidate.id === open && !candidate.trashed)
  const folderId = folder?.id ?? null
  const next =
    source.kind === 'asset'
      ? await library.saveAsset(source.scope, name, folderId)
      : source.kind === 'clip'
        ? await library.saveClip(source.trackId, source.clipId, name, folderId)
        : await library.saveSample(source.sampleId, name, folderId)
  useLibraryStore.getState().setCatalog(next)
  // The new item is the one id the catalog didn't have before; an asset's presets come with it.
  const known = new Set(before.items.map((item) => item.id))
  const added = next.items.filter((item) => !known.has(item.id))
  const item = added.find((candidate) => candidate.content.kind !== 'preset') ?? added[0]
  const message = `Saved ${name} to ${folder?.name ?? 'My library'}`
  if (!item) return { message }
  const subject: Subject = { kind: 'library-item', itemId: item.id }
  return {
    message,
    action: {
      label: 'Show',
      run: () => {
        useLibraryStore.getState().reveal(item.id)
        startRename(subject, { ...context, origin: 'library' })
      },
    },
  }
}

/** An owner's effects graph saved to the library: *Save effects to library* on an audio or return track, a bus, the master. */
export const saveEffectsAction = <S extends Subject>(id: string, owner: (subject: S) => ControlOwner, applies?: (subject: S) => boolean): Action<S> => ({
  id,
  title: 'Save effects to library',
  group: 'edit',
  ...(applies && { applies }),
  run: (subject, context) => saveToLibrary({ kind: 'asset', scope: { owner: owner(subject), domain: 'fx' } }, context),
})
