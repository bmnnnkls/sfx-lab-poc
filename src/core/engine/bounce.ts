import type { Project } from '../project'
import { type SampleData, type WavBitDepth, encodeWavChannels } from '../sample'
import { diffProject } from '../sync'
import { Engine } from './engine'

/**
 * Offline bounce: the project rendered by the very `Engine` the audio worklet runs, faster than real time and with no browser, so
 * the same project is the same samples every time (every random source is seeded, a voice's salt is its slot in the pool).
 *
 * Where it ends. Clips loop forever, so the bounce decides: it plays `bars` bars (the *body*), then stops the transport, as the Stop
 * button does (notes are released, audio clips fade in 5 ms), and keeps rendering the *tail* until the output has stayed under -80 dB
 * for a quarter of a second, but at most `maxTail` seconds, so envelopes, reverbs and delays are not cut. The file ends at the last
 * sample above -80 dB, and is never shorter than the body. A patch that never goes quiet (a clock or noise wired to the output)
 * runs the tail to `maxTail`; set it to 0 to get the body only.
 */

/** The project is in 4/4 everywhere (the launch grid, the piano roll's ruler), so a bar is four beats. */
export const BEATS_PER_BAR = 4

export const BOUNCE_SAMPLE_RATES = [44100, 48000] as const
export type BounceSampleRate = (typeof BOUNCE_SAMPLE_RATES)[number]

/** What to play: one track's clip, or a whole scene (the clip of every track in that row of the session grid). */
export type BounceScope =
  | { readonly kind: 'clip'; readonly trackId: string; readonly clipId: string }
  | { readonly kind: 'scene'; readonly scene: number }

export interface BounceOptions {
  readonly scope: BounceScope
  /** Default 48000, the rate the app plays at. */
  readonly sampleRate?: BounceSampleRate
  /** How many bars of the loop to play before the tail; may be fractional (a 2-beat clip is 0.5). Default: the longest clip of the scope, once through. */
  readonly bars?: number
  /** The most seconds of tail to add after the last bar. Default 10; 0 for none. */
  readonly maxTail?: number
  /** Scale the peak to -1 dBFS. Default off. Silence is left silent. */
  readonly normalize?: boolean
  /** 16-bit PCM (default) or 32-bit float. Only matters when encoding (`encodeBounce`). */
  readonly bitDepth?: WavBitDepth
}

export interface BounceResult {
  readonly left: Float32Array
  readonly right: Float32Array
  readonly sampleRate: number
  readonly bitDepth: WavBitDepth
  /** How many frames of the file are the body (the bars played); the rest is tail. */
  readonly bodyFrames: number
}

export const DEFAULT_BOUNCE_SAMPLE_RATE: BounceSampleRate = 48000
export const DEFAULT_MAX_TAIL = 10
/** Fewer than a beat is not a loop; more than this is not a sound effect and would take a gigabyte of memory. */
export const MIN_BOUNCE_BARS = 1 / BEATS_PER_BAR
export const MAX_BOUNCE_BARS = 64
export const MAX_TAIL_LIMIT = 30
/** The normalize target: -1 dBFS. */
const NORMALIZE_PEAK = 10 ** (-1 / 20)
/** The tail is over when the output has stayed under this (-80 dB) ... */
const SILENCE_LEVEL = 1e-4
/** ... for this long. */
const SILENCE_SECONDS = 0.25
/** A peak under this (-100 dB) is silence, not a quiet sound: normalizing it would only raise the noise. */
const SILENT_PEAK = 1e-5
/** Frames per `step`: 32 engine blocks, about 85 ms of audio, so the caller can yield to the browser between them. */
export const BOUNCE_CHUNK_FRAMES = 4096

export interface ResolvedBounceOptions {
  readonly scope: BounceScope
  readonly sampleRate: BounceSampleRate
  readonly bars: number
  readonly maxTail: number
  readonly normalize: boolean
  readonly bitDepth: WavBitDepth
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))
const finiteOr = (value: number | undefined, fallback: number) => (value !== undefined && Number.isFinite(value) ? value : fallback)

