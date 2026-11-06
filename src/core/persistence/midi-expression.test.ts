import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compileAutomation, compileTimelineAutomation } from '../automation'
import { CURRENT_VERSION } from './format'
import { parseProject, serializeProject } from './project-file'

const parseOk = (text: string) => {
  const result = parseProject(text)
  if (!result.ok) throw new Error(result.error)
  return result
}
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const v15 = () => JSON.parse(fixture('v15-midi-expression.sfxlab.json'))

describe('format v15: pitch bend, pressure and CC lanes', () => {
  it('loads the committed fixture without warnings, and every lane plays', () => {
    const { project, warnings } = parseOk(fixture('v15-midi-expression.sfxlab.json'))
    expect(warnings).toEqual([])
    const track = project.tracks[0]!
    expect(track.kind === 'instrument' && track.bendRange).toBe(12)
    const clipLanes = track.kind === 'instrument' ? track.clips[0]?.automation ?? [] : []
    expect(clipLanes.map((lane) => lane.target)).toMatchObject([{ kind: 'expression', control: 'pitchBend' }, { kind: 'expression', control: 'cc', cc: 1 }])
    expect(project.arrangement![0]!.content.automation![0]!.target).toMatchObject({ kind: 'expression', control: 'pressure' })
    expect(project.arrangementAutomation![0]!.lanes[0]!.target).toMatchObject({ kind: 'expression', control: 'pitchBend' })
    expect(compileAutomation(project)[0]!.clips[0]!.lanes).toHaveLength(2)
    const timeline = compileTimelineAutomation(project)
    expect(timeline.owners[0]!.lanes).toHaveLength(1)
    expect(timeline.regions[0]!.lanes).toHaveLength(1)
  })

  it('round-trips, and saves as v15', () => {
    const { project } = parseOk(fixture('v15-midi-expression.sfxlab.json'))
    const text = serializeProject(project)
    expect(CURRENT_VERSION).toBe(15)
    expect(JSON.parse(text).version).toBe(15)
    expect(parseOk(text).project).toEqual(project)
  })

  it('loads a v14 file as it was', () => {
    const { project, warnings } = parseOk(fixture('v14-timeline-automation.sfxlab.json'))
    expect(warnings).toEqual([])
    expect(project.arrangementAutomation).toHaveLength(4)
  })

  it.each([
    ['a CC with no number', { kind: 'expression', control: 'cc' }],
    ['the sustain pedal', { kind: 'expression', control: 'cc', cc: 64 }],
    ['a channel mode message', { kind: 'expression', control: 'cc', cc: 120 }],
    ['a fractional CC', { kind: 'expression', control: 'cc', cc: 1.5 }],
    ['a bend with a CC number', { kind: 'expression', control: 'pitchBend', cc: 1 }],
    ['an unknown control', { kind: 'expression', control: 'aftertouch' }],
  ])('skips a lane naming %s, with a warning', (_name, target) => {
    const file = v15()
    const lane = file.project.tracks[0].clips[0].automation[0]
    lane.target = { ...target, owner: lane.target.owner }
    const { project, warnings } = parseOk(JSON.stringify(file))
    expect(warnings).toContain('Invalid automation lane skipped')
    const track = project.tracks[0]!
    expect(track.kind === 'instrument' && track.clips[0]?.automation?.map((l) => l.id)).toEqual(['lane_mod'])
  })

  it('keeps an expression lane on an owner that isn’t an instrument track, with a warning, and doesn’t play it', () => {
    const file = v15()
    const ret = { kind: 'return', id: 'ret', name: 'Return', volume: 1, fx: file.project.tracks[0].fx }
    file.project.tracks.push(ret)
    const owner = { kind: 'track', trackId: 'ret' }
    file.project.arrangementAutomation.push({ owner, lanes: [{ id: 'ret_bend', target: { kind: 'expression', owner, control: 'pitchBend' }, enabled: true, points: [] }] })
    const { project, warnings } = parseOk(JSON.stringify(file))
    expect(warnings.some((warning) => warning.includes('Unsupported automation owner in lane "ret_bend"'))).toBe(true)
    expect(project.arrangementAutomation![1]!.lanes).toHaveLength(1)
    expect(compileTimelineAutomation(project).owners).toHaveLength(1)
  })

  it('refuses a MIDI mapping that names an expression target', () => {
    const file = v15()
    const owner = file.project.tracks[0].clips[0].automation[0].target.owner
    file.project.midiMappings = [{ id: 'm', deviceId: 'd', deviceName: 'Keys', channel: 0, cc: 21, pickup: false, target: { kind: 'expression', owner, control: 'pitchBend' } }]
    const { project, warnings } = parseOk(JSON.stringify(file))
    expect(warnings).toContain('Invalid MIDI mapping skipped')
    expect(project.midiMappings).toBeUndefined()
  })
})
