import { frameCount } from './channels'
import type { SampleAudio } from './types'
import type { WavBitDepth } from './wav'

/**
 * Sample edits as data: what an edit does is a value (`SampleEdit`), applied by one pure function, so the same edit of
 * the same audio gives the same floats every time, and an edit can be described, repeated and tested apart from who asks
 * for it. Every edit works on every channel.
 */

/** A stretch of a sample in frames, from `from` up to (not including) `to`. */
export interface FrameRange {
  readonly from: number
  readonly to: number
}

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

/** The range inside the sample, in order. */
const clampRange = (audio: SampleAudio, { from, to }: FrameRange): FrameRange => {
  const length = frameCount(audio)
  const clamp = (frame: number) => Math.max(0, Math.min(length, Math.round(frame)))
  return { from: clamp(Math.min(from, to)), to: clamp(Math.max(from, to)) }
}

/** One gain for every channel, so a stereo sample keeps its balance. */
const normalize = (audio: SampleAudio): SampleAudio => {
  let peak = 0
  for (const channel of audio.channels) for (let i = 0; i < channel.length; i++) peak = Math.max(peak, Math.abs(channel[i] ?? 0))
  if (peak < SILENT_PEAK) return map(audio, (channel) => Float32Array.from(channel))
  const gain = NORMALIZE_PEAK / peak
  return map(audio, (channel) => Float32Array.from(channel, (value) => value * gain))
}

/** How many frames a fade of `seconds` covers: sample-rate aware, at least one, at most half the sample. */
const fadeFrames = (audio: SampleAudio, seconds: number) =>
  Math.max(1, Math.min(Math.floor(seconds * audio.sampleRate), Math.floor(frameCount(audio) / 2)))

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
}

const withSelection = (make: (range: FrameRange) => SampleEdit) => ({ selection }: SampleEditContext) =>
  selection && selection.to > selection.from ? make(selection) : null

/** The edits, in toolbar order. Adding or dropping one is one entry. */
export const SAMPLE_EDITS: readonly SampleEditEntry[] = [
  {
    kind: 'normalize', title: 'Normalize', suffix: 'normalized', needsSelection: false,
    tooltip: 'Scale the sample so its loudest point is just under full scale',
    create: () => ({ kind: 'normalize' }),
  },
  {
    kind: 'reverse', title: 'Reverse', suffix: 'reversed', needsSelection: false,
    tooltip: 'Play the sample backwards',
    create: () => ({ kind: 'reverse' }),
  },
  {
    kind: 'keep', title: 'Keep selection', suffix: 'cut', needsSelection: true,
    tooltip: 'Keep only the selected part',
    create: withSelection((range) => ({ kind: 'keep', range })),
  },
  {
    kind: 'delete', title: 'Delete selection', suffix: 'edited', needsSelection: true,
    tooltip: 'Remove the selected part and join the parts around it',
    create: withSelection((range) => ({ kind: 'delete', range })),
  },
  {
    kind: 'fade-in', title: 'Fade in', suffix: 'fade in', needsSelection: false,
    tooltip: 'Fade in over the first 10 ms (removes clicks)',
    create: () => ({ kind: 'fade-in', seconds: CLICK_FADE_SECONDS }),
  },
  {
    kind: 'fade-out', title: 'Fade out', suffix: 'fade out', needsSelection: false,
    tooltip: 'Fade out over the last 10 ms (removes clicks)',
    create: () => ({ kind: 'fade-out', seconds: CLICK_FADE_SECONDS }),
  },
]

/** The registry entry for an edit. */
export const sampleEditEntry = (kind: SampleEditKind): SampleEditEntry => {
  const entry = SAMPLE_EDITS.find((candidate) => candidate.kind === kind)
  if (!entry) throw new Error(`Unknown sample edit: ${kind}`)
  return entry
}