/** The length in beats of the clips a scope plays; throws when the scope names a clip or scene that is not in the project. */
const scopeBeats = (project: Project, scope: BounceScope): number[] => {
  if (scope.kind === 'scene') {
    if (!Number.isInteger(scope.scene) || scope.scene < 0 || scope.scene >= project.sceneCount) {
      throw new Error(`There is no scene ${scope.scene + 1} to bounce.`)
    }
    return project.tracks.flatMap((track) => {
      const clip = track.kind === 'return' ? null : track.clips[scope.scene]
      return clip ? [clip.lengthBeats] : []
    })
  }
  const track = project.tracks.find((candidate) => candidate.id === scope.trackId)
  const clip = track && track.kind !== 'return' ? track.clips.find((candidate) => candidate?.id === scope.clipId) : undefined
  if (!clip) throw new Error('The clip to bounce is not in the project.')
  return [clip.lengthBeats]
}

/** How many bars the scope plays once through: its longest clip. A scene with no clips is one bar of silence. */
export const defaultBounceBars = (project: Project, scope: BounceScope): number => {
  const longest = Math.max(0, ...scopeBeats(project, scope))
  return longest > 0 ? longest / BEATS_PER_BAR : 1
}

/** Fills in the defaults and keeps every number in its range, so a bad option cannot ask for a day of audio. */
export const resolveBounceOptions = (project: Project, options: BounceOptions): ResolvedBounceOptions => ({
  scope: options.scope,
  sampleRate: options.sampleRate === 44100 ? 44100 : DEFAULT_BOUNCE_SAMPLE_RATE,
  bars: clamp(finiteOr(options.bars, defaultBounceBars(project, options.scope)), MIN_BOUNCE_BARS, MAX_BOUNCE_BARS),
  maxTail: clamp(finiteOr(options.maxTail, DEFAULT_MAX_TAIL), 0, MAX_TAIL_LIMIT),
  normalize: options.normalize === true,
  bitDepth: options.bitDepth === 32 ? 32 : 16,
})

type Phase = 'body' | 'tail' | 'done'

/**
 * A bounce in progress. `step()` renders one chunk (about 85 ms of audio, a few ms of work), so a caller on the main thread can
 * yield between steps and show `progress`; `renderProject` runs it to the end in one go.
 */
export class Bounce {
  readonly options: ResolvedBounceOptions
  private readonly engine: Engine
  private readonly bodyFrames: number
  private readonly tailLimit: number
  private readonly silenceFrames: number
  private readonly left: Float32Array[] = []
  private readonly right: Float32Array[] = []
  private frames = 0
  /** One past the last frame whose output was above -80 dB. */
  private audibleEnd = 0
  private phase: Phase = 'body'

  constructor(project: Project, samples: readonly SampleData[], options: BounceOptions) {
    this.options = resolveBounceOptions(project, options)
    const { sampleRate, bars, maxTail, scope } = this.options
    this.engine = new Engine(sampleRate)
    // The same commands that build the live engine from an empty one: tempo, master graph, every track.
    for (const command of diffProject(null, project)) this.engine.apply(command)
    for (const sample of samples) this.engine.apply({ type: 'sample/add', sample })
    this.engine.apply(
      scope.kind === 'scene'
        ? { type: 'scene/launch', scene: scope.scene }
        : { type: 'clip/launch', trackId: scope.trackId, clipId: scope.clipId },
    )
    // Launches take effect at the next bar line and the transport starts at beat 0, so the first note is at the first sample.
    this.bodyFrames = Math.round(((bars * BEATS_PER_BAR * 60) / project.tempo) * sampleRate)
    this.tailLimit = this.bodyFrames + Math.round(maxTail * sampleRate)
    this.silenceFrames = Math.round(SILENCE_SECONDS * sampleRate)
  }

