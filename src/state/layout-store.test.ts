import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_LAYOUT, type GroupState, type LayoutDriver, type RegionId, type ViewId, groupIn, useLayoutStore } from './layout-store'
import { openAutomationSlot, openClip, openMasterEffects, openSampleEditor, openTrackView } from './navigation'
import { useSelectionStore } from './selection-store'

const layout = () => useLayoutStore.getState()
const active = (region: RegionId) => groupIn(layout(), region)?.active

let detach: (() => void) | undefined
afterEach(() => {
  detach?.()
  detach = undefined
  useLayoutStore.setState(DEFAULT_LAYOUT)
  useSelectionStore.getState().reset()
})

/** A driver that records its calls, as the shell would receive them. */
const recordingDriver = () => {
  const driver: LayoutDriver = { reveal: vi.fn(), setRegionVisible: vi.fn(), reset: vi.fn() }
  detach = layout().attachDriver(driver)
  return driver
}

const group = (id: string, region: RegionId, views: readonly ViewId[], current: ViewId): GroupState => ({ id, region, views, active: current })

describe('layout store without a driver', () => {
  it("starts on today's layout: session above, instrument below, the sidebars hidden", () => {
    expect(layout().groups).toEqual([
      group('editor', 'editor', ['session', 'arrangement'], 'session'),
      group('panel', 'panel', ['instrument', 'effects', 'notes', 'clip', 'mixer', 'samples', 'sounds', 'library'], 'instrument'),
    ])
    expect(layout().visible).toEqual(['session', 'instrument'])
    expect(layout().hiddenRegions).toEqual(['primary', 'secondary'])
  })

  it('reveals a view in the group that holds it and leaves the other group alone', () => {
    layout().revealView('mixer')
    expect(active('panel')).toBe('mixer')
    expect(active('editor')).toBe('session')
    layout().revealView('arrangement')
    expect(active('editor')).toBe('arrangement')
    expect(active('panel')).toBe('mixer')
    expect(layout().visible).toEqual(['arrangement', 'mixer'])
  })

  it('keeps the same state when the view is already showing', () => {
    const before = layout().groups
    layout().revealView('instrument')
    expect(layout().groups).toBe(before)
  })

  it('shows a hidden region to reveal a view in it', () => {
    layout().toggleRegion('panel')
    expect(layout().hiddenRegions).toContain('panel')
    expect(layout().visible).toEqual(['session'])
    layout().revealView('instrument')
    expect(layout().hiddenRegions).not.toContain('panel')
    expect(layout().visible).toEqual(['session', 'instrument'])
  })

  it('toggles a region but never the editor area', () => {
    layout().toggleRegion('editor')
    expect(layout().hiddenRegions).toEqual(['primary', 'secondary'])
    layout().toggleRegion('primary')
    expect(layout().hiddenRegions).toEqual(['secondary'])
  })

  it('resets to the default layout', () => {
    layout().revealView('library')
    layout().toggleRegion('panel')
    layout().resetLayout()
    expect(layout()).toMatchObject(DEFAULT_LAYOUT)
  })
})

describe('toggleMainView', () => {
  it('shows the main view that is not showing', () => {
    layout().toggleMainView()
    expect(active('editor')).toBe('arrangement')
    layout().toggleMainView()
    expect(active('editor')).toBe('session')
  })

  it('does nothing when both main views are showing side by side', () => {
    layout().sync({
      groups: [group('a', 'editor', ['session'], 'session'), group('b', 'editor', ['arrangement'], 'arrangement')],
      visible: ['session', 'arrangement'],
      hiddenRegions: [],
    })
    const before = layout().groups
    layout().toggleMainView()
    expect(layout().groups).toBe(before)
  })

  it('shows Session when neither main view is showing', () => {
    layout().sync({ groups: [group('a', 'panel', ['session', 'arrangement', 'mixer'], 'mixer')], visible: ['mixer'], hiddenRegions: [] })
    layout().toggleMainView()
    expect(layout().visible).toEqual(['session'])
  })
})

