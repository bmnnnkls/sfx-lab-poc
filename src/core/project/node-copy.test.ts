import { describe, expect, it } from 'vitest'
import type { Patch, PatchNode } from '../patch'
import { copyNodes, pasteNodes } from './node-copy'
import { MAX_PATCH_NODES } from './edit'

const node = (id: string, type: string, x: number, y: number, extra: Partial<PatchNode> = {}): PatchNode => ({ id, type, x, y, params: { gain: 0.5 }, ...extra })
const wire = (id: string, from: string, to: string) => ({ id, from: { node: from, port: 'out' }, to: { node: to, port: 'in' } })

/** Track in -> filter -> delay -> Track out, with an LFO into the filter and a module use beside. */
const fx: Patch = {
  nodes: [
    node('in', 'trackIn', 0, 0),
    node('filter', 'filter', 100, 40),
    node('delay', 'delay', 220, 60),
    node('lfo', 'lfo', 100, 160),
    node('use', 'module', 300, 200, { moduleId: 'wobble' }),
    node('out', 'trackOut', 400, 0),
  ],
  connections: [wire('w1', 'in', 'filter'), wire('w2', 'filter', 'delay'), wire('w3', 'delay', 'out'), wire('w4', 'lfo', 'filter')],
}

describe('copyNodes', () => {
  it('keeps the wires between the copied nodes and drops the ones leading out', () => {
    const copied = copyNodes(fx, ['filter', 'delay', 'lfo'])
    expect(copied.nodes.map((entry) => entry.id)).toEqual(['filter', 'delay', 'lfo'])
    expect(copied.connections.map((entry) => entry.id)).toEqual(['w2', 'w4'])
  })

  it("never copies a graph's fixed ends", () => {
    expect(copyNodes(fx, ['in', 'filter', 'out']).nodes.map((entry) => entry.id)).toEqual(['filter'])
    expect(copyNodes({ nodes: [node('a', 'clipNotes', 0, 0), node('b', 'noteOut', 0, 0), node('c', 'returnIn', 0, 0), node('d', 'masterIn', 0, 0)], connections: [] }, ['a', 'b', 'c', 'd']).nodes).toEqual([])
  })

  it('copies a module use as a use of the same module', () => {
    expect(copyNodes(fx, ['use']).nodes[0]).toMatchObject({ type: 'module', moduleId: 'wobble' })
  })
})

describe('pasteNodes', () => {
  it('adds the nodes with fresh ids at the point, in the same places relative to each other, rewired', () => {
    const { patch, nodeIds } = pasteNodes(fx, copyNodes(fx, ['filter', 'delay', 'lfo']), { x: 500, y: 300 })
    expect(patch.nodes).toHaveLength(9)
    const pasted = patch.nodes.slice(6)
    expect(pasted.map((entry) => entry.id)).toEqual(nodeIds)
    expect(nodeIds.some((id) => fx.nodes.some((existing) => existing.id === id))).toBe(false)
    expect(pasted.map((entry) => [entry.type, entry.x, entry.y])).toEqual([['filter', 500, 300], ['delay', 620, 320], ['lfo', 500, 420]])
    expect(pasted[0]?.params).toEqual({ gain: 0.5 })
    const added = patch.connections.slice(4)
    expect(added.map((entry) => [entry.from.node, entry.to.node])).toEqual([[nodeIds[0], nodeIds[1]], [nodeIds[2], nodeIds[0]]])
    expect(added.every((entry) => !fx.connections.some((existing) => existing.id === entry.id))).toBe(true)
  })

  it('pastes the same copy twice as two independent groups', () => {
    const copied = copyNodes(fx, ['filter'])
    const once = pasteNodes(fx, copied, { x: 0, y: 0 })
    const twice = pasteNodes(once.patch, copied, { x: 0, y: 0 })
    expect(twice.nodeIds[0]).not.toBe(once.nodeIds[0])
  })

  it("stops at the file format's node limit, and pastes nothing for nothing", () => {
    const full: Patch = { nodes: Array.from({ length: MAX_PATCH_NODES - 1 }, (_, index) => node(`n${index}`, 'gain', 0, 0)), connections: [] }
    expect(pasteNodes(full, copyNodes(fx, ['filter']), { x: 0, y: 0 }).nodeIds).toHaveLength(1)
    expect(pasteNodes(full, copyNodes(fx, ['filter', 'delay']), { x: 0, y: 0 })).toEqual({ patch: full, nodeIds: [] })
    expect(pasteNodes(fx, { nodes: [], connections: [] }, { x: 0, y: 0 })).toEqual({ patch: fx, nodeIds: [] })
  })
})
