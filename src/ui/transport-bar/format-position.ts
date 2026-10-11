const BEATS_PER_BAR = 4

/** Formats a beat count as `bar.beat` (both 1-based), e.g. 5.25 -> "2.2". */
export const formatPosition = (beat: number): string => {
  const bar = Math.floor(beat / BEATS_PER_BAR) + 1
  const inBar = Math.floor(beat % BEATS_PER_BAR) + 1
  return `${bar}.${inBar}`
}
