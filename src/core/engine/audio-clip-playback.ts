/** The slice of a sample that plays, in (fractional) sample frames. */
export interface Region {
  readonly startPos: number
  readonly endPos: number
}

export const regionOf = (start: number, end: number, sampleLength: number): Region => {
  const startPos = start * sampleLength
  return { startPos, endPos: Math.max(startPos + 1, end * sampleLength) }
}

/**
 * Where in the sample (in sample frames) an audio clip should be `beatsSinceStart` beats after it started, in
 * re-pitch mode: the played region is stretched evenly over `lengthBeats`. Derived from the beat clock rather than
 * accumulated sample by sample, so the clip stays locked to the grid for good: it cannot drift and follows tempo
 * changes without a seam. Returns null once a non-looping clip has finished.
 */
export const repitchPosition = (
  beatsSinceStart: number,
  lengthBeats: number,
  loop: boolean,
  region: Region,
): number | null => {
  // The start frame is rounded to the nearest sample, so we can be a hair early; treat that as the start.
  const beats = Math.max(0, beatsSinceStart)
  if (!loop && beats >= lengthBeats) return null
  const phase = loop ? beats % lengthBeats : beats
  return region.startPos + (phase / lengthBeats) * (region.endPos - region.startPos)
}

/**
 * Linearly interpolated sample value at a fractional `position` inside `region`. At the end of the region it
 * blends towards the region's start when looping (so loop seams are continuous) or towards silence otherwise.
 */
export const readRegion = (data: Float32Array, position: number, region: Region, loop: boolean): number => {
  const index = Math.floor(position)
  const fraction = position - index
  const endIndex = Math.min(data.length, Math.ceil(region.endPos))
  const next = index + 1 < endIndex ? index + 1 : loop ? Math.floor(region.startPos) : -1
  const a = data[index] ?? 0
  const b = next >= 0 ? (data[next] ?? 0) : 0
  return a + (b - a) * fraction
}

/**
 * Gain (0..1) for the fades at each end of a pass through the region. Computed from the read position, so a fade
 * lasts the same amount of *sample* time whatever the tempo or warp mode. Each fade is capped at half the region,
 * so they can never overlap.
 */
export const fadeGain = (position: number, region: Region, fadeInFrames: number, fadeOutFrames: number): number => {
  const half = (region.endPos - region.startPos) / 2
  const fadeIn = Math.min(fadeInFrames, half)
  const fadeOut = Math.min(fadeOutFrames, half)
  const rising = fadeIn > 0 ? (position - region.startPos) / fadeIn : 1
  const falling = fadeOut > 0 ? (region.endPos - position) / fadeOut : 1
  return Math.max(0, Math.min(1, rising, falling))
}
