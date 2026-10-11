import { toMono } from '@core'

/** Longest clip we accept; decoded audio is held in memory as 32-bit floats. */
export const MAX_SAMPLE_SECONDS = 120

/** decodeAudioData resamples to the context's rate; any rate works as the engine adapts at playback. */
const DECODE_SAMPLE_RATE = 48000

export interface DecodedAudio {
  readonly mono: Float32Array
  readonly sampleRate: number
  readonly channels: number
  readonly durationSeconds: number
}

/**
 * Decodes wav / mp3 / ogg / flac / … into mono floats. Uses an OfflineAudioContext, which
 * (unlike a normal AudioContext) needs no user gesture, so saved samples can load at startup.
 */
export const decodeAudio = async (bytes: Uint8Array): Promise<DecodedAudio> => {
  const context = new OfflineAudioContext(1, 1, DECODE_SAMPLE_RATE)
  // decodeAudioData may detach the buffer it is given, so hand it a copy.
  const buffer = await context.decodeAudioData(bytes.slice().buffer)

  if (buffer.duration > MAX_SAMPLE_SECONDS) {
    throw new Error(`Samples longer than ${MAX_SAMPLE_SECONDS} seconds are not supported`)
  }
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i))
  return {
    mono: toMono(channels),
    sampleRate: buffer.sampleRate,
    channels: buffer.numberOfChannels,
    durationSeconds: buffer.duration,
  }
}
