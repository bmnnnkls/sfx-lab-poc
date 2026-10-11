import { RIGHT, STEREO_FRAMES, type SignalTaps, isStereoBuffer } from '../dsp'

interface Slot {
  readonly before: Float32Array
  readonly after: Float32Array
}

/**
 * What the tracks produced in the stretch being mixed, for Track audio nodes to read: each track's sound before and
 * after its insert graph (both before its fader), one stereo buffer each. Like the sends, it is cleared before every stretch
 * the engine mixes and the engine mixes a track after the tracks it takes audio from, so what a node reads is complete.
 * Only tracks someone reads are written, so a project without Track audio nodes pays nothing.
 */
export class AudioTaps implements SignalTaps {
  private readonly slots = new Map<string, Slot>()

  /** Keeps a pair of buffers for each track in `wanted` (allocating here, not while rendering) and forgets the rest. */
  sync(wanted: Iterable<string>): void {
    const ids = new Set(wanted)
    for (const id of this.slots.keys()) if (!ids.has(id)) this.slots.delete(id)
    for (const id of ids) {
      if (!this.slots.has(id)) this.slots.set(id, { before: new Float32Array(STEREO_FRAMES), after: new Float32Array(STEREO_FRAMES) })
    }
  }

  /** Empties the first `frames` samples of every buffer. */
  clear(frames: number): void {
    for (const { before, after } of this.slots.values()) {
      for (const buffer of [before, after]) {
        buffer.fill(0, 0, frames)
        buffer.fill(0, RIGHT, RIGHT + frames)
      }
    }
  }

  /** Records a track's sound (`tap` 0 before its effects, 1 after); a mono signal is stored in both channels. No-op when nobody reads the track. */
  write(trackId: string, tap: number, source: Float32Array, frames: number): void {
    const slot = this.slots.get(trackId)
    if (!slot) return
    const target = tap === 0 ? slot.before : slot.after
    const stereo = isStereoBuffer(source)
    for (let i = 0; i < frames; i++) {
      target[i] = source[i] ?? 0
      target[RIGHT + i] = source[stereo ? RIGHT + i : i] ?? 0
    }
  }

  read(trackId: string, tap: number): Float32Array | undefined {
    const slot = this.slots.get(trackId)
    return slot && (tap === 0 ? slot.before : slot.after)
  }
}
