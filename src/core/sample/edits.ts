import { frameCount } from './channels'
import { type AudioCopy, type JoinFade, silenceCopy, spliceAudio } from './crossfade'
import { type CrossfadeCurve, type FadeCurve, fadeShape } from './fade-curves'
import { type FrameRange, type RemapStep, type SampleRemap, mapOf, remapOfSteps } from './remap'
import { BAND_FEATHER_OCTAVES, BAND_GAIN_RANGE_DB, type BandEdit, type FrequencyBand, applyBandEditTo, bandEditChanged } from '../spectrum'
import type { SampleAudio } from './types'
import type { WavBitDepth } from './wav'

export type { FrameRange } from './remap'

/**
 * Sample edits as data: what an edit does is a value (`SampleEdit`), applied by one pure function, so the same edit of
 * the same audio gives the same floats every time, and an edit can be described, repeated and tested apart from who asks
 * for it. Each kind is one entry of `SAMPLE_EDITS`: its title, settings, how it is made from the editor's state, how it
 * is applied, where it moves positions, what it changes and where it leaves the selection. Nothing else switches on the
 * kind.
 */

/** Which channels an edit works on. A mono sample is always `both`. */
export type EditChannels = 'both' | 'left' | 'right'

/**
 * How an edit that changes part of a sample eases in and out at the range's edges inside the sample, so a step doesn't
 * click: `frames` at each edge (at most half the range), shaped by `curve`. Audio outside the range never changes.
 */
export interface EdgeRamp {
  readonly frames: number
  readonly curve: CrossfadeCurve
}

interface Ranged {
  readonly range: FrameRange
  readonly channels: EditChannels
}

export type SampleEdit =
  | ({ readonly kind: 'gain'; readonly db: number; readonly ramp: EdgeRamp } & Ranged)
  | ({ readonly kind: 'fade'; readonly direction: 'in' | 'out'; readonly curve: FadeCurve } & Ranged)
  | ({ readonly kind: 'normalize'; readonly peakDb: number; readonly linked: boolean } & Ranged)
  | ({ readonly kind: 'reverse' } & Ranged)
  | ({ readonly kind: 'silence'; readonly ramp: EdgeRamp } & Ranged)
  | ({ readonly kind: 'dc-offset'; readonly ramp: EdgeRamp } & Ranged)
  | { readonly kind: 'delete'; readonly range: FrameRange; readonly crossfade: JoinFade }
  | { readonly kind: 'crop'; readonly range: FrameRange }
  | { readonly kind: 'insert'; readonly at: number; readonly insert: AudioCopy; readonly crossfade: JoinFade }
  | { readonly kind: 'replace'; readonly range: FrameRange; readonly insert: AudioCopy; readonly crossfade: JoinFade }
  | BandEdit

export type SampleEditKind = SampleEdit['kind']
type EditOf<K extends SampleEditKind> = Extract<SampleEdit, { kind: K }>

/** The bit depth of the WAV files edits write: 32-bit float is exact, so a chain of edits is not quantized again. */
export const EDIT_WAV_BIT_DEPTH: WavBitDepth = 32

/** Gain takes −48 to +24 dB. */
export const GAIN_RANGE_DB = { min: -48, max: 24 } as const
/** Normalize's default target: just under full scale. */
export const NORMALIZE_DEFAULT_DB = -0.1
/** A peak under this (-100 dB) is silence: normalizing it would only raise the noise. */
export const SILENT_PEAK = 1e-5
/** The longest crossfade (and edge ramp). */
export const MAX_CROSSFADE_SECONDS = 0.1

/** A crossfade's length and curve: the toolbar's setting, at every join and selection edge. */
export interface Crossfade {
  readonly seconds: number
  readonly curve: CrossfadeCurve
}
export const DEFAULT_CROSSFADE: Crossfade = { seconds: 0.005, curve: 'linear' }

/** A crossfade length the toolbar may hold: 0 (a butt splice) to `MAX_CROSSFADE_SECONDS`. */
export const clampCrossfadeSeconds = (seconds: number): number =>
  Number.isFinite(seconds) ? Math.min(MAX_CROSSFADE_SECONDS, Math.max(0, seconds)) : DEFAULT_CROSSFADE.seconds

const dbToGain = (db: number) => 10 ** (db / 20)

