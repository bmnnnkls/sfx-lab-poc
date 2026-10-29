import { describe, expect, it } from 'vitest'
import {
  type AudioCopy,
  CLIPBOARD_HANDLE_SECONDS,
  type SampleAudio,
  applySampleEdit,
  copyAudioRange,
  fadeShape,
  frameCount,
  joinChannel,
  monoAt,
  silenceCopy,
} from '.'

const filled = (length: number, value: number) => new Float32Array(length).fill(value)
const ramp = (length: number, offset = 0) => Float32Array.from({ length }, (_, i) => (i + offset) / 100)
const EMPTY = new Float32Array(0)

describe('joinChannel', () => {
  it('is the plain cut with no crossfade, bit for bit', () => {
    const [a, b] = [ramp(10), ramp(7, 50)]
    const joined = joinChannel(a, ramp(5, 10), b, ramp(5, 45), { frames: 0, curve: 'linear' })
    expect(Array.from(joined)).toEqual([...a, ...b])
  })

  it('crossfades centred on the join with both handles: linear keeps equal gain, equal power equal power', () => {
    // Every part is 1, so a linear crossfade sums to 1 everywhere.
    const linear = joinChannel(filled(20, 1), filled(10, 1), filled(20, 1), filled(10, 1), { frames: 8, curve: 'linear' })
    expect(linear).toHaveLength(40)
    for (const value of linear) expect(value).toBeCloseTo(1, 6)
    // Only the outgoing side sounds, then only the incoming: their gains' squares sum to 1.
    const out = joinChannel(filled(20, 1), filled(10, 1), filled(20, 0), filled(10, 0), { frames: 8, curve: 'equal-power' })
    const into = joinChannel(filled(20, 0), filled(10, 0), filled(20, 1), filled(10, 1), { frames: 8, curve: 'equal-power' })
    for (let k = 16; k < 24; k++) expect(out[k]! ** 2 + into[k]! ** 2, `${k}`).toBeCloseTo(1, 6)
    expect([out[15], out[24], into[15], into[24]]).toEqual([1, 0, 0, 1])
  })

  it.each(['linear', 'equal-power'] as const)('fades each side by the %s curve over the crossfade', (curve) => {
    const g = fadeShape(curve)
    const joined = joinChannel(filled(20, 1), filled(10, 1), filled(20, 0), filled(10, 0), { frames: 8, curve })
    for (let u = 0; u < 8; u++) expect(joined[16 + u]).toBeCloseTo(g(1 - (u + 0.5) / 8), 6)
  })

  it('fades a side with nothing to borrow over what there is', () => {
    // The outgoing part has no handle: it fades out before the join; the incoming, with one, fades in across it.
    const joined = joinChannel(filled(20, 1), EMPTY, filled(20, 2), filled(10, 2), { frames: 8, curve: 'linear' })
    for (let u = 0; u < 4; u++) expect(joined[16 + u]).toBeCloseTo(1 * (1 - (u + 0.5) / 4) + 2 * ((u + 0.5) / 8), 6)
    for (let u = 4; u < 8; u++) expect(joined[16 + u]).toBeCloseTo(2 * ((u + 0.5) / 8), 6)
    // With no handles at all, each side fades on its own half: out to the join, in from it.
    const bare = joinChannel(filled(20, 1), EMPTY, filled(20, 1), EMPTY, { frames: 8, curve: 'linear' })
    expect(Array.from(bare.subarray(16, 24), (value) => +value.toFixed(4))).toEqual([0.875, 0.625, 0.375, 0.125, 0.125, 0.375, 0.625, 0.875])
    expect([bare[15], bare[24]]).toEqual([1, 1])
  })

  it("doesn't reach past the parts' ends", () => {
    const joined = joinChannel(filled(2, 1), filled(10, 1), filled(3, 1), filled(10, 1), { frames: 20, curve: 'linear' })
    expect(joined).toHaveLength(5)
    for (const value of joined) expect(value).toBeCloseTo(1, 6)
  })
})

const stereo = (frames: number): SampleAudio => ({ sampleRate: 1000, channels: [ramp(frames), ramp(frames, 1000)] })
const mono = (frames: number): SampleAudio => ({ sampleRate: 1000, channels: [ramp(frames)] })
const fade = { frames: 10, curve: 'linear' } as const

