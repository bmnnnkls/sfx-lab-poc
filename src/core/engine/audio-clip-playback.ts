/**
 * Where in the sample (in sample frames) an audio clip should be `beatsSinceStart` beats after it started, in
 * re-pitch mode. Derived from the beat clock rather than accumulated sample by sample, so the clip stays
 * locked to the grid for good: it cannot drift and follows tempo changes without a seam.
 * Returns null once a non-looping clip has finished.
 */
export const repitchPosition = (
  beatsSinceStart: number,
  lengthBeats: number,
  loop: boolean,
  sampleLength: number,
): number | null => {
  // The start frame is rounded to the nearest sample, so we can be a hair early; treat that as the start.
  const beats = Math.max(0, beatsSinceStart)
  if (!loop && beats >= lengthBeats) return null
  const phase = loop ? beats % lengthBeats : beats
  return (phase / lengthBeats) * sampleLength
}

/** Linearly interpolated sample value at a fractional `position`; wraps past the end when `loop` is set. */
export const readInterpolated = (data: Float32Array, position: number, loop: boolean): number => {
  const index = Math.floor(position)
  const fraction = position - index
  const next = index + 1 < data.length ? index + 1 : loop ? 0 : -1
  const a = data[index] ?? 0
  const b = next >= 0 ? (data[next] ?? 0) : 0
  return a + (b - a) * fraction
}
