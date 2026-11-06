import type { TrackRow } from '@core'
import { describe, expect, it } from 'vitest'
import { revealKeys } from './reveal'

const track = (id: string, depth: number) => ({ kind: 'track', track: { id }, depth }) as unknown as TrackRow
const group = (id: string, depth: number) => ({ kind: 'group', group: { id }, depth, trackIds: [] }) as unknown as TrackRow

describe('revealKeys', () => {
  // drums (kick, perc (shaker)), bass
  const rows = [group('drums', 0), track('kick', 1), group('perc', 1), track('shaker', 2), track('bass', 0)]

  it('is the row itself, then the groups around it from the innermost out', () => {
    expect(revealKeys(rows, 'track', 'shaker')).toEqual(['t:shaker', 'g:perc', 'g:drums'])
    expect(revealKeys(rows, 'track', 'kick')).toEqual(['t:kick', 'g:drums'])
    expect(revealKeys(rows, 'group', 'perc')).toEqual(['g:perc', 'g:drums'])
    expect(revealKeys(rows, 'track', 'bass')).toEqual(['t:bass'])
  })

  it('is empty for a row that is not there', () => {
    expect(revealKeys(rows, 'track', 'gone')).toEqual([])
  })
})
