import { readFileSync } from 'node:fs'
import type { InstrumentTrack } from '../project'
import { describe, expect, it } from 'vitest'
import { describeNode, noteGraphFrom } from '../patch'
import { type Project, createDemoProject, editPatchAt, groupNodesAsModule } from '../project'
import { parseProject, serializeProject } from './project-file'

const parseOk = (text: string) => {
  const result = parseProject(text)
  if (!result.ok) throw new Error(result.error)
  return result
}

const envelope = (project: unknown, version = 1) =>
  JSON.stringify({ format: 'sfx-lab-project', version, project })

const project = (overrides: Record<string, unknown>) => ({
  name: 'T',
  tempo: 120,
  sceneCount: 2,
  tracks: [],
  ...overrides,
})

describe('project file round trip', () => {
  it('restores the demo project exactly, compact or pretty', () => {
    const demo = createDemoProject()
    for (const space of [undefined, 2]) {
      const result = parseOk(serializeProject(demo, space))
      expect(result.project).toEqual(demo)
      expect(result.warnings).toEqual([])
    }
  })

  it('reads the committed v1 fixture without warnings', () => {
    const text = readFileSync(new URL('./fixtures/v1-minimal.sfxlab.json', import.meta.url), 'utf8')
    const { project: loaded, warnings } = parseOk(text)

    expect(warnings).toEqual([])
    expect(loaded.name).toBe('Fixture v1')
    expect((loaded.tracks[0] as InstrumentTrack).patch.connections.map((c) => c.id)).toEqual(['w1', 'w2'])
    expect((loaded.tracks[0] as InstrumentTrack).clips[0]?.notes).toHaveLength(2)
    expect((loaded.tracks[0] as InstrumentTrack).clips[1]).toBeNull()
  })

  it('gives files saved before polyphony the default voice count, silently', () => {
    const text = readFileSync(new URL('./fixtures/v1-minimal.sfxlab.json', import.meta.url), 'utf8')
    const { project: loaded, warnings } = parseOk(text)

    expect((loaded.tracks[0] as InstrumentTrack).voices).toBe(8)
    expect(warnings).toEqual([])
  })

  it('clamps an out-of-range voice count', () => {
    const raw = project({ tracks: [{ id: 't', name: 'T', voices: 500, patch: {}, clips: [] }] })
    expect((parseOk(envelope(raw)).project.tracks[0] as InstrumentTrack).voices).toBe(16)
  })
})

describe('insert graphs in files', () => {
  const tracks = (extra: Record<string, unknown>) =>
    project({ tracks: [{ id: 't', name: 'T', patch: {}, clips: [], ...extra }, { id: 'a', name: 'A', kind: 'audio', clips: [], ...extra }] })
  const types = (patch: { nodes: readonly { type: string }[] }) => patch.nodes.map((node) => node.type)

  it('gives files saved before insert graphs the default graph on every track, silently', () => {
    const { project: loaded, warnings } = parseOk(envelope(tracks({})))
    for (const track of loaded.tracks) expect(types(track.fx)).toEqual(['trackIn', 'trackOut'])
    expect(loaded.tracks[0]!.fx.connections).toHaveLength(1)
    expect(warnings).toEqual([])
  })

  it('round-trips a graph with effects, on both kinds of track', () => {
    const base = createDemoProject()
    const withFx = {
      ...base,
      tracks: base.tracks.map((track) => ({
        ...track,
        fx: noteGraphFrom(
          [{ id: `i${track.id}`, type: 'trackIn' }, { id: `r${track.id}`, type: 'reverb', params: { mix: 0.5 } }, { id: `o${track.id}`, type: 'trackOut' }],
          [`i${track.id}.out>r${track.id}.in`, `r${track.id}.out>o${track.id}.in`],
        ),
      })),
    }
    const result = parseOk(serializeProject(withFx))
    expect(result.project).toEqual(withFx)
    expect(result.warnings).toEqual([])
  })

  it('drops note nodes, unknown nodes and bad wires from a hand-edited graph, and says so', () => {
    const fx = {
      nodes: [
        { id: 'i', type: 'trackIn', x: 0, y: 0, params: {} },
        { id: 'n', type: 'transpose', x: 0, y: 0, params: {} }, // a note node does not belong in sound
        { id: 'z', type: 'nonsense', x: 0, y: 0, params: {} },
        { id: 'f', type: 'filter', x: 0, y: 0, params: { cutoff: 1e9 } },
        { id: 'o', type: 'trackOut', x: 0, y: 0, params: {} },
      ],
      connections: [
        { id: 'w1', from: { node: 'i', port: 'out' }, to: { node: 'f', port: 'in' } },
        { id: 'w2', from: { node: 'f', port: 'out' }, to: { node: 'o', port: 'in' } },
        { id: 'w3', from: { node: 'o', port: 'in' }, to: { node: 'i', port: 'out' } }, // backwards
      ],
    }
    const { project: loaded, warnings } = parseOk(envelope(tracks({ fx })))
    expect(types(loaded.tracks[0]!.fx)).toEqual(['trackIn', 'filter', 'trackOut'])
    expect(loaded.tracks[0]!.fx.nodes[1]!.params.cutoff).toBe(20000)
    expect(warnings.join('\n')).toMatch(/do not mix/)
  })

  it('falls back to the default graph when the stored one is not an object', () => {
    for (const fx of ['text', 5, [], null]) {
      const { project: loaded } = parseOk(envelope(tracks({ fx })))
      expect(types(loaded.tracks[1]!.fx)).toEqual(['trackIn', 'trackOut'])
    }
  })
})