describe('the structure edits', () => {
  it('give exactly the length they should, with or without a crossfade', () => {
    const audio = stereo(1000)
    const pasted = copyAudioRange(audio, { from: 100, to: 250 }, [0, 1])
    for (const crossfade of [fade, { frames: 0, curve: 'linear' } as const]) {
      expect(frameCount(applySampleEdit(audio, { kind: 'delete', range: { from: 200, to: 500 }, crossfade }))).toBe(700)
      expect(frameCount(applySampleEdit(audio, { kind: 'insert', at: 400, insert: silenceCopy(123, 1000, 2), crossfade }))).toBe(1123)
      expect(frameCount(applySampleEdit(audio, { kind: 'replace', range: { from: 600, to: 700 }, insert: pasted, crossfade }))).toBe(1050)
      expect(frameCount(applySampleEdit(audio, { kind: 'replace', range: { from: 600, to: 600 }, insert: pasted, crossfade }))).toBe(1150)
    }
    expect(frameCount(applySampleEdit(audio, { kind: 'crop', range: { from: 300, to: 420 } }))).toBe(120)
  })

  it('crop keeps the selection bit for bit: nothing is joined', () => {
    const audio = stereo(100)
    const cropped = applySampleEdit(audio, { kind: 'crop', range: { from: 30, to: 60 } })
    expect(cropped.channels.map((channel) => Array.from(channel))).toEqual(audio.channels.map((channel) => Array.from(channel.subarray(30, 60))))
  })

  it('delete at 0 ms is the plain cut, and with a crossfade changes only the frames around the join', () => {
    const audio = stereo(1000)
    const plain = applySampleEdit(audio, { kind: 'delete', range: { from: 200, to: 500 }, crossfade: { frames: 0, curve: 'linear' } })
    expect(Array.from(plain.channels[1]!)).toEqual([...audio.channels[1]!.subarray(0, 200), ...audio.channels[1]!.subarray(500)])
    const faded = applySampleEdit(audio, { kind: 'delete', range: { from: 200, to: 500 }, crossfade: fade })
    for (let k = 0; k < 700; k++) if (k < 195 || k >= 205) expect(faded.channels[0]![k], `${k}`).toBe(plain.channels[0]![k])
  })

  it('copies with up to 50 ms of handles on each side, on the selected channels', () => {
    const audio = stereo(1000)
    const copy = copyAudioRange(audio, { from: 20, to: 200 }, [1])
    expect(copy.audio.channels.map((channel) => channel.length)).toEqual([180])
    expect(copy.handles.before.channels[0]).toHaveLength(20)
    expect(copy.handles.after.channels[0]).toHaveLength(CLIPBOARD_HANDLE_SECONDS * 1000)
    expect(Array.from(copy.audio.channels[0]!)).toEqual(Array.from(audio.channels[1]!.subarray(20, 200)))
  })

  it('pastes a mono copy into both channels of a stereo sample, and a stereo copy into a mono one as its average', () => {
    const butt = { frames: 0, curve: 'linear' } as const
    const monoCopy: AudioCopy = copyAudioRange(mono(100), { from: 10, to: 30 }, [0])
    const intoStereo = applySampleEdit(stereo(50), { kind: 'replace', range: { from: 5, to: 5 }, insert: monoCopy, crossfade: butt })
    expect(intoStereo.channels).toHaveLength(2)
    for (const channel of intoStereo.channels) expect(Array.from(channel.subarray(5, 25))).toEqual(Array.from(monoCopy.audio.channels[0]!))

    const source = stereo(100)
    const stereoCopy = copyAudioRange(source, { from: 10, to: 30 }, [0, 1])
    const intoMono = applySampleEdit(mono(50), { kind: 'replace', range: { from: 5, to: 5 }, insert: stereoCopy, crossfade: butt })
    expect(intoMono.channels).toHaveLength(1)
    expect(Array.from(intoMono.channels[0]!.subarray(5, 25))).toEqual(Array.from({ length: 20 }, (_, i) => monoAt(stereoCopy.audio, i)))
  })

  it('crossfades a paste into the audio around it, using the copy’s handles', () => {
    const audio: SampleAudio = { sampleRate: 1000, channels: [filled(200, 1)] }
    const copy: AudioCopy = {
      audio: { sampleRate: 1000, channels: [filled(50, 1)] },
      handles: { before: { sampleRate: 1000, channels: [filled(50, 1)] }, after: { sampleRate: 1000, channels: [filled(50, 1)] } },
    }
    // The same level everywhere, with handles on every side: a linear crossfade is seamless.
    const pasted = applySampleEdit(audio, { kind: 'replace', range: { from: 80, to: 120 }, insert: copy, crossfade: fade })
    expect(frameCount(pasted)).toBe(210)
    for (const value of pasted.channels[0]!) expect(value).toBeCloseTo(1, 6)
  })
})
