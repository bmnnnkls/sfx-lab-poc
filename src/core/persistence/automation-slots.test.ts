import { readFileSync } from 'node:fs'
import { CURRENT_VERSION } from './format'
import { describe, expect, it } from 'vitest'
import { parseProject, serializeProject } from './project-file'
const fixture = readFileSync(new URL('./fixtures/v5-automation-slots.sfxlab.json', import.meta.url), 'utf8')
const read = (raw: string) => { const r = parseProject(raw); if (!r.ok) throw new Error(r.error); return r }
describe('v5 return/master slots', () => {
  it('round trips dedicated nested/mixer lanes and independent lengths without warnings', () => {
    const r = read(fixture)
    expect(r.warnings).toEqual([])
    expect(r.project.master.automationSlots?.[0]?.lengthBeats).toBe(3)
    const ret = r.project.tracks.find((t) => t.kind === 'return')!
    expect(ret.kind === 'return' && ret.automationSlots?.[0]?.lengthBeats).toBe(2)
    expect(JSON.parse(serializeProject(r.project)).version).toBe(CURRENT_VERSION)
    expect(read(serializeProject(r.project)).project).toEqual(r.project)
  })
  it('migrates all older versions without reinterpreting formerly unknown slot data', () => {
    for (const version of [1, 2, 3, 4]) {
      const raw = JSON.parse(fixture); raw.version = version
      const p = read(JSON.stringify(raw)).project
      expect(p.master.automationSlots).toBeUndefined()
      expect(p.tracks.filter((t) => t.kind === 'return')[0]?.automationSlots).toBeUndefined()
    }
  })
  it('bounds slot counts, identities, lengths and cross-owner targets', () => {
    const raw = JSON.parse(fixture), slot = raw.project.master.automationSlots[0]
    slot.lengthBeats = 1e99
    slot.automation.push({ ...slot.automation[0], id: 'foreign', target: { kind: 'mixer', owner: { kind: 'track', trackId: 'return' }, control: 'volume' } })
    raw.project.master.automationSlots = [slot, slot, { ...slot, id: 'x'.repeat(257) }, ...new Array(100).fill(null)]
    const r = read(JSON.stringify(raw))
    expect(r.project.master.automationSlots).toHaveLength(r.project.sceneCount)
    expect(r.project.master.automationSlots?.[0]?.lengthBeats).toBe(256)
    expect(r.project.master.automationSlots?.[0]?.automation).toHaveLength(2)
    expect(r.project.master.automationSlots?.[1]).toBeNull()
    expect(r.warnings).toContain('Unsupported automation owner in lane "foreign"; lane retained but will not play')
  })
})
