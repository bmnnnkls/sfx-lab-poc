import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CROSSFADE,
  FADE_CURVES,
  SAMPLE_EDITS,
  type EditChannels,
  type SampleAudio,
  type SampleEdit,
  type SampleEditContext,
  applySampleEdit,
  changedFrames,
  clampCrossfadeSeconds,
  editSuffix,
  fadeShape,
  remapFrame,
  remapRange,
  sampleEditEntry,
} from '.'

const audio = (...channels: number[][]): SampleAudio => ({ sampleRate: 100, channels: channels.map((values) => Float32Array.from(values)) })
const values = (result: SampleAudio) => result.channels.map((channel) => Array.from(channel, (value) => +value.toFixed(5)))
const round = (list: readonly number[]) => list.map((value) => +value.toFixed(5))

const LEFT = [0, 1, 2, 3, 4, 5, 6, 7]
const RIGHT = [0, -1, -2, -3, -4, -5, -6, -7]
const NO_RAMP = { frames: 0, curve: 'linear' } as const
const WHOLE = { from: 0, to: 8 }
const PART = { from: 2, to: 6 }

/** A process on a mono sample: what it gives for the whole of it and for frames 2 to 6. */
const processes: Array<{ name: string; make: (range: { from: number; to: number }, channels: EditChannels) => SampleEdit; whole: number[]; part: number[] }> = [
  {
    name: 'gain −6.0206 dB (half)',
    make: (range, channels) => ({ kind: 'gain', range, channels, db: 20 * Math.log10(0.5), ramp: NO_RAMP }),
    whole: LEFT.map((value) => value / 2),
    part: [0, 1, 1, 1.5, 2, 2.5, 6, 7],
  },
  {
    name: 'fade in, linear',
    make: (range, channels) => ({ kind: 'fade', range, channels, direction: 'in', curve: 'linear' }),
    whole: LEFT.map((value, i) => value * (i / 8)),
    part: [0, 1, 0, 3 * 0.25, 4 * 0.5, 5 * 0.75, 6, 7],
  },
  {
    name: 'fade out, linear',
    make: (range, channels) => ({ kind: 'fade', range, channels, direction: 'out', curve: 'linear' }),
    whole: LEFT.map((value, i) => value * ((7 - i) / 8)),
    part: [0, 1, 2 * 0.75, 3 * 0.5, 4 * 0.25, 0, 6, 7],
  },
  {
    name: 'normalize to 0 dBFS',
    make: (range, channels) => ({ kind: 'normalize', range, channels, peakDb: 0, linked: true }),
    whole: LEFT.map((value) => value / 7),
    part: [0, 1, 2 / 5, 3 / 5, 4 / 5, 1, 6, 7],
  },
  {
    name: 'reverse',
    make: (range, channels) => ({ kind: 'reverse', range, channels }),
    whole: [...LEFT].reverse(),
    part: [0, 1, 5, 4, 3, 2, 6, 7],
  },
  {
    name: 'silence',
    make: (range, channels) => ({ kind: 'silence', range, channels, ramp: NO_RAMP }),
    whole: LEFT.map(() => 0),
    part: [0, 1, 0, 0, 0, 0, 6, 7],
  },
  {
    name: 'remove DC offset',
    make: (range, channels) => ({ kind: 'dc-offset', range, channels, ramp: NO_RAMP }),
    whole: LEFT.map((value) => value - 3.5),
    part: [0, 1, 2 - 3.5, 3 - 3.5, 4 - 3.5, 5 - 3.5, 6, 7],
  },
]

