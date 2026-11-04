import { describe, expect, it, vi } from 'vitest'
import type { LayoutSnapshot } from '@state'
import { Actions, BorderNode, DockLocation, type IJsonModel, type IJsonTabSetNode, Model, TabNode, TabSetNode } from 'flexlayout-react'
import { defaultLayout } from './default-layout'
import { FlexLayoutDriver } from './layout-driver'

const PANEL_VIEWS = ['instrument', 'effects', 'notes', 'clip', 'mixer']

const driverFor = (json: IJsonModel = defaultLayout()) => {
  const published: LayoutSnapshot[] = []
  const shell = { reset: vi.fn(), load: vi.fn(), loadPreset: vi.fn(), saveAs: vi.fn() }
  const driver = new FlexLayoutDriver(Model.fromJson(json), (snapshot) => published.push(snapshot), shell)
  return { driver, model: driver.model, published, shell, last: () => published[published.length - 1]! }
}
/** The panel's tab group in a default layout's JSON. */
const panelJson = (json: IJsonModel) => json.layout.children![0]!.children![1] as IJsonTabSetNode
const panel = (model: Model) => model.getNodeById('panel') as TabSetNode
const collapsed = (model: Model) => panel(model).getAttrMaxHeight() === 0
/** A user action, as flexlayout's `onAction` passes it through the driver. */
const user = (driver: FlexLayoutDriver, action: ReturnType<typeof Actions.selectTab>) => {
  driver.model.doAction(driver.intercept(action))
  driver.sync()
}

