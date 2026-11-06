import { describe, expect, it } from 'vitest'
import type { AutomationLane, AutomationPoint } from '../automation'
import type { ExpressionTarget } from '../control'
import type { TrackExpression } from '../dsp'
import { noteGraphFrom } from '../patch'
import { type ArrangementClip, type Clip, type InstrumentTrack, type Project, createArrangementClip, createClip, createEmptyProject, createNote } from '../project'
import { diffProject } from '../sync'
import { renderProject } from './bounce'
import { Engine } from './engine'

const RATE = 48000
const BLOCK = 128
/** 120 BPM: a beat is 24000 frames. */
const TEMPO = 120
const FRAMES_PER_BEAT = RATE * 60 / TEMPO

const owner = { kind: 'track' as const, trackId: 'a' }
const bend: ExpressionTarget = { kind: 'expression', owner, control: 'pitchBend' }
const modWheel: ExpressionTarget = { kind: 'expression', owner, control: 'cc', cc: 1 }
const point = (beat: number, value: number, interpolation: AutomationPoint['interpolation'] = 'linear'): AutomationPoint => ({ id: `p${beat}`, beat, value, interpolation })
const lane = (target: ExpressionTarget, points: readonly AutomationPoint[], id = 'lane'): AutomationLane => ({ id, target, enabled: true, points })
/** A clip holding A4 for its whole length, with these lanes. */
const clip = (lanes: readonly AutomationLane[], length = 4): Clip => ({ ...createClip('Held', length, [createNote(69, 0, length, 1)]), id: 'clip', automation: lanes })

/** An oscillator following the note, so the bend is heard; track 'a' has `clips`. */
const project = (clips: readonly (Clip | null)[], extra: Partial<Project> = {}): Project => {
  const base = createEmptyProject(), track = base.tracks[0] as InstrumentTrack
  const patch = noteGraphFrom([{ id: 'n', type: 'note' }, { id: 'osc', type: 'oscillator' }, { id: 'out', type: 'output' }], ['n.frequency>osc.freq', 'osc.out>out.in'])
  return { ...base, tempo: TEMPO, tracks: [{ ...track, id: 'a', patch, clips: [...clips, ...track.clips.slice(clips.length)] }], ...extra }
}
const engineFor = (p: Project) => {
  const engine = new Engine(RATE)
  for (const command of diffProject(null, p)) engine.apply(command)
  return engine
}
const expressionOf = (engine: Engine): Readonly<TrackExpression> =>
  (engine as unknown as { tracks: Map<string, { expressionNow(): Readonly<TrackExpression> }> }).tracks.get('a')!.expressionNow()
const render = (engine: Engine, frames: number) => {
  for (let done = 0; done < frames; done += BLOCK) engine.render(new Float32Array(BLOCK), new Float32Array(BLOCK))
}