describe('the processes', () => {
  it.each(processes)('$name works on the whole sample and on a range, mono and stereo', ({ make, whole, part }) => {
    expect(values(applySampleEdit(audio(LEFT), make(WHOLE, 'both')))).toEqual([round(whole)])
    expect(values(applySampleEdit(audio(LEFT), make(PART, 'both')))).toEqual([round(part)])
    // On a stereo sample, both channels; the right is the left negated, so each result is too (DC offset included).
    const stereo = values(applySampleEdit(audio(LEFT, RIGHT), make(PART, 'both')))
    expect(stereo[0]).toEqual(round(part))
    expect(stereo[1]).toEqual(round(part).map((value) => +(-value).toFixed(5)))
  })

  it.each(processes)('$name works on the left or the right channel alone, and leaves the other bit for bit', ({ make, part }) => {
    const input = audio(LEFT, RIGHT)
    const left = applySampleEdit(input, make(PART, 'left'))
    expect(values(left)[0]).toEqual(round(part))
    expect(Array.from(left.channels[1]!)).toEqual(Array.from(input.channels[1]!))
    const right = applySampleEdit(input, make(PART, 'right'))
    expect(Array.from(right.channels[0]!)).toEqual(Array.from(input.channels[0]!))
    expect(values(right)[1]).toEqual(round(part).map((value) => +(-value).toFixed(5)))
  })

  it.each(FADE_CURVES)('fades in and out with the $title curve: g(t), and g(1 − t)', ({ curve, g }) => {
    const ones = audio(Array(10).fill(1))
    const range = { from: 0, to: 10 }
    const fadeIn = applySampleEdit(ones, { kind: 'fade', range, channels: 'both', direction: 'in', curve })
    const fadeOut = applySampleEdit(ones, { kind: 'fade', range, channels: 'both', direction: 'out', curve })
    expect(values(fadeIn)[0]).toEqual(round(Array.from({ length: 10 }, (_, i) => g(i / 10))))
    expect(values(fadeOut)[0]).toEqual(round(Array.from({ length: 10 }, (_, i) => g((9 - i) / 10))))
    expect([g(0), g(1)].map((value) => +value.toFixed(9))).toEqual([0, 1])
  })

  it.each([
    { kind: 'gain', edit: (ramp: { frames: number; curve: 'linear' | 'equal-power' }) => ({ kind: 'gain', range: { from: 20, to: 80 }, channels: 'both', db: -12, ramp }) },
    { kind: 'silence', edit: (ramp: { frames: number; curve: 'linear' | 'equal-power' }) => ({ kind: 'silence', range: { from: 20, to: 80 }, channels: 'both', ramp }) },
    { kind: 'dc-offset', edit: (ramp: { frames: number; curve: 'linear' | 'equal-power' }) => ({ kind: 'dc-offset', range: { from: 20, to: 80 }, channels: 'both', ramp }) },
  ] as const)('$kind ramps inside the range at edges inside the sample, and leaves the frames outside bit for bit', ({ edit }) => {
    const input = audio(Array.from({ length: 100 }, (_, i) => Math.sin(i / 3) * 0.7 + 0.2))
    for (const curve of ['linear', 'equal-power'] as const) {
      const ramped = applySampleEdit(input, edit({ frames: 10, curve }) as SampleEdit)
      const plain = applySampleEdit(input, edit({ frames: 0, curve }) as SampleEdit)
      const [before, after, full] = [ramped.channels[0]!, input.channels[0]!, plain.channels[0]!]
      for (let i = 0; i < 100; i++) {
        if (i < 20 || i >= 80) expect(before[i], `${curve} ${i}`).toBe(after[i])
        else if (i >= 30 && i < 70) expect(before[i], `${curve} ${i}`).toBe(full[i])
      }
      // In the ramps, between the input and the fully changed value, moving towards the change.
      const g = fadeShape(curve)
      for (let j = 0; j < 10; j++) {
        const weight = g((j + 1) / 11)
        expect(before[20 + j]).toBeCloseTo(after[20 + j]! + weight * (full[20 + j]! - after[20 + j]!), 6)
        expect(before[79 - j]).toBeCloseTo(after[79 - j]! + weight * (full[79 - j]! - after[79 - j]!), 6)
      }
    }
  })

  it("doesn't ramp at the sample's own ends, and a ramp is at most half the range", () => {
    const input = audio(Array(10).fill(1))
    const atStart = applySampleEdit(input, { kind: 'silence', range: { from: 0, to: 4 }, channels: 'both', ramp: { frames: 10, curve: 'linear' } })
    // The start is the sample's: no ramp there; the end ramps over 2 frames (half of 4).
    expect(values(atStart)[0]).toEqual(round([0, 0, 1 - 2 / 3, 1 - 1 / 3, 1, 1, 1, 1, 1, 1]))
  })

  it('normalizes linked with one gain, keeping the balance, or each channel to the peak, and leaves silence alone', () => {
    const input = audio([0.1, 0.2], [-0.4, 0.1])
    const range = { from: 0, to: 2 }
    expect(values(applySampleEdit(input, { kind: 'normalize', range, channels: 'both', peakDb: 0, linked: true }))).toEqual([[0.25, 0.5], [-1, 0.25]])
    expect(values(applySampleEdit(input, { kind: 'normalize', range, channels: 'both', peakDb: 0, linked: false }))).toEqual([[0.5, 1], [-1, 0.25]])
    const target = 10 ** (-0.1 / 20)
    expect(values(applySampleEdit(input, { kind: 'normalize', range, channels: 'both', peakDb: -0.1, linked: true }))[1]![0]).toBeCloseTo(-target, 5)
    const quiet = audio([1e-6, -1e-6])
    expect(applySampleEdit(quiet, { kind: 'normalize', range, channels: 'both', peakDb: 0, linked: true }).channels[0]![0]).toBeCloseTo(1e-6, 9)
  })

  it('may go past full scale: float keeps it', () => {
    const result = applySampleEdit(audio([0.5, -0.5]), { kind: 'gain', range: { from: 0, to: 2 }, channels: 'both', db: 12, ramp: NO_RAMP })
    expect(result.channels[0]![0]).toBeGreaterThan(1.9)
  })

  it('deletes a range and joins the parts around it, on every channel', () => {
    expect(values(applySampleEdit(audio(LEFT, RIGHT), { kind: 'delete', range: { from: 1, to: 4 }, crossfade: { frames: 0, curve: 'linear' } }))).toEqual([[0, 4, 5, 6, 7], [0, -4, -5, -6, -7]])
    expect(values(applySampleEdit(audio(LEFT), { kind: 'delete', range: { from: 0, to: 8 }, crossfade: { frames: 0, curve: 'linear' } }))).toEqual([[]])
  })

  it('leaves its input alone and keeps the sample rate', () => {
    const input = audio(LEFT, RIGHT)
    const result = applySampleEdit(input, { kind: 'reverse', range: WHOLE, channels: 'both' })
    expect(values(input)).toEqual([LEFT, RIGHT])
    expect(result.sampleRate).toBe(100)
    expect(result.channels[0]).not.toBe(input.channels[0])
  })
})

