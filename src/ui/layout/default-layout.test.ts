import { describe, expect, it } from 'vitest'
import { Model, TabNode } from 'flexlayout-react'
import { defaultLayout, defaultRegionOf } from './default-layout'

describe('default layout', () => {
  it("is today's: Session and Arrangement over the tool views in the panel, the sidebars hidden and empty", () => {
    const json = defaultLayout()
    expect(json.layout.children).toEqual([expect.objectContaining({ type: 'tabset', id: 'editor', selected: 0 })])
    expect(json.layout.children![0]!.children!.map((tab) => tab.id)).toEqual(['session', 'arrangement'])
    const [panel, primary, secondary] = json.borders!
    expect(panel).toMatchObject({ location: 'bottom', show: true, selected: 0, size: 460 })
    expect(panel!.children!.map((tab) => tab.id)).toEqual(['instrument', 'effects', 'notes', 'clip', 'mixer', 'samples', 'sounds', 'library'])
    expect(primary).toMatchObject({ location: 'left', show: false, children: [] })
    expect(secondary).toMatchObject({ location: 'right', show: false, children: [] })
  })

  it('names each tab from the registry and gives it a tooltip where the view has one', () => {
    const model = Model.fromJson(defaultLayout())
    const session = model.getNodeById('session') as TabNode
    expect(session.getName()).toBe('Session')
    expect(session.getHelpText()).toBe('Session view (Tab)')
    expect((model.getNodeById('clip') as TabNode).getHelpText()).toBeUndefined()
  })

  it('takes the editor view and the panel size it is given', () => {
    const json = defaultLayout({ editorView: 'arrangement', panelSize: 300 })
    expect(json.layout.children![0]).toMatchObject({ selected: 1 })
    expect(json.borders![0]).toMatchObject({ size: 300 })
    expect(defaultLayout({ editorView: 'mixer' }).layout.children![0]).toMatchObject({ selected: 0 })
  })

  it('knows where each view goes by default', () => {
    expect(defaultRegionOf('arrangement')).toBe('editor')
    expect(defaultRegionOf('library')).toBe('panel')
  })
})
