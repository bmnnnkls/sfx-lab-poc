import { type ControlOwner, controlTargetLabel, nodeTitles, patchAt } from '@core'
import { useLibraryStore } from '../library-store'
import { GRAPH_TITLES } from './pin'
import { editTargetOf } from './nodes'
import { project, sessionClipOf, trackOf } from './lookup'
import type { Subject } from './types'

const ownerName = (owner: ControlOwner): string =>
  owner.kind === 'master'
    ? 'Master'
    : owner.kind === 'group'
      ? project().groups?.find((group) => group.id === owner.groupId)?.name ?? 'Group'
      : trackOf(owner.trackId)?.name ?? 'Track'

const sceneName = (scene: number): string => project().sceneNames?.[scene] || `Scene ${scene + 1}`

/**
 * What the palette calls a subject in front of an action's title: *Bass: Duplicate*, *2 nodes: Delete*. A subject
 * whose thing is gone gets its kind's word.
 */
export const subjectName = (subject: Subject): string => {
  switch (subject.kind) {
    case 'track':
      return trackOf(subject.trackId)?.name ?? 'Track'
    case 'group':
      return project().groups?.find((group) => group.id === subject.groupId)?.name ?? 'Group'
    case 'master':
      return 'Master'
    case 'clip':
      return sessionClipOf(subject.trackId, subject.clipId)?.clip.name || 'Clip'
    case 'slot':
      return `${trackOf(subject.trackId)?.name ?? 'Track'}, ${sceneName(subject.scene)}`
    case 'automation-slot':
      return `${ownerName(subject.owner)} automation, ${sceneName(subject.scene)}`
    case 'scene':
      return sceneName(subject.scene)
    case 'sample':
      return project().samples?.find((sample) => sample.id === subject.sampleId)?.name ?? 'Sample'
    case 'library-item':
      return useLibraryStore.getState().catalog.items.find((item) => item.id === subject.itemId)?.name ?? 'Library item'
    case 'library-folder':
      return useLibraryStore.getState().catalog.folders.find((folder) => folder.id === subject.folderId)?.name ?? 'Folder'
    case 'nodes': {
      if (subject.nodeIds.length !== 1) return `${subject.nodeIds.length} nodes`
      const patch = patchAt(project(), editTargetOf(subject))
      return (patch && nodeTitles(patch, project().modules).get(subject.nodeIds[0]!)) ?? '1 node'
    }
    case 'canvas':
      return 'Canvas'
    case 'module':
      return project().modules.find((module) => module.id === subject.moduleId)?.name ?? 'Module'
    case 'region': {
      const region = (project().arrangement ?? []).find((candidate) => candidate.id === subject.regionId)
      return region?.content.name || 'Region'
    }
    case 'lane':
      return `${trackOf(subject.trackId)?.name ?? 'Track'} lane`
    case 'control':
      return subject.targets.length === 1 ? controlTargetLabel(project(), subject.targets[0]!) : subject.targets.length === 0 ? 'Control' : `${subject.targets.length} controls`
    case 'sound': {
      const sounds = subject.preset ? project().presets : project().snapshots
      return sounds?.find((sound) => sound.id === subject.soundId)?.name ?? 'Sound'
    }
    case 'pin':
      return `${ownerName(subject.owner)} ${GRAPH_TITLES[subject.graph].toLowerCase()}`
  }
}
