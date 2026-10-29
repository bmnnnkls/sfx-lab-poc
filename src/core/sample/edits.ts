import { frameCount } from './channels'
import { type FrameMap, type FrameRange, type SampleRemap, cropMap, identityMap, mirrorMap, spliceMap } from './remap'
import type { SampleAudio } from './types'
import type { WavBitDepth } from './wav'

export type { FrameRange } from './remap'

/**
 * Sample edits as data: what an edit does is a value (`SampleEdit`), applied by one pure function, so the same edit of
 * the same audio gives the same floats every time, and an edit can be described, repeated and tested apart from who asks
 * for it. Every edit works on every channel.
 */

export type SampleEdit =
  | { readonly kind: 'normalize' }
  | { readonly kind: 'reverse' }
  | { readonly kind: 'keep'; readonly range: FrameRange }
  | { readonly kind: 'delete'; readonly range: FrameRange }
  | { readonly kind: 'fade-in'; readonly seconds: number }
  | { readonly kind: 'fade-out'; readonly seconds: number }

export type SampleEditKind = SampleEdit['kind']

/** The bit depth of the WAV files edits write: 32-bit float is exact, so a chain of edits is not quantized again. */
export const EDIT_WAV_BIT_DEPTH: WavBitDepth = 32

/** The peak after normalizing: just under full scale. */
const NORMALIZE_PEAK = 0.999
/** A peak under this (-100 dB) is silence: normalizing it would only raise the noise. */
const SILENT_PEAK = 1e-5
/** How long the toolbar's fades are: enough to remove a click. */
const CLICK_FADE_SECONDS = 0.01

const map = (audio: SampleAudio, each: (channel: Float32Array) => Float32Array): SampleAudio => ({
  sampleRate: audio.sampleRate,
  channels: audio.channels.map(each),
})

/** The range inside a sample of `length` frames, in order. */
const clampTo = (length: number, { from, to }: FrameRange): FrameRange => {
  const clamp = (frame: number) => Math.max(0, Math.min(length, Math.round(frame)))
  return { from: clamp(Math.min(from, to)), to: clamp(Math.max(from, to)) }
}

/** The range inside the sample, in order. */
const clampRange = (audio: SampleAudio, range: FrameRange): FrameRange => clampTo(frameCount(audio), range)

/** One gain for every channel, so a stereo sample keeps its balance. */
const normalize = (audio: SampleAudio): SampleAudio => {
  let peak = 0
  for (const channel of audio.channels) for (let i = 0; i < channel.length; i++) peak = Math.max(peak, Math.abs(channel[i] ?? 0))
  if (peak < SILENT_PEAK) return map(audio, (channel) => Float32Array.from(channel))
  const gain = NORMALIZE_PEAK / peak
  return map(audio, (channel) => Float32Array.from(channel, (value) => value * gain))
}

/** How many frames a fade of `seconds` covers: sample-rate aware, at least one, at most half the sample. */
const fadeFrames = (audio: SampleAudio, seconds: number) => fadeFramesOf(audio.sampleRate, frameCount(audio), seconds)
const fadeFramesOf = (sampleRate: number, frames: number, seconds: number) =>
  Math.max(1, Math.min(Math.floor(seconds * sampleRate), Math.floor(frames / 2)))

/** A new `SampleAudio` with `edit` applied; the input is left as it is. */
export const applySampleEdit = (audio: SampleAudio, edit: SampleEdit): SampleAudio => {
  switch (edit.kind) {
    case 'normalize':
      return normalize(audio)
    case 'reverse':
      return map(audio, (channel) => Float32Array.from(channel).reverse())
    case 'keep': {
      const { from, to } = clampRange(audio, edit.range)
      return map(audio, (channel) => channel.slice(from, to))
    }
    case 'delete': {
      const { from, to } = clampRange(audio, edit.range)
      return map(audio, (channel) => {
        const next = new Float32Array(channel.length - (to - from))
        next.set(channel.subarray(0, from), 0)
        next.set(channel.subarray(to), from)
        return next
      })
    }
    case 'fade-in': {
      const count = fadeFrames(audio, edit.seconds)
      return map(audio, (channel) => Float32Array.from(channel, (value, index) => (index >= count ? value : value * (index / count))))
    }
    case 'fade-out': {
      const count = fadeFrames(audio, edit.seconds)
      return map(audio, (channel) =>
        Float32Array.from(channel, (value, index) => {
          const fromEnd = channel.length - 1 - index
          return fromEnd >= count ? value : value * (fromEnd / count)
        }),
      )
    }
  }
}

/** What an editor knows when it asks for an edit: the selection, if any, in frames. */
export interface SampleEditContext {
  readonly selection: FrameRange | null
}

/**
 * Where the editor's selection and cursor go once an edit lands, in output frames: `keep` leaves them (a process), or a
 * new selection (none, or what was inserted) and cursor.
 */
export type SampleEditAfter = 'keep' | { readonly selection: FrameRange | null; readonly cursor: number }

/** One edit the editor offers. The toolbar, and later menus and the palette, are built from `SAMPLE_EDITS`. */
export interface SampleEditEntry {
  readonly kind: SampleEditKind
  readonly title: string
  readonly tooltip: string
  /** Added to the name of a copy: "Kick (reversed)". */
  readonly suffix: string
  readonly needsSelection: boolean
  /** The edit to apply, or null when it can't run (no selection). */
  readonly create: (context: SampleEditContext) => SampleEdit | null
  /** Where the positions of a sample of `frames` frames are after the edit (`remapFrame`, `remapRange`). */
  readonly remap: (edit: SampleEdit, frames: number) => FrameMap
  /**
   * The output frames that differ from the input, for a sample of `frames` frames and `sampleRate`: to the new end for
   * edits that change the length. The pyramid update redraws just these.
   */
  readonly changed: (edit: SampleEdit, frames: number, sampleRate: number) => FrameRange
  /** The selection and cursor after the edit, in a sample that had `frames` frames. */
  readonly after: (edit: SampleEdit, frames: number) => SampleEditAfter
}

