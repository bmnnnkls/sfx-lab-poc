import { describe, expect, it } from 'vitest'
import { type ControlOwner, type ControlTarget, resolveControlTarget } from '../control'
import { createEmptyProject, createReturnTrack, groupNodesAsModule, unlinkModuleNode, type Project } from '../project'
import { noteGraphFrom } from '../patch'
import { automationSlotsOf, setAutomationSlot } from './edit'

describe('automation slot route transforms', () => {
  it.each([{ kind: 'master' }, { kind: 'track', trackId: 'return' }] as ControlOwner[])('preserves nested targets through group and unlink for %j', (owner) => {
    const initial = createEmptyProject()
    const fx = noteGraphFrom([{ id: 'in', type: owner.kind === 'master' ? 'masterIn' : 'returnIn' }, { id: 'gain', type: 'gain', params: { gain: 0.5 } }, { id: 'out', type: 'trackOut' }], ['in.out>gain.in', 'gain.out>out.in'])
    let p: Project = owner.kind === 'master' ? { ...initial, master: { ...initial.master, fx } } : { ...initial, tracks: [...initial.tracks, { ...createReturnTrack('Return'), id: 'return', fx }] }
    const target: ControlTarget = { kind: 'graph', owner, domain: 'fx', path: [], nodeId: 'gain', nodeType: 'gain', paramId: 'gain' }
    p = setAutomationSlot(p, owner, 0, { id: 'slot', name: 'Lane', lengthBeats: 4, automation: [{ id: 'lane', enabled: true, target, points: [{ id: 'point', beat: 0, value: 0.5, interpolation: 'hold' }] }] })
    const scope = owner.kind === 'track' ? { trackId: owner.trackId, graph: 'fx' as const } : { master: true as const }
    const grouped = groupNodesAsModule(p, scope, ['gain'])
    const route = automationSlotsOf(grouped, owner)![0]!.automation![0]!.target
    expect(route.kind === 'graph' && route.path).toHaveLength(1)
    expect(resolveControlTarget(grouped, route).status).toBe('available')
    if (route.kind !== 'graph') throw new Error('Graph lane lost')
    const unlinked = unlinkModuleNode(grouped, scope, route.path[0]!.nodeId)
    const result = automationSlotsOf(unlinked, owner)![0]!.automation![0]!
    expect(result.target.kind === 'graph' && result.target.path).toHaveLength(0)
    expect(resolveControlTarget(unlinked, result.target).status).toBe('available')
    expect(result.points).toEqual(automationSlotsOf(p, owner)![0]!.automation![0]!.points)
  })
})
