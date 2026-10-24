import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, type LayoutSnapshot } from '@state'
import { groupToFocus } from './group-focus'

const split: LayoutSnapshot = {
  groups: [
    { id: 'editor', region: 'editor', views: ['session', 'arrangement'], active: 'session' },
    { id: 'right', region: 'editor', views: ['mixer'], active: 'mixer' },
    { id: 'panel', region: 'panel', views: ['instrument', 'clip'], active: 'clip' },
  ],
  visible: ['session', 'mixer', 'clip'],
  hiddenRegions: ['primary', 'secondary'],
}

describe('groupToFocus', () => {
  it('moves between the editor area and the panel, wrapping around', () => {
    expect(groupToFocus(DEFAULT_LAYOUT, 'session', 1)).toBe('instrument')
    expect(groupToFocus(DEFAULT_LAYOUT, 'instrument', 1)).toBe('session')
    expect(groupToFocus(DEFAULT_LAYOUT, 'instrument', -1)).toBe('session')
  })

  it('goes through split editor groups in order, from any view of a group', () => {
    expect(groupToFocus(split, 'arrangement', 1)).toBe('mixer')
    expect(groupToFocus(split, 'mixer', 1)).toBe('clip')
    expect(groupToFocus(split, 'instrument', -1)).toBe('mixer')
  })

  it('starts at the first group, or the last going back, from outside every group', () => {
    expect(groupToFocus(split, undefined, 1)).toBe('session')
    expect(groupToFocus(split, undefined, -1)).toBe('clip')
  })

  it('skips a hidden or collapsed panel', () => {
    expect(groupToFocus({ ...DEFAULT_LAYOUT, visible: ['session'], hiddenRegions: ['panel', 'primary', 'secondary'] }, 'session', 1)).toBe('session')
    expect(groupToFocus({ groups: [], visible: [], hiddenRegions: [] }, undefined, 1)).toBeUndefined()
  })
})
