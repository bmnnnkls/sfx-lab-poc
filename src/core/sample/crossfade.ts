import { frameCount, monoAt } from './channels'
import { type CrossfadeCurve, fadeShape } from './fade-curves'
import type { FrameRange } from './remap'
import type { SampleAudio } from './types'

/**
 * Joins with a crossfade, and the copied audio with the handles that make them. A join is centred: over `frames` frames,
 * the outgoing part continues into the audio that followed it (its handle) while it fades out, and the incoming part
 * starts early from the audio that came before it (its handle) while it fades in. The output has exactly the length of
 * the two parts. Where a side has less to borrow than half the crossfade (the sample's start or end, a short handle),
 * that side fades over what there is; with no crossfade the join is a butt splice, bit for bit the plain cut.
 */

/** How long a join's crossfade is, and its curve. */
export interface JoinFade {
  readonly frames: number
  readonly curve: CrossfadeCurve
}

/** Half the longest crossfade: a copy keeps this much audio on each side, so a paste always has enough to borrow. */
export const CLIPBOARD_HANDLE_SECONDS = 0.05

/** `outgoing` then `incoming`, crossfaded at the join; each handle is the audio that followed or preceded its part. */
export const joinChannel = (
  outgoing: Float32Array,
  outgoingHandle: Float32Array,
  incoming: Float32Array,
  incomingHandle: Float32Array,
  fade: JoinFade,
): Float32Array => {
  const join = outgoing.length
  const out = new Float32Array(join + incoming.length)
  out.set(outgoing, 0)
  out.set(incoming, join)
  const length = Math.max(0, Math.round(fade.frames))
  if (length === 0) return out
  const before = Math.min(Math.floor(length / 2), outgoing.length)
  const after = Math.min(length - Math.floor(length / 2), incoming.length)
  const start = join - before
  const end = join + after
  // Each side's own fade: the outgoing part fades out until its handle runs out, the incoming fades in from where its begins.
  const outEnd = join + Math.min(after, outgoingHandle.length)
  const inStart = join - Math.min(before, incomingHandle.length)
  const g = fadeShape(fade.curve)
  for (let k = start; k < end; k++) {
    const a = k < join ? outgoing[k]! : k < outEnd ? outgoingHandle[k - join]! : 0
    const b = k >= join ? incoming[k - join]! : k >= inStart ? incomingHandle[incomingHandle.length - (join - k)]! : 0
    const fadeOut = k < outEnd ? g(1 - (k - start + 0.5) / (outEnd - start)) : 0
    const fadeIn = k >= inStart ? g((k - inStart + 0.5) / (end - inStart)) : 0
    out[k] = a * fadeOut + b * fadeIn
  }
  return out
}

/** Copied audio and up to `CLIPBOARD_HANDLE_SECONDS` of what was just outside it on each side, on the same channels. */
export interface AudioCopy {
  readonly audio: SampleAudio
  readonly handles: { readonly before: SampleAudio; readonly after: SampleAudio }
}

/** The audio an edit inserts, fitted to the sample's channels: mono into stereo goes in both, stereo into mono is averaged. */
export const fitChannels = (audio: SampleAudio, count: number): readonly Float32Array[] => {
  if (audio.channels.length === count) return audio.channels
  if (count === 1) return [Float32Array.from({ length: frameCount(audio) }, (_, index) => monoAt(audio, index))]
  return Array.from({ length: count }, () => audio.channels[0] ?? new Float32Array(0))
}

const slice = (audio: SampleAudio, channels: readonly number[], from: number, to: number): SampleAudio => ({
  sampleRate: audio.sampleRate,
  channels: channels.map((channel) => audio.channels[channel]!.slice(from, to)),
})

/** Copies a range of the audio, on `channels` (indexes), with its handles. */
export const copyAudioRange = (audio: SampleAudio, range: FrameRange, channels: readonly number[]): AudioCopy => {
  const frames = frameCount(audio)
  const from = Math.max(0, Math.min(frames, Math.round(range.from)))
  const to = Math.max(from, Math.min(frames, Math.round(range.to)))
  const handle = Math.round(CLIPBOARD_HANDLE_SECONDS * audio.sampleRate)
  return {
    audio: slice(audio, channels, from, to),
    handles: { before: slice(audio, channels, Math.max(0, from - handle), from), after: slice(audio, channels, to, Math.min(frames, to + handle)) },
  }
}

/** Silence to insert: zeros, with nothing to borrow on either side. */
export const silenceCopy = (frames: number, sampleRate: number, channels: number): AudioCopy => {
  const empty = { sampleRate, channels: Array.from({ length: channels }, () => new Float32Array(0)) }
  return { audio: { sampleRate, channels: Array.from({ length: channels }, () => new Float32Array(Math.max(0, Math.round(frames)))) }, handles: { before: empty, after: empty } }
}

/**
 * The audio with frames `from` up to `to` replaced by `insert` (a delete inserts nothing, a paste at the cursor replaces
 * nothing), crossfaded at both joins. The replaced audio is each join's handle on the sample's side; the inserted audio
 * brings its own. A crossfade never reaches past the middle of what is inserted.
 */
export const spliceAudio = (audio: SampleAudio, range: FrameRange, insert: AudioCopy | null, fade: JoinFade): SampleAudio => {
  const frames = frameCount(audio)
  const from = Math.max(0, Math.min(frames, Math.round(Math.min(range.from, range.to))))
  const to = Math.max(from, Math.min(frames, Math.round(Math.max(range.from, range.to))))
  const count = audio.channels.length
  const middle = insert ? fitChannels(insert.audio, count) : null
  const middleBefore = insert ? fitChannels(insert.handles.before, count) : null
  const middleAfter = insert ? fitChannels(insert.handles.after, count) : null
  const inserted = middle?.[0]?.length ?? 0
  const inner: JoinFade = middle ? { ...fade, frames: Math.min(fade.frames, inserted) } : fade
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((channel, index) => {
      const head = channel.subarray(0, from)
      const replaced = channel.subarray(from, to)
      const tail = channel.subarray(to)
      if (!middle) return joinChannel(head, replaced, tail, replaced, fade)
      // The audio around the cursor (or the replaced part) is what each side borrows.
      const into = joinChannel(head, channel.subarray(from), middle[index]!, middleBefore![index]!, inner)
      return joinChannel(into, middleAfter![index]!, tail, channel.subarray(0, to), inner)
    }),
  }
}
