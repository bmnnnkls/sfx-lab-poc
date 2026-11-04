import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { trackInIsStereo } from '../patch'
import { type SampleInfo, originOf, revertBlocked } from '../sample'
import { CURRENT_VERSION } from './format'
import { parseProject, serializeProject } from './project-file'
import { sanitizeSamples } from './sanitize-samples'
import { validateLibraryPayloads } from './validate-library'
import { captureLibrarySample, emptyLibrary } from '../library'

const parseOk = (text: string) => {
  const result = parseProject(text)
  if (!result.ok) throw new Error(result.error)
  return result
}

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

/** A 2 s sample at 48 kHz: 96000 frames. */
const base: SampleInfo = { id: 'a'.repeat(64), name: 'Loop', extension: 'wav', durationSeconds: 2, sampleRate: 48000, channels: 2, bytes: 1 }

const sanitize = (raw: Record<string, unknown>) => {
  const warnings: string[] = []
  const [sample] = sanitizeSamples([{ ...base, ...raw }], (message) => warnings.push(message))
  return { sample: sample!, warnings }
}

describe('format v11: origin, markers and regions on a sample', () => {
  it('loads the committed fixture, with an origin, two markers, a region and a stereo Track in, without warnings', () => {
    const { project, warnings } = parseOk(fixture('v11-sample-markers.sfxlab.json'))
    expect(warnings).toEqual([])
    const [sample] = project.samples
    expect(originOf(sample!)).toBe('d'.repeat(64))
    expect(sample!.markers).toEqual([{ id: 'marker-1', frame: 0, name: 'Start' }, { id: 'marker-2', frame: 48000, name: 'Beat 3' }])
    expect(sample!.regions).toEqual([{ id: 'region-1', from: 24000, to: 72000, name: 'Middle' }])
    expect(trackInIsStereo(project.tracks[0]!.fx)).toBe(true)
  })

  it('round-trips, and saves as the current version', () => {
    const { project } = parseOk(fixture('v11-sample-markers.sfxlab.json'))
    const text = serializeProject(project)
    expect(JSON.parse(text).version).toBe(CURRENT_VERSION)
    expect(parseOk(text).project).toEqual(project)
  })

  it('loads every older fixture as before: no origin, markers or regions appear', () => {
    for (const name of ['v1-minimal', 'v6-presets', 'v7-library', 'v10-group-buses', 'v10-pinned-panels', 'v10-track-groups']) {
      const { project } = parseOk(fixture(`${name}.sfxlab.json`))
      for (const sample of project.samples) expect(Object.keys(sample).filter((key) => ['origin', 'markers', 'regions'].includes(key)), name).toEqual([])
    }
  })

  it('reads its own id as the origin of a sample no edit made', () => {
    expect(originOf(base)).toBe(base.id)
    expect(sanitize({}).sample).toEqual(base)
  })

  it('drops hostile markers and regions one by one, with a warning, and keeps the rest', () => {
    const { sample, warnings } = sanitize({
      origin: 'not a hash',
      markers: [
        { id: 'ok', frame: 96000, name: 'End' },
        { id: 'ok', frame: 10, name: 'Same id' },
        { id: 'half', frame: 1.5, name: '' },
        { id: 'past', frame: 96001, name: '' },
        { id: 'neg', frame: -1, name: '' },
        { id: 'long', frame: 1, name: 'x'.repeat(61) },
        { id: '<script>', frame: 1, name: '' },
        'marker',
      ],
      regions: [
        { id: 'ok', from: 0, to: 96000, name: 'All' },
        { id: 'empty', from: 5, to: 5, name: '' },
        { id: 'back', from: 9, to: 5, name: '' },
        { id: 'past', from: 0, to: 96001, name: '' },
      ],
    })
    expect(sample).not.toHaveProperty('origin')
    expect(sample.markers).toEqual([{ id: 'ok', frame: 96000, name: 'End' }])
    expect(sample.regions).toEqual([{ id: 'ok', from: 0, to: 96000, name: 'All' }])
    expect(warnings).toEqual([
      'Dropped the invalid origin of "Loop"',
      'Dropped 7 invalid markers of "Loop"',
      'Dropped 3 invalid regions of "Loop"',
    ])
  })

  it('keeps at most 256 of each, and drops a list that is not a list', () => {
    const many = Array.from({ length: 300 }, (_, i) => ({ id: `m${i}`, frame: i, name: '' }))
    const { sample, warnings } = sanitize({ markers: many, regions: 'all of them' })
    expect(sample.markers).toHaveLength(256)
    expect(sample.regions).toEqual([])
    expect(warnings).toEqual(['Only the first 256 markers of "Loop" were kept', 'Dropped 1 invalid region of "Loop"'])
  })

  it('travels in the personal library: a catalog sample with marks is valid as it is', () => {
    const { project } = parseOk(fixture('v11-sample-markers.sfxlab.json'))
    const catalog = captureLibrarySample(emptyLibrary(), project, project.samples[0]!.id, 'Loop', null)
    expect(catalog.samples).toEqual(project.samples)
    expect(() => validateLibraryPayloads(catalog)).not.toThrow()
  })
})