/** The range inside a sample of `length` frames, whole frames, in order. */
const clampTo = (length: number, { from, to }: FrameRange): FrameRange => {
  const clamp = (frame: number) => Math.max(0, Math.min(length, Math.round(frame)))
  return { from: clamp(Math.min(from, to)), to: clamp(Math.max(from, to)) }
}

/** The channel indexes an edit touches. */
const channelIndexes = (audio: SampleAudio, channels: EditChannels): number[] => {
  if (audio.channels.length < 2 || channels === 'both') return audio.channels.map((_, index) => index)
  return [channels === 'left' ? 0 : 1]
}

/** A copy of the audio, with `change` run on each touched channel's copy over the range. */
const processRange = (
  audio: SampleAudio,
  edit: Ranged,
  change: (data: Float32Array, from: number, to: number, channel: number) => void,
): SampleAudio => {
  const { from, to } = clampTo(frameCount(audio), edit.range)
  const touched = new Set(channelIndexes(audio, edit.channels))
  const channels = audio.channels.map((channel, index) => {
    const copy = channel.slice()
    if (touched.has(index) && to > from) change(copy, from, to, index)
    return copy
  })
  return { sampleRate: audio.sampleRate, channels }
}

/**
 * The weight of an edge-ramped change at frame `i`: 0 outside, rising over `ramp.frames` at an edge inside the sample,
 * 1 in the middle. At the sample's own start or end there is nothing to ease into, so no ramp.
 */
const rampWeights = (frames: number, from: number, to: number, ramp: EdgeRamp) => {
  const half = Math.floor((to - from) / 2)
  const head = from > 0 ? Math.max(0, Math.min(ramp.frames, half)) : 0
  const tail = to < frames ? Math.max(0, Math.min(ramp.frames, half)) : 0
  const g = fadeShape(ramp.curve)
  return (i: number): number => {
    const intoHead = i - from
    const intoTail = to - 1 - i
    let weight = 1
    if (intoHead < head) weight = Math.min(weight, g((intoHead + 1) / (head + 1)))
    if (intoTail < tail) weight = Math.min(weight, g((intoTail + 1) / (tail + 1)))
    return weight
  }
}

/** Replaces each value in the range by `processed(value)`, eased in and out at the edges by `ramp`. */
const ramped = (audio: SampleAudio, edit: Ranged & { readonly ramp: EdgeRamp }, processed: (value: number, channel: number) => number) => {
  const frames = frameCount(audio)
  return processRange(audio, edit, (data, from, to, channel) => {
    const weight = rampWeights(frames, from, to, edit.ramp)
    for (let i = from; i < to; i++) {
      const value = data[i]!
      const target = processed(value, channel)
      const w = weight(i)
      // Fully changed frames take the processed value exactly.
      data[i] = w === 1 ? target : value + w * (target - value)
    }
  })
}

const meanOf = (data: Float32Array, from: number, to: number) => {
  let sum = 0
  for (let i = from; i < to; i++) sum += data[i]!
  return to > from ? sum / (to - from) : 0
}

const peakIn = (data: Float32Array, from: number, to: number) => {
  let peak = 0
  for (let i = from; i < to; i++) {
    const value = Math.abs(data[i]!)
    if (value > peak) peak = value
  }
  return peak
}

/** The loudest absolute value in a range of the audio, over every channel; what the flow warns about past full scale. */
export const peakOfRange = (audio: SampleAudio, range: FrameRange): number => {
  const { from, to } = clampTo(frameCount(audio), range)
  return Math.max(0, ...audio.channels.map((channel) => peakIn(channel, from, to)))
}

const normalize = (audio: SampleAudio, edit: EditOf<'normalize'>): SampleAudio => {
  const { from, to } = clampTo(frameCount(audio), edit.range)
  const touched = channelIndexes(audio, edit.channels)
  const peaks = audio.channels.map((channel, index) => (touched.includes(index) ? peakIn(channel, from, to) : 0))
  const target = dbToGain(edit.peakDb)
  const linkedPeak = Math.max(...peaks)
  return processRange(audio, edit, (data, start, end, channel) => {
    const peak = edit.linked ? linkedPeak : peaks[channel]!
    if (peak < SILENT_PEAK) return
    const gain = target / peak
    for (let i = start; i < end; i++) data[i] = data[i]! * gain
  })
}