const withSelection = (make: (range: FrameRange) => SampleEdit) => ({ selection }: SampleEditContext) =>
  selection && selection.to > selection.from ? make(selection) : null

/** The edit's range inside the sample; the whole sample for edits without one. */
const rangeOf = (edit: SampleEdit, frames: number): FrameRange =>
  'range' in edit ? clampTo(frames, edit.range) : { from: 0, to: frames }

const whole = (_edit: SampleEdit, frames: number): FrameRange => ({ from: 0, to: frames })
const keep = (): SampleEditAfter => 'keep'

/** The edits, in toolbar order. Adding or dropping one is one entry. */
export const SAMPLE_EDITS: readonly SampleEditEntry[] = [
  {
    kind: 'normalize', title: 'Normalize', suffix: 'normalized', needsSelection: false,
    tooltip: 'Scale the sample so its loudest point is just under full scale',
    create: () => ({ kind: 'normalize' }),
    remap: () => identityMap,
    changed: whole,
    after: keep,
  },
  {
    kind: 'reverse', title: 'Reverse', suffix: 'reversed', needsSelection: false,
    tooltip: 'Play the sample backwards',
    create: () => ({ kind: 'reverse' }),
    remap: (_edit, frames) => mirrorMap(0, frames),
    changed: whole,
    after: keep,
  },
  {
    kind: 'keep', title: 'Keep selection', suffix: 'cut', needsSelection: true,
    tooltip: 'Keep only the selected part',
    create: withSelection((range) => ({ kind: 'keep', range })),
    remap: (edit, frames) => {
      const { from, to } = rangeOf(edit, frames)
      return cropMap(from, to)
    },
    changed: (edit, frames) => {
      const { from, to } = rangeOf(edit, frames)
      return { from: 0, to: to - from }
    },
    after: () => ({ selection: null, cursor: 0 }),
  },
  {
    kind: 'delete', title: 'Delete selection', suffix: 'edited', needsSelection: true,
    tooltip: 'Remove the selected part and join the parts around it',
    create: withSelection((range) => ({ kind: 'delete', range })),
    remap: (edit, frames) => {
      const { from, to } = rangeOf(edit, frames)
      return spliceMap(from, to, 0)
    },
    changed: (edit, frames) => {
      const { from, to } = rangeOf(edit, frames)
      return { from, to: frames - (to - from) }
    },
    after: (edit, frames) => ({ selection: null, cursor: rangeOf(edit, frames).from }),
  },
  {
    kind: 'fade-in', title: 'Fade in', suffix: 'fade in', needsSelection: false,
    tooltip: 'Fade in over the first 10 ms (removes clicks)',
    create: () => ({ kind: 'fade-in', seconds: CLICK_FADE_SECONDS }),
    remap: () => identityMap,
    changed: (edit, frames, sampleRate) => ({ from: 0, to: fadeFramesOf(sampleRate, frames, edit.kind === 'fade-in' ? edit.seconds : 0) }),
    after: keep,
  },
  {
    kind: 'fade-out', title: 'Fade out', suffix: 'fade out', needsSelection: false,
    tooltip: 'Fade out over the last 10 ms (removes clicks)',
    create: () => ({ kind: 'fade-out', seconds: CLICK_FADE_SECONDS }),
    remap: () => identityMap,
    changed: (edit, frames, sampleRate) => ({ from: frames - fadeFramesOf(sampleRate, frames, edit.kind === 'fade-out' ? edit.seconds : 0), to: frames }),
    after: keep,
  },
]

/** The registry entry for an edit. */
export const sampleEditEntry = (kind: SampleEditKind): SampleEditEntry => {
  const entry = SAMPLE_EDITS.find((candidate) => candidate.kind === kind)
  if (!entry) throw new Error(`Unknown sample edit: ${kind}`)
  return entry
}

/** Where a position of a sample of `frames` frames is after `edit`, or null when the audio at it is gone. */
export const remapFrame = (edit: SampleEdit, frames: number, position: number): number | null =>
  sampleEditEntry(edit.kind).remap(edit, frames).frame(position)

/** A range of a sample of `frames` frames after `edit`: its start mapped forward, its end backward; null when it is gone. */
export const remapRange = (edit: SampleEdit, frames: number, range: FrameRange): FrameRange | null =>
  sampleEditEntry(edit.kind).remap(edit, frames).range(range)

/** What `replaceSample` needs to move uses onto the edited sample: the map, with the lengths before and after. */
export const sampleRemap = (edit: SampleEdit, fromFrames: number, toFrames: number): SampleRemap => ({
  ...sampleEditEntry(edit.kind).remap(edit, fromFrames),
  fromFrames,
  toFrames,
})

/** The output frames `edit` changes in a sample of `frames` frames at `sampleRate`. */
export const changedFrames = (edit: SampleEdit, frames: number, sampleRate: number): FrameRange =>
  sampleEditEntry(edit.kind).changed(edit, frames, sampleRate)

/** Where the editor's selection and cursor go after `edit` of a sample of `frames` frames. */
export const afterEdit = (edit: SampleEdit, frames: number): SampleEditAfter => sampleEditEntry(edit.kind).after(edit, frames)
