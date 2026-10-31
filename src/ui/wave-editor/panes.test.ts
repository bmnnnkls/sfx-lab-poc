import { DEFAULT_SECOND_PANE } from '@state'
import { describe, expect, it } from 'vitest'
import { clampShare } from './PaneSplitter'
import { readSecondPane } from './use-wave-panes-storage'

describe('the second pane in storage', () => {
  it('reads what was saved', () => {
    expect(readSecondPane('{"open":true,"sampleId":"abc","share":0.3}')).toEqual({ open: true, sampleId: 'abc', share: 0.3 })
    expect(readSecondPane('{"open":false,"sampleId":null,"share":0.5}')).toEqual(DEFAULT_SECOND_PANE)
  })

  it('keeps the default for a missing, unreadable or bad field, and a share inside 10 % to 90 %', () => {
    expect(readSecondPane(null)).toEqual(DEFAULT_SECOND_PANE)
    expect(readSecondPane('not json')).toEqual(DEFAULT_SECOND_PANE)
    expect(readSecondPane('[1]')).toEqual({ ...DEFAULT_SECOND_PANE })
    expect(readSecondPane('{"open":"yes","sampleId":3,"share":"half"}')).toEqual(DEFAULT_SECOND_PANE)
    expect(readSecondPane('{"open":true}')).toEqual({ ...DEFAULT_SECOND_PANE, open: true })
    expect(readSecondPane('{"share":0}').share).toBe(0.1)
    expect(readSecondPane('{"share":2}').share).toBe(0.9)
  })
})

describe('the splitter', () => {
  it('keeps each pane at its minimum', () => {
    expect(clampShare(0.5, 400, 100, 100)).toBe(0.5)
    expect(clampShare(0.1, 400, 100, 100)).toBe(0.25)
    expect(clampShare(0.9, 400, 100, 120)).toBe(0.7)
  })

  it("shares what there is in proportion when the two minimums don't fit", () => {
    expect(clampShare(0.9, 150, 100, 100)).toBe(0.5)
    expect(clampShare(0.2, 150, 120, 80)).toBe(0.6)
  })

  it('leaves the share alone before the panes have a height', () => {
    expect(clampShare(0.3, 0, 100, 100)).toBe(0.3)
  })
})