const fade = (audio: SampleAudio, edit: EditOf<'fade'>): SampleAudio => {
  const g = fadeShape(edit.curve)
  return processRange(audio, edit, (data, from, to) => {
    const length = to - from
    for (let i = from; i < to; i++) {
      // In: 0 at the first frame, rising; out: falling to 0 at the last.
      const t = edit.direction === 'in' ? (i - from) / length : (to - 1 - i) / length
      data[i] = data[i]! * g(t)
    }
  })
}

const reverse = (audio: SampleAudio, edit: EditOf<'reverse'>): SampleAudio =>
  processRange(audio, edit, (data, from, to) => data.subarray(from, to).reverse())

/** A selection in the editor: frames `from` up to `to`, on some channels, and a band of frequencies when one is drawn. */
export interface EditSelection extends FrameRange {
  readonly channels: EditChannels
  readonly band?: FrequencyBand
}

/** What the editor knows when it asks for an edit. */
export interface SampleEditContext {
  readonly selection: EditSelection | null
  /** The open sample's length and shape. */
  readonly frames: number
  readonly sampleRate: number
  readonly channelCount: number
  readonly crossfade: Crossfade
  readonly fadeCurve: FadeCurve
  /** The values of the entry's `settings`, by id (a popover's last values); missing ones take the default. */
  readonly settings?: Readonly<Record<string, number>>
  /** Where an insert goes without a selection. */
  readonly cursor?: number
  /** What *Paste* inserts. */
  readonly clipboard?: AudioCopy | null
}

/** A numeric field of an edit's settings popover, or a toggle (1 on, 0 off). */
export interface EditSetting {
  readonly id: string
  readonly label: string
  readonly kind: 'number' | 'toggle'
  readonly unit?: string
  readonly min?: number
  readonly max?: number
  readonly step?: number
  readonly default: number
  /** A toggle's id that, while on, makes this field moot (*Remove* over *Gain*): the popover disables it. */
  readonly offWhen?: string
}

/**
 * Where the editor's selection and cursor go once an edit lands, in output frames: `keep` leaves them (a process), or a
 * new selection (none, or what was inserted) and cursor.
 */
export type SampleEditAfter = 'keep' | { readonly selection: FrameRange | null; readonly cursor: number }

/** One way an entry's edit is offered, as its own button. */
export interface SampleEditVariant {
  readonly id: string
  readonly title: string
  readonly tooltip: string
  readonly suffix: string
}

/** One edit the editor offers. The toolbar, and later menus and the palette, are built from `SAMPLE_EDITS`. */
export interface SampleEditEntry<E extends SampleEdit = SampleEdit> {
  readonly kind: E['kind']
  readonly title: string
  readonly tooltip: string
  /** Added to the name of a copy: "Kick (reversed)". */
  readonly suffix: string
  /** Where the toolbar puts it. */
  readonly group: 'process' | 'structure' | 'clipboard' | 'spectral'
  /** A popover's fields before it runs; none runs at once. */
  readonly settings: readonly EditSetting[]
  /** Buttons that make the edit different ways (Fade in, Fade out): each passes its id to `create`. One button without. */
  readonly variants?: readonly SampleEditVariant[]
  /** It shapes itself by the fade curve (`SampleEditContext.fadeCurve`): the toolbar puts the curve menu beside it. */
  readonly takesFadeCurve?: boolean
  /** `both` for edits that change the length: a one-channel selection can't run them. */
  readonly channels: 'any' | 'both'
  readonly needsSelection: boolean
  /** It inserts what was copied (`SampleEditContext.clipboard`), so it can't run with nothing copied. */
  readonly needsClipboard?: boolean
  /** It runs while the selection has a frequency band; every other edit works on whole frequencies, so a band blocks it. */
  readonly allowsBand?: boolean
  /** It works on the selection's band, so it can't run without one. */
  readonly needsBand?: boolean
  /** The edit to apply, or null when it can't run (no selection). */
  readonly create: (context: SampleEditContext, variant?: string) => E | null
  readonly apply: (audio: SampleAudio, edit: E) => SampleAudio
  /**
   * Where the positions of a sample of `frames` frames are after the edit (`remapFrame`, `remapRange`), as data: the
   * step, or null when nothing moves.
   */
  readonly remap: (edit: E, frames: number) => RemapStep | null
  /** The output frames that differ from the input: to the new end for edits that change the length. */
  readonly changed: (edit: E, frames: number) => FrameRange
  /** The selection and cursor after the edit, in a sample that had `frames` frames. */
  readonly after: (edit: E, frames: number) => SampleEditAfter
}

