import type { SampleAudio } from './types'

/**
 * The only ways engine code reads a sample's channels. Playing everything as mono again, or reading more channels,
 * is a change here and nowhere else.
 */

/** Which channel a stereo read wants: 0 left, 1 right. A mono sample gives its one channel for both. */
export type SampleChannel = 0 | 1

/** How many frames the sample has. */
export const frameCount = (audio: SampleAudio): number => audio.channels[0]?.length ?? 0

/** How much memory the decoded audio takes: 4 bytes per frame and channel. What the caches' budgets count. */
export const decodedBytes = (audio: SampleAudio): number => frameCount(audio) * audio.channels.length * 4

/**
 * The sample's mono value at `index`, 0 outside it: the one channel, or the average of two. The same arithmetic as
 * `toMono` (the sum rounded to 32 bits, then halved and rounded), so a stereo file reads what the old mix gave, bit for bit.
 */
export const monoAt = (audio: SampleAudio, index: number): number => {
  const { channels } = audio
  const left = channels[0]?.[index] ?? 0
  if (channels.length < 2) return left
  return Math.fround(Math.fround(left + (channels[1]?.[index] ?? 0)) / 2)
}

/** One channel's value at `index`, 0 outside it. A mono sample is the same in both. */
export const channelAt = (audio: SampleAudio, channel: SampleChannel, index: number): number =>
  (audio.channels[channel] ?? audio.channels[0])?.[index] ?? 0
