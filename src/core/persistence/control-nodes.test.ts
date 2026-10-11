import { describe, expect, it } from 'vitest'
import { addNode, connect, createModuleUse, createNode, describeNode, noteGraphFrom, setNodeName } from '../patch'
import { type InstrumentTrack, createDemoProject, editPatchAt, setTrackPatch } from '../project'
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
        { id: 'sel', type: 'selector', x: 0, y: 0, params: { index: 7, count: 99 }, unit: 'Hz', panel: { size: 'L' } },
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
    expect('unit' in get('sel')).toBe(false)
    expect(get('sel')).toMatchObject({ panel: { size: 'L' }, params: { index: 7, count: 16 } })
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

  describe('a use of a module keeps the values of the controls inside it', () => {
    const inner = noteGraphFrom([{ id: 'f', type: 'filter' }, { id: 'k', type: 'control', params: { value: 440, min: 20, max: 20000 } }], ['k.out>f.param:cutoff'])
    const definition = { id: 'm', name: 'Tone', patch: inner, inputs: [], outputs: [], knobs: [] }
    const build = (params: Record<string, number>) =>
      editPatchAt({ ...demo, modules: [definition] }, { master: true }, (fx) => addNode(fx, { ...createModuleUse(definition, 0, 0), id: 'u', params }))
    const useOf = (project: { master: { fx: { nodes: readonly { id: string; params: Record<string, number> }[] } } }) => project.master.fx.nodes.find((n) => n.id === 'u')!

    it('round trips the values a use turned, and only those', () => {
      const built = build({ 'k:value': 3000 })
      const result = parseOk(serializeProject(built))
      expect(result.warnings).toEqual([])
      expect(useOf(result.project)!.params).toEqual({ 'k:value': 3000 })
      expect(result.project).toEqual(built)
    })

    it('a use that turned nothing stays that way, so the module\'s value keeps flowing to it', () => {
      expect(useOf(parseOk(serializeProject(build({}))).project).params).toEqual({})
    })

    it('holds a value inside the control\'s own range, and drops what is not a number', () => {
      const raw = JSON.parse(serializeProject(build({ 'k:value': 3000 })))
      const use = raw.project.master.fx.nodes.find((n: { id: string }) => n.id === 'u')
      use.params = { 'k:value': 1e9, 'k:ghost': 4 }
      const loaded = useOf(parseOk(JSON.stringify(raw)).project)
      expect(loaded.params).toEqual({ 'k:value': 20000 })
    })
  })

  describe('in a note graph', () => {
    const withNoteControl = () => {
      const raw = JSON.parse(serializeProject(demo))
      const graph = raw.project.tracks[0].noteGraph
      graph.nodes.push(
        { id: 't', type: 'transpose', x: 0, y: 0, params: {} },
        { id: 'k', type: 'control', x: 0, y: 0, params: { value: 5, min: -24, max: 24 } },
        { id: 'a', type: 'add', x: 0, y: 0, params: {} },
        { id: 'o', type: 'oscillator', x: 0, y: 0, params: {} },
      )
      graph.connections.push(
        { id: 'c1', from: { node: 'k', port: 'out' }, to: { node: 'a', port: 'a' } },
        { id: 'c2', from: { node: 'a', port: 'out' }, to: { node: 't', port: 'param:semitones' } },
      )
      return raw
    }
    const noteNodes = (loaded: { tracks: readonly unknown[] }) => (loaded.tracks[0] as InstrumentTrack).noteGraph.nodes

    it('keeps controls and math and their wires into a note node\'s socket; a sound node still does not belong', () => {
      const result = parseOk(JSON.stringify(withNoteControl()))
      const nodes = noteNodes(result.project)
      expect(nodes.map((n) => n.id)).toEqual(expect.arrayContaining(['t', 'k', 'a']))
      expect(nodes.some((n) => n.id === 'o')).toBe(false)
      expect(result.warnings.join('\n')).toMatch(/Oscillator node that does not belong/)
      expect((result.project.tracks[0] as InstrumentTrack).noteGraph.connections.filter((c) => c.to.port === 'param:semitones')).toHaveLength(1)
    })

    it('round trips without warnings', () => {
      const raw = withNoteControl()
      raw.project.tracks[0].noteGraph.nodes = raw.project.tracks[0].noteGraph.nodes.filter((n: { id: string }) => n.id !== 'o')
      const first = parseOk(JSON.stringify(raw))
      const again = parseOk(serializeProject(first.project))
      expect(again.warnings).toEqual([])
      expect(again.project).toEqual(first.project)
    })
  })

  it('files saved before control nodes load exactly as they did: no warnings, no new nodes, same wiring', () => {
    const result = parseOk(serializeProject(demo))
    expect(result.warnings).toEqual([])
    expect(result.project).toEqual(demo)
  })
})
