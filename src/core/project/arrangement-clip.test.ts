import { describe, expect, it } from 'vitest'
import type { SampleInfo } from '../sample'
import { createAudioClip } from './audio-clip'
import { createClip } from './edit'
import { createNote } from './note-edit'
import type { AudioClip } from './types'
import {
  addArrangementClip,
  arrangementEnd,
  arrangementOnTrack,
  arrangementOverlaps,
  createArrangementClip,
  isAudioContent,
  removeArrangementClip,
  updateArrangementClip,
} from './arrangement-clip'
import type { Clip } from './types'
import type { ArrangementClip } from './arrangement-clip'

const midiClip = (): Clip => ({ ...createClip('Groove', 4, [createNote(60, 0, 2)]) })
const audioClip = (): AudioClip => createAudioClip({ id: 'a'.repeat(64), name: 'Loop', durationSeconds: 2, sampleRate: 48000, extension: 'wav', channels: 1, bytes: 96044 } as SampleInfo, 120)

describe('arrangement clips', () => {
  it('are copies with fresh ids, placed at their beat', () => {
    const region = createArrangementClip('t1', 8, midiClip())
    expect(region.id).not.toBe(midiClip().id)
    expect(region).toMatchObject({ trackId: 't1', startBeat: 8 })
    expect(region.content.name).toBe('Groove')
  })

  it('never start before the beginning', () => {
    expect(createArrangementClip('t1', -3, midiClip()).startBeat).toBe(0)
  })

  it('tell audio and MIDI content apart', () => {
    expect(isAudioContent(createArrangementClip('t1', 0, audioClip()).content)).toBe(true)
    expect(isAudioContent(createArrangementClip('t1', 0, midiClip()).content)).toBe(false)
  })

  it('end at start plus length', () => {
    expect(arrangementEnd(createArrangementClip('t1', 8, midiClip()))).toBe(12)
  })

  it('overlap the ranges they sound in, and only those', () => {
    const region = createArrangementClip('t1', 4, midiClip())
    expect(arrangementOverlaps(region, 0, 4)).toBe(false)
    expect(arrangementOverlaps(region, 4, 8)).toBe(true)
    expect(arrangementOverlaps(region, 7, 9)).toBe(true)
    expect(arrangementOverlaps(region, 8, 12)).toBe(false)
  })

  it('move and resize, keeping other regions alone', () => {
    const a = createArrangementClip('t1', 0, midiClip())
    const b = createArrangementClip('t1', 8, midiClip())
    const moved = updateArrangementClip([a, b], a.id, { startBeat: 4 })
    expect(moved[0]!.startBeat).toBe(4)
    expect(moved[1]).toBe(b)
    const resized = updateArrangementClip(moved, a.id, { content: { ...a.content, lengthBeats: 8 } })
    expect(resized[0]!.content.lengthBeats).toBe(8)
    expect(resized[1]).toBe(b)
  })

  it('trim a resized MIDI clip so no note starts past its end', () => {
    const region = createArrangementClip('t1', 0, createClip('Long', 4, [createNote(60, 0, 8), createNote(72, 3, 1)]))
    const next = updateArrangementClip([region], region.id, { content: { ...region.content, lengthBeats: 2 } })
    expect(next[0]!.content).toMatchObject({ lengthBeats: 2 })
    expect(isAudioContent(next[0]!.content)).toBe(false)
    const notes = (next[0]!.content as Clip).notes
    expect(notes).toHaveLength(1)
    expect(notes[0]).toMatchObject({ pitch: 60, duration: 2 })
  })

  it('ignore no-op edits (the same objects back)', () => {
    const region = createArrangementClip('t1', 4, midiClip())
    expect(updateArrangementClip([region], region.id, { startBeat: 4 })[0]).toBe(region)
  })

  it('add and remove', () => {
    const region = createArrangementClip('t1', 0, midiClip())
    let regions: readonly ArrangementClip[] = []
    regions = addArrangementClip(regions, region)
    expect(regions).toHaveLength(1)
    regions = removeArrangementClip(regions, region.id)
    expect(regions).toHaveLength(0)
  })

  it("filter one track's regions into timeline order", () => {
    const a = createArrangementClip('t1', 8, midiClip())
    const b = createArrangementClip('t1', 0, midiClip())
    const other = createArrangementClip('t2', 0, midiClip())
    const onTrack = arrangementOnTrack([a, other, b], 't1')
    expect(onTrack.map((region) => region.startBeat)).toEqual([0, 8])
  })
})
