import { describe, expect, it } from 'vitest'
import { addNode, connect, createDefaultPatch, createNode } from '../patch'
import { classifyStages, planStages } from './stages'

const empty = { nodes: [], connections: [] }

describe('stage planning', () => {
  it('keeps the synth voice per-voice and the delay + output shared in the default patch', () => {
    const patch = createDefaultPatch()
    const stages = classifyStages(patch)
    const stageOf = (type: string) => stages.get(patch.nodes.find((n) => n.type === type)!.id)

    for (const type of ['note', 'oscillator', 'filter', 'envelope', 'gain']) {
      expect(stageOf(type), type).toBe('voice')
    }
    expect(stageOf('delay')).toBe('shared')
    expect(stageOf('output')).toBe('shared')
  })

  it('finds the one signal crossing from voices into the shared stage', () => {
    const patch = createDefaultPatch()
    const plan = planStages(patch)
    const gain = patch.nodes.find((n) => n.type === 'gain')!

    expect(plan.boundaries).toEqual([`${gain.id}:out`])
  })

  it('makes everything downstream of a shared node shared', () => {
    const osc = createNode('oscillator', 0, 0)
    const delay = createNode('delay', 0, 0)
    const filter = createNode('filter', 0, 0)
    let patch = [osc, delay, filter].reduce(addNode, empty)
    patch = connect(patch, { node: osc.id, port: 'out' }, { node: delay.id, port: 'in' })
    patch = connect(patch, { node: delay.id, port: 'out' }, { node: filter.id, port: 'in' })

    const stages = classifyStages(patch)
    expect([stages.get(osc.id), stages.get(delay.id), stages.get(filter.id)]).toEqual([
      'voice',
      'shared',
      'shared',
    ])
  })

  it('treats a patch with no effects as entirely per-voice', () => {
    const osc = createNode('oscillator', 0, 0)
    const out = createNode('output', 0, 0)
    const patch = connect(
      [osc, out].reduce(addNode, empty),
      { node: osc.id, port: 'out' },
      { node: out.id, port: 'in' },
    )

    expect(planStages(patch).sharedOrder).toEqual([])
    expect(planStages(patch).boundaries).toEqual([])
  })
})
