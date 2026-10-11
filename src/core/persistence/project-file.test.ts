import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createDemoProject } from '../project'
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
    expect(loaded.tracks[0]?.patch.connections.map((c) => c.id)).toEqual(['w1', 'w2'])
    expect(loaded.tracks[0]?.clips[0]?.notes).toHaveLength(2)
    expect(loaded.tracks[0]?.clips[1]).toBeNull()
  })

  it('gives files saved before polyphony the default voice count, silently', () => {
    const text = readFileSync(new URL('./fixtures/v1-minimal.sfxlab.json', import.meta.url), 'utf8')
    const { project: loaded, warnings } = parseOk(text)

    expect(loaded.tracks[0]?.voices).toBe(8)
    expect(warnings).toEqual([])
  })

  it('clamps an out-of-range voice count', () => {
    const raw = project({ tracks: [{ id: 't', name: 'T', voices: 500, patch: {}, clips: [] }] })
    expect(parseOk(envelope(raw)).project.tracks[0]?.voices).toBe(16)
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

    expect(loaded.tracks[0]?.patch.nodes.map((n) => n.id)).toEqual(['a', 'b'])
    expect(loaded.tracks[0]?.patch.connections).toHaveLength(1)
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
    const node = loaded.tracks[0]!.patch.nodes[0]!

    expect(loaded.tempo).toBe(240)
    expect(loaded.tracks[0]?.volume).toBe(1)
    expect(node.x).toBe(0)
    expect(node.params).toMatchObject({ cutoff: 20000, resonance: 0.707 })
    expect(loaded.tracks[0]?.clips[0]?.notes).toEqual([
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
    expect(loaded.tracks[0]?.clips).toHaveLength(3)
    expect(new Set(loaded.tracks[0]?.clips.map((c) => c?.id)).size).toBe(3)
    expect(loaded.tracks[1]?.clips).toEqual([null, null, null])
  })

  it('survives garbage inside an otherwise valid envelope', () => {
    const raw = project({ tracks: [null, 7, 'x', { patch: 5, clips: 'no' }] })
    const { project: loaded } = parseOk(envelope(raw))

    expect(loaded.tracks).toHaveLength(1)
    expect(loaded.tracks[0]?.patch).toEqual({ nodes: [], connections: [] })
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
    expect(loaded.tracks[0]?.patch.nodes[0]?.sampleId).toBe(id)
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

    expect(loaded.tracks[0]?.patch.nodes[0]?.sampleId).toBeUndefined()
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
    parseOk(envelope(project({ tracks: [{ id: 't', name: 'T', patch: {}, clips: [clipWith(notes)] }] }))).project.tracks[0]!.clips[0]!.notes

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
