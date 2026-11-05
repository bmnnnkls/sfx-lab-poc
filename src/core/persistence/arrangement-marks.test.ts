import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MAX_ARRANGEMENT_MARKERS, MAX_TIMELINE_BEATS, createDemoProject } from '../project'
import { CURRENT_VERSION } from './format'
import { parseProject, serializeProject } from './project-file'
import { sanitizeArrangementMarks } from './sanitize-arrangement'

const parseOk = (text: string) => {
  const result = parseProject(text)
  if (!result.ok) throw new Error(result.error)
  return result
}

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

const sanitize = (markers: unknown, loop?: unknown) => {
  const warnings: string[] = []
  const marks = sanitizeArrangementMarks(markers, loop, (message) => warnings.push(message))
  return { ...marks, warnings }
}

describe('format v13: markers and the loop on the arrangement', () => {
  it('loads the committed fixture without warnings', () => {
    const { project, warnings } = parseOk(fixture('v13-arrangement-marks.sfxlab.json'))
    expect(warnings).toEqual([])
    expect(project.arrangementMarkers!.map((marker) => [marker.beat, marker.name])).toEqual([[0, 'Intro'], [8, 'Verse'], [24, 'Chorus']])
    expect(project.arrangementLoop).toEqual({ from: 8, to: 16, enabled: true })
    expect(project.arrangement![0]!.loop).toBe(true)
  })

  it('round-trips, and saves as the current version', () => {
    const { project } = parseOk(fixture('v13-arrangement-marks.sfxlab.json'))
    const text = serializeProject(project)
    expect(JSON.parse(text).version).toBe(CURRENT_VERSION)
    expect(parseOk(text).project).toEqual(project)
  })

  it('loads every v12 and older fixture with neither field', () => {
    for (const name of ['v1-minimal', 'v7-library', 'v10-track-groups', 'v11-sample-markers', 'v12-sample-lineage']) {
      const { project } = parseOk(fixture(`${name}.sfxlab.json`))
      expect(Object.keys(project).filter((key) => ['arrangementMarkers', 'arrangementLoop'].includes(key)), name).toEqual([])
    }
  })

  it('saves a project with neither field without them', () => {
    const saved = JSON.parse(serializeProject(createDemoProject()))
    expect(saved.project).not.toHaveProperty('arrangementMarkers')
    expect(saved.project).not.toHaveProperty('arrangementLoop')
  })

  it('keeps good marks as they are, sorted by beat, without warnings', () => {
    const { markers, loop, warnings } = sanitize([{ id: 'b', beat: 9, name: ' B ' }, { id: 'a', beat: 2.5, name: 'A' }], { from: 4, to: 8 })
    expect(warnings).toEqual([])
    expect(markers).toEqual([{ id: 'a', beat: 2.5, name: 'A' }, { id: 'b', beat: 9, name: 'B' }])
    expect(loop).toEqual({ from: 4, to: 8 })
  })

  it.each([
    { what: 'a marker without a beat', markers: [{ id: 'a', name: 'A' }], warning: 'The arrangement dropped 1 marker(s) outside the timeline' },
    { what: 'a marker past the timeline', markers: [{ id: 'a', beat: MAX_TIMELINE_BEATS + 1, name: 'A' }], warning: 'The arrangement dropped 1 marker(s) outside the timeline' },
    { what: 'a marker before the start', markers: [{ id: 'a', beat: -1, name: 'A' }], warning: 'The arrangement dropped 1 marker(s) outside the timeline' },
    { what: 'a marker that is not a record', markers: ['here'], warning: 'The arrangement dropped 1 marker(s) outside the timeline' },
  ])('drops $what, with a warning', ({ markers, warning }) => {
    const result = sanitize(markers)
    expect(result.markers).toBeUndefined()
    expect(result.warnings).toEqual([warning])
  })

  it('gives a duplicate or missing id a fresh one, with a warning', () => {
    const { markers, warnings } = sanitize([{ id: 'a', beat: 1, name: 'A' }, { id: 'a', beat: 2, name: 'B' }, { beat: 3, name: 'C' }])
    expect(new Set(markers!.map((marker) => marker.id)).size).toBe(3)
    expect(markers![0]!.id).toBe('a')
    expect(warnings).toEqual(['The arrangement gave 2 marker(s) with a missing or duplicate id a new one'])
  })

  it('keeps the first markers by beat at the limit, with a warning', () => {
    const many = Array.from({ length: MAX_ARRANGEMENT_MARKERS + 4 }, (_, index) => ({ id: `m${index}`, beat: MAX_ARRANGEMENT_MARKERS + 4 - index, name: `M${index}` }))
    const { markers, warnings } = sanitize(many)
    expect(markers).toHaveLength(MAX_ARRANGEMENT_MARKERS)
    expect(markers![0]!.beat).toBe(1)
    expect(warnings).toEqual([`Only the first ${MAX_ARRANGEMENT_MARKERS} arrangement markers were kept`])
  })

  it('puts a reversed loop in order and stretches a short one, with a warning', () => {
    expect(sanitize(undefined, { from: 8, to: 4 })).toMatchObject({ loop: { from: 4, to: 8 }, warnings: ["The arrangement's loop was put in order and made at least 1 beat long"] })
    expect(sanitize(undefined, { from: 4, to: 4.5 }).loop).toEqual({ from: 4, to: 5 })
    expect(sanitize(undefined, { from: MAX_TIMELINE_BEATS, to: MAX_TIMELINE_BEATS }).loop).toEqual({ from: MAX_TIMELINE_BEATS - 1, to: MAX_TIMELINE_BEATS })
  })

  it.each([{ from: 'a', to: 3 }, { from: 0, to: MAX_TIMELINE_BEATS + 1 }, [1, 2], null])('drops the loop %j, with a warning', (loop) => {
    const result = sanitize(undefined, loop)
    expect(result.loop).toBeUndefined()
    expect(result.warnings).toEqual(['The arrangement dropped a loop outside the timeline'])
  })

  it('keeps the loop on only for a real true', () => {
    expect(sanitize(undefined, { from: 0, to: 4, enabled: true }).loop).toEqual({ from: 0, to: 4, enabled: true })
    expect(sanitize(undefined, { from: 0, to: 4, enabled: 'yes' }).loop).toEqual({ from: 0, to: 4 })
  })
})
