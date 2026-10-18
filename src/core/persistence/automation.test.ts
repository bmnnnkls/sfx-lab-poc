import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseProject, serializeProject } from './project-file'
const fixture = readFileSync(new URL('./fixtures/v4-automation.sfxlab.json', import.meta.url), 'utf8')
const read = (text: string) => { const r = parseProject(text); if (!r.ok) throw new Error(r.error); return r }
describe('v4 saved automation', () => {
  it('round trips nested and mixer lanes with no warnings', () => {
    const result = read(fixture)
    expect(result.warnings).toEqual([])
    const track = result.project.tracks[0]!
    expect(track.kind !== 'return' && track.clips[0]?.automation).toHaveLength(2)
    expect(JSON.parse(serializeProject(result.project)).version).toBe(8)
    expect(read(serializeProject(result.project)).project).toEqual(result.project)
  })
  it('explicitly drops unknown automation fields in v1/v2/v3 files', () => {
    for (const version of [1, 2, 3]) { const raw = JSON.parse(fixture); raw.version = version; const track = read(JSON.stringify(raw)).project.tracks[0]!; expect(track.kind !== 'return' && track.clips[0]?.automation).toBeUndefined() }
  })
  it('bounds lane/point counts, IDs, paths and numbers and collapses equal-time points', () => {
    const raw = JSON.parse(fixture), clip = raw.project.tracks[0].clips[0], lane = clip.automation[0]
    clip.automation = [{ ...lane, points: [{ id: 'a', beat: 0, value: 0, interpolation: 'linear' }, { id: 'b', beat: 0, value: 2, interpolation: 'hold' }, { id: 'bad', beat: 1e99, value: 0, interpolation: 'linear' }] }, { ...lane, id: 'duplicate' }, { ...lane, id: 'x'.repeat(257) }]
    const loaded = read(JSON.stringify(raw)), t = loaded.project.tracks[0]!
    const lanes = t.kind !== 'return' ? t.clips[0]?.automation : undefined
    expect(lanes).toHaveLength(1); expect(lanes?.[0]?.points).toEqual([{ id: 'b', beat: 0, value: 1, interpolation: 'hold' }]); expect(loaded.warnings.length).toBeGreaterThan(0)
    clip.automation = new Array(65).fill(lane)
    expect(read(JSON.stringify(raw)).warnings).toContain('Automation lane limit exceeded')
    clip.automation = [{ ...lane, points: new Array(2049).fill(lane.points[0]) }]
    expect(read(JSON.stringify(raw)).warnings).toContain('Automation point limit exceeded')
  })
})
