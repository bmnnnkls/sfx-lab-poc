import type { RemapStep } from './remap'

/** Metadata about an imported sample; saved with the project. The audio bytes are stored separately. */
export interface SampleInfo {
  /** SHA-256 (hex) of the original file's bytes, so identical files are the same sample. */
  readonly id: string
  readonly name: string
  /** Original file extension (`wav`, `mp3`, …), used to name it inside project packages. */
  readonly extension: string
  readonly durationSeconds: number
  readonly sampleRate: number
  /** The original file's channel count (what was imported), not what the engine plays: that is one or two. */
  readonly channels: number
  /** Size of the original file. */
  readonly bytes: number
  /** The id of the first version of this sample, when an edit made it (`originOf` reads it). Since v11. */
  readonly origin?: string
  /** Named points in the sample, in frames. Since v11. */
  readonly markers?: readonly SampleMarker[]
  /** Named stretches of the sample, in frames. Since v11. */
  readonly regions?: readonly SampleRegion[]
  /** The stretch a sampler in *loop* mode repeats while a note is held, in frames. Since v12. */
  readonly loop?: SampleLoop
  /** What *Revert to original* needs: the first version's facts and the position maps of the edits since. Since v12. */
  readonly lineage?: SampleLineage
}

/** A sample's loop: frames `from` up to (not including) `to`, at least one frame. */
export interface SampleLoop {
  readonly from: number
  readonly to: number
}

/** The facts of a sample's first version that its `SampleInfo` held; with the origin's id they are that `SampleInfo`. */
export type SampleOriginal = Pick<SampleInfo, 'extension' | 'bytes' | 'channels' | 'durationSeconds' | 'sampleRate'>

/**
 * How a sample came from its first version: that version's facts and each in-place edit's position map, in order.
 * Run backwards (`revertRemap`) they put positions back where they were in the original.
 */
export interface SampleLineage {
  readonly original: SampleOriginal
  readonly steps: readonly RemapStep[]
}

/** A named point in a sample: `frame` is a whole frame, 0 to the sample's length. */
export interface SampleMarker {
  readonly id: string
  readonly frame: number
  readonly name: string
}

/** A named stretch of a sample, from frame `from` up to (not including) `to`. */
export interface SampleRegion {
  readonly id: string
  readonly from: number
  readonly to: number
  readonly name: string
}

/** Decoded audio: one channel, or two (left, right) of equal length, as floating point. What edits work on. */
export interface SampleAudio {
  readonly sampleRate: number
  readonly channels: readonly Float32Array[]
}

/**
 * Decoded audio ready for playback by the engine. Engine code reaches the channels only through `monoAt`,
 * `channelAt` and `frameCount` (`channels.ts`), so how many it plays is decided there.
 */
export interface SampleData extends SampleAudio {
  readonly id: string
}

/** Read access to decoded samples, as seen by DSP nodes. */
export interface SampleLookup {
  get(id: string): SampleData | undefined
}