describe('expression lanes in the engine', () => {
  it('a clip’s bend lane moves the track’s bend block by block, and a stop puts it back at rest', () => {
    // From the wheel at rest (0.5 normalized) up to +1 over the first beat.
    const engine = engineFor(project([clip([lane(bend, [point(0, 0.5), point(1, 1)])])]))
    engine.apply({ type: 'scene/launch', scene: 0 })
    const seen: number[] = []
    for (let block = 0; block < Math.floor(FRAMES_PER_BEAT / BLOCK); block++) {
      render(engine, BLOCK)
      seen.push(expressionOf(engine).bend)
      // The block hears the lane at its last sample.
      const beat = ((block + 1) * BLOCK - 1) / FRAMES_PER_BEAT
      expect(expressionOf(engine).bend).toBeCloseTo(beat, 3)
    }
    expect(seen.every((value, index) => index === 0 || value > seen[index - 1]!)).toBe(true)
    render(engine, FRAMES_PER_BEAT / 2)
    expect(expressionOf(engine).bend).toBe(1)
    engine.apply({ type: 'track/stop', trackId: 'a' })
    render(engine, FRAMES_PER_BEAT * 4)
    expect(expressionOf(engine).bend).toBe(0)
  })

  it('a CC lane writes the CC, and ■ puts it back at rest', () => {
    const engine = engineFor(project([clip([lane(modWheel, [point(0, 0.75, 'hold')])])]))
    engine.apply({ type: 'scene/launch', scene: 0 })
    render(engine, BLOCK * 4)
    expect(expressionOf(engine).cc[1]).toBe(0.75)
    engine.apply({ type: 'transport/stop' })
    expect(expressionOf(engine).cc[1]).toBe(0)
  })

  it('a timeline lane wins over a region’s for the same control', () => {
    const region = createArrangementClip('a', 0, clip([lane(bend, [point(0, 1, 'hold')])]))
    const p = project([], { arrangement: [region], arrangementAutomation: [{ owner, lanes: [lane(bend, [point(0, 0.25, 'hold')], 'timeline')] }] })
    const engine = engineFor(p)
    engine.apply({ type: 'arrangement/play', fromBeat: 0 })
    render(engine, BLOCK * 4)
    expect(expressionOf(engine).bend).toBe(-0.5)
    // Without the timeline lane the region's plays.
    const alone = engineFor({ ...p, arrangementAutomation: [] })
    alone.apply({ type: 'arrangement/play', fromBeat: 0 })
    render(alone, BLOCK * 4)
    expect(expressionOf(alone).bend).toBe(1)
  })

  it('a looping region’s lane plays at its phase, and ends at rest after the region', () => {
    // A two-beat region from −1 to +1, looping until the next region at beat 8, which has no lanes.
    const looping: ArrangementClip = { ...createArrangementClip('a', 0, clip([lane(bend, [point(0, 0), point(2, 1)])], 2)), loop: true }
    const next = createArrangementClip('a', 8, { ...clip([], 2), id: 'plain' })
    const engine = engineFor(project([], { arrangement: [looping, next] }))
    engine.apply({ type: 'arrangement/play', fromBeat: 5 })
    render(engine, BLOCK)
    // Beat 5 is a beat into the third pass: the middle of the ramp, heard at the block's last sample.
    expect(expressionOf(engine).bend).toBeCloseTo((BLOCK - 1) / FRAMES_PER_BEAT, 6)
    render(engine, FRAMES_PER_BEAT * 3.5)
    expect(expressionOf(engine).bend).toBe(0)
  })

  it('a keyboard’s release leaves what the lane, or an override over it, wrote', () => {
    const engine = engineFor(project([clip([lane(bend, [point(0, 1, 'hold')])])]))
    engine.apply({ type: 'scene/launch', scene: 0 })
    render(engine, BLOCK * 2)
    engine.apply({ type: 'track/expression', trackId: 'a', sourceId: 'midi:keys', channel: 0, control: 'pitchBend', value: 0.3 })
    engine.apply({ type: 'automation/overrides', values: [{ target: bend, value: 0.3 }] })
    render(engine, BLOCK * 2)
    expect(expressionOf(engine).bend).toBeCloseTo(0.3, 6)
    engine.apply({ type: 'notes/releaseSource', sourceId: 'midi:keys' })
    render(engine, BLOCK * 2)
    expect(expressionOf(engine).bend).toBeCloseTo(0.3, 6)
    // *Read*: the lane plays again.
    engine.apply({ type: 'automation/overrides', values: [] })
    render(engine, BLOCK * 2)
    expect(expressionOf(engine).bend).toBe(1)
  })

  it('the bounce bends as the live render does', () => {
    const p = project([clip([lane(bend, [point(0, 0.5), point(2, 1), point(4, 0)])])])
    const bounced = renderProject(p, [], { scope: { kind: 'clip', trackId: 'a', clipId: 'clip' }, maxTail: 0, sampleRate: RATE })
    const engine = engineFor(p)
    engine.apply({ type: 'clip/launch', trackId: 'a', clipId: 'clip' })
    const live = new Float32Array(bounced.left.length)
    for (let offset = 0; offset < live.length; offset += BLOCK) {
      const l = new Float32Array(Math.min(BLOCK, live.length - offset))
      engine.render(l, new Float32Array(l.length))
      live.set(l, offset)
    }
    let difference = 0
    for (let i = 0; i < live.length; i++) difference = Math.max(difference, Math.abs(live[i]! - bounced.left[i]!))
    expect(difference).toBeLessThan(1e-5)
    // And the bend is heard: the bounce differs from the same clip without the lane.
    const flat = renderProject(project([clip([])]), [], { scope: { kind: 'clip', trackId: 'a', clipId: 'clip' }, maxTail: 0, sampleRate: RATE })
    let bent = 0
    for (let i = 0; i < live.length; i++) bent = Math.max(bent, Math.abs(flat.left[i]! - bounced.left[i]!))
    expect(bent).toBeGreaterThan(0.1)
  })

  it('a project without expression lanes configures as before', () => {
    const plain = project([clip([])])
    const commands = diffProject(null, plain).filter((command) => command.type === 'automation/configure')
    expect(commands).toEqual([])
  })
})
