import { type SampleAudio, buildPeakPyramid, decodedBytes } from '@core'
import type { WaveAudio } from '@state'
import { describe, expect, it } from 'vitest'
import { createWorkingCopies } from './working-copies'

const copy = (sampleId: string, frames: number): WaveAudio => {
  const audio: SampleAudio = { sampleRate: 48000, channels: [new Float32Array(frames)] }
  return { sampleId, viewKey: sampleId, audio, pyramid: buildPeakPyramid(audio) }
}

describe('the working copies', () => {
  it('keeps the most recently used inside the budget, and lets the least recently used go first', () => {
    const copies = createWorkingCopies(decodedBytes(copy('a', 100).audio) * 2)
    copies.put(copy('a', 100))
    copies.put(copy('b', 100))
    expect(copies.get('a')?.sampleId).toBe('a')
    copies.put(copy('c', 100))
    expect([copies.get('a'), copies.get('b'), copies.get('c')].map((entry) => entry?.sampleId)).toEqual(['a', undefined, 'c'])
    expect(copies.bytes).toBe(800)
  })

  it("doesn't keep one bigger than the budget, and replaces one put again", () => {
    const copies = createWorkingCopies(400)
    copies.put(copy('big', 101))
    expect(copies.get('big')).toBeUndefined()
    copies.put(copy('a', 50))
    copies.put(copy('a', 100))
    expect(copies.bytes).toBe(400)
  })
})
