import { describe, expect, it } from 'vitest'
import { type ArrangementClip, createClip, createNote } from '../project'
import { createDefaultFxGraph, createDefaultNoteGraph, createDefaultPatch } from '../patch'
import { Engine } from './engine'

const SAMPLE_RATE = 48000
const BEAT = 24000 // frames per beat at 120 bpm
const AMPLITUDE = 0.2

const SAMPLE_ID = 'a'.repeat(64)

const setup = (arrangement: readonly ArrangementClip[]) => {
  const engine = new Engine(SAMPLE_RATE)
  engine.apply({ type: 'transport/setTempo', bpm: 120 })
  engine.apply({ type: 'sample/add', sample: { id: SAMPLE_ID, sampleRate: SAMPLE_RATE, data: new Float32Array(4 * BEAT).fill(AMPLITUDE) } })
  engine.apply({
    type: 'track/add',
    kind: 'instrument',
    trackId: 'synth',
    patch: createDefaultPatch(),
    noteGraph: createDefaultNoteGraph(),
    fx: createDefaultFxGraph(),
    clips: [{ ...createClip('Session', 4, [createNote(60, 0, 4)]), id: 'clip' }],
    volume: 1,
    voices: 8,
  })
  engine.apply({ type: 'track/add', kind: 'audio', trackId: 'loop', fx: createDefaultFxGraph(), clips: [], volume: 1 })
  engine.apply({ type: 'arrangement/set', clips: arrangement })
  return engine
}

const render = (engine: Engine, frames: number): Float32Array => {
  const left = new Float32Array(frames)
  engine.render(left, new Float32Array(frames))
  return left
}

const midiRegion = (trackId: string, startBeat: number, id = 'r-midi'): ArrangementClip => ({
  id,
  trackId,
  startBeat,
  content: createClip('Groove', 4, [createNote(60, 0, 4)]),
})

const loopingAudioRegion = (trackId: string, startBeat: number, id = 'r-audio'): ArrangementClip => ({
  ...audioRegion(trackId, startBeat, id),
  loop: true,
})

const audioRegion = (trackId: string, startBeat: number, id = 'r-audio'): ArrangementClip => ({
  id,
  trackId,
  startBeat,
  content: {
    id: `arr-audio-${id}`,
    name: 'Loop',
    sampleId: SAMPLE_ID,
    lengthBeats: 4,
    loop: false,
    warp: 'repitch',
    gain: 1,
    start: 0,
    end: 1,
    fadeIn: 0,
    fadeOut: 0,
  },
})

