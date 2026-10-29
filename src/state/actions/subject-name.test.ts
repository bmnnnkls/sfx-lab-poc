import { type InstrumentTrack } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '../project-store'
import { subjectName } from '.'
import { loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const track = (name: string) => project().tracks.find((candidate) => candidate.name === name) as InstrumentTrack

beforeEach(() => {
  loadDemo()
})

describe('subjectName', () => {
  it('names each kind by what the views show', () => {
    const bass = track('Bass')
    const target = { trackId: bass.id }
    const filter = bass.patch.nodes.find((node) => node.type === 'filter')!.id
    const envelope = bass.patch.nodes.find((node) => node.type === 'envelope')!.id
    useProjectStore.getState().addArrangementClip(bass.id, 0, bass.clips[0]!)
    useProjectStore.getState().setSceneName(1, 'Drop')
    expect(subjectName({ kind: 'track', trackId: bass.id })).toBe('Bass')
    expect(subjectName({ kind: 'master' })).toBe('Master')
    expect(subjectName({ kind: 'clip', trackId: bass.id, clipId: bass.clips[0]!.id })).toBe(bass.clips[0]!.name)
    expect(subjectName({ kind: 'region', regionId: project().arrangement![0]!.id })).toBe(bass.clips[0]!.name)
    expect(subjectName({ kind: 'scene', scene: 0 })).toBe('Scene 1')
    expect(subjectName({ kind: 'scene', scene: 1 })).toBe('Drop')
    expect(subjectName({ kind: 'slot', trackId: bass.id, scene: 1 })).toBe('Bass, Drop')
    expect(subjectName({ kind: 'automation-slot', owner: { kind: 'master' }, scene: 0 })).toBe('Master automation, Scene 1')
    expect(subjectName({ kind: 'sample', sampleId: 'kick' })).toBe('Kick')
    expect(subjectName({ kind: 'nodes', target, path: [], nodeIds: [filter, envelope] })).toBe('2 nodes')
    expect(subjectName({ kind: 'nodes', target, path: [], nodeIds: [filter] })).toBe('Filter')
    expect(subjectName({ kind: 'canvas', target, path: [], at: { x: 0, y: 0 } })).toBe('Canvas')
    expect(subjectName({ kind: 'lane', trackId: bass.id, beat: 0 })).toBe('Bass lane')
    expect(subjectName({ kind: 'pin', owner: { kind: 'track', trackId: track('Lead').id }, graph: 'patch' })).toBe('Lead instrument')
    expect(subjectName({ kind: 'control', targets: [{ kind: 'mixer', owner: { kind: 'master' }, control: 'volume' }] })).toBe('Mixer / volume')
  })

  it("falls back to the kind's word for a thing that is gone", () => {
    expect(subjectName({ kind: 'track', trackId: 'gone' })).toBe('Track')
    expect(subjectName({ kind: 'group', groupId: 'gone' })).toBe('Group')
    expect(subjectName({ kind: 'clip', trackId: 'gone', clipId: 'gone' })).toBe('Clip')
    expect(subjectName({ kind: 'library-item', itemId: 'gone' })).toBe('Library item')
    expect(subjectName({ kind: 'library-folder', folderId: 'gone' })).toBe('Folder')
    expect(subjectName({ kind: 'module', moduleId: 'gone' })).toBe('Module')
    expect(subjectName({ kind: 'sound', soundId: 'gone', preset: true })).toBe('Sound')
  })
})
