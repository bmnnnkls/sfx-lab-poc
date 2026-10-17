import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { parseProject, serializeProject } from './project-file'
const fixture = readFileSync(new URL('./fixtures/v3-midi-mappings.sfxlab.json', import.meta.url), 'utf8')
const read = (text: string) => {
  const result = parseProject(text)
  if (!result.ok) throw new Error(result.error)
  return result
}
describe('v3 portable MIDI mappings', () => {
  it('round trips nested and mixer targets without browser objects', () => {
    const result = read(fixture)
    expect(result.warnings).toEqual([])
    expect(result.project.midiMappings).toHaveLength(2)
    expect(read(serializeProject(result.project)).project).toEqual(result.project)
    expect(JSON.parse(serializeProject(result.project)).version).toBe(6)
  })
  it('migrates v1/v2 and drops unknown old mapping fields', () => {
    for (const version of [1, 2]) {
      const raw = JSON.parse(fixture); raw.version = version
      expect(read(JSON.stringify(raw)).project.midiMappings).toBeUndefined()
    }
  })
  it('bounds mappings, IDs, channels, CCs, paths and deduplicates sources', () => {
    const raw = JSON.parse(fixture), valid = raw.project.midiMappings[0]
    raw.project.midiMappings = [valid, { ...valid, id: 'duplicate' }, { ...valid, channel: 16 }, { ...valid, cc: 64 }, { ...valid, cc: 123 }, { ...valid, deviceId: 'x'.repeat(257) }, { ...valid, target: { ...valid.target, path: new Array(33).fill({ nodeId: 'n', moduleId: 'm' }) } }]
    const result = read(JSON.stringify(raw))
    expect(result.project.midiMappings).toHaveLength(1)
    expect(result.warnings).toHaveLength(6)
    raw.project.midiMappings = new Array(1025).fill(valid)
    expect(read(JSON.stringify(raw)).warnings).toContain('Only the first 1024 MIDI mappings were kept')
  })
})
