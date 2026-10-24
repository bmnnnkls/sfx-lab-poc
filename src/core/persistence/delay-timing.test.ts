import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseProject, serializeProject } from './index'
import { migrate } from './migrations'
import type { InstrumentTrack } from '../project'
const fixture = (version: number) => readFileSync(new URL(`./fixtures/v${version}-delay-timing.sfxlab.json`, import.meta.url), 'utf8')

describe('v8 delay divisions', () => {
  it.each([7, 8])('round trips the committed v%s fixture without changing free seconds or numeric beats', version => {
    const loaded = parseProject(fixture(version))
    expect(loaded.ok).toBe(true)
    if (!loaded.ok) return
    expect(loaded.warnings).toEqual([])
    const track = loaded.project.tracks[0] as InstrumentTrack
    expect(track.patch.nodes.find(n => n.id === 'delay')?.params).toMatchObject({ time: 1.8, sync: 0 })
    expect(track.fx.nodes.find(n => n.id === 'echo')?.params).toMatchObject({ time: 0.75, sync: 1 })
    expect(track.fx.nodes.find(n => n.id === 'echo')?.params.division).toBe(version === 8 ? 8 : undefined)
    const saved = serializeProject(loaded.project)
    expect(JSON.parse(saved).version).toBe(9)
    expect(parseProject(saved)).toEqual(loaded)
  })
  it('v7 discards formerly unknown divisions and references in nested graphs, revisions and automation', () => {
    const target = { nodeType: 'delay', paramId: 'division' }
    const node = { type: 'delay', params: { time: 0.75, sync: 1, division: 24 } }
    const raw = { tracks: [{ fx: { nodes: [node] }, clips: [{ automation: [{ target }] }] }], modules: [{ patch: { nodes: [node] } }], assetRevisions: [{ payload: { graph: { nodes: [node] } } }], controlValues: [{ target, value: 24 }], midiMappings: [{ target }], snapshots: [{ values: [{ target }] }] }
    const migrated = migrate(raw, 7)
    expect(JSON.stringify(migrated)).not.toContain('division')
    expect(JSON.stringify(migrated)).toContain('0.75')
    expect(raw.tracks[0]!.fx.nodes[0]!.params.division).toBe(24)
  })
  it('bounds hostile divisions without losing the legacy value', () => {
    const raw = JSON.parse(fixture(8))
    raw.project.tracks[0].fx.nodes[1].params.division = 1e9
    const parsed = parseProject(JSON.stringify(raw))
    expect(parsed.ok && parsed.project.tracks[0]?.fx.nodes[1]?.params).toMatchObject({ division: 24, time: 0.75 })
    raw.project.tracks[0].fx.nodes[1].params.division = null
    const invalid = parseProject(JSON.stringify(raw))
    expect(invalid.ok && invalid.project.tracks[0]?.fx.nodes[1]?.params.division).toBe(0)
  })
})