/** The selection, or the whole sample; and its channels (both on a mono sample). */
const targetOf = (context: SampleEditContext): Ranged => ({
  range: context.selection ? { from: context.selection.from, to: context.selection.to } : { from: 0, to: context.frames },
  channels: context.channelCount < 2 ? 'both' : (context.selection?.channels ?? 'both'),
})

const rampOf = (context: SampleEditContext): EdgeRamp => ({
  frames: Math.round(clampCrossfadeSeconds(context.crossfade.seconds) * context.sampleRate),
  curve: context.crossfade.curve,
})

const setting = (context: SampleEditContext, entry: { settings: readonly EditSetting[] }, id: string): number => {
  const field = entry.settings.find((candidate) => candidate.id === id)!
  const value = context.settings?.[id]
  if (typeof value !== 'number' || !Number.isFinite(value)) return field.default
  return Math.min(field.max ?? value, Math.max(field.min ?? value, value))
}

const joinOf = (context: SampleEditContext): JoinFade => rampOf(context)

const keep = (): SampleEditAfter => 'keep'
const insertedFrames = (insert: AudioCopy) => frameCount(insert.audio)
/** A join's crossfade reaches this far before it, so the output differs from there on. */
const changedFrom = (at: number, fade: JoinFade) => Math.max(0, at - Math.ceil(fade.frames / 2))
const rangeChanged = (edit: { readonly range: FrameRange }, frames: number) => clampTo(frames, edit.range)
const hasSelection = (context: SampleEditContext) => !!context.selection && context.selection.to > context.selection.from

const GAIN_SETTINGS: readonly EditSetting[] = [
  { id: 'db', label: 'Gain', kind: 'number', unit: 'dB', min: GAIN_RANGE_DB.min, max: GAIN_RANGE_DB.max, step: 0.1, default: -3 },
]
const INSERT_SETTINGS: readonly EditSetting[] = [
  { id: 'seconds', label: 'Length', kind: 'number', unit: 's', min: 0.001, max: 10, step: 0.001, default: 1 },
]
const NORMALIZE_SETTINGS: readonly EditSetting[] = [
  { id: 'peakDb', label: 'Peak', kind: 'number', unit: 'dBFS', min: -60, max: 0, step: 0.1, default: NORMALIZE_DEFAULT_DB },
  { id: 'linked', label: 'Same gain for both channels', kind: 'toggle', default: 1 },
]

const BAND_GAIN_SETTINGS: readonly EditSetting[] = [
  { id: 'db', label: 'Gain', kind: 'number', unit: 'dB', min: BAND_GAIN_RANGE_DB.min, max: BAND_GAIN_RANGE_DB.max, step: 0.1, default: -6, offWhen: 'remove' },
  { id: 'remove', label: 'Remove', kind: 'toggle', default: 0 },
]

/** The selection's box: its time range, channels and band, eased by the crossfade length; null without a band. */
const boxOf = (context: SampleEditContext) => {
  const band = context.selection?.band
  if (!band || !hasSelection(context)) return null
  return { ...targetOf(context), band, feather: { frames: rampOf(context).frames, octaves: BAND_FEATHER_OCTAVES } }
}

/** A spectral edit: works on the selection's box and keeps the length. */
const spectral = <K extends BandEdit['kind']>(
  entry: Pick<SampleEditEntry<EditOf<K>>, 'kind' | 'title' | 'tooltip' | 'suffix' | 'create'> & Partial<Pick<SampleEditEntry<EditOf<K>>, 'settings'>>,
): SampleEditEntry<EditOf<K>> => ({
  group: 'spectral',
  channels: 'any',
  // A band is a selection: `needsBand` says why it can't run.
  needsSelection: false,
  allowsBand: true,
  needsBand: true,
  settings: [],
  apply: applyBandEditTo,
  remap: () => null,
  changed: bandEditChanged,
  after: keep,
  ...entry,
})

