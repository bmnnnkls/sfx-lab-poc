import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CURRENT_VERSION } from './format'
import { parseProject, serializeProject } from './project-file'
import { sanitizeTimelineAutomation } from './sanitize-timeline-automation'

const parseOk = (text: string) => {
  const result = parseProject(text)
  if (!result.ok) throw new Error(result.error)
  return result
}
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

const owners = { tracks: [{ id: 'A' }, { id: 'R' }], groups: [{ id: 'G', bus: {} }, { id: 'F' }] } as never
const sanitize = (raw: unknown) => {
  const warnings: string[] = []
  return { entries: sanitizeTimelineAutomation(raw, owners, (message) => warnings.push(message)), warnings }
}
const volume = (owner: unknown) => ({ kind: 'mixer', owner, control: 'volume' })
const lane = (owner: unknown, beats: readonly number[] = [0, 8]) => ({
  id: `lane-${JSON.stringify(owner)}`,
  target: volume(owner),
  enabled: true,
  points: beats.map((beat, i) => ({ id: `p${i}`, beat, value: 0.5, interpolation: 'linear' })),
})

describe('format v14: automation lanes on the timeline', () => {
  it('loads the committed fixture without warnings', () => {
    const { project, warnings } = parseOk(fixture('v14-timeline-automation.sfxlab.json'))
    expect(warnings).toEqual([])
    expect(project.arrangementAutomation!.map((entry) => [entry.owner.kind, entry.lanes.length, entry.open ?? false])).toEqual([
      ['track', 1, true],
      ['group', 1, false],
      ['master', 1, false],
      ['track', 0, true],
    ])
    expect(project.arrangement![0]!.content.automation).toHaveLength(1)
  })

  it('round-trips, and saves as v14', () => {
    const { project } = parseOk(fixture('v14-timeline-automation.sfxlab.json'))
    const text = serializeProject(project)
    expect(CURRENT_VERSION).toBe(14)
    expect(JSON.parse(text).version).toBe(14)
    expect(parseOk(text).project).toEqual(project)
  })

  it('loads a v13 file with no timeline lanes', () => {
    const { project, warnings } = parseOk(fixture('v13-arrangement-marks.sfxlab.json'))
    expect(warnings).toEqual([])
    expect(project.arrangementAutomation).toBeUndefined()
  })

  it("warns about a region lane naming another track, and keeps it", () => {
    const file = JSON.parse(fixture('v14-timeline-automation.sfxlab.json'))
    file.project.arrangement[0].content.automation[0].target.owner = { kind: 'track', trackId: 'track_iiaje4lg' }
    const { project, warnings } = parseOk(JSON.stringify(file))
    expect(warnings.some((warning) => warning.includes('Unsupported automation owner'))).toBe(true)
    expect(project.arrangement![0]!.content.automation).toHaveLength(1)
  })
})

describe('sanitizeTimelineAutomation', () => {
  it('keeps well-formed entries without a warning', () => {
    const { entries, warnings } = sanitize([{ owner: { kind: 'track', trackId: 'A' }, lanes: [lane({ kind: 'track', trackId: 'A' })] }])
    expect(warnings).toEqual([])
    expect(entries).toHaveLength(1)
  })

  it.each([
    ['not a list', 'nope', 'Invalid timeline automation dropped'],
    ['an entry without an owner', [{ lanes: [] }], 'Invalid timeline automation entry skipped'],
    ['a missing track', [{ owner: { kind: 'track', trackId: 'X' }, lanes: [lane({ kind: 'track', trackId: 'X' })] }], 'missing owner'],
    ['a missing group', [{ owner: { kind: 'group', groupId: 'X' }, lanes: [] }], 'missing owner'],
    ['a duplicate owner', [{ owner: { kind: 'master' }, lanes: [lane({ kind: 'master' })] }, { owner: { kind: 'master' }, lanes: [lane({ kind: 'master' })] }], 'Duplicate timeline automation'],
    ['a lane of another owner', [{ owner: { kind: 'master' }, lanes: [lane({ kind: 'track', trackId: 'A' })] }], 'Unsupported automation owner'],
    ['a point past the timeline', [{ owner: { kind: 'master' }, lanes: [lane({ kind: 'master' }, [0, 5000])] }], 'Invalid automation point'],
  ])('warns for %s', (_, raw, warning) => {
    expect(sanitize(raw).warnings.some((message) => message.includes(warning))).toBe(true)
  })

  it("keeps a group's entry while the group exists, bus or not, and `open` only for a real true", () => {
    const { entries } = sanitize([
      { owner: { kind: 'group', groupId: 'F' }, lanes: [lane({ kind: 'group', groupId: 'F' })], open: 'yes' },
      { owner: { kind: 'track', trackId: 'R' }, lanes: [], open: true },
      { owner: { kind: 'track', trackId: 'A' }, lanes: [] },
    ])
    expect(entries).toEqual([
      { owner: { kind: 'group', groupId: 'F' }, lanes: [expect.objectContaining({ target: volume({ kind: 'group', groupId: 'F' }) })] },
      { owner: { kind: 'track', trackId: 'R' }, lanes: [], open: true },
    ])
  })
})