describe('remap and changed', () => {
  const frames = 100
  const range = { from: 20, to: 60 }
  it.each([
    { edit: { kind: 'gain', range, channels: 'both', db: -3, ramp: NO_RAMP }, frame: [30, 30], moved: [{ from: 10, to: 30 }, { from: 10, to: 30 }], changed: range },
    { edit: { kind: 'fade', range, channels: 'left', direction: 'in', curve: 'linear' }, frame: [30, 30], moved: [{ from: 10, to: 30 }, { from: 10, to: 30 }], changed: range },
    { edit: { kind: 'normalize', range, channels: 'both', peakDb: 0, linked: true }, frame: [30, 30], moved: [{ from: 10, to: 30 }, { from: 10, to: 30 }], changed: range },
    { edit: { kind: 'silence', range, channels: 'both', ramp: NO_RAMP }, frame: [30, 30], moved: [{ from: 10, to: 30 }, { from: 10, to: 30 }], changed: range },
    { edit: { kind: 'dc-offset', range, channels: 'both', ramp: NO_RAMP }, frame: [30, 30], moved: [{ from: 10, to: 30 }, { from: 10, to: 30 }], changed: range },
    // Reverse mirrors positions inside its range when every channel turns; on one channel, positions stay.
    { edit: { kind: 'reverse', range, channels: 'both' }, frame: [30, 50], moved: [{ from: 25, to: 30 }, { from: 50, to: 55 }], changed: range },
    { edit: { kind: 'reverse', range, channels: 'right' }, frame: [30, 30], moved: [{ from: 25, to: 30 }, { from: 25, to: 30 }], changed: range },
    { edit: { kind: 'delete', range, crossfade: { frames: 0, curve: 'linear' } }, frame: [70, 30], moved: [{ from: 10, to: 70 }, { from: 10, to: 30 }], changed: { from: 20, to: 60 } },
    { edit: { kind: 'delete', range, crossfade: { frames: 0, curve: 'linear' } }, frame: [30, null], moved: [{ from: 30, to: 50 }, null], changed: { from: 20, to: 60 } },
  ] as const)('$edit.kind ($edit.range.from–$edit.range.to) maps $frame.0, a range, and says what changed', ({ edit, frame, moved, changed }) => {
    expect(remapFrame(edit as SampleEdit, frames, frame[0])).toBe(frame[1])
    expect(remapRange(edit as SampleEdit, frames, moved[0])).toEqual(moved[1])
    expect(changedFrames(edit as SampleEdit, frames)).toEqual(changed)
  })
})

