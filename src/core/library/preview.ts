import { createEmptyProject, createGroupBus, createTrack, createAudioTrack, createReturnTrack, createClip, createNote, type Project } from '../project'
import { createId } from '../shared'
import type { SnapshotScope } from '../preset'
import type { LibraryCatalog, LibraryItem } from './types'
import { insertLibraryAsset } from './assets'
import { insertLibraryClip } from './clips'
/** Temporary engine document. Effects receive a test tone; no live document/routing is consulted. */
export const libraryPreviewProject = (catalog: LibraryCatalog, item: LibraryItem): Project => {
  let project: Project = { ...createEmptyProject(), tracks: [] }
  const content = item.content
  if (content.kind === 'sample') throw new Error('Samples preview directly')
  const track = content.kind === 'audio-clip' ? createAudioTrack('Preview', project.sceneCount) : createTrack('Preview test tone', project.sceneCount)
  project = { ...project, tracks: [track] }
  if (content.kind === 'midi-clip' || content.kind === 'audio-clip') return insertLibraryClip(project, catalog, item, track.id, 0).project
  const payload = catalog.revisions.find(r => r.id === content.revisionId)?.payload
  if (!payload) throw new Error('Preview revision is unavailable')
  let scope: SnapshotScope = { owner: { kind: 'track', trackId: track.id }, domain: payload.kind === 'instrument' ? 'patch' : payload.kind === 'note-effect' ? 'notes' : 'fx' }
  if (payload.kind === 'audio-effect') {
    const graphs = [payload.graph, ...payload.modules.map(m => m.patch)]
    if (graphs.some(g => g.nodes.some(n => n.type === 'masterIn'))) scope = { owner: { kind: 'master' }, domain: 'fx' }
    else if (graphs.some(g => g.nodes.some(n => n.type === 'groupIn'))) {
      const group = { id: createId('group'), name: 'Preview group', colour: 'red' as const, bus: createGroupBus() }
      project = { ...project, tracks: [{ ...track, groupId: group.id }], groups: [group] }
      scope = { owner: { kind: 'group', groupId: group.id }, domain: 'fx' }
    } else if (graphs.some(g => g.nodes.some(n => n.type === 'returnIn'))) {
      const effect = { ...createReturnTrack('Preview return'), soloed: true as const }
      project = { ...project, tracks: [{ ...track, sends: { [effect.id]: 1 } }, effect] }
      scope = { owner: { kind: 'track', trackId: effect.id }, domain: 'fx' }
    }
  }
  project = insertLibraryAsset(project, catalog, item, { mode: 'replace', scope }).project
  return { ...project, tracks: project.tracks.map(t => t.kind === 'instrument' ? { ...t, clips: [createClip('Preview', 4, [createNote(60, 0, 1, 0.7)]), ...t.clips.slice(1)] } : t) }
}