/** A process: works on the selection (or the whole sample), on its channels, and keeps the length. */
const process = <K extends 'gain' | 'fade' | 'normalize' | 'reverse' | 'silence' | 'dc-offset'>(
  entry: Omit<SampleEditEntry<EditOf<K>>, 'group' | 'channels' | 'needsSelection' | 'remap' | 'changed' | 'after' | 'settings'> &
    Partial<Pick<SampleEditEntry<EditOf<K>>, 'remap' | 'settings' | 'variants' | 'takesFadeCurve'>>,
): SampleEditEntry<EditOf<K>> => ({
  group: 'process',
  channels: 'any',
  needsSelection: false,
  settings: [],
  remap: () => null,
  changed: rangeChanged,
  after: keep,
  ...entry,
})

/** The edits by kind, in toolbar order within each group. Adding or dropping one is one entry. */
export const SAMPLE_EDITS: { readonly [K in SampleEditKind]: SampleEditEntry<EditOf<K>> } = {
  gain: process({
    kind: 'gain',
    title: 'Gain…',
    tooltip: 'Make the selection louder or quieter, easing in and out at its edges',
    suffix: 'gain',
    settings: GAIN_SETTINGS,
    create: (context) => ({ kind: 'gain', ...targetOf(context), db: setting(context, { settings: GAIN_SETTINGS }, 'db'), ramp: rampOf(context) }),
    apply: (audio, edit) => {
      const gain = dbToGain(edit.db)
      return ramped(audio, edit, (value) => value * gain)
    },
  }),
  fade: process({
    kind: 'fade',
    title: 'Fade',
    tooltip: 'Fade the selection in or out',
    suffix: 'fade',
    variants: [
      { id: 'in', title: 'Fade in', tooltip: 'Fade the selection in, from silence, with the chosen curve', suffix: 'fade in' },
      { id: 'out', title: 'Fade out', tooltip: 'Fade the selection out, to silence, with the chosen curve', suffix: 'fade out' },
    ],
    takesFadeCurve: true,
    create: (context, variant) => ({ kind: 'fade', ...targetOf(context), direction: variant === 'out' ? 'out' : 'in', curve: context.fadeCurve }),
    apply: fade,
  }),
  normalize: process({
    kind: 'normalize',
    title: 'Normalize…',
    tooltip: 'Scale the selection so its loudest point reaches the peak you set',
    suffix: 'normalized',
    settings: NORMALIZE_SETTINGS,
    create: (context) => ({
      kind: 'normalize',
      ...targetOf(context),
      peakDb: setting(context, { settings: NORMALIZE_SETTINGS }, 'peakDb'),
      linked: setting(context, { settings: NORMALIZE_SETTINGS }, 'linked') !== 0,
    }),
    apply: normalize,
  }),
  reverse: process({
    kind: 'reverse',
    title: 'Reverse',
    tooltip: 'Play the selection backwards',
    suffix: 'reversed',
    create: (context) => ({ kind: 'reverse', ...targetOf(context) }),
    apply: reverse,
    // Positions move only when every channel is reversed: a clip still plays the same part of the sample.
    remap: (edit, frames) => {
      if (edit.channels !== 'both') return null
      const { from, to } = clampTo(frames, edit.range)
      return { kind: 'mirror', from, to }
    },
  }),
  silence: process({
    kind: 'silence',
    title: 'Silence',
    tooltip: 'Make the selection silent, easing in and out at its edges',
    suffix: 'silenced',
    create: (context) => ({ kind: 'silence', ...targetOf(context), ramp: rampOf(context) }),
    apply: (audio, edit) => ramped(audio, edit, () => 0),
  }),
  'dc-offset': process({
    kind: 'dc-offset',
    title: 'Remove DC offset',
    tooltip: "Centre the selection's waveform on zero",
    suffix: 'centred',
    create: (context) => ({ kind: 'dc-offset', ...targetOf(context), ramp: rampOf(context) }),
    apply: (audio, edit) => {
      const { from, to } = clampTo(frameCount(audio), edit.range)
      const means = audio.channels.map((channel) => meanOf(channel, from, to))
      return ramped(audio, edit, (value, channel) => value - means[channel]!)
    },
  }),
  'band-gain': spectral({
    kind: 'band-gain',
    title: 'Band gain…',
    tooltip: "Make the box's frequencies louder or quieter, or remove them, easing in and out at its edges",
    suffix: 'band gain',
    settings: BAND_GAIN_SETTINGS,
    create: (context) => {
      const box = boxOf(context)
      if (!box) return null
      const remove = setting(context, { settings: BAND_GAIN_SETTINGS }, 'remove') !== 0
      return { kind: 'band-gain', ...box, db: remove ? -Infinity : setting(context, { settings: BAND_GAIN_SETTINGS }, 'db') }
    },
  }),
  'keep-band': spectral({
    kind: 'keep-band',
    title: 'Keep band',
    tooltip: "Remove every frequency outside the box's band, over its time range",
    suffix: 'band kept',
    create: (context) => {
      const box = boxOf(context)
      return box && { kind: 'keep-band', ...box }
    },
  }),
  delete: {
    kind: 'delete',
    title: 'Delete',
    tooltip: 'Remove the selection and join the parts around it, with a crossfade',
    suffix: 'edited',
    group: 'structure',
    settings: [],
    channels: 'both',
    needsSelection: true,
    create: (context) => (hasSelection(context) ? { kind: 'delete', range: targetOf(context).range, crossfade: joinOf(context) } : null),
    apply: (audio, edit) => spliceAudio(audio, edit.range, null, edit.crossfade),
    remap: (edit, frames) => {
      const { from, to } = clampTo(frames, edit.range)
      return { kind: 'splice', from, to, inserted: 0 }
    },
    changed: (edit, frames) => {
      const { from, to } = clampTo(frames, edit.range)
      return { from: changedFrom(from, edit.crossfade), to: frames - (to - from) }
    },
    after: (edit, frames) => ({ selection: null, cursor: clampTo(frames, edit.range).from }),
  },
  crop: {
    kind: 'crop',
    title: 'Crop',
    tooltip: 'Keep only the selection',
    suffix: 'cropped',
    group: 'structure',
    settings: [],
    channels: 'both',
    needsSelection: true,
    create: (context) => (hasSelection(context) ? { kind: 'crop', range: targetOf(context).range } : null),
    // Nothing is joined, so nothing crossfades.
    apply: (audio, edit) => {
      const { from, to } = clampTo(frameCount(audio), edit.range)
      return { sampleRate: audio.sampleRate, channels: audio.channels.map((channel) => channel.slice(from, to)) }
    },
    remap: (edit, frames) => {
      const { from, to } = clampTo(frames, edit.range)
      return { kind: 'crop', from, to }
    },
    changed: (edit, frames) => {
      const { from, to } = clampTo(frames, edit.range)
      return { from: 0, to: to - from }
    },
    after: () => ({ selection: null, cursor: 0 }),
  },
  insert: {
    kind: 'insert',
    title: 'Insert silence…',
    tooltip: 'Insert silence at the cursor; the audio around it fades into and out of it',
    suffix: 'silence inserted',
    group: 'structure',
    settings: INSERT_SETTINGS,
    channels: 'both',
    needsSelection: false,
    create: (context) => {
      const seconds = setting(context, { settings: INSERT_SETTINGS }, 'seconds')
      const at = Math.max(0, Math.min(context.frames, Math.round(context.cursor ?? 0)))
      return { kind: 'insert', at, insert: silenceCopy(seconds * context.sampleRate, context.sampleRate, context.channelCount), crossfade: joinOf(context) }
    },
    apply: (audio, edit) => spliceAudio(audio, { from: edit.at, to: edit.at }, edit.insert, edit.crossfade),
    remap: (edit, frames) => {
      const at = Math.max(0, Math.min(frames, edit.at))
      return { kind: 'splice', from: at, to: at, inserted: insertedFrames(edit.insert) }
    },
    changed: (edit, frames) => ({ from: changedFrom(Math.min(frames, edit.at), edit.crossfade), to: frames + insertedFrames(edit.insert) }),
    after: (edit, frames) => {
      const at = Math.max(0, Math.min(frames, edit.at))
      return { selection: { from: at, to: at + insertedFrames(edit.insert) }, cursor: at }
    },
  },
  replace: {
    kind: 'replace',
    title: 'Paste',
    tooltip: 'Paste the copied audio over the selection, or at the cursor, with a crossfade at each join',
    suffix: 'pasted',
    group: 'clipboard',
    settings: [],
    channels: 'both',
    needsSelection: false,
    needsClipboard: true,
    // Over the selection; without one, at the cursor (an empty range: an insert).
    create: (context) => {
      if (!context.clipboard || insertedFrames(context.clipboard) === 0) return null
      const cursor = Math.max(0, Math.min(context.frames, Math.round(context.cursor ?? 0)))
      const range = hasSelection(context) ? targetOf(context).range : { from: cursor, to: cursor }
      return { kind: 'replace', range, insert: context.clipboard, crossfade: joinOf(context) }
    },
    apply: (audio, edit) => spliceAudio(audio, edit.range, edit.insert, edit.crossfade),
    remap: (edit, frames) => {
      const { from, to } = clampTo(frames, edit.range)
      return { kind: 'splice', from, to, inserted: insertedFrames(edit.insert) }
    },
    changed: (edit, frames) => {
      const { from, to } = clampTo(frames, edit.range)
      return { from: changedFrom(from, edit.crossfade), to: frames - (to - from) + insertedFrames(edit.insert) }
    },
    after: (edit, frames) => {
      const { from } = clampTo(frames, edit.range)
      return { selection: { from, to: from + insertedFrames(edit.insert) }, cursor: from }
    },
  },
}

