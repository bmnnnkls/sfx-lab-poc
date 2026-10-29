import { describe, expect, it } from 'vitest'
import { SAMPLE_EDITS, type SampleAudio, type SampleEdit, applySampleEdit, sampleEditEntry } from '.'

const audio = (...channels: number[][]): SampleAudio => ({ sampleRate: 100, channels: channels.map((values) => Float32Array.from(values)) })
const values = (result: SampleAudio) => result.channels.map((channel) => Array.from(channel, (value) => +value.toFixed(5)))

const LEFT = [0, 1, 2, 3, 4, 5]
const RIGHT = [0, -1, -2, -3, -4, -5]

/** Each edit on a mono and a stereo sample: the stereo result is the mono result on each channel. */
const table: Array<{ edit: SampleEdit; left: number[]; right: number[] }> = [
  { edit: { kind: 'reverse' }, left: [5, 4, 3, 2, 1, 0], right: [-5, -4, -3, -2, -1, -0] },
  { edit: { kind: 'keep', range: { from: 1, to: 4 } }, left: [1, 2, 3], right: [-1, -2, -3] },
  { edit: { kind: 'keep', range: { from: 4, to: 1 } }, left: [1, 2, 3], right: [-1, -2, -3] },
  { edit: { kind: 'keep', range: { from: -3, to: 99 } }, left: LEFT, right: RIGHT },
  { edit: { kind: 'delete', range: { from: 1, to: 4 } }, left: [0, 4, 5], right: [0, -4, -5] },
  { edit: { kind: 'delete', range: { from: 0, to: 6 } }, left: [], right: [] },
  // 0.02 s at 100 Hz = 2 frames.
  { edit: { kind: 'fade-in', seconds: 0.02 }, left: [0, 0.5, 2, 3, 4, 5], right: [0, -0.5, -2, -3, -4, -5] },
  { edit: { kind: 'fade-out', seconds: 0.02 }, left: [0, 1, 2, 3, 2, 0], right: [0, -1, -2, -3, -2, -0] },
  // A fade is at most half the sample.
  { edit: { kind: 'fade-in', seconds: 10 }, left: [0, 1 / 3, 4 / 3, 3, 4, 5], right: [0, -1 / 3, -4 / 3, -3, -4, -5] },
]

describe('applySampleEdit', () => {
  it.each(table)('$edit.kind $edit works on every channel, mono and stereo alike', ({ edit, left, right }) => {
    const round = (list: number[]) => list.map((value) => +value.toFixed(5))
    expect(values(applySampleEdit(audio(LEFT), edit))).toEqual([round(left)])
    expect(values(applySampleEdit(audio(LEFT, RIGHT), edit))).toEqual([round(left), round(right)])
  })

  it('normalizes with one gain for both channels, so the balance stays', () => {
    const result = applySampleEdit(audio([0.1, 0.2], [-0.4, 0.1]), { kind: 'normalize' })
    expect(values(result)).toEqual([[0.24975, 0.4995], [-0.999, 0.24975]])
    // Silence is left silent.
    expect(values(applySampleEdit(audio([1e-6, -1e-6]), { kind: 'normalize' }))).toEqual([[0, -0]])
    expect(applySampleEdit(audio([1e-6]), { kind: 'normalize' }).channels[0]![0]).toBeCloseTo(1e-6, 9)
  })

  it('leaves its input alone and keeps the sample rate', () => {
    const input = audio(LEFT, RIGHT)
    const result = applySampleEdit(input, { kind: 'reverse' })
    expect(values(input)).toEqual([LEFT, RIGHT])
    expect(result.sampleRate).toBe(100)
    expect(result.channels[0]).not.toBe(input.channels[0])
  })
})

describe('SAMPLE_EDITS', () => {
  it('lists the six edits in toolbar order, each with a title, a tooltip and a suffix', () => {
    expect(SAMPLE_EDITS.map((entry) => entry.title)).toEqual(['Normalize', 'Reverse', 'Keep selection', 'Delete selection', 'Fade in', 'Fade out'])
    for (const entry of SAMPLE_EDITS) expect(entry.tooltip && entry.suffix, entry.kind).toBeTruthy()
  })

  it('makes an edit from the selection, or none without one where it needs it', () => {
    const selection = { from: 10, to: 20 }
    expect(sampleEditEntry('keep').create({ selection })).toEqual({ kind: 'keep', range: selection })
    expect(sampleEditEntry('delete').create({ selection: null })).toBeNull()
    expect(sampleEditEntry('delete').create({ selection: { from: 5, to: 5 } })).toBeNull()
    expect(sampleEditEntry('fade-in').create({ selection: null })).toEqual({ kind: 'fade-in', seconds: 0.01 })
    expect(SAMPLE_EDITS.filter((entry) => entry.needsSelection).map((entry) => entry.kind)).toEqual(['keep', 'delete'])
  })
})