describe('the arrangement in the engine', () => {
  it('is silent until the arrangement plays', () => {
    const engine = setup([midiRegion('synth', 0)])
    expect(Math.max(...render(engine, BEAT))).toBe(0)
  })

  it('plays the notes of the region under the playhead, in time with the grid', () => {
    const engine = setup([midiRegion('synth', 4)])
    engine.apply({ type: 'arrangement/play', fromBeat: 4 })
    expect(engine.status().beat).toBe(4)
    // One beat of the region (a note on beat 0 of the clip) — the instrument sounds right away.
    const left = render(engine, BEAT)
    expect(Math.max(...left)).toBeGreaterThan(0)
  })

  it('plays an audio region phase-locked from its timeline start, and stops at its end', () => {
    const engine = setup([audioRegion('loop', 0)])
    engine.apply({ type: 'arrangement/play', fromBeat: 0 })
    const left = render(engine, 1000)
    // The sample is a DC signal at AMPLITUDE; the output soft clip makes it tanh(AMPLITUDE).
    expect(left[10]).toBeCloseTo(Math.tanh(AMPLITUDE), 5)
    // Four beats in, the region has ended (a non-looping pass) and the engine reports it finished.
    render(engine, 4 * BEAT)
    expect(engine.status().tracks.loop!.playingClipId).toBeNull()
  })

  it('stops with the transport (notes are released, audio fades out)', () => {
    const engine = setup([audioRegion('loop', 0)])
    engine.apply({ type: 'arrangement/play', fromBeat: 0 })
    render(engine, BEAT)
    engine.apply({ type: 'arrangement/stop' })
    expect(engine.status().playing).toBe(false)
    render(engine, 480)
    expect(engine.status().tracks.loop!.playingClipId).toBeNull()
  })

  it('switches back to the session when a clip is launched', () => {
    const engine = setup([midiRegion('synth', 8)])
    engine.apply({ type: 'arrangement/play', fromBeat: 0 })
    engine.apply({ type: 'clip/launch', trackId: 'synth', clipId: 'clip' })
    // The session clip takes over at the current quantize boundary (beat 0, the transport position).
    render(engine, BEAT)
    expect(engine.status().tracks.synth).toMatchObject({ playingClipId: 'clip', startBeat: 0 })
  })

  it('plays each region on its own track only', () => {
    // Two instrument tracks, panned to opposite sides; the region belongs to the right-hand one.
    const engine = new Engine(SAMPLE_RATE)
    engine.apply({ type: 'transport/setTempo', bpm: 120 })
    for (const trackId of ['synth', 'ghost']) {
      engine.apply({
        type: 'track/add',
        kind: 'instrument',
        trackId,
        patch: createDefaultPatch(),
        noteGraph: createDefaultNoteGraph(),
        fx: createDefaultFxGraph(),
        clips: [],
        volume: 1,
        voices: 8,
      })
      engine.apply({ type: 'track/setPan', trackId, pan: trackId === 'synth' ? 1 : -1 })
    }
    engine.apply({ type: 'arrangement/set', clips: [midiRegion('synth', 0)] })
    engine.apply({ type: 'arrangement/play', fromBeat: 0 })
    const left = new Float32Array(BEAT)
    const right = new Float32Array(BEAT)
    engine.render(left, right)
    // The left channel (the ghost track) stays silent: the region never leaked across tracks.
    expect(Math.max(...left)).toBeLessThan(1e-9)
    expect(Math.max(...right)).toBeGreaterThan(0)
  })

  it('starts an audio region on its track only', () => {
    const engine = new Engine(SAMPLE_RATE)
    engine.apply({ type: 'transport/setTempo', bpm: 120 })
    engine.apply({ type: 'sample/add', sample: { id: SAMPLE_ID, sampleRate: SAMPLE_RATE, data: new Float32Array(4 * BEAT).fill(AMPLITUDE) } })
    engine.apply({ type: 'track/add', kind: 'audio', trackId: 'loop', fx: createDefaultFxGraph(), clips: [], volume: 1 })
    engine.apply({ type: 'track/add', kind: 'audio', trackId: 'other', fx: createDefaultFxGraph(), clips: [], volume: 1 })
    engine.apply({ type: 'arrangement/set', clips: [audioRegion('loop', 0)] })
    engine.apply({ type: 'arrangement/play', fromBeat: 0 })
    render(engine, BEAT)
    expect(engine.status().tracks.loop!.playingClipId).not.toBeNull()
    expect(engine.status().tracks.other!.playingClipId).toBeNull()
  })

  it('plays a looping audio region past its own end, until the next region on the track', () => {
    const engine = setup([loopingAudioRegion('loop', 0), audioRegion('loop', 16, 'r-next')])
    engine.apply({ type: 'arrangement/play', fromBeat: 0 })
    // Past the region's own end (beat 4) the clip is still looping: the DC signal keeps sounding.
    render(engine, 4 * BEAT + 500)
    expect(engine.status().tracks.loop!.playingClipId).not.toBeNull()
    // The next region at beat 16 cuts the loop and takes over.
    render(engine, 12 * BEAT + 500)
    expect(engine.status().tracks.loop!.playingClipId).toBe('arr-audio-r-next')
  })
})
