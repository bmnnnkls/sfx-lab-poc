import { type LibraryCatalog, renameModule, putSnapshot, saveLibraryFolder, saveLibraryItem, setNodeName } from '@core'
import { useLayoutStore, type ViewId } from '../layout-store'
import { useLibraryStore } from '../library-store'
import { editPresetProject } from '../preset-actions'
import { useProjectStore } from '../project-store'
import { useRenameStore } from '../rename-store'
import type { Action, ActionContext, Subject, SubjectKind, SubjectOf } from './types'

/** Where each kind's name is drawn when a rename starts outside a view. */
const HOME: Partial<Record<SubjectKind, ViewId>> = {
  track: 'session',
  group: 'tracks',
  clip: 'session',
  scene: 'session',
  sample: 'samples',
  'library-item': 'library',
  'library-folder': 'library',
  sound: 'sounds',
  module: 'instrument',
  nodes: 'instrument',
}

/** Starts renaming `subject` in place, in the view the menu was opened in, which is shown if it is hidden. */
export const startRename = (subject: Subject, context: ActionContext): void => {
  const origin = context.origin ?? HOME[subject.kind]
  if (!origin) return
  useRenameStore.getState().start({ subject, origin })
  useLayoutStore.getState().revealView(origin)
}

/** The *Rename* entry of a kind's menu. */
export const renameAction = <K extends SubjectKind>(kind: K, applies?: (subject: SubjectOf<K>) => boolean): Action<SubjectOf<K>> => ({
  id: `${kind}.rename`,
  title: 'Rename',
  group: 'edit',
  takesFocus: true,
  ...(applies && { applies }),
  run: (subject, context) => startRename(subject, context),
})

const updateLibrary = async (context: ActionContext, edit: (catalog: LibraryCatalog) => LibraryCatalog) => {
  const catalog = await context.library.update(edit)
  useLibraryStore.getState().setCatalog(catalog)
  return catalog
}

/**
 * Gives `subject` a new name with its kind's setter, as one undo step for project edits. An empty name changes nothing.
 * The library's renames are asynchronous and resolve with the new catalog.
 */
export const commitRename = (subject: Subject, typed: string, context: ActionContext): void | Promise<LibraryCatalog> => {
  const name = typed.trim()
  if (name === '') return
  const store = useProjectStore.getState()
  switch (subject.kind) {
    case 'track':
      return store.setTrackName(subject.trackId, name)
    case 'group':
      return store.setGroupName(subject.groupId, name)
    case 'clip':
      return store.setClipName(subject.trackId, subject.clipId, name)
    case 'scene':
      return store.setSceneName(subject.scene, name)
    case 'sample':
      return store.setSampleName(subject.sampleId, name)
    case 'module':
      return store.updateModule(subject.moduleId, (module) => renameModule(module, name.slice(0, 60)))
    case 'sound':
      return editPresetProject((project) => {
        const cut = name.slice(0, 80)
        if (subject.preset) return { ...project, presets: project.presets?.map((preset) => (preset.id === subject.soundId ? { ...preset, name: cut } : preset)) }
        const snapshot = project.snapshots?.find((candidate) => candidate.id === subject.soundId)
        return snapshot ? putSnapshot(project, { ...snapshot, name: cut }) : project
      })
    case 'library-item':
      return updateLibrary(context, (catalog) => {
        const item = catalog.items.find((candidate) => candidate.id === subject.itemId)
        if (!item) throw new Error('That library item is gone')
        return saveLibraryItem(catalog, { ...item, name })
      })
    case 'library-folder':
      return updateLibrary(context, (catalog) => {
        const folder = catalog.folders.find((candidate) => candidate.id === subject.folderId)
        if (!folder) throw new Error('That library folder is gone')
        return saveLibraryFolder(catalog, name, folder.parentId, folder.id)
      })
    case 'nodes': {
      const [nodeId] = subject.nodeIds
      const moduleId = subject.path.at(-1)
      if (nodeId) store.editPatch(moduleId ? { moduleId } : subject.target, (patch) => setNodeName(patch, nodeId, name))
      return
    }
    default:
      return
  }
}