describe('layout store with a driver', () => {
  it('forwards revealView, toggleRegion and resetLayout to the driver and leaves the mirror to sync', () => {
    const driver = recordingDriver()
    layout().revealView('mixer')
    expect(driver.reveal).toHaveBeenCalledWith('mixer')
    expect(active('panel')).toBe('instrument')
    layout().toggleRegion('panel')
    expect(driver.setRegionVisible).toHaveBeenCalledWith('panel', false)
    layout().toggleRegion('primary')
    expect(driver.setRegionVisible).toHaveBeenCalledWith('primary', true)
    layout().resetLayout()
    expect(driver.reset).toHaveBeenCalledOnce()
  })

  it('toggles the main view from the mirror the driver syncs', () => {
    const driver = recordingDriver()
    layout().toggleMainView()
    expect(driver.reveal).toHaveBeenLastCalledWith('arrangement')
    layout().sync({ ...DEFAULT_LAYOUT, visible: ['arrangement', 'instrument'] })
    layout().toggleMainView()
    expect(driver.reveal).toHaveBeenLastCalledWith('session')
  })

  it('keeps the mirror\'s references when a sync changes nothing', () => {
    const before = layout()
    layout().sync({ groups: before.groups.map((g) => ({ ...g, views: [...g.views] })), visible: [...before.visible], hiddenRegions: [...before.hiddenRegions] })
    expect(layout().groups).toBe(before.groups)
    expect(layout().visible).toBe(before.visible)
    expect(layout().hiddenRegions).toBe(before.hiddenRegions)
    layout().sync({ ...DEFAULT_LAYOUT, visible: ['session'] })
    expect(layout().visible).toEqual(['session'])
    expect(layout().groups).toBe(before.groups)
  })

  it('stops forwarding once detached, and a stale detach leaves a newer driver attached', () => {
    const first = recordingDriver()
    const detachFirst = detach!
    const second = recordingDriver()
    detachFirst()
    layout().revealView('mixer')
    expect(second.reveal).toHaveBeenCalledWith('mixer')
    expect(first.reveal).not.toHaveBeenCalled()
    detach!()
    layout().revealView('notes')
    expect(active('panel')).toBe('notes')
  })
})

describe('navigation intents', () => {
  it('openClip selects the clip and shows Clip', () => {
    openClip('t', 'c')
    expect(useSelectionStore.getState()).toMatchObject({ trackId: 't', clipId: 'c', master: false })
    expect(active('panel')).toBe('clip')
  })

  it('openTrackView selects the track and shows the given view', () => {
    openTrackView('t', 'effects')
    expect(useSelectionStore.getState()).toMatchObject({ trackId: 't', master: false })
    expect(active('panel')).toBe('effects')
    openTrackView('u', 'notes')
    expect(useSelectionStore.getState().trackId).toBe('u')
    expect(active('panel')).toBe('notes')
  })

  it('openMasterEffects selects the master and shows Effects', () => {
    openTrackView('t', 'instrument')
    openMasterEffects()
    expect(useSelectionStore.getState()).toMatchObject({ master: true, trackId: null })
    expect(active('panel')).toBe('effects')
  })

  it('openAutomationSlot selects the owner and scene and shows Clip', () => {
    openClip('t', 'c')
    layout().revealView('mixer')
    openAutomationSlot({ kind: 'track', trackId: 'r' }, 2)
    expect(useSelectionStore.getState()).toMatchObject({ trackId: 'r', master: false, clipId: null, automationScene: 2 })
    expect(active('panel')).toBe('clip')
    openAutomationSlot({ kind: 'master' }, 1)
    expect(useSelectionStore.getState()).toMatchObject({ trackId: null, master: true, automationScene: 1 })
  })

  it('openSampleEditor selects the sample and shows Samples; switching views keeps it, reset clears it', () => {
    openSampleEditor('s')
    expect(useSelectionStore.getState().sampleId).toBe('s')
    expect(active('panel')).toBe('samples')
    layout().revealView('mixer')
    expect(useSelectionStore.getState().sampleId).toBe('s')
    useSelectionStore.getState().selectSample(null)
    expect(useSelectionStore.getState().sampleId).toBeNull()
    openSampleEditor('s')
    useSelectionStore.getState().reset()
    expect(useSelectionStore.getState().sampleId).toBeNull()
  })
})
