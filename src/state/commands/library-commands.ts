import { canRunAction, runAction, type Subject } from '../actions'
import { project, sessionClipOf, trackOf } from '../actions/lookup'
import { useLayoutStore } from '../layout-store'
import { openFolder, useLibraryStore } from '../library-store'
import { useSelectionStore } from '../selection-store'
import type { Command, CommandContext } from './types'

/** What a save command runs now: a subject action, with its choice, and the name of what it reads. */
interface SaveTarget {
  readonly subject: Subject
  readonly action: string
  readonly choice?: string
  /** *Bass*, *Master*, *Drums bus*, *clip "Backbeat"*. */
  readonly of: string
}

/** A save target, or why there is none: the disabled command's tooltip. */
type Resolved = SaveTarget | { readonly reason: string }

const groupOf = (groupId: string) => project().groups?.find((group) => group.id === groupId)

/** The selected instrument track, or why the selection isn't one. */
const instrument = (choice: 'patch' | 'notes'): Resolved => {
  const { trackId, groupId, master } = useSelectionStore.getState()
  const track = !groupId && !master && trackId ? trackOf(trackId) : undefined
  if (track?.kind !== 'instrument') return { reason: 'Select an instrument track' }
  return { subject: { kind: 'track', trackId: track.id }, action: 'track.save-to-library', choice, of: track.name }
}

/** The selected track, bus or master, whose effects are saved; a folder group has none. */
const effects = (): Resolved => {
  const { trackId, groupId, master } = useSelectionStore.getState()
  if (master) return { subject: { kind: 'master' }, action: 'master.save-effects-to-library', of: 'Master' }
  if (groupId) {
    const group = groupOf(groupId)
    if (!group) return { reason: 'Select a track, a group bus or the master' }
    if (!group.bus) return { reason: 'Sum the group to a bus first' }
    return { subject: { kind: 'group', groupId }, action: 'group.save-effects-to-library', of: `${group.name} bus` }
  }
  const track = trackId ? trackOf(trackId) : undefined
  if (!track) return { reason: 'Select a track, a group bus or the master' }
  const subject: Subject = { kind: 'track', trackId: track.id }
  return track.kind === 'instrument' ? { subject, action: 'track.save-to-library', choice: 'fx', of: track.name } : { subject, action: 'track.save-effects-to-library', of: track.name }
}

/** The selected session clip, while it exists. */
const clip = (): Resolved => {
  const { trackId, clipId, groupId, master } = useSelectionStore.getState()
  const found = !groupId && !master && trackId && clipId ? sessionClipOf(trackId, clipId) : undefined
  if (!found || !trackId || !clipId) return { reason: 'Select a session clip' }
  return { subject: { kind: 'clip', trackId, clipId }, action: 'clip.save-to-library', of: `clip "${found.clip.name || 'Clip'}"` }
}

/** The selected sample, while it is in the project. */
const sample = (): Resolved => {
  const { sampleId } = useSelectionStore.getState()
  const found = sampleId ? project().samples.find((candidate) => candidate.id === sampleId) : undefined
  if (!found) return { reason: 'Select a sample' }
  return { subject: { kind: 'sample', sampleId: found.id }, action: 'sample.add-to-library', of: `sample "${found.name}"` }
}

/**
 * A command that runs a subject's *Save to library* on what is selected. Its label names what it will read; with
 * nothing of the right kind selected it shows its title, disabled, with the reason as its tooltip.
 */
const saveCommand = (id: string, title: string, label: (of: string) => string, resolve: () => Resolved, notRunnable?: (target: SaveTarget) => string): Command => {
  const runnable = (target: Resolved, context: CommandContext): target is SaveTarget => !('reason' in target) && canRunAction(target.action, target.subject, context, target.choice)
  return {
    id,
    category: 'Library',
    title,
    label: () => {
      const target = resolve()
      return 'reason' in target ? title : label(target.of)
    },
    tooltip: (context) => {
      const target = resolve()
      if ('reason' in target) return target.reason
      return runnable(target, context) ? undefined : notRunnable?.(target)
    },
    enabled: (context) => runnable(resolve(), context),
    run: (context) => {
      const target = resolve()
      if (runnable(target, context)) return runAction(target.action, target.subject, context, target.choice === undefined ? {} : { choice: target.choice })
    },
  }
}

/** The library's live items and folders, read from storage: the store's copy is empty until the Library is shown. */
const exportAll = async (context: CommandContext) => {
  const catalog = await context.library.read()
  useLibraryStore.getState().setCatalog(catalog)
  const itemIds = catalog.items.filter((item) => !item.trashed).map((item) => item.id)
  const folderIds = catalog.folders.filter((folder) => !folder.trashed).map((folder) => folder.id)
  if (itemIds.length === 0 && folderIds.length === 0) throw new Error('My library is empty')
  useLibraryStore.getState().setRequest({ kind: 'export', selection: { itemIds, folderIds }, name: 'My library' })
  useLayoutStore.getState().revealView('library')
}

/** The *Library* menu's commands: the saves of what is selected, and what *My library*'s own menu does. */
export const LIBRARY_COMMANDS: readonly Command[] = [
  saveCommand('library.save-instrument', 'Save instrument to library', (of) => `Save instrument of ${of} to library`, () => instrument('patch')),
  saveCommand('library.save-effects', 'Save effects to library', (of) => `Save effects of ${of} to library`, effects),
  saveCommand('library.save-notes', 'Save note effects to library', (of) => `Save note effects of ${of} to library`, () => instrument('notes'), ({ of }) => `${of} has no note effects`),
  saveCommand('library.save-clip', 'Save clip to library', (of) => `Save ${of} to library`, clip),
  saveCommand('library.save-sample', 'Add sample to library', (of) => `Add ${of} to library`, sample),
  {
    id: 'library.new-folder',
    category: 'Library',
    title: 'New folder',
    tooltip: 'In the folder open in the Library',
    takesFocus: true,
    // Inside the open folder, as the Library's own New folder; the rename shows in the Library.
    run: (context) => {
      const folderId = openFolder()
      return folderId === null ? runAction('library-root.new-folder', { kind: 'library-root', root: 'mine' }, context) : runAction('library-folder.new-folder', { kind: 'library-folder', folderId }, context)
    },
  },
  { id: 'library.import', category: 'Library', title: 'Import .sfxlib…', takesFocus: true, run: (context) => runAction('library-root.import', { kind: 'library-root', root: 'mine' }, context) },
  { id: 'library.export', category: 'Library', title: 'Export library…', tooltip: 'All of My library, through the bundle review', takesFocus: true, run: exportAll },
]
