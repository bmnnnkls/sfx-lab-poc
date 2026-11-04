import { type SampleAudio, toMono } from '@core'

/** Longest clip we accept; decoded audio is held in memory as 32-bit floats. */
export const MAX_SAMPLE_SECONDS = 120

/** decodeAudioData resamples to the context's rate; any rate works as the engine adapts at playback. */
const DECODE_SAMPLE_RATE = 48000

export interface DecodedAudio {
  /** One or two channels, each a buffer of its own (so it can be transferred). */
  readonly audio: SampleAudio
  /** The file's channel count, which may be more than `audio` keeps. */
  readonly channels: number
  readonly durationSeconds: number
}

/** Which of a file's channels a sample keeps: one or two as they are, more averaged to one. Copies, never views. */
export const keepChannels = (channels: readonly Float32Array[]): Float32Array[] =>
  channels.length <= 2 ? channels.map((channel) => channel.slice()) : [toMono(channels)]

/**
 * Decodes wav / mp3 / ogg / flac / … into floats. Uses an OfflineAudioContext, which
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
    audio: { sampleRate: buffer.sampleRate, channels: keepChannels(channels) },
    channels: buffer.numberOfChannels,
    durationSeconds: buffer.duration,
  }
}
