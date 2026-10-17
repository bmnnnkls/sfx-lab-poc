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

/** A region whose clip is a single note running the whole clip, so every pass has exactly one on and one off. */
const loopRegion = (id: string, startBeat: number, loop = false) => ({
  id,
  trackId: 't',
  startBeat,
  loop,
  content: {
    id: `clip-${id}`,
    name: 'clip',
    lengthBeats: 4,
    notes: [{ id: 'n1', pitch: 60, start: 0, duration: 4, velocity: 0.9 }],
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

  it('loop: the notes repeat each pass until the next region on the track', () => {
    const player = new ArrangementNotes('track:t')
    player.setRegions([loopRegion('r1', 0, true), loopRegion('r2', 16)])
    const events = player.collectEvents(0, 16)
    expect(events.filter((event) => event.kind === 'noteOn').map((event) => event.beat)).toEqual([0, 4, 8, 12])
    // The note runs to the clip end, so it is released at every pass boundary (the last on the boundary range, checked below).
    expect(events.filter((event) => event.kind === 'noteOff').map((event) => event.beat)).toEqual([4, 8, 12])
    expect(events.filter((event) => event.kind === 'noteOn').map((event) => event.identity?.id)).toEqual([
      JSON.stringify(['arr', 'r1', 0, 'n1']),
      JSON.stringify(['arr', 'r1', 1, 'n1']),
      JSON.stringify(['arr', 'r1', 2, 'n1']),
      JSON.stringify(['arr', 'r1', 3, 'n1']),
    ])
    // Past the loop end, the boundary range releases the last pass and the next region plays its own notes once.
    const after = player.collectEvents(16, 24)
    expect(after.map((event) => [event.beat, event.kind, 'identity' in event && event.identity ? event.identity.id : null])).toEqual([
      [16, 'noteOff', JSON.stringify(['arr', 'r1', 3, 'n1'])],
      [16, 'noteOn', JSON.stringify(['arr', 'r2', 'n1'])],
      [20, 'noteOff', JSON.stringify(['arr', 'r2', 'n1'])],
    ])
  })

  it('loop: a pass the loop end falls into is cut short there', () => {
    const player = new ArrangementNotes('track:t')
    player.setRegions([loopRegion('r1', 0, true), loopRegion('r2', 6)])
    // The second pass runs 4 to 6: the note starts there and is cut at the loop end. The next region's own note starts at 6.
    const events = player.collectEvents(0, 8)
    expect(events.filter((event) => event.kind === 'noteOn').map((event) => event.beat)).toEqual([0, 4, 6])
    expect(events.filter((event) => event.kind === 'noteOff').map((event) => event.beat)).toEqual([4, 6])
    // The loop is over; only the next region's own tail note-off follows.
    expect(player.collectEvents(8, 12).map((event) => [event.beat, event.kind])).toEqual([[10, 'noteOff']])
  })

  it('loop: with no next region, a lone looping region still stops at its own end', () => {
    const player = new ArrangementNotes('track:t')
    player.setRegions([loopRegion('r1', 0, true)])
    expect(player.collectEvents(0, 8).map((event) => [event.beat, event.kind])).toEqual([
      [0, 'noteOn'],
      [4, 'noteOff'],
    ])
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

  it('loops: the clip keeps looping until the next region on the track stops it', () => {
    const player = new ArrangementAudio()
    player.setRegions([{ ...audioRegion('r1', 0), loop: true }, audioRegion('r2', 12)])
    expect(player.collectEvents(0, 4)).toEqual([expect.objectContaining({ beat: 0, kind: 'start', origin: 0 })])
    // Past the region's own end (beat 4) it is still playing — nothing stops it before the next region.
    expect(player.collectEvents(4, 12)).toEqual([])
    // The next region (at beat 12) cuts the loop there and takes over.
    expect(player.collectEvents(12, 16)).toEqual([
      expect.objectContaining({ beat: 12, kind: 'stop' }),
      expect.objectContaining({ beat: 12, kind: 'start', clip: expect.objectContaining({ id: 'audio-r2' }) }),
    ])
  })

  it('loops: the start event enables the clip loop, so the read position wraps each pass', () => {
    const player = new ArrangementAudio()
    player.setRegions([{ ...audioRegion('r1', 0), loop: true }, audioRegion('r2', 8)])
    const events = player.collectEvents(0, 1)
    expect(events[0]).toMatchObject({ kind: 'start', clip: expect.objectContaining({ id: 'audio-r1', loop: true }) })
  })

  it('loops: with no next region, a lone looping region stops at its own end', () => {
    const player = new ArrangementAudio()
    player.setRegions([{ ...audioRegion('r1', 0), loop: true }])
    player.collectEvents(0, 1)
    expect(player.collectEvents(3, 5)).toEqual([expect.objectContaining({ beat: 4, kind: 'stop' })])
    expect(player.collectEvents(5, 6)).toEqual([])
  })
})
