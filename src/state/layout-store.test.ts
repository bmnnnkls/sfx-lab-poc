import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_REGIONS, useLayoutStore } from './layout-store'
import { openAutomationSlot, openClip, openMasterEffects, openTrackView } from './navigation'
import { useSelectionStore } from './selection-store'

const regions = () => useLayoutStore.getState().regions
const layout = () => useLayoutStore.getState()

afterEach(() => {
  useLayoutStore.setState({ regions: DEFAULT_REGIONS })
  useSelectionStore.getState().reset()
})

describe('layout store', () => {
  it("starts on today's layout: session above, instrument below", () => {
    expect(regions().main).toEqual({ views: ['session', 'arrangement'], active: 'session' })
    expect(regions().panel).toEqual({
      views: ['instrument', 'effects', 'notes', 'clip', 'mixer', 'samples', 'sounds', 'library'],
      active: 'instrument',
    })
  })

  it('reveals a view in the region that holds it and leaves the other region alone', () => {
    layout().revealView('mixer')
    expect(regions().panel.active).toBe('mixer')
    expect(regions().main.active).toBe('session')
    layout().revealView('arrangement')
    expect(regions().main.active).toBe('arrangement')
    expect(regions().panel.active).toBe('mixer')
  })

  it('keeps the same state when the view is already showing', () => {
    const before = regions()
    layout().revealView('instrument')
    expect(regions()).toBe(before)
  })

  it('toggles the main view back and forth', () => {
    layout().toggleMainView()
    expect(regions().main.active).toBe('arrangement')
    layout().toggleMainView()
    expect(regions().main.active).toBe('session')
  })

  it('resets the panel to Instrument and keeps the main view', () => {
    layout().revealView('library')
    layout().revealView('arrangement')
    layout().resetPanel()
    expect(regions().panel.active).toBe('instrument')
    expect(regions().main.active).toBe('arrangement')
  })
})

describe('navigation intents', () => {
  it('openClip selects the clip and shows Clip', () => {
    openClip('t', 'c')
    expect(useSelectionStore.getState()).toMatchObject({ trackId: 't', clipId: 'c', master: false })
    expect(regions().panel.active).toBe('clip')
  })

  it('openTrackView selects the track and shows the given view', () => {
    openTrackView('t', 'effects')
    expect(useSelectionStore.getState()).toMatchObject({ trackId: 't', master: false })
    expect(regions().panel.active).toBe('effects')
    openTrackView('u', 'notes')
    expect(useSelectionStore.getState().trackId).toBe('u')
    expect(regions().panel.active).toBe('notes')
  })

  it('openMasterEffects selects the master and shows Effects', () => {
    openTrackView('t', 'instrument')
    openMasterEffects()
    expect(useSelectionStore.getState()).toMatchObject({ master: true, trackId: null })
    expect(regions().panel.active).toBe('effects')
  })

  it('openAutomationSlot selects the owner and scene and shows Clip', () => {
    openClip('t', 'c')
    layout().revealView('mixer')
    openAutomationSlot({ kind: 'track', trackId: 'r' }, 2)
    expect(useSelectionStore.getState()).toMatchObject({ trackId: 'r', master: false, clipId: null, automationScene: 2 })
    expect(regions().panel.active).toBe('clip')
    openAutomationSlot({ kind: 'master' }, 1)
    expect(useSelectionStore.getState()).toMatchObject({ trackId: null, master: true, automationScene: 1 })
  })
})