describe('FlexLayoutDriver', () => {
  it('mirrors the default layout', () => {
    const { driver } = driverFor()
    expect(driver.snapshot()).toEqual({
      groups: [
        { id: 'editor', region: 'editor', views: ['session', 'arrangement', 'wave'], active: 'session' },
        { id: 'panel', region: 'panel', views: PANEL_VIEWS, active: 'instrument' },
        { id: 'border_left', region: 'primary', views: ['samples', 'library', 'tracks'], active: 'samples' },
        { id: 'border_right', region: 'secondary', views: ['sounds', 'pinned'], active: 'sounds' },
      ],
      visible: ['session', 'instrument'],
      hiddenRegions: ['primary', 'secondary'],
    })
  })

  it('reveals a view in a group or the panel and publishes the result', () => {
    const { driver, model, last } = driverFor()
    driver.reveal('arrangement')
    driver.reveal('mixer')
    expect(last().visible).toEqual(['arrangement', 'mixer'])
    driver.reveal('mixer')
    expect(panel(model).getSelectedNode()?.getId()).toBe('mixer')
    expect(collapsed(model)).toBe(false)
  })

  it('collapses the panel to its strip and expands it with its weight, counting it hidden meanwhile', () => {
    const { driver, model, last } = driverFor()
    driver.setRegionVisible('panel', false)
    expect(collapsed(model)).toBe(true)
    expect(last()).toMatchObject({ visible: ['session'], hiddenRegions: ['panel', 'primary', 'secondary'] })
    // The open tab stays selected and the group stays in the mirror.
    expect(last().groups[1]).toMatchObject({ region: 'panel', active: 'instrument' })
    driver.setRegionVisible('panel', true)
    expect(collapsed(model)).toBe(false)
    expect(panel(model).getWeight()).toBe(52)
    expect(last()).toMatchObject({ visible: ['session', 'instrument'], hiddenRegions: ['primary', 'secondary'] })
  })

  it('expands a collapsed panel to reveal a view in it', () => {
    const { driver, model, last } = driverFor()
    driver.setRegionVisible('panel', false)
    driver.reveal('notes')
    expect(collapsed(model)).toBe(false)
    expect(last()).toMatchObject({ visible: ['session', 'notes'], hiddenRegions: ['primary', 'secondary'] })
    // The panel's open tab too.
    driver.setRegionVisible('panel', false)
    driver.reveal('notes')
    expect(last().visible).toEqual(['session', 'notes'])
  })

  it("collapses the panel when its open tab is clicked, and expands it on the next click or another tab's", () => {
    const { driver, model, last } = driverFor()
    driver.clickTab('instrument')
    expect(last().hiddenRegions).toContain('panel')
    driver.clickTab('instrument')
    expect(last().hiddenRegions).not.toContain('panel')

    driver.clickTab('instrument')
    // flexlayout selects a tab that isn't open; the driver adds the expand.
    driver.clickTab('clip')
    user(driver, Actions.selectTab('clip'))
    expect(collapsed(model)).toBe(false)
    expect(last().visible).toEqual(['session', 'clip'])

    // Clicks elsewhere change nothing: the editor area's open tab, and a tab that isn't open.
    driver.clickTab('session')
    driver.clickTab('mixer')
    expect(collapsed(model)).toBe(false)
  })

  it("clears the minimum height of the tabs a collapsed panel squeezes, and puts it back on expanding", () => {
    const { driver, model } = driverFor()
    const minHeight = (id: string) => (model.getNodeById(id) as TabNode).getMinHeight()
    model.doAction(Actions.moveNode('mixer', 'panel', DockLocation.RIGHT, -1))
    driver.setRegionVisible('panel', false)
    // The panel's tabs, and those of the group beside it that collapses with it.
    expect(PANEL_VIEWS.map(minHeight)).toEqual(PANEL_VIEWS.map(() => 0))
    expect(minHeight('session')).toBe(240)
    driver.setRegionVisible('panel', true)
    expect(PANEL_VIEWS.map(minHeight)).toEqual([240, 240, 240, 240, 200])
  })

  it('gives a tab dragged out of a collapsed panel its minimum height, and a saved collapsed panel none', () => {
    const json = defaultLayout()
    panelJson(json).maxHeight = 0
    const { driver, model } = driverFor(json)
    driver.sync()
    expect((model.getNodeById('clip') as TabNode).getMinHeight()).toBe(0)
    model.doAction(Actions.moveNode('clip', 'editor', DockLocation.CENTER, -1))
    driver.sync()
    expect((model.getNodeById('clip') as TabNode).getMinHeight()).toBe(240)
    expect((model.getNodeById('notes') as TabNode).getMinHeight()).toBe(0)
  })

  it('expands a collapsed panel when a tab is dropped into it', () => {
    const { driver, model } = driverFor()
    driver.setRegionVisible('panel', false)
    user(driver, Actions.moveNode('arrangement', 'panel', DockLocation.CENTER, -1))
    expect(collapsed(model)).toBe(false)
    expect(panel(model).getSelectedNode()?.getId()).toBe('arrangement')
  })

  it('keeps an empty panel, which can still collapse and expand', () => {
    const { driver, model, last } = driverFor()
    for (const id of PANEL_VIEWS) model.doAction(Actions.moveNode(id, 'editor', DockLocation.CENTER, -1))
    expect(panel(model)).toBeInstanceOf(TabSetNode)
    expect(panel(model).getChildren()).toEqual([])
    driver.sync()
    expect(last().groups.map((group) => group.id)).toEqual(['editor', 'border_left', 'border_right'])
    driver.setRegionVisible('panel', false)
    expect(last().hiddenRegions).toContain('panel')
    driver.setRegionVisible('panel', true)
    expect(last().hiddenRegions).not.toContain('panel')
    driver.reveal('mixer')
    expect(panel(model).getChildren()).toEqual([])
  })

  it('counts a group split off beside the panel as the editor area, collapsing with the panel', () => {
    const { driver, model, last } = driverFor()
    model.doAction(Actions.moveNode('clip', 'panel', DockLocation.RIGHT, -1))
    driver.sync()
    const split = (model.getNodeById('clip') as TabNode).getParent()!
    expect(last().groups.find((group) => group.id === split.getId())).toMatchObject({ region: 'editor', views: ['clip'] })
    expect(last().visible).toEqual(['session', 'instrument', 'clip'])
    driver.setRegionVisible('panel', false)
    expect(last().visible).toEqual(['session'])
    driver.reveal('clip')
    expect(collapsed(model)).toBe(false)
  })

  it("doesn't collapse a panel with nothing above or below it", () => {
    const { driver, model } = driverFor()
    model.doAction(Actions.moveNode('panel', 'editor', DockLocation.RIGHT, -1))
    expect(panel(model).getParent()).toBe(model.getRootRow())
    driver.setRegionVisible('panel', false)
    expect(collapsed(model)).toBe(false)
  })

  it("keeps the panel's weight when a splitter is dragged while it is collapsed", () => {
    const { driver, model } = driverFor()
    const column = panel(model).getParent()!
    driver.setRegionVisible('panel', false)
    model.doAction(driver.intercept(Actions.adjustWeights(column.getId(), [97, 3])))
    expect(panel(model).getWeight()).toBe(52)
    expect((model.getNodeById('editor') as TabSetNode).getWeight()).toBe(48)
    // Expanded, a drag sets the weights as usual.
    driver.setRegionVisible('panel', true)
    model.doAction(driver.intercept(Actions.adjustWeights(column.getId(), [70, 30])))
    expect(panel(model).getWeight()).toBe(30)
  })

  it('opens the collapsed secondary sidebar to reveal Sounds, and hides and shows it', () => {
    const { driver, model, last } = driverFor()
    const secondary = model.getNodeById('border_right') as BorderNode
    expect(secondary.isShowing()).toBe(true)
    driver.reveal('sounds')
    expect(secondary.getSelectedNode()?.getId()).toBe('sounds')
    expect(last()).toMatchObject({ visible: ['session', 'instrument', 'sounds'], hiddenRegions: ['primary'] })
    driver.setRegionVisible('secondary', false)
    expect(last()).toMatchObject({ visible: ['session', 'instrument'], hiddenRegions: ['primary', 'secondary'] })
    driver.setRegionVisible('secondary', true)
    expect(last().visible).toContain('sounds')
  })

  it('counts a collapsed sidebar as hidden and brings back its last tab when shown', () => {
    const { driver, model, last } = driverFor()
    model.doAction(Actions.updateNodeAttributes('border_left', { show: true }))
    model.doAction(Actions.moveNode('library', 'border_left', DockLocation.CENTER, -1))
    model.doAction(Actions.moveNode('sounds', 'border_left', DockLocation.CENTER, -1))
    driver.reveal('library')
    model.doAction(Actions.selectTab('library')) // the user clicks the open tab: the sidebar collapses
    driver.sync()
    expect(last().hiddenRegions).toContain('primary')
    expect(last().groups.find((group) => group.region === 'primary')).toMatchObject({ active: 'library' })
    driver.setRegionVisible('primary', true)
    expect(last().visible).toContain('library')
  })

  it('mirrors a view moved next to Session as a second editor group', () => {
    const { driver, model } = driverFor()
    model.doAction(Actions.moveNode('mixer', 'editor', DockLocation.RIGHT, -1))
    const snapshot = driver.snapshot()
    expect(snapshot.groups.filter((group) => group.region === 'editor').map((group) => group.views)).toEqual([['session', 'arrangement', 'wave'], ['mixer']])
    expect(snapshot.visible).toEqual(expect.arrayContaining(['session', 'mixer', 'instrument']))
  })

  it('shows only the maximized group, and a reveal elsewhere restores the others', () => {
    const { driver, model, last } = driverFor()
    model.doAction(Actions.moveNode('mixer', 'editor', DockLocation.RIGHT, -1))
    model.doAction(Actions.maximizeToggle('editor'))
    expect(driver.snapshot().visible).toEqual(['session'])
    driver.reveal('mixer')
    expect(model.getMaximizedTabset()).toBeUndefined()
    expect(last().visible).toEqual(expect.arrayContaining(['session', 'mixer', 'instrument']))
  })

  it('counts the panel hidden while the editor area is maximized; showing it restores the editor area', () => {
    const { driver, model, last } = driverFor()
    user(driver, Actions.maximizeToggle('editor'))
    expect(last()).toMatchObject({ visible: ['session'], hiddenRegions: ['panel', 'primary', 'secondary'] })
    driver.setRegionVisible('panel', true)
    expect(model.getMaximizedTabset()).toBeUndefined()
    expect(last()).toMatchObject({ visible: ['session', 'instrument'], hiddenRegions: ['primary', 'secondary'] })
  })

  it('maximizes the panel, expanding it first if it is collapsed, and hiding it restores the others', () => {
    const { driver, model, last } = driverFor()
    driver.setRegionVisible('panel', false)
    user(driver, Actions.maximizeToggle('panel'))
    expect(model.getMaximizedTabset()).toBe(panel(model))
    expect(collapsed(model)).toBe(false)
    expect(last()).toMatchObject({ visible: ['instrument'], hiddenRegions: ['primary', 'secondary'] })
    // A reveal in the editor area restores it.
    driver.reveal('arrangement')
    expect(model.getMaximizedTabset()).toBeUndefined()
    user(driver, Actions.maximizeToggle('panel'))
    driver.setRegionVisible('panel', false)
    expect(model.getMaximizedTabset()).toBeUndefined()
    expect(collapsed(model)).toBe(true)
    expect(last().visible).toEqual(['arrangement'])
  })

  it("maximizes and restores a view's group: an editor group, the panel (expanding it first), not a sidebar view", () => {
    const { driver, model, last } = driverFor()
    model.doAction(Actions.moveNode('mixer', 'editor', DockLocation.RIGHT, -1))
    driver.toggleMaximize('mixer')
    const mixerGroup = (model.getNodeById('mixer') as TabNode).getParent()
    expect(model.getMaximizedTabset()).toBe(mixerGroup)
    expect(last().visible).toEqual(['mixer'])
    driver.toggleMaximize('mixer')
    expect(model.getMaximizedTabset()).toBeUndefined()
    driver.setRegionVisible('panel', false)
    driver.toggleMaximize('notes')
    expect(model.getMaximizedTabset()).toBe(panel(model))
    expect(collapsed(model)).toBe(false)
    expect(last()).toMatchObject({ visible: ['instrument'], hiddenRegions: ['primary', 'secondary'] })
    driver.toggleMaximize('notes')
    // A view in a sidebar has no group to fill.
    driver.toggleMaximize('samples')
    expect(model.getMaximizedTabset()).toBeUndefined()
  })

  it("maximizes flexlayout's active group when no view is given", () => {
    const { driver, model } = driverFor()
    model.doAction(Actions.setActiveTabset('panel'))
    driver.toggleMaximize(undefined)
    expect(model.getMaximizedTabset()).toBe(panel(model))
    driver.toggleMaximize(undefined)
    expect(model.getMaximizedTabset()).toBeUndefined()
  })

  it('adds a view missing from the layout to its default region', () => {
    const json = defaultLayout()
    panelJson(json).children = panelJson(json).children!.filter((tab) => tab.id !== 'mixer')
    panelJson(json).maxHeight = 0
    const { driver, model, last } = driverFor(json)
    driver.reveal('mixer')
    const mixer = model.getNodeById('mixer')
    expect(mixer).toBeInstanceOf(TabNode)
    expect((mixer as TabNode).getParent()).toBe(panel(model))
    expect(collapsed(model)).toBe(false)
    expect(last().visible).toContain('mixer')
  })

  it('keeps a sidebar open on a neighbouring tab when its open tab is dragged away', () => {
    const { driver, model } = driverFor()
    model.doAction(Actions.updateNodeAttributes('border_left', { show: true }))
    for (const id of ['samples', 'sounds', 'library']) model.doAction(Actions.moveNode(id, 'border_left', DockLocation.CENTER, -1))
    driver.reveal('sounds')
    model.doAction(driver.intercept(Actions.moveNode('sounds', 'editor', DockLocation.RIGHT, -1)))
    const border = model.getNodeById('border_left') as BorderNode
    expect(border.getSelectedNode()?.getId()).toBe('library')
    // The last tab falls back to the one before it; other moves pass through untouched.
    model.doAction(driver.intercept(Actions.moveNode('library', 'editor', DockLocation.CENTER, -1)))
    expect(border.getSelectedNode()?.getId()).toBe('samples')
    const select = Actions.selectTab('notes')
    expect(driver.intercept(select)).toBe(select)
  })

  it('leaves reset and named layouts to the shell', () => {
    const { driver, shell } = driverFor()
    driver.reset()
    driver.saveAs('Mix')
    driver.load('Mix')
    driver.loadPreset('mix')
    expect(shell.loadPreset).toHaveBeenCalledWith('mix')
    expect(shell.reset).toHaveBeenCalledOnce()
    expect(shell.saveAs).toHaveBeenCalledWith('Mix')
    expect(shell.load).toHaveBeenCalledWith('Mix')
  })
})