describe('stereo in files', () => {
  const fx = (nodes: unknown[], connections: unknown[] = []) =>
    parseOk(envelope(project({ tracks: [{ id: 't', name: 'T', patch: {}, clips: [], fx: { nodes, connections } }] }))).project.tracks[0]!.fx
  const node = (id: string, type: string, extra: Record<string, unknown> = {}) => ({ id, type, x: 0, y: 0, params: {}, ...extra })

  it('keeps the stereo switch on nodes that can run in stereo, with the wires that need it', () => {
    const patch = fx(
      [node('i', 'trackIn'), node('p', 'pan'), node('f', 'filter', { stereo: true }), node('o', 'trackOut')],
      [
        { id: 'a', from: { node: 'i', port: 'out' }, to: { node: 'p', port: 'in' } },
        { id: 'b', from: { node: 'p', port: 'out' }, to: { node: 'f', port: 'in' } },
        { id: 'c', from: { node: 'f', port: 'out' }, to: { node: 'o', port: 'in' } },
      ],
    )
    expect(patch.nodes.find((n) => n.id === 'f')?.stereo).toBe(true)
    expect(patch.connections.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('drops a stereo wire into a mono input, and ignores the switch on a node that cannot go stereo', () => {
    const patch = fx(
      [node('i', 'trackIn'), node('p', 'pan', { stereo: true }), node('f', 'filter'), node('o', 'trackOut')],
      [
        { id: 'a', from: { node: 'i', port: 'out' }, to: { node: 'p', port: 'in' } },
        { id: 'b', from: { node: 'p', port: 'out' }, to: { node: 'f', port: 'in' } }, // stereo -> mono: not allowed
      ],
    )
    expect(patch.nodes.find((n) => n.id === 'p')).not.toHaveProperty('stereo')
    expect(patch.connections.map((c) => c.id)).toEqual(['a'])
  })

  it('round-trips a stereo graph', () => {
    const base = createDemoProject()
    const stereoFx = noteGraphFrom(
      [{ id: 'i', type: 'trackIn' }, { id: 'p', type: 'pan', params: { pan: 0.4 } }, { id: 'r', type: 'stereoReverb' }, { id: 'o', type: 'trackOut' }],
      ['i.out>p.in', 'p.out>r.in', 'r.out>o.in'],
    )
    const withFx = { ...base, tracks: base.tracks.map((track) => ({ ...track, fx: stereoFx })) }
    const result = parseOk(serializeProject(withFx))
    expect(result.project).toEqual(withFx)
    expect(result.warnings).toEqual([])
  })
})

describe('rejecting bad files', () => {
  it.each([
    ['not json', 'nope{', /not valid JSON/],
    ['a different JSON file', '{"hello":1}', /not an SFX Lab project/],
    ['a missing version', JSON.stringify({ format: 'sfx-lab-project', project: {} }), /version/],
    ['a newer version', envelope({}, 99), /newer version/],
    ['no project payload', envelope(null), /no project data/],
  ])('%s', (_label, text, message) => {
    const result = parseProject(text)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toMatch(message)
  })
})

describe('sanitizing', () => {
  const track = (patch: unknown, clips: unknown[] = []) => ({ id: 't', name: 'T', patch, clips })

  it('drops unknown nodes, dangling wires and cycles, and says so', () => {
    const patch = {
      nodes: [
        { id: 'a', type: 'gain', x: 0, y: 0, params: {} },
        { id: 'b', type: 'gain', x: 0, y: 0, params: {} },
        { id: 'c', type: 'does-not-exist', x: 0, y: 0, params: {} },
      ],
      connections: [
        { id: 'w1', from: { node: 'a', port: 'out' }, to: { node: 'b', port: 'in' } },
        { id: 'w2', from: { node: 'b', port: 'out' }, to: { node: 'a', port: 'in' } }, // cycle
        { id: 'w3', from: { node: 'a', port: 'out' }, to: { node: 'zzz', port: 'in' } }, // dangling
      ],
    }
    const { project: loaded, warnings } = parseOk(envelope(project({ tracks: [track(patch)] })))

    expect((loaded.tracks[0] as InstrumentTrack).patch.nodes.map((n) => n.id)).toEqual(['a', 'b'])
    expect((loaded.tracks[0] as InstrumentTrack).patch.connections).toHaveLength(1)
    expect(warnings.join('\n')).toMatch(/unknown node type "does-not-exist"/)
    expect(warnings.join('\n')).toMatch(/dropped 2 invalid connection/)
  })

  it('clamps params and numbers to valid ranges', () => {
    const patch = {
      nodes: [{ id: 'f', type: 'filter', x: 'oops', y: 5, params: { cutoff: 1e9, resonance: 'x' } }],
      connections: [],
    }
    const clip = { id: 'c', name: 'C', lengthBeats: 4, notes: [
      { pitch: 500, start: 0, duration: -3, velocity: 7 },
      { pitch: 60, start: 99, duration: 1, velocity: 1 }, // beyond clip end
      'garbage',
    ] }
    const raw = project({ tempo: 9999, tracks: [{ ...track(patch, [clip]), volume: 5 }] })
    const { project: loaded, warnings } = parseOk(envelope(raw))
    const node = (loaded.tracks[0] as InstrumentTrack).patch.nodes[0]!

    expect(loaded.tempo).toBe(240)
    expect(loaded.tracks[0]?.volume).toBe(1)
    expect(node.x).toBe(0)
    expect(node.params).toMatchObject({ cutoff: 20000, resonance: 0.707 })
    expect((loaded.tracks[0] as InstrumentTrack).clips[0]?.notes).toEqual([
      { id: expect.stringMatching(/^note_/), pitch: 127, start: 0, duration: 1 / 16, velocity: 1 },
    ])
    expect(warnings.join('\n')).toMatch(/dropped 2 invalid note/)
  })

  it('makes ids unique and fits clip slots to the scene count', () => {
    const clip = { id: 'same', name: 'C', lengthBeats: 4, notes: [] }
    const raw = project({
      sceneCount: 3,
      tracks: [
        { ...track({}, [clip, clip, clip, clip]), id: 'dup' },
        { ...track({}, []), id: 'dup' },
      ],
    })
    const { project: loaded } = parseOk(envelope(raw))

    expect(new Set(loaded.tracks.map((t) => t.id)).size).toBe(2)
    expect((loaded.tracks[0] as InstrumentTrack).clips).toHaveLength(3)
    expect(new Set((loaded.tracks[0] as InstrumentTrack).clips.map((c) => c?.id)).size).toBe(3)
    expect((loaded.tracks[1] as InstrumentTrack).clips).toEqual([null, null, null])
  })

  it('survives garbage inside an otherwise valid envelope', () => {
    const raw = project({ tracks: [null, 7, 'x', { patch: 5, clips: 'no' }] })
    const { project: loaded } = parseOk(envelope(raw))

    expect(loaded.tracks).toHaveLength(1)
    expect((loaded.tracks[0] as InstrumentTrack).patch).toEqual({ nodes: [], connections: [] })
  })
})

describe('samples in files', () => {
  const id = 'c'.repeat(64)
  const sampleEntry = { id, name: 'Kick', extension: 'wav', durationSeconds: 1.5, sampleRate: 44100, channels: 2, bytes: 5000 }
  const samplerPatch = (sampleId: unknown) => ({
    nodes: [{ id: 's', type: 'sampler', x: 0, y: 0, params: {}, sampleId }],
    connections: [],
  })
  const track = (patch: unknown) => ({ id: 't', name: 'T', patch, clips: [] })

  it('round-trips the library and sampler references', () => {
    const raw = project({ samples: [sampleEntry], tracks: [track(samplerPatch(id))] })
    const { project: loaded, warnings } = parseOk(envelope(raw))

    expect(warnings).toEqual([])
    expect(loaded.samples).toEqual([sampleEntry])
    expect((loaded.tracks[0] as InstrumentTrack).patch.nodes[0]?.sampleId).toBe(id)
    expect(parseOk(serializeProject(loaded)).project).toEqual(loaded)
  })

  it('drops invalid library entries and says so', () => {
    const raw = project({
      samples: [sampleEntry, sampleEntry, { id: 'not-a-hash', name: 'x' }, 'junk', { ...sampleEntry, id: 'd'.repeat(64), extension: '../etc', sampleRate: 1e9, channels: 99 }],
    })
    const { project: loaded, warnings } = parseOk(envelope(raw))

    expect(loaded.samples.map((s) => s.id)).toEqual([id, 'd'.repeat(64)])
    expect(loaded.samples[1]).toMatchObject({ extension: 'bin', sampleRate: 192000, channels: 8 })
    expect(warnings.join('\n')).toMatch(/Skipped 3 invalid sample entries/)
  })

  it('drops a sampler reference to a sample that is not in the library', () => {
    const raw = project({ samples: [], tracks: [track(samplerPatch(id))] })
    const { project: loaded, warnings } = parseOk(envelope(raw))

    expect((loaded.tracks[0] as InstrumentTrack).patch.nodes[0]?.sampleId).toBeUndefined()
    expect(warnings.join('\n')).toMatch(/pointed at a sample that is not in the project/)
  })

  it('loads older files that have no sample library', () => {
    expect(parseOk(envelope(project({}))).project.samples).toEqual([])
  })
})

describe('note ids in files', () => {
  const clipWith = (notes: unknown[]) => ({
    id: 'c', name: 'C', lengthBeats: 4, notes,
  })
  const load = (notes: unknown[]) =>
    (parseOk(envelope(project({ tracks: [{ id: 't', name: 'T', patch: {}, clips: [clipWith(notes)] }] }))).project.tracks[0] as InstrumentTrack).clips[0]!.notes

  it('keeps saved ids and gives older files (no ids) fresh unique ones, without warnings', () => {
    const kept = load([{ id: 'mine', pitch: 60, start: 0, duration: 1, velocity: 1 }])
    expect(kept[0]!.id).toBe('mine')

    const old = load([
      { pitch: 60, start: 0, duration: 1, velocity: 1 },
      { pitch: 62, start: 1, duration: 1, velocity: 1 },
    ])
    expect(new Set(old.map((n) => n.id)).size).toBe(2)
    expect(old.every((n) => n.id.startsWith('note_'))).toBe(true)
  })

  it('re-ids duplicate note ids so selections stay unambiguous', () => {
    const notes = load([
      { id: 'same', pitch: 60, start: 0, duration: 1, velocity: 1 },
      { id: 'same', pitch: 62, start: 1, duration: 1, velocity: 1 },
    ])
    expect(new Set(notes.map((n) => n.id)).size).toBe(2)
  })
})

describe('audio tracks in files', () => {
  const id = 'e'.repeat(64)
  const sampleEntry = { id, name: 'Loop', extension: 'wav', durationSeconds: 2, sampleRate: 44100, channels: 1, bytes: 10 }
  const audioTrack = (clips: unknown[], extra: Record<string, unknown> = {}) => ({
    kind: 'audio', id: 'at', name: 'Audio', volume: 0.7, clips, ...extra,
  })
  const clip = (overrides: Record<string, unknown> = {}) => ({
    id: 'ac', name: 'Loop', sampleId: id, lengthBeats: 4, loop: true, warp: 'repitch', gain: 1, ...overrides,
  })

  it('round-trips an audio track with its clip', () => {
    const raw = project({ samples: [sampleEntry], tracks: [audioTrack([clip(), null])] })
    const { project: loaded, warnings } = parseOk(envelope(raw))

    expect(warnings).toEqual([])
    expect(loaded.tracks[0]).toMatchObject({ kind: 'audio', id: 'at', volume: 0.7 })
    expect(parseOk(serializeProject(loaded)).project).toEqual(loaded)
  })

  it('treats a track with no kind (older files) as an instrument', () => {
    const loaded = parseOk(envelope(project({ tracks: [{ id: 't', name: 'T', patch: {}, clips: [] }] }))).project
    expect(loaded.tracks[0]?.kind).toBe('instrument')
  })

  it('drops an audio clip whose sample is not in the project, with a warning', () => {
    const raw = project({ samples: [], tracks: [audioTrack([clip()])] })
    const { project: loaded, warnings } = parseOk(envelope(raw))

    expect((loaded.tracks[0] as unknown as { clips: unknown[] }).clips).toEqual([null, null])
    expect(warnings.join('\n')).toMatch(/audio clip whose sample is not in the project/)
  })

  it('repairs out-of-range settings and unknown warp modes', () => {
    const raw = project({
      samples: [sampleEntry],
      tracks: [audioTrack([clip({ gain: 50, lengthBeats: 'x', warp: 'wobble', loop: 'yes' })])],
    })
    const loaded = parseOk(envelope(raw)).project.tracks[0] as unknown as { clips: Array<Record<string, unknown>> }

    expect(loaded.clips[0]).toMatchObject({ gain: 2, lengthBeats: 4, warp: 'repitch', loop: true })
  })

  it('gives clips unique ids and fits the slots to the scene count', () => {
    const raw = project({ sceneCount: 3, samples: [sampleEntry], tracks: [audioTrack([clip(), clip(), clip(), clip()])] })
    const loaded = parseOk(envelope(raw)).project.tracks[0] as unknown as { clips: Array<{ id: string } | null> }

    expect(loaded.clips).toHaveLength(3)
    expect(new Set(loaded.clips.map((c) => c?.id)).size).toBe(3)
  })

  it('gives clips saved before trim and fades the whole sample and no fades, as they always had', () => {
    const raw = project({ samples: [sampleEntry], tracks: [audioTrack([clip()])] })
    const loaded = parseOk(envelope(raw)).project.tracks[0] as unknown as { clips: Array<Record<string, unknown>> }
    expect(loaded.clips[0]).toMatchObject({ start: 0, end: 1, fadeIn: 0, fadeOut: 0 })
  })

  it('repairs a nonsensical trim region and out-of-range fades', () => {
    const raw = project({ samples: [sampleEntry], tracks: [audioTrack([clip({ start: 0.9, end: 0.1, fadeIn: -3, fadeOut: 'x' })])] })
    const loaded = parseOk(envelope(raw)).project.tracks[0] as unknown as { clips: Array<{ start: number; end: number; fadeIn: number; fadeOut: number }> }
    const c = loaded.clips[0]!
    expect(c.start).toBe(0.9)
    expect(c.end).toBeGreaterThan(c.start)
    expect(c.fadeIn).toBe(0)
    expect(c.fadeOut).toBe(0)
  })

  it('round-trips a trimmed, faded clip', () => {
    const raw = project({ samples: [sampleEntry], tracks: [audioTrack([clip({ start: 0.25, end: 0.75, fadeIn: 0.05, fadeOut: 0.1 })])] })
    const { project: loaded } = parseOk(envelope(raw))
    expect(parseOk(serializeProject(loaded)).project).toEqual(loaded)
    expect((loaded.tracks[0] as unknown as { clips: Array<Record<string, unknown>> }).clips[0]).toMatchObject({ start: 0.25, end: 0.75, fadeIn: 0.05, fadeOut: 0.1 })
  })
})

describe('modules in files', () => {
  const grouped = () => {
    const demo = createDemoProject()
    const bass = demo.tracks[0] as InstrumentTrack
    const ids = ['oscillator', 'filter'].map((type) => bass.patch.nodes.find((node) => node.type === type)!.id)
    return groupNodesAsModule(demo, { trackId: bass.id }, ids, 'Core')
  }

  it('round-trips modules and their uses exactly', () => {
    const original = grouped()
    const result = parseOk(serializeProject(original, 2))
    expect(result.project).toEqual(original)
    expect(result.warnings).toEqual([])
  })

  it('files from before modules existed load with an empty library', () => {
    const result = parseOk(envelope(project({ tracks: [] })))
    expect(result.project.modules).toEqual([])
  })

  it('drops uses of modules that are missing from the file, with a warning', () => {
    const original = grouped()
    const raw = JSON.parse(serializeProject(original))
    raw.project.modules = []
    const result = parseOk(JSON.stringify(raw))
    const track = result.project.tracks[0] as InstrumentTrack
    expect(track.patch.nodes.some((node) => node.type === 'module')).toBe(false)
    expect(result.warnings.join(' ')).toMatch(/module that is not in the project/)
  })

  it('drops ports and knobs that point at nothing', () => {
    const raw = JSON.parse(serializeProject(grouped()))
    raw.project.modules[0].inputs.push({ id: 'x', label: 'Ghost', inner: { node: 'nope', port: 'in' } })
    raw.project.modules[0].knobs.push({ id: 'y', label: 'Ghost', node: 'nope', param: 'cutoff' })
    const result = parseOk(JSON.stringify(raw))
    expect(result.project.modules[0]!.inputs).toHaveLength(1)
    expect(result.project.modules[0]!.knobs).toHaveLength(0)
  })

  it('loads nested modules regardless of the order they are listed in', () => {
    const inner = grouped()
    const track = inner.tracks[0] as InstrumentTrack
    const use = track.patch.nodes.find((node) => node.type === 'module')!
    const nested = groupNodesAsModule(inner, { trackId: track.id }, [use.id], 'Outer')
    expect(nested.modules).toHaveLength(2)

    const raw = JSON.parse(serializeProject(nested))
    raw.project.modules.reverse() // the outer module now comes before the one it uses
    const result = parseOk(JSON.stringify(raw))
    expect(result.project.modules.map((module) => module.name).sort()).toEqual(['Core', 'Outer'])
    expect(result.warnings).toEqual([])
  })

  it('drops a module that contains itself instead of looping', () => {
    const raw = JSON.parse(serializeProject(grouped()))
    const module = raw.project.modules[0]
    module.patch.nodes.push({ id: 'self', type: 'module', moduleId: module.id, x: 0, y: 0, params: {} })
    const result = parseOk(JSON.stringify(raw))
    expect(result.project.modules).toEqual([])
    expect(result.warnings.join(' ')).toMatch(/contain themselves/)
  })
})

describe('note graphs in files', () => {
  /** The bass track with a split, an effect on one branch, and notes from the lead mixed back in. */
  const withGraph = () => {
    const demo = createDemoProject()
    const [bass, lead] = demo.tracks as InstrumentTrack[]
    const graph = noteGraphFrom(
      [
        { id: 'c', type: 'clipNotes' },
        { id: 's', type: 'rangeSplit', params: { lowPitch: 55 } },
        { id: 'a', type: 'arpeggiator', params: { rate: 2 } },
        { id: 't', type: 'trackNotes', trackId: lead!.id, params: { tap: 1 } },
        { id: 'o', type: 'noteOut' },
      ],
      ['c.out>s.in', 's.inside>a.in', 'a.out>o.in', 's.outside>o.in', 't.out>o.in'],
    )
    return { project: editPatchAt(demo, { trackId: bass!.id, graph: 'notes' }, () => graph), bass: bass!, lead: lead! }
  }
  const graphOf = (project: Project, index = 0) => (project.tracks[index] as InstrumentTrack).noteGraph

  it('every track starts with the clip notes wired to the instrument', () => {
    const graph = graphOf(createDemoProject())
    expect(graph.nodes.map((node) => node.type)).toEqual(['clipNotes', 'noteOut'])
    expect(graph.connections).toHaveLength(1)
  })

  it('round-trips a graph with splits, merges and a track reference exactly', () => {
    const { project } = withGraph()
    const result = parseOk(serializeProject(project, 2))
    expect(result.project).toEqual(project)
    expect(result.warnings).toEqual([])
  })

  it('files without a note graph load with the default one', () => {
    const raw = JSON.parse(serializeProject(createDemoProject()))
    for (const track of raw.project.tracks) delete track.noteGraph
    const result = parseOk(JSON.stringify(raw))
    expect(graphOf(result.project).nodes.map((node) => node.type)).toEqual(['clipNotes', 'noteOut'])
    expect(result.warnings).toEqual([])
  })

  it('drops an input that points at a missing track, or at its own track', () => {
    const { project, bass } = withGraph()
    const raw = JSON.parse(serializeProject(project))
    raw.project.tracks[0].noteGraph.nodes.find((n: { id: string }) => n.id === 't').trackId = 'ghost'
    let result = parseOk(JSON.stringify(raw))
    expect(graphOf(result.project).nodes.find((n) => n.id === 't')!.trackId).toBeUndefined()
    expect(result.warnings.join(' ')).toMatch(/missing track or at itself/)

    raw.project.tracks[0].noteGraph.nodes.find((n: { id: string }) => n.id === 't').trackId = bass.id
    result = parseOk(JSON.stringify(raw))
    expect(graphOf(result.project).nodes.find((n) => n.id === 't')!.trackId).toBeUndefined()
  })

  it('drops an input that would make two tracks feed each other', () => {
    const { project, bass, lead } = withGraph()
    const raw = JSON.parse(serializeProject(project))
    raw.project.tracks[1].noteGraph.nodes.push({ id: 'back', type: 'trackNotes', x: 0, y: 0, params: { tap: 0 }, trackId: bass.id })
    const result = parseOk(JSON.stringify(raw))
    const taps = [0, 1].flatMap((index) => graphOf(result.project, index).nodes.filter((n) => n.trackId !== undefined))
    expect(taps).toHaveLength(1) // one of the two was dropped
    expect(result.warnings.join(' ')).toMatch(/feed each other/)
    expect([bass.id, lead.id]).toContain(taps[0]!.trackId)
  })

  it('keeps sound nodes out of a note graph and note nodes out of a patch', () => {
    const raw = JSON.parse(serializeProject(createDemoProject()))
    raw.project.tracks[0].noteGraph.nodes.push({ id: 'osc', type: 'oscillator', x: 0, y: 0, params: {} })
    raw.project.tracks[0].patch.nodes.push({ id: 'arp', type: 'arpeggiator', x: 0, y: 0, params: {} })
    const result = parseOk(JSON.stringify(raw))
    expect(graphOf(result.project).nodes.some((n) => n.type === 'oscillator')).toBe(false)
    expect((result.project.tracks[0] as InstrumentTrack).patch.nodes.some((n) => n.type === 'arpeggiator')).toBe(false)
    expect(result.warnings.join(' ')).toMatch(/sound and notes do not mix/)
  })

  it('drops wires between sound and note ports', () => {
    const { project } = withGraph()
    const raw = JSON.parse(serializeProject(project))
    raw.project.tracks[0].noteGraph.connections.push({ id: 'bad', from: { node: 'c', port: 'out' }, to: { node: 'nowhere', port: 'in' } })
    expect(parseOk(JSON.stringify(raw)).warnings.join(' ')).toMatch(/dropped 1 invalid connection/)
  })

  it('round-trips a module of note nodes, with its ports typed as notes', () => {
    const { project, bass } = withGraph()
    const ids = ['a']
    const grouped = groupNodesAsModule(project, { trackId: bass.id, graph: 'notes' }, ids, 'Arp box')
    expect(grouped.modules).toHaveLength(1)
    const result = parseOk(serializeProject(grouped))
    expect(result.project).toEqual(grouped)
    expect(result.warnings).toEqual([])
    const use = graphOf(result.project).nodes.find((n) => n.type === 'module')!
    expect(describeNode(use, result.project.modules)!.inputs[0]!.kind).toBe('notes')
  })
})