  get done(): boolean {
    return this.phase === 'done'
  }

  /** 0 to 1; the tail counts in full until it ends, which it usually does early, so the last stretch jumps. */
  get progress(): number {
    return this.done ? 1 : Math.min(1, this.frames / Math.max(1, this.tailLimit))
  }

  /** Renders the next chunk. Does nothing once done. */
  step(): void {
    if (this.phase === 'done') return
    const until = this.phase === 'body' ? this.bodyFrames : this.tailLimit
    const frames = Math.max(0, Math.min(BOUNCE_CHUNK_FRAMES, until - this.frames))
    if (frames > 0) this.renderChunk(frames)

    if (this.phase === 'body' && this.frames >= this.bodyFrames) {
      // The loop would go on for ever: stop it, as the Stop button does, and let what is ringing ring out.
      this.engine.apply({ type: 'transport/stop' })
      this.phase = 'tail'
    }
    if (this.phase === 'tail' && (this.frames >= this.tailLimit || this.frames - this.audibleEnd >= this.silenceFrames)) {
      this.phase = 'done'
    }
  }

  /** The finished audio: trimmed to the last audible sample (never shorter than the body), normalized if asked. Run `step()` until `done` first. */
  result(): BounceResult {
    if (!this.done) throw new Error('The bounce is not finished.')
    const length = Math.max(this.bodyFrames, this.audibleEnd)
    const [left, right] = [joined(this.left, length), joined(this.right, length)]
    if (this.options.normalize) normalizePeak(left, right)
    return { left, right, sampleRate: this.options.sampleRate, bitDepth: this.options.bitDepth, bodyFrames: this.bodyFrames }
  }

  private renderChunk(frames: number): void {
    const [left, right] = [new Float32Array(frames), new Float32Array(frames)]
    this.engine.render(left, right)
    for (let i = 0; i < frames; i++) {
      // A NaN would be written into the file as it is, and ruin the player's output, not just this sound.
      if (!Number.isFinite(left[i])) left[i] = 0
      if (!Number.isFinite(right[i])) right[i] = 0
      if (Math.abs(left[i] as number) > SILENCE_LEVEL || Math.abs(right[i] as number) > SILENCE_LEVEL) this.audibleEnd = this.frames + i + 1
    }
    this.left.push(left)
    this.right.push(right)
    this.frames += frames
  }
}

/** The chunks as one array of exactly `length` frames. */
const joined = (chunks: readonly Float32Array[], length: number): Float32Array => {
  const out = new Float32Array(length)
  let at = 0
  for (const chunk of chunks) {
    if (at >= length) break
    out.set(chunk.subarray(0, length - at), at)
    at += chunk.length
  }
  return out
}

/** Scales both channels together so the loudest sample is -1 dBFS (down as well as up); silence stays as it is. */
const normalizePeak = (left: Float32Array, right: Float32Array): void => {
  let peak = 0
  for (let i = 0; i < left.length; i++) peak = Math.max(peak, Math.abs(left[i] as number), Math.abs(right[i] as number))
  if (peak < SILENT_PEAK) return
  const gain = NORMALIZE_PEAK / peak
  for (let i = 0; i < left.length; i++) {
    left[i] = (left[i] as number) * gain
    right[i] = (right[i] as number) * gain
  }
}

/** Renders the whole bounce at once. `samples` is the decoded (mono) audio of every library sample the project plays (`usedSampleIds`). */
export const renderProject = (project: Project, samples: readonly SampleData[], options: BounceOptions): BounceResult => {
  const bounce = new Bounce(project, samples, options)
  while (!bounce.done) bounce.step()
  return bounce.result()
}

/** The bounce as a stereo WAV file at the bit depth it was asked for. */
export const encodeBounce = (result: BounceResult): Uint8Array =>
  encodeWavChannels([result.left, result.right], result.sampleRate, result.bitDepth)
