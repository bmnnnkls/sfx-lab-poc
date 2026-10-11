/** Metadata about an imported sample; saved with the project. The audio bytes are stored separately. */
export interface SampleInfo {
  /** SHA-256 (hex) of the original file's bytes, so identical files are the same sample. */
  readonly id: string
  readonly name: string
  /** Original file extension (`wav`, `mp3`, …), used to name it inside project packages. */
  readonly extension: string
  readonly durationSeconds: number
  readonly sampleRate: number
  readonly channels: number
  /** Size of the original file. */
  readonly bytes: number
}

/** Decoded audio ready for playback by the engine: mono, floating point. */
export interface SampleData {
  readonly id: string
  readonly sampleRate: number
  readonly data: Float32Array
}

/** Read access to decoded samples, as seen by DSP nodes. */
export interface SampleLookup {
  get(id: string): SampleData | undefined
}
