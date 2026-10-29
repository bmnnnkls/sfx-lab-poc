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
