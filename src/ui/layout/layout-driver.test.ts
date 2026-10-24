import { describe, expect, it, vi } from 'vitest'
import type { LayoutSnapshot } from '@state'
import { Actions, BorderNode, DockLocation, type IJsonModel, Model, TabNode } from 'flexlayout-react'
import { defaultLayout } from './default-layout'
import { FlexLayoutDriver } from './layout-driver'

const driverFor = (json: IJsonModel = defaultLayout()) => {
  const published: LayoutSnapshot[] = []
  const reset = vi.fn()
  const driver = new FlexLayoutDriver(Model.fromJson(json), (snapshot) => published.push(snapshot), reset)
  return { driver, model: driver.model, published, reset, last: () => published[published.length - 1]! }
}
const panel = (model: Model) => model.getNodeById('border_bottom') as BorderNode

describe('FlexLayoutDriver', () => {
  it('mirrors the default layout', () => {
    const { driver } = driverFor()
    expect(driver.snapshot()).toEqual({
      groups: [
        { id: 'editor', region: 'editor', views: ['session', 'arrangement'], active: 'session' },
        { id: 'border_bottom', region: 'panel', views: ['instrument', 'effects', 'notes', 'clip', 'mixer', 'samples', 'sounds', 'library'], active: 'instrument' },
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
    // Revealing the panel's open tab again must not collapse it.
    driver.reveal('mixer')
    expect(panel(model).getSelectedNode()?.getId()).toBe('mixer')
  })

  it('counts a collapsed panel as hidden and brings back its last tab when shown', () => {
    const { driver, model, last } = driverFor()
    driver.reveal('library')
    model.doAction(Actions.selectTab('library')) // the user clicks the open tab: the panel collapses
    driver.sync()
    expect(last().hiddenRegions).toContain('panel')
    expect(last().groups[1]).toMatchObject({ region: 'panel', active: 'library' })
    driver.setRegionVisible('panel', true)
    expect(last().visible).toEqual(['session', 'library'])
  })

  it('hides and shows a region, and reveals into a hidden one', () => {
    const { driver, model, last } = driverFor()
    driver.setRegionVisible('panel', false)
    expect(panel(model).isShowing()).toBe(false)
    expect(last()).toMatchObject({ visible: ['session'], hiddenRegions: ['panel', 'primary', 'secondary'] })
    driver.reveal('notes')
    expect(last()).toMatchObject({ visible: ['session', 'notes'], hiddenRegions: ['primary', 'secondary'] })
  })

  it('mirrors a view moved next to Session as a second editor group', () => {
    const { driver, model } = driverFor()
    model.doAction(Actions.moveNode('mixer', 'editor', DockLocation.RIGHT, -1))
    const snapshot = driver.snapshot()
    expect(snapshot.groups.filter((group) => group.region === 'editor').map((group) => group.views)).toEqual([['session', 'arrangement'], ['mixer']])
    expect(snapshot.visible).toEqual(expect.arrayContaining(['session', 'mixer', 'instrument']))
  })

  it('shows only the maximized group, and a reveal elsewhere restores the others', () => {
    const { driver, model, last } = driverFor()
    model.doAction(Actions.moveNode('mixer', 'editor', DockLocation.RIGHT, -1))
    model.doAction(Actions.maximizeToggle('editor'))
    expect(driver.snapshot().visible).toEqual(['session', 'instrument'])
    driver.reveal('mixer')
    expect(model.getMaximizedTabset()).toBeUndefined()
    expect(last().visible).toEqual(expect.arrayContaining(['session', 'mixer']))
  })

  it('adds a view missing from the layout to its default region', () => {
    const json = defaultLayout()
    json.borders![0]!.children = json.borders![0]!.children!.filter((tab) => tab.id !== 'library')
    const { driver, model, last } = driverFor(json)
    driver.reveal('library')
    const library = model.getNodeById('library')
    expect(library).toBeInstanceOf(TabNode)
    expect((library as TabNode).getParent()).toBe(panel(model))
    expect(last().visible).toContain('library')
  })

  it('leaves reset to the shell', () => {
    const { driver, reset } = driverFor()
    driver.reset()
    expect(reset).toHaveBeenCalledOnce()
  })
})