/** The registry entry for an edit kind. */
export const sampleEditEntry = <K extends SampleEditKind>(kind: K): SampleEditEntry<EditOf<K>> => {
  const entry = SAMPLE_EDITS[kind]
  if (!entry) throw new Error(`Unknown sample edit: ${kind}`)
  return entry
}

/** The entry for an edit, typed loosely so one call dispatches any kind. */
const entryOf = (edit: SampleEdit) => sampleEditEntry(edit.kind) as unknown as SampleEditEntry

/** Whether an edit is a spectral one (a band edit), which may run off the main thread (`SpectrumService.applyOf`). */
export const isBandEdit = (edit: SampleEdit): edit is BandEdit => entryOf(edit).group === 'spectral'

/** A new `SampleAudio` with `edit` applied; the input is left as it is. */
export const applySampleEdit = (audio: SampleAudio, edit: SampleEdit): SampleAudio => entryOf(edit).apply(audio, edit)

/** Where a position of a sample of `frames` frames is after `edit`, or null when the audio at it is gone. */
export const remapFrame = (edit: SampleEdit, frames: number, position: number): number | null =>
  mapOf(entryOf(edit).remap(edit, frames)).frame(position)

/** A range of a sample of `frames` frames after `edit`: its start mapped forward, its end backward; null when it is gone. */
export const remapRange = (edit: SampleEdit, frames: number, range: FrameRange): FrameRange | null =>
  mapOf(entryOf(edit).remap(edit, frames)).range(range)

