import { describe, expect, it } from 'vitest'
import { noteGraphFrom } from '../patch'
import { addTrack, createDemoProject, createEmptyProject, createReturnTrack, editPatchAt, groupNodesAsModule, moduleUsage, patchAt, removeModule, removeSample, removeTrack, addSamples } from './index'

const demo = createDemoProject()

const addNodes = (project: typeof demo, ...specs: Parameters<typeof noteGraphFrom>[0]) =>
  editPatchAt(project, { master: true }, (fx) => ({ nodes: [...fx.nodes, ...noteGraphFrom(specs, []).nodes], connections: fx.connections }))

describe('the master bus in the project', () => {
  it('starts with its input wired straight to its output, in every new project', () => {
    for (const project of [demo, createEmptyProject()]) {
      expect(project.master.fx.nodes.map((n) => n.type)).toEqual(['masterIn', 'trackOut'])
      expect(project.master.fx.connections).toHaveLength(1)
    }
  })

  it('is edited through the same path as every other graph', () => {
    const next = addNodes(demo, { id: 'r', type: 'stereoReverb' })
    expect(patchAt(next, { master: true })!.nodes).toHaveLength(3)
    expect(next.tracks).toBe(demo.tracks)
    expect(editPatchAt(demo, { master: true }, (fx) => fx)).toBe(demo) // no change, same project
  })

  it('can hold a module, which counts as a use ("Master" is listed) and keeps the module from being deleted', () => {
    const withGain = addNodes(demo, { id: 'g', type: 'gain' })
    const grouped = groupNodesAsModule(withGain, { master: true }, ['g'], 'Trim')
    const id = grouped.modules[0]!.id
    expect(moduleUsage(grouped, id)).toMatchObject({ uses: 1, tracks: ['Master'] })
    expect(removeModule(grouped, id)).toBe(grouped)
  })

  it('has no part in track removal except that Sends in it stop pointing at the removed track', () => {
    const ret = createReturnTrack('Return A')
    const withReturn = addTrack(demo, ret)
    const sending = addNodes(withReturn, { id: 's', type: 'send', trackId: ret.id })
    expect(sending.master.fx.nodes.find((n) => n.id === 's')!.trackId).toBe(ret.id)
    expect(removeTrack(sending, ret.id).master.fx.nodes.find((n) => n.id === 's')!.trackId).toBeUndefined()
  })

  it('a sampler left in it loses its sample when the sample is removed', () => {
    const sample = { id: 's'.repeat(64), name: 'S', extension: 'wav', durationSeconds: 1, sampleRate: 44100, channels: 1, bytes: 1 }
    const withSampler = addNodes(addSamples(demo, [sample]), { id: 'p', type: 'sampler' })
    const pointed = editPatchAt(withSampler, { master: true }, (fx) => ({ ...fx, nodes: fx.nodes.map((n) => (n.id === 'p' ? { ...n, sampleId: sample.id } : n)) }))
    expect(removeSample(pointed, sample.id).master.fx.nodes.find((n) => n.id === 'p')!.sampleId).toBeUndefined()
  })
})
