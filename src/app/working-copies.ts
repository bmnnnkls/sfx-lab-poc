import { decodedBytes } from '@core'
import type { WaveAudio } from '@state'

/**
 * Working copies of samples recently open in the Wave editor (not the open one), so undo, redo and reopening don't
 * decode again. Least recently used first out, once the decoded audio passes `budget` bytes; one bigger than the
 * budget isn't kept. Plain JS: nothing renders from it.
 */
export interface WorkingCopies {
  get(sampleId: string): WaveAudio | undefined
  put(copy: WaveAudio): void
  readonly bytes: number
}

export const createWorkingCopies = (budget: number): WorkingCopies => {
  const copies = new Map<string, WaveAudio>()
  let bytes = 0
  const drop = (sampleId: string) => {
    const copy = copies.get(sampleId)
    if (!copy) return
    copies.delete(sampleId)
    bytes -= decodedBytes(copy.audio)
  }
  return {
    get: (sampleId) => {
      const copy = copies.get(sampleId)
      if (!copy) return undefined
      // Now the most recently used.
      copies.delete(sampleId)
      copies.set(sampleId, copy)
      return copy
    },
    put: (copy) => {
      drop(copy.sampleId)
      const size = decodedBytes(copy.audio)
      if (size > budget) return
      copies.set(copy.sampleId, copy)
      bytes += size
      for (const sampleId of copies.keys()) {
        if (bytes <= budget) break
        drop(sampleId)
      }
    },
    get bytes() {
      return bytes
    },
  }
}
