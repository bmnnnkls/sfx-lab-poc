import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseProject, serializeProject } from './project-file'

const fixture = readFileSync(new URL('./fixtures/v2-instance-values.sfxlab.json', import.meta.url), 'utf8')
const read = (text: string) => {
  const result = parseProject(text)
  if (!result.ok) throw new Error(result.error)
  return result
}

describe('v2 control value persistence', () => {
  it('round trips the v2 instance-value fixture', () => {
    const loaded = read(fixture)
    expect(loaded.warnings).toEqual([])
    expect(loaded.project.controlValues).toHaveLength(1)
    expect(read(serializeProject(loaded.project)).project).toEqual(loaded.project)
    expect(JSON.parse(serializeProject(loaded.project)).version).toBe(7)
  })
  it('drops malformed/nonfinite entries with warnings and bounds the collection', () => {
    const raw = JSON.parse(fixture)
    const valid = raw.project.controlValues[0]
    raw.project.controlValues = [valid, { ...valid, value: 'bad' }, { ...valid, target: { ...valid.target, path: new Array(33).fill({ nodeId: 'a', moduleId: 'm' }) } }, { ...valid, target: { ...valid.target, owner: {} } }]
    const result = read(JSON.stringify(raw))
    expect(result.project.controlValues).toHaveLength(1)
    expect(result.warnings).toHaveLength(3)
    raw.project.controlValues = new Array(4097).fill(valid)
    expect(read(JSON.stringify(raw)).warnings).toContain('Only the first 4096 control values were kept')
  })
  it('migrates v1 without adding or changing base values', () => {
    const old = readFileSync(new URL('./fixtures/v1-minimal.sfxlab.json', import.meta.url), 'utf8')
    const loaded = read(old)
    expect(loaded.project.controlValues).toBeUndefined()
    expect(loaded.warnings).toEqual([])
    expect(read(serializeProject(loaded.project)).project).toEqual(loaded.project)
  })
})


it('does not reinterpret a v1 unknown field as new v2 instance values', () => {
  const raw = JSON.parse(fixture)
  raw.version = 1
  expect(read(JSON.stringify(raw)).project.controlValues).toBeUndefined()
})