describe('SAMPLE_EDITS', () => {
  const context = (change: Partial<SampleEditContext> = {}): SampleEditContext => ({
    selection: null,
    frames: 1000,
    sampleRate: 1000,
    channelCount: 2,
    crossfade: DEFAULT_CROSSFADE,
    fadeCurve: 's-curve',
    ...change,
  })

  it('is one entry per kind, each with a title, a tooltip, a suffix and a group', () => {
    expect(Object.keys(SAMPLE_EDITS)).toEqual(['gain', 'fade', 'normalize', 'reverse', 'silence', 'dc-offset', 'delete', 'crop', 'insert', 'replace'])
    for (const [kind, entry] of Object.entries(SAMPLE_EDITS)) {
      expect(entry.kind).toBe(kind)
      expect(entry.tooltip && entry.suffix && entry.group, kind).toBeTruthy()
    }
  })

  it('makes a process from the selection and its channels, or the whole sample, with the crossfade as its ramp', () => {
    const selection = { from: 10, to: 20, channels: 'left' as const }
    expect(sampleEditEntry('silence').create(context({ selection }))).toEqual({ kind: 'silence', range: { from: 10, to: 20 }, channels: 'left', ramp: { frames: 5, curve: 'linear' } })
    expect(sampleEditEntry('reverse').create(context())).toEqual({ kind: 'reverse', range: { from: 0, to: 1000 }, channels: 'both' })
    // A mono sample is always both channels.
    expect(sampleEditEntry('reverse').create(context({ selection, channelCount: 1 }))).toMatchObject({ channels: 'both' })
  })

  it('takes its settings, clamped, or their defaults', () => {
    expect(sampleEditEntry('gain').create(context())).toMatchObject({ db: -3 })
    expect(sampleEditEntry('gain').create(context({ settings: { db: 99 } }))).toMatchObject({ db: 24 })
    expect(sampleEditEntry('normalize').create(context({ settings: { linked: 0 } }))).toMatchObject({ peakDb: -0.1, linked: false })
  })

  it('makes fades in and out with the curve from the menu, and names their copies by direction', () => {
    const fadeOut = sampleEditEntry('fade').create(context(), 'out')!
    expect(fadeOut).toMatchObject({ kind: 'fade', direction: 'out', curve: 's-curve' })
    expect(editSuffix(fadeOut)).toBe('fade out')
    expect(SAMPLE_EDITS.fade.variants?.map((variant) => variant.title)).toEqual(['Fade in', 'Fade out'])
  })

  it('needs a selection to delete and crop, and both channels for every edit that changes the length', () => {
    expect(sampleEditEntry('delete').create(context())).toBeNull()
    expect(sampleEditEntry('crop').create(context({ selection: { from: 5, to: 5, channels: 'both' } }))).toBeNull()
    expect(Object.values(SAMPLE_EDITS).filter((entry) => entry.needsSelection).map((entry) => entry.kind)).toEqual(['delete', 'crop'])
    expect(Object.values(SAMPLE_EDITS).filter((entry) => entry.channels === 'both').map((entry) => entry.kind)).toEqual(['delete', 'crop', 'insert', 'replace'])
    // A delete joins with the toolbar's crossfade, in frames.
    expect(sampleEditEntry('delete').create(context({ selection: { from: 10, to: 20, channels: 'both' } }))).toEqual({
      kind: 'delete',
      range: { from: 10, to: 20 },
      crossfade: { frames: 5, curve: 'linear' },
    })
  })

  it('inserts silence at the cursor, and pastes over the selection or at the cursor, with nothing to paste disabled', () => {
    const insert = sampleEditEntry('insert').create(context({ cursor: 300, settings: { seconds: 0.25 } }))!
    expect(insert).toMatchObject({ kind: 'insert', at: 300 })
    expect(insert.insert.audio.channels.map((channel) => channel.length)).toEqual([250, 250])
    expect(sampleEditEntry('replace').create(context({ cursor: 300 }))).toBeNull()
    const clipboard = { audio: { sampleRate: 1000, channels: [new Float32Array(10)] }, handles: { before: { sampleRate: 1000, channels: [new Float32Array(0)] }, after: { sampleRate: 1000, channels: [new Float32Array(0)] } } }
    expect(sampleEditEntry('replace').create(context({ cursor: 300, clipboard }))).toMatchObject({ range: { from: 300, to: 300 } })
    expect(sampleEditEntry('replace').create(context({ cursor: 300, clipboard, selection: { from: 10, to: 20, channels: 'both' } }))).toMatchObject({ range: { from: 10, to: 20 } })
  })

  it('keeps a crossfade between 0 and 100 ms', () => {
    expect([clampCrossfadeSeconds(-1), clampCrossfadeSeconds(0.05), clampCrossfadeSeconds(1), clampCrossfadeSeconds(NaN)]).toEqual([0, 0.05, 0.1, 0.005])
  })
})
