import { BEATS_PER_BAR, controlTargetLabel, nodeTitles, patchAt } from '@core'
import { catalogOf } from '../library-store'
import { markerTitle } from './arrangement-marks'
import { GRAPH_TITLES } from './pin'
import { editTargetOf } from './nodes'
import { ownerName, project, sessionClipOf, trackOf } from './lookup'
import type { Subject } from './types'

const sampleOf = (sampleId: string) => project().samples?.find((sample) => sample.id === sampleId)
const sampleName = (sampleId: string) => sampleOf(sampleId)?.name ?? 'sample'

/** A beat on the arrangement's timeline as its bar and beat, counted from 1: beat 16 is *5.1*. */
const barBeat = (beat: number): string => `${Math.floor(beat / BEATS_PER_BAR) + 1}.${Math.floor(beat % BEATS_PER_BAR) + 1}`

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
      return catalogOf(subject.itemId).items.find((item) => item.id === subject.itemId)?.name ?? 'Library item'
    case 'library-folder':
      return catalogOf(subject.folderId).folders.find((folder) => folder.id === subject.folderId)?.name ?? 'Folder'
    case 'library-root':
      return subject.root === 'mine' ? 'My library' : 'Trash'
    case 'project-graph':
      return `${ownerName(subject.owner)} ${GRAPH_TITLES[subject.domain].toLowerCase()}`
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
    case 'sample-selection':
      return `Selection in ${sampleName(subject.sampleId)}`
    case 'sample-marker':
      return `${sampleOf(subject.sampleId)?.markers?.find((marker) => marker.id === subject.markerId)?.name ?? 'Marker'} in ${sampleName(subject.sampleId)}`
    case 'sample-region':
      return `${sampleOf(subject.sampleId)?.regions?.find((region) => region.id === subject.regionId)?.name ?? 'Region'} in ${sampleName(subject.sampleId)}`
    case 'sample-loop':
      return `Loop in ${sampleName(subject.sampleId)}`
    case 'arrangement-marker': {
      const name = project().arrangementMarkers?.find((marker) => marker.id === subject.markerId)?.name
      return name ? markerTitle(name) : 'Marker'
    }
    case 'arrangement-loop': {
      const loop = project().arrangementLoop
      return loop ? `Loop ${barBeat(loop.from)} – ${barBeat(loop.to)}` : 'Loop'
    }
    case 'arrangement-timeline':
      return `Timeline at ${barBeat(subject.beat)}`
  }
}