/** The step `edit` moves positions by in a sample of `frames` frames, or null when nothing moves. */
export const remapStep = (edit: SampleEdit, frames: number): RemapStep | null => {
  const step = entryOf(edit).remap(edit, frames)
  return step && !mapOf(step).identity ? step : null
}

/** What `replaceSample` needs to move uses onto the edited sample: the map, with the lengths before and after, and its step. */
export const sampleRemap = (edit: SampleEdit, fromFrames: number, toFrames: number): SampleRemap => {
  const step = remapStep(edit, fromFrames)
  return remapOfSteps(step ? [step] : [], fromFrames, toFrames)
}

/** The output frames `edit` changes in a sample of `frames` frames. */
export const changedFrames = (edit: SampleEdit, frames: number): FrameRange => entryOf(edit).changed(edit, frames)

/** Where the editor's selection and cursor go after `edit` of a sample of `frames` frames. */
export const afterEdit = (edit: SampleEdit, frames: number): SampleEditAfter => entryOf(edit).after(edit, frames)

/** The suffix a copy made by `edit` gets: its variant's, or its entry's. */
export const editSuffix = (edit: SampleEdit): string => {
  const entry = entryOf(edit)
  const variant = edit.kind === 'fade' ? entry.variants?.find((candidate) => candidate.id === edit.direction) : undefined
  return variant?.suffix ?? entry.suffix
}
