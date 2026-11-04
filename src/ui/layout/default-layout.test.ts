import { describe, expect, it } from 'vitest'
import { type IJsonModel, type IJsonTabSetNode, Model, RowNode, TabNode, TabSetNode } from 'flexlayout-react'
import { defaultLayout, defaultRegionOf, LAYOUT_PRESETS, panelWeightOf, presetLayout } from './default-layout'
import { FlexLayoutDriver } from './layout-driver'
import { LAYOUT_VERSION, parseLayoutModel } from './layout-storage'
import { viewTitles } from './view-titles'

describe('default layout', () => {
  it('stacks the editor area over the panel in a column, with Samples, Library and Tracks, and Sounds and Pinned, in collapsed sidebars', () => {
    const json = defaultLayout()
    const [column] = json.layout.children!
    expect(json.layout.children).toHaveLength(1)
    expect(column).toMatchObject({ type: 'row' })
    const [editor, panel] = column!.children! as IJsonTabSetNode[]
    expect(editor).toMatchObject({ type: 'tabset', id: 'editor', selected: 0, weight: 48 })
    expect(editor!.children!.map((tab) => tab.id)).toEqual(['session', 'arrangement', 'wave'])
    expect(panel).toMatchObject({ type: 'tabset', id: 'panel', selected: 0, weight: 52, enableDeleteWhenEmpty: false })
    expect(panel).not.toHaveProperty('maxHeight')
    expect(panel!.children!.map((tab) => tab.id)).toEqual(['instrument', 'effects', 'notes', 'clip', 'mixer'])
    const [primary, secondary] = json.borders!
    // Shown but collapsed: their tabs show in the strips, and the editor area keeps its width.
    expect(primary).toMatchObject({ location: 'left', show: true, selected: -1 })
    expect(primary!.children!.map((tab) => tab.id)).toEqual(['samples', 'library', 'tracks'])
    expect(secondary).toMatchObject({ location: 'right', show: true, selected: -1 })
    expect(secondary!.children!.map((tab) => tab.id)).toEqual(['sounds', 'pinned'])
    expect(json.global).toMatchObject({ borderSize: 300 })
  })

  it('loads as a vertical column under the root row', () => {
    const model = Model.fromJson(defaultLayout())
    const panel = model.getNodeById('panel') as TabSetNode
    const column = panel.getParent() as RowNode
    expect(column.getOrientation().getName()).toBe('vert')
    expect(column.getParent()).toBe(model.getRootRow())
    expect(model.getNodeById('editor')!.getParent()).toBe(column)
  })

  it('names each tab from the registry and gives it a tooltip where the view has one', () => {
    const model = Model.fromJson(defaultLayout())
    const session = model.getNodeById('session') as TabNode
    expect(session.getName()).toBe('Session')
    expect((model.getNodeById('mixer') as TabNode).getHelpText()).toBe('Mixer: a channel strip for every track, the returns and the master')
    // Session's tooltip names its key, which can change, so the workbench draws it.
    expect(session.getHelpText()).toBeUndefined()
    expect((model.getNodeById('clip') as TabNode).getHelpText()).toBeUndefined()
  })

  it("gives each tab its view's minimum size: 480 × 240 for editors, 280 × 200 for tool views", () => {
    const model = Model.fromJson(defaultLayout())
    const tab = (id: string) => model.getNodeById(id) as TabNode
    for (const id of ['session', 'arrangement', 'wave', 'instrument', 'effects', 'notes', 'clip']) {
      expect([tab(id).getMinWidth(), tab(id).getMinHeight()]).toEqual([480, 240])
    }
    for (const id of ['mixer', 'samples', 'sounds', 'library']) expect([tab(id).getMinWidth(), tab(id).getMinHeight()]).toEqual([280, 200])
  })

  it('takes the editor view and the panel weight it is given', () => {
    const json = defaultLayout({ editorView: 'arrangement', panelWeight: 30 })
    expect(json.layout.children![0]!.children).toEqual([
      expect.objectContaining({ id: 'editor', selected: 1, weight: 70 }),
      expect.objectContaining({ id: 'panel', weight: 30 }),
    ])
    expect(defaultLayout({ editorView: 'mixer' }).layout.children![0]!.children![0]).toMatchObject({ selected: 0 })
  })

  it('turns a panel height into a weight against 1000 px, within bounds', () => {
    expect(panelWeightOf(460)).toBe(46)
    expect(panelWeightOf(40)).toBe(10)
    expect(panelWeightOf(4000)).toBe(90)
  })

  it('knows where each view goes by default', () => {
    expect(defaultRegionOf('arrangement')).toBe('editor')
    expect(defaultRegionOf('mixer')).toBe('panel')
    expect(defaultRegionOf('library')).toBe('primary')
    expect(defaultRegionOf('sounds')).toBe('secondary')
    expect(defaultRegionOf('pinned')).toBe('secondary')
  })
})

describe('layout presets', () => {
  const tabIds = (json: IJsonModel): string[] => {
    const ids: string[] = []
    const visit = (node: { id?: string; type?: string; children?: readonly unknown[] }) => {
      if (node.type === 'tab') ids.push(node.id!)
      for (const child of node.children ?? []) visit(child as typeof node)
    }
    visit(json.layout)
    for (const border of json.borders ?? []) visit(border)
    return ids
  }
  const visible = (json: IJsonModel) => {
    const driver = new FlexLayoutDriver(Model.fromJson(json), () => undefined, { reset: () => undefined, load: () => undefined, loadPreset: () => undefined, saveAs: () => undefined })
    return driver.snapshot()
  }

  it.each(LAYOUT_PRESETS.map((preset) => preset.id))('%s passes the saved-layout checks unchanged and holds every view once', (id) => {
    const json = presetLayout(id)
    expect(parseLayoutModel(LAYOUT_VERSION, json)?.model).toEqual(json)
    expect(tabIds(json).sort()).toEqual(Object.keys(viewTitles).sort())
  })

  it('opens the views each names', () => {
    expect(visible(presetLayout('compose'))).toMatchObject({ visible: ['session', 'clip'], hiddenRegions: ['primary', 'secondary'] })
    expect(visible(presetLayout('arrange'))).toMatchObject({ visible: ['arrangement', 'mixer'], hiddenRegions: ['primary', 'secondary'] })
    const sound = visible(presetLayout('sound-design'))
    expect(sound.visible).toEqual(['wave', 'instrument', 'effects', 'sounds'])
    expect(sound.hiddenRegions).toEqual(['primary'])
    expect(sound.groups.find((group) => group.views.includes('instrument'))).toMatchObject({ region: 'editor', views: ['instrument'] })
    const mix = visible(presetLayout('mix'))
    expect(mix.visible).toEqual(['mixer'])
    expect(mix.hiddenRegions).toEqual(['panel', 'primary', 'secondary'])
    expect(mix.groups.find((group) => group.region === 'editor')?.views).toEqual(['session', 'arrangement', 'wave', 'mixer'])
  })
})
