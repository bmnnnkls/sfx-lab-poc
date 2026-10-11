import { describe, expect, it } from 'vitest'
import { moveNode, setNodeParam } from '../patch'
import { createDemoProject, setClipAt, setTempo, setTrackPatch, setTrackVolume } from '../project'
import { diffProject } from './diff-project'

describe('diffProject', () => {
  const project = createDemoProject()
  const track = project.tracks[0]!

  it('describes a whole project as tempo + one add per track when starting from nothing', () => {
    const commands = diffProject(null, project)
    expect(commands.map((c) => c.type)).toEqual(['transport/setTempo', 'track/add', 'track/add', 'track/add'])
  })

  it('emits nothing for an identical project', () => {
    expect(diffProject(project, project)).toEqual([])
  })

  it('maps param edits to setParam without rebuilding the patch', () => {
    const osc = track.patch.nodes.find((n) => n.type === 'oscillator')!
    const next = setTrackPatch(project, track.id, setNodeParam(track.patch, osc.id, 'detune', 12))

    expect(diffProject(project, next)).toEqual([
      { type: 'track/setParam', trackId: track.id, nodeId: osc.id, paramId: 'detune', value: 12 },
    ])
  })

  it('ignores canvas position changes', () => {
    const node = track.patch.nodes[0]!
    const next = setTrackPatch(project, track.id, moveNode(track.patch, node.id, 500, 500))

    expect(diffProject(project, next)).toEqual([])
  })

  it('maps clip, volume and tempo edits to their own commands', () => {
    let next = setClipAt(project, track.id, 0, null)
    next = setTrackVolume(next, track.id, 0.5)
    next = setTempo(next, 140)

    expect(diffProject(project, next).map((c) => c.type)).toEqual([
      'transport/setTempo',
      'track/setClips',
      'track/setVolume',
    ])
  })
})
