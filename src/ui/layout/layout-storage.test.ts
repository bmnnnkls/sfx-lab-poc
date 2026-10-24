import { describe, expect, it } from 'vitest'
import { Actions, DockLocation, type IJsonModel, type IJsonTabSetNode, Model } from 'flexlayout-react'
import { defaultLayout, GLOBAL_ATTRIBUTES } from './default-layout'
import { migratedLayout, parseStoredLayout, serializeLayout } from './layout-storage'

const stored = (model: unknown, version: unknown = 1) => JSON.stringify({ version, model })
const editorTabs = (json: IJsonModel) => (json.layout.children![0] as IJsonTabSetNode).children!.map((tab) => tab.id)
const borderTabs = (json: IJsonModel, location: string) => json.borders!.find((border) => border.location === location)!.children!.map((tab) => tab.id)

describe('parseStoredLayout', () => {
  it('reads back what serializeLayout wrote, a moved view included', () => {
    const model = Model.fromJson(defaultLayout())
    model.doAction(Actions.moveNode('mixer', 'editor', DockLocation.RIGHT, -1))
    const parsed = parseStoredLayout(serializeLayout(model.toJson()))!
    const reloaded = Model.fromJson(parsed)
    expect(reloaded.getNodeById('mixer')?.getParent()?.getParent()).toBe(reloaded.getNodeById('editor')?.getParent())
    expect(reloaded.toJson().layout).toEqual(model.toJson().layout)
  })

  it('uses the default when nothing is saved', () => {
    expect(parseStoredLayout(null)).toBeUndefined()
  })

  it.each([
    ['not JSON', '{"version":1,'],
    ['not an object', '"layout"'],
    ['another version', stored(defaultLayout(), 2)],
    ['no version', JSON.stringify({ model: defaultLayout() })],
    ['no model', JSON.stringify({ version: 1 })],
  ])('rejects a layout that is %s', (_, raw) => {
    expect(parseStoredLayout(raw)).toBeUndefined()
  })

  const withEditorTab = (tab: unknown) => {
    const json = defaultLayout()
    ;(json.layout.children![0] as { children: unknown[] }).children.push(tab)
    return stored(json)
  }

  it('rejects a tab that is not a view', () => {
    expect(parseStoredLayout(withEditorTab({ type: 'tab', id: 'wave', component: 'view' }))).toBeUndefined()
    expect(parseStoredLayout(withEditorTab({ type: 'tab', id: 'toString', component: 'view' }))).toBeUndefined()
    const json = defaultLayout()
    json.borders![0]!.children![0] = { ...json.borders![0]!.children![0]!, component: 'iframe' }
    expect(parseStoredLayout(stored(json))).toBeUndefined()
  })

  it('rejects duplicate ids', () => {
    expect(parseStoredLayout(withEditorTab({ type: 'tab', id: 'mixer', component: 'view' }))).toBeUndefined()
    const json = defaultLayout()
    json.layout.children!.push({ type: 'tabset', id: 'editor', children: [] })
    expect(parseStoredLayout(stored(json))).toBeUndefined()
  })

  it('rejects unknown node types and unsupported parts', () => {
    expect(parseStoredLayout(withEditorTab({ type: 'tabgroup', children: [] }))).toBeUndefined()
    expect(parseStoredLayout(stored({ ...defaultLayout(), layout: { type: 'column', children: [] } }))).toBeUndefined()
    expect(parseStoredLayout(stored({ ...defaultLayout(), borders: [{ type: 'border', location: 'top', children: [] }] }))).toBeUndefined()
    expect(parseStoredLayout(stored({ ...defaultLayout(), popouts: { p: { layout: { type: 'row' } } } }))).toBeUndefined()
  })

  it('adds the views a saved layout lacks to their default regions, and the borders it lacks', () => {
    const json = defaultLayout()
    ;(json.layout.children![0] as IJsonTabSetNode).children = [{ type: 'tab', id: 'session', component: 'view' }]
    json.borders = [{ type: 'border', location: 'bottom', selected: 0, children: [{ type: 'tab', id: 'mixer', component: 'view' }] }]
    const parsed = parseStoredLayout(stored(json))!
    expect(editorTabs(parsed)).toEqual(['session', 'arrangement'])
    expect(borderTabs(parsed, 'bottom')).toEqual(['mixer', 'instrument', 'effects', 'notes', 'clip', 'samples', 'sounds', 'library'])
    expect(json.borders.length).toBe(1)
    expect(parsed.borders!.map((border) => [border.location, border.show])).toEqual([['bottom', undefined], ['left', false], ['right', false]])
    expect(() => Model.fromJson(parsed)).not.toThrow()
  })

  it("gives tabs the registry's names and tooltips, and every layout today's global attributes", () => {
    const json = defaultLayout()
    json.global = { tabEnableClose: true }
    ;(json.layout.children![0] as IJsonTabSetNode).children![0] = { type: 'tab', id: 'session', component: 'view', name: 'Old name', helpText: 'old' }
    const parsed = parseStoredLayout(stored(json))!
    expect(parsed.global).toEqual(GLOBAL_ATTRIBUTES)
    expect((parsed.layout.children![0] as IJsonTabSetNode).children![0]).toMatchObject({ name: 'Session', helpText: 'Session view (Tab)' })
  })
})

describe('migratedLayout', () => {
  it('takes the editor view and panel height the old keys remembered', () => {
    const json = migratedLayout(JSON.stringify('arrangement'), JSON.stringify(320))
    expect(json.layout.children![0]).toMatchObject({ selected: 1 })
    expect(json.borders![0]).toMatchObject({ location: 'bottom', size: 320 })
  })

  it('ignores old values it cannot use', () => {
    expect(migratedLayout('not json', JSON.stringify('tall'))).toEqual(defaultLayout())
    expect(migratedLayout(JSON.stringify('mixer'), null)).toEqual(defaultLayout())
    expect(migratedLayout(null, JSON.stringify(40)).borders![0]).toMatchObject({ size: 180 })
  })
})
