import { describe, expect, it } from 'vitest'
import { addNode, connect, createNode, describeNode, setNodeName } from '../patch'
import { type InstrumentTrack, createDemoProject, setTrackPatch } from '../project'
import { parseProject, serializeProject } from './project-file'

const parseOk = (text: string) => {
  const result = parseProject(text)
  if (!result.ok) throw new Error(result.error)
  return result
}

const demo = createDemoProject()
const track = demo.tracks[0] as InstrumentTrack
const filter = track.patch.nodes.find((node) => node.type === 'filter')!

const withNodes = (): { text: string; project: typeof demo } => {
  const control = { ...createNode('control', 10, 10), id: 'knob', params: { ...createNode('control', 0, 0).params, value: 800, min: 20, max: 20000, curve: 1 } }
  const hz = { ...createNode('midiToHz', 20, 20), id: 'hz' }
  let patch = [control, hz].reduce(addNode, track.patch)
  patch = connect(patch, { node: control.id, port: 'out' }, { node: filter.id, port: 'param:cutoff' })
  patch = connect(patch, { node: hz.id, port: 'out' }, { node: filter.id, port: 'param:resonance' })
  patch = setNodeName(patch, filter.id, 'Bright filter')
  const project = setTrackPatch(demo, track.id, patch)
  return { project, text: serializeProject(project, 2) }
}

/** The demo project as JSON with its first track's patch edited by `change`. */
const rawWith = (change: (patch: { nodes: Array<Record<string, unknown>>; connections: Array<Record<string, unknown>> }) => void) => {
  const raw = JSON.parse(serializeProject(demo))
  change(raw.project.tracks[0].patch)
  return JSON.stringify(raw)
}

