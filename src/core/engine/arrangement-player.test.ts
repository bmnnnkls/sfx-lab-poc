import { describe, expect, it } from 'vitest'
import { ArrangementAudio, ArrangementNotes } from './arrangement-player'

const midiRegion = (id: string, startBeat: number) => ({
  id,
  trackId: 't',
  startBeat,
  content: {
    id: `clip-${id}`,
    name: 'clip',
    lengthBeats: 4,
    notes: [
      { id: 'n1', pitch: 60, start: 0, duration: 2, velocity: 0.9 },
      { id: 'n2', pitch: 72, start: 2, duration: 2, velocity: 0.9 },
    ],
  },
})

const audioRegion = (id: string, startBeat: number) => ({
  id,
  trackId: 't',
  startBeat,
  content: {
    id: `audio-${id}`,
    name: 'clip',
    sampleId: 'a'.repeat(64),
    lengthBeats: 4,
    loop: false,
    warp: 'repitch' as const,
    gain: 1,
    start: 0,
    end: 1,
    fadeIn: 0,
    fadeOut: 0,
  },
})

describe('arrangement notes', () => {
  it('emit the notes of the region under the playhead', () => {
    const player = new ArrangementNotes('track:t')
    player.setRegions([midiRegion('r1', 4)])
    const events = player.collectEvents(4, 5)
    expect(events).toEqual([
      { beat: 4, kind: 'noteOn', pitch: 60, velocity: 0.9, identity: { source: 'track:t', channel: 0, id: JSON.stringify(['arr', 'r1', 'n1']) } },
    ])
  })

  it('emit the note off of a note that ends within the range', () => {
    const player = new ArrangementNotes('track:t')
    player.setRegions([midiRegion('r1', 0)])
    const events = player.collectEvents(2, 4)
    expect(events.map((event) => [event.beat, event.kind, 'pitch' in event ? event.pitch : null])).toEqual([
      [2, 'noteOff', 60],
      [2, 'noteOn', 72],
    ])
  })

  it('play what is under the playhead when the transport starts mid-clip', () => {
    const player = new ArrangementNotes('track:t')
    player.setRegions([midiRegion('r1', 4)])
    // Seeking into the middle of the region: notes that start in the range fire, earlier ones do not.
    const events = player.collectEvents(6, 8)
    expect(events.map((event) => [event.beat, event.kind, 'pitch' in event ? event.pitch : null])).toEqual([
      [6, 'noteOff', 60],
      [6, 'noteOn', 72],
    ])
  })

  it('play once: nothing after the region ends', () => {
    const player = new ArrangementNotes('track:t')
    player.setRegions([midiRegion('r1', 0)])
    // The boundary range releases the note that runs to the region end, then the region is done.
    expect(player.collectEvents(4, 8).map((event) => [event.beat, event.kind])).toEqual([[4, 'noteOff']])
    expect(player.collectEvents(8, 12)).toEqual([])
  })

  it('skip audio regions', () => {
    const player = new ArrangementNotes('track:t')
    player.setRegions([audioRegion('r1', 0)])
    expect(player.collectEvents(0, 8)).toEqual([])
  })
})

describe('arrangement audio', () => {
  it('starts a region when the transport reaches it, with the region start as its loop origin', () => {
    const player = new ArrangementAudio()
    player.setRegions([audioRegion('r1', 4)])
    expect(player.collectEvents(0, 4)).toEqual([])
    const events = player.collectEvents(4, 5)
    expect(events).toEqual([{ beat: 4, kind: 'start', clip: expect.objectContaining({ id: 'audio-r1' }), origin: 4 }])
  })

  it('joins in phase when playback begins inside a region', () => {
    const player = new ArrangementAudio()
    player.setRegions([audioRegion('r1', 0)])
    const events = player.collectEvents(2, 3)
    expect(events).toEqual([{ beat: 2, kind: 'start', clip: expect.objectContaining({ id: 'audio-r1' }), origin: 0 }])
  })

  it('stops a region at its timeline end', () => {
    const player = new ArrangementAudio()
    player.setRegions([audioRegion('r1', 0)])
    player.collectEvents(0, 1)
    const events = player.collectEvents(3, 5)
    expect(events).toEqual([expect.objectContaining({ beat: 4, kind: 'stop' })])
  })

  it('stops a region that was moved or deleted while playing', () => {
    const player = new ArrangementAudio()
    player.setRegions([audioRegion('r1', 0)])
    player.collectEvents(0, 1)
    player.setRegions([]) // deleted mid-play
    expect(player.collectEvents(1, 2)).toEqual([expect.objectContaining({ beat: 1, kind: 'stop' })])
  })
})
