/** Averages any number of channels into one. */
export const toMono = (channels: readonly Float32Array[]): Float32Array => {
  const first = channels[0]
  if (!first) return new Float32Array(0)
  if (channels.length === 1) return Float32Array.from(first)

  const mono = new Float32Array(first.length)
  for (const channel of channels) {
    for (let i = 0; i < mono.length; i++) mono[i] = (mono[i] ?? 0) + (channel[i] ?? 0)
  }
  for (let i = 0; i < mono.length; i++) mono[i] = (mono[i] ?? 0) / channels.length
  return mono
}

/** Largest absolute value in each of `buckets` equal slices; for drawing waveform thumbnails. */
export const computePeaks = (data: Float32Array, buckets: number): Float32Array => {
  const peaks = new Float32Array(buckets)
  if (data.length === 0) return peaks
  for (let bucket = 0; bucket < buckets; bucket++) {
    const start = Math.floor((bucket * data.length) / buckets)
    const end = Math.max(start + 1, Math.floor(((bucket + 1) * data.length) / buckets))
    let peak = 0
    for (let i = start; i < end; i++) peak = Math.max(peak, Math.abs(data[i] ?? 0))
    peaks[bucket] = peak
  }
  return peaks
}