describe('format v12: a sample\'s loop and lineage', () => {
  const LINEAGE = {
    original: { extension: 'wav', bytes: 10, channels: 2, durationSeconds: 2.5, sampleRate: 48000 },
    // 120000 frames, less 24000, cropped to 96000, mirrored.
    steps: [
      { kind: 'splice', from: 0, to: 24000, inserted: 0 },
      { kind: 'crop', from: 0, to: 96000 },
      { kind: 'mirror', from: 10, to: 20 },
    ],
  }

  it('loads the committed fixture without warnings, and it can revert', () => {
    const { project, warnings } = parseOk(fixture('v12-sample-lineage.sfxlab.json'))
    expect(warnings).toEqual([])
    const [sample] = project.samples
    expect(sample!.loop).toEqual({ from: 24000, to: 60000 })
    expect(sample!.lineage!.steps).toEqual([{ kind: 'splice', from: 0, to: 6000, inserted: 0 }, { kind: 'mirror', from: 40000, to: 50000 }])
    expect(revertBlocked(sample!)).toBeNull()
  })

  it('round-trips, and saves as the current version', () => {
    const { project } = parseOk(fixture('v12-sample-lineage.sfxlab.json'))
    const text = serializeProject(project)
    expect(JSON.parse(text).version).toBe(CURRENT_VERSION)
    expect(parseOk(text).project).toEqual(project)
  })

  it('loads every v11 and older fixture unchanged: no loop or lineage appears', () => {
    for (const name of ['v1-minimal', 'v6-presets', 'v7-library', 'v10-group-buses', 'v10-track-groups', 'v11-sample-markers']) {
      const { project } = parseOk(fixture(`${name}.sfxlab.json`))
      for (const sample of project.samples) expect(Object.keys(sample).filter((key) => ['loop', 'lineage'].includes(key)), name).toEqual([])
    }
  })

  it('keeps a good lineage and loop', () => {
    const { sample, warnings } = sanitize({ origin: 'd'.repeat(64), lineage: LINEAGE, loop: { from: 100, to: 200 } })
    expect(warnings).toEqual([])
    expect(sample.lineage).toEqual(LINEAGE)
    expect(sample.loop).toEqual({ from: 100, to: 200 })
  })

  it.each([
    { what: 'without an origin', origin: null, lineage: LINEAGE },
    { what: 'with a step outside the length before it', lineage: { ...LINEAGE, steps: [{ kind: 'crop', from: 0, to: 120001 }] } },
    { what: 'ending at another length', lineage: { ...LINEAGE, steps: [] } },
    { what: 'with an unknown step', lineage: { ...LINEAGE, steps: [...LINEAGE.steps, { kind: 'stretch', from: 0, to: 5 }] } },
    { what: 'with a fractional step', lineage: { ...LINEAGE, steps: [{ ...LINEAGE.steps[0], inserted: 0.5 }, ...LINEAGE.steps.slice(1)] } },
    { what: 'with a bad original', lineage: { ...LINEAGE, original: { ...LINEAGE.original, sampleRate: 'fast' } } },
    { what: 'that is not a record', lineage: 'all of it' },
  ])('drops a lineage $what, with a warning, and keeps the sample', ({ origin = 'd'.repeat(64), lineage }: { origin?: string | null; lineage: unknown }) => {
    const { sample, warnings } = sanitize({ origin, lineage })
    expect(sample).not.toHaveProperty('lineage')
    expect(sample.id).toBe(base.id)
    expect(warnings).toContain('Dropped the invalid edit history of "Loop"; it can\'t be reverted')
  })

  it('clamps a loop to the sample, rounds it, and drops an empty or broken one with a warning', () => {
    expect(sanitize({ loop: { from: -5, to: 100.4 } }).sample.loop).toEqual({ from: 0, to: 100 })
    expect(sanitize({ loop: { from: 95000, to: 99000 } }).sample.loop).toEqual({ from: 95000, to: 96000 })
    for (const loop of [{ from: 5, to: 5 }, { from: 9, to: 2 }, { from: 'a', to: 3 }, [1, 2]]) {
      const { sample, warnings } = sanitize({ loop })
      expect(sample).not.toHaveProperty('loop')
      expect(warnings).toEqual(['Dropped the invalid loop of "Loop"'])
    }
  })
})