describe('control nodes in a saved project', () => {
  it('round trips: controls, math nodes, wires into sockets, names, and the values', () => {
    const { project, text } = withNodes()
    const result = parseOk(text)
    expect(result.warnings).toEqual([])
    expect(result.project).toEqual(project)
    const loaded = (result.project.tracks[0] as InstrumentTrack).patch
    expect(loaded.connections.filter((c) => c.to.port.startsWith('param:'))).toHaveLength(2)
    expect(loaded.nodes.find((n) => n.id === filter.id)!.name).toBe('Bright filter')
    expect(loaded.nodes.find((n) => n.id === 'knob')!.params).toMatchObject({ value: 800, min: 20, max: 20000, curve: 1 })
  })

  it('stores a name only when there is one, so old files and unnamed nodes are unchanged', () => {
    expect(serializeProject(demo)).not.toContain('"name":"Oscillator')
    expect(JSON.stringify(track.patch.nodes)).not.toContain('"name"')
    const reloaded = parseOk(serializeProject(demo)).project
    expect(reloaded).toEqual(demo)
  })

  it('reads a name as text, trimmed and capped; anything else is dropped', () => {
    const raw = (name: unknown) => {
      const text = rawWith((patch) => {
        patch.nodes[0]!.name = name
      })
      return (parseOk(text).project.tracks[0] as InstrumentTrack).patch.nodes[0]!.name
    }
    expect(raw('  Lead  ')).toBe('Lead')
    expect(raw('x'.repeat(200))).toHaveLength(60)
    for (const bad of [42, null, {}, ['a'], '   ', '']) expect(raw(bad), JSON.stringify(bad)).toBeUndefined()
  })

  it('drops a wire into a socket that does not exist, an enum, or a note port, with a warning, and keeps the rest', () => {
    const text = rawWith((patch) => {
      patch.nodes.push({ id: 'knob', type: 'control', x: 0, y: 0, params: {} })
      const wire = (id: string, port: string) => patch.connections.push({ id, from: { node: 'knob', port: 'out' }, to: { node: filter.id, port } })
      wire('w-good', 'param:cutoff')
      wire('w-missing', 'param:nonsense')
      wire('w-enum', 'param:mode')
      wire('w-socket-as-port', 'param:')
    })
    const result = parseOk(text)
    const loaded = (result.project.tracks[0] as InstrumentTrack).patch
    expect(loaded.connections.filter((c) => c.from.node === 'knob').map((c) => c.id)).toEqual(['w-good'])
    expect(result.warnings.join('\n')).toMatch(/dropped 3 invalid connection/)
  })

  it('a control output cannot be wired into stereo or note ports, and a loop through a socket is refused', () => {
    const text = rawWith((patch) => {
      patch.nodes.push({ id: 'knob', type: 'control', x: 0, y: 0, params: {} }, { id: 'add', type: 'add', x: 0, y: 0, params: {} })
      patch.connections.push(
        { id: 'a', from: { node: 'knob', port: 'out' }, to: { node: 'add', port: 'param:a' } },
        { id: 'loop', from: { node: 'add', port: 'out' }, to: { node: 'add', port: 'param:b' } },
      )
    })
    const loaded = (parseOk(text).project.tracks[0] as InstrumentTrack).patch
    expect(loaded.connections.map((c) => c.id)).toContain('a')
    expect(loaded.connections.map((c) => c.id)).not.toContain('loop')
  })

  it('clamps control parameters to their specs like any other node', () => {
    const text = rawWith((patch) => {
      patch.nodes.push({ id: 'knob', type: 'control', x: 0, y: 0, params: { value: 1e12, min: -1e12, max: Number.NaN, curve: 9, step: -4 } })
    })
    const knob = (parseOk(text).project.tracks[0] as InstrumentTrack).patch.nodes.find((n) => n.id === 'knob')!
    const spec = describeNode(knob)!.params
    for (const { id, min, max } of spec) {
      expect(knob.params[id]!, id).toBeGreaterThanOrEqual(min)
      expect(knob.params[id]!, id).toBeLessThanOrEqual(max)
    }
    expect(Number.isFinite(knob.params.max!)).toBe(true)
  })

  it('keeps a control unit and display, an XY pad unit for each axis, and nothing of the kind on other nodes', () => {
    const text = rawWith((patch) => {
      patch.nodes.push(
        { id: 'knob', type: 'control', x: 0, y: 0, params: {}, unit: ' Hz ', display: 'slider-horizontal' },
        { id: 'pad', type: 'xyPad', x: 0, y: 0, params: {}, unit: 'Hz', unitY: '%', display: 'slider' },
        { id: 'sw', type: 'switch', x: 0, y: 0, params: {}, unit: 'Hz', display: 'slider' },
      )
      patch.nodes[0]!.unit = 'Hz'
      patch.nodes[0]!.display = 'slider'
    })
    const nodes = (parseOk(text).project.tracks[0] as InstrumentTrack).patch.nodes
    const get = (id: string) => nodes.find((n) => n.id === id)!
    expect(get('knob')).toMatchObject({ unit: 'Hz', display: 'slider-horizontal' })
    expect(get('pad')).toMatchObject({ unit: 'Hz', unitY: '%' })
    expect('display' in get('pad')).toBe(false)
    expect('unit' in get('sw') || 'display' in get('sw')).toBe(false)
    expect('unit' in nodes[0]! || 'display' in nodes[0]!).toBe(false)
  })

  it('drops a unit that is not text, an unknown display and a knob display (the default)', () => {
    const text = rawWith((patch) => {
      patch.nodes.push(
        { id: 'a', type: 'control', x: 0, y: 0, params: {}, unit: 5, display: 'bogus' },
        { id: 'b', type: 'control', x: 0, y: 0, params: {}, unit: 'x'.repeat(99), display: 'knob' },
      )
    })
    const nodes = (parseOk(text).project.tracks[0] as InstrumentTrack).patch.nodes
    expect('unit' in nodes.find((n) => n.id === 'a')! || 'display' in nodes.find((n) => n.id === 'a')!).toBe(false)
    expect(nodes.find((n) => n.id === 'b')!.unit).toHaveLength(16)
    expect('display' in nodes.find((n) => n.id === 'b')!).toBe(false)
  })

  it('files saved before control nodes load exactly as they did: no warnings, no new nodes, same wiring', () => {
    const result = parseOk(serializeProject(demo))
    expect(result.warnings).toEqual([])
    expect(result.project).toEqual(demo)
  })
})
