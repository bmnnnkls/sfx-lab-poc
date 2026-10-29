import { RIGHT, STEREO_FRAMES, type SendSink, isStereoBuffer } from '../dsp'

/**
 * Where the tracks leave sound for the return tracks (or, on a second board, for the group buses), one stereo buffer
 * per return track or bus. The engine clears it before every stretch of audio it mixes, tracks that send add to it
 * (Send nodes, send knobs; members their output), and a return track or bus reads its own buffer as its input; the
 * engine runs senders before the returns they send to, so each buffer is complete by then.
 */
export class AudioBoard implements SendSink {
  private readonly slots = new Map<string, Float32Array>()
  private readonly views = new Map<string, { readonly left: Float32Array; readonly right: Float32Array }>()

  /** Keeps one buffer per id in `ids` (allocating here, not while rendering) and forgets the rest. */
  sync(ids: Iterable<string>): void {
    const wanted = new Set(ids)
    for (const id of this.slots.keys()) {
      if (wanted.has(id)) continue
      this.slots.delete(id)
      this.views.delete(id)
    }
    for (const id of wanted) {
      if (this.slots.has(id)) continue
      const slot = new Float32Array(STEREO_FRAMES)
      this.slots.set(id, slot)
      this.views.set(id, { left: slot.subarray(0, RIGHT), right: slot.subarray(RIGHT) })
    }
  }

  /** A buffer's left and right halves, to mix into at offset 0; undefined when there is no such id. */
  channels(id: string): { readonly left: Float32Array; readonly right: Float32Array } | undefined {
    return this.views.get(id)
  }

  /** Empties the first `frames` samples of every buffer. */
  clear(frames: number): void {
    for (const slot of this.slots.values()) {
      slot.fill(0, 0, frames)
      slot.fill(0, RIGHT, RIGHT + frames)
    }
  }

  /** What has been sent to a return track so far (a stereo buffer), or undefined when there is no such return. */
  read(trackId: string): Float32Array | undefined {
    return this.slots.get(trackId)
  }

  add(trackId: string, source: Float32Array, amount: number, frames: number, offset = 0): void {
    const slot = this.slots.get(trackId)
    if (!slot || amount === 0) return
    const stereo = isStereoBuffer(source)
    for (let i = 0; i < frames; i++) {
      slot[offset + i] = (slot[offset + i] ?? 0) + (source[i] ?? 0) * amount
      slot[RIGHT + offset + i] = (slot[RIGHT + offset + i] ?? 0) + (source[stereo ? RIGHT + i : i] ?? 0) * amount
    }
  }
}
