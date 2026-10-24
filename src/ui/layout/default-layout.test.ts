import { describe, expect, it } from 'vitest'
import { type IJsonTabSetNode, Model, RowNode, TabNode, TabSetNode } from 'flexlayout-react'
import { defaultLayout, defaultRegionOf, panelWeightOf } from './default-layout'

describe('default layout', () => {
  it('stacks the editor area over the panel in a column, with Sounds in the collapsed secondary sidebar', () => {
    const json = defaultLayout()
    const [column] = json.layout.children!
    expect(json.layout.children).toHaveLength(1)
    expect(column).toMatchObject({ type: 'row' })
    const [editor, panel] = column!.children! as IJsonTabSetNode[]
    expect(editor).toMatchObject({ type: 'tabset', id: 'editor', selected: 0, weight: 48 })
    expect(editor!.children!.map((tab) => tab.id)).toEqual(['session', 'arrangement', 'wave'])
    expect(panel).toMatchObject({ type: 'tabset', id: 'panel', selected: 0, weight: 52, enableDeleteWhenEmpty: false })
    expect(panel).not.toHaveProperty('maxHeight')
    expect(panel!.children!.map((tab) => tab.id)).toEqual(['instrument', 'effects', 'notes', 'clip', 'mixer', 'samples', 'library'])
    const [primary, secondary] = json.borders!
    expect(primary).toMatchObject({ location: 'left', show: false, selected: -1, children: [] })
    // Shown but collapsed: its tab shows in the strip, and the editor area keeps its width.
    expect(secondary).toMatchObject({ location: 'right', show: true, selected: -1 })
    expect(secondary!.children!.map((tab) => tab.id)).toEqual(['sounds'])
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
    expect(session.getHelpText()).toBe('Session view (Tab)')
    expect((model.getNodeById('clip') as TabNode).getHelpText()).toBeUndefined()
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
    expect(defaultRegionOf('library')).toBe('panel')
    expect(defaultRegionOf('sounds')).toBe('secondary')
  })
})
