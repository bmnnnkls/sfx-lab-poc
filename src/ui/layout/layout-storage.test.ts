import { describe, expect, it } from 'vitest'
import { Actions, DockLocation, type IJsonModel, type IJsonRowNode, type IJsonTabSetNode, Model, TabNode, TabSetNode } from 'flexlayout-react'
import { defaultLayout, GLOBAL_ATTRIBUTES } from './default-layout'
import { migratedLayout, parseStoredLayout, serializeLayout } from './layout-storage'

const stored = (model: unknown, version: unknown = 2) => JSON.stringify({ version, model })
const parse = (raw: string) => parseStoredLayout(raw)?.model
/** The tab groups of a model, depth first. */
const tabSets = (row: IJsonRowNode): IJsonTabSetNode[] =>
  (row.children ?? []).flatMap((child) => (child.type === 'tabset' ? [child as IJsonTabSetNode] : tabSets(child as IJsonRowNode)))
const group = (json: IJsonModel, id: string) => tabSets(json.layout).find((candidate) => candidate.id === id)!
const tabsOf = (json: IJsonModel, id: string) => group(json, id).children!.map((tab) => tab.id)
const borderTabs = (json: IJsonModel, location: string) => json.borders!.find((border) => border.location === location)!.children!.map((tab) => tab.id)
const editorGroup = (json: IJsonModel) => (json.layout.children![0] as IJsonRowNode).children![0] as { children: unknown[] }

describe('parseStoredLayout', () => {
  it('reads back what serializeLayout wrote, a moved view and a collapsed panel included', () => {
    const model = Model.fromJson(defaultLayout())
    model.doAction(Actions.moveNode('mixer', 'editor', DockLocation.RIGHT, -1))
    model.doAction(Actions.updateNodeAttributes('panel', { maxHeight: 0 }))
    const parsed = parseStoredLayout(serializeLayout(model.toJson()))!
    expect(parsed.migrated).toBe(false)
    const reloaded = Model.fromJson(parsed.model)
    expect(reloaded.getNodeById('mixer')?.getParent()?.getParent()).toBe(reloaded.getNodeById('editor')?.getParent())
    expect((reloaded.getNodeById('panel') as TabSetNode).getAttrMaxHeight()).toBe(0)
    expect(reloaded.toJson().layout).toEqual(model.toJson().layout)
  })

  it('gives the tabs of a layout saved without minimum sizes their views\' minimums', () => {
    const json = defaultLayout()
    const strip = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(strip)
      if (typeof node !== 'object' || node === null) return node
      const { minWidth: _width, minHeight: _height, ...rest } = node as Record<string, unknown>
      return Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, strip(value)]))
    }
    expect(JSON.stringify(strip(json))).not.toContain('minWidth')
    const reloaded = Model.fromJson(parse(stored(strip(json)))!)
    expect([(reloaded.getNodeById('clip') as TabNode).getMinWidth(), (reloaded.getNodeById('clip') as TabNode).getMinHeight()]).toEqual([480, 240])
    expect((reloaded.getNodeById('sounds') as TabNode).getMinWidth()).toBe(280)
  })

  it('uses the default when nothing is saved', () => {
    expect(parseStoredLayout(null)).toBeUndefined()
  })

  it.each([
    ['not JSON', '{"version":2,'],
    ['not an object', '"layout"'],
    ['another version', stored(defaultLayout(), 3)],
    ['no version', JSON.stringify({ model: defaultLayout() })],
    ['no model', JSON.stringify({ version: 2 })],
  ])('rejects a layout that is %s', (_, raw) => {
    expect(parseStoredLayout(raw)).toBeUndefined()
  })

  const withEditorTab = (tab: unknown) => {
    const json = defaultLayout()
    editorGroup(json).children.push(tab)
    return stored(json)
  }

  it('rejects a tab that is not a view', () => {
    expect(parse(withEditorTab({ type: 'tab', id: 'tuner', component: 'view' }))).toBeUndefined()
    expect(parse(withEditorTab({ type: 'tab', id: 'toString', component: 'view' }))).toBeUndefined()
    const json = defaultLayout()
    const panel = group(json, 'panel')
    panel.children![0] = { ...panel.children![0]!, component: 'iframe' }
    expect(parse(stored(json))).toBeUndefined()
  })

  it('rejects duplicate ids', () => {
    expect(parse(withEditorTab({ type: 'tab', id: 'mixer', component: 'view' }))).toBeUndefined()
    const json = defaultLayout()
    json.layout.children!.push({ type: 'tabset', id: 'editor', children: [] })
    expect(parse(stored(json))).toBeUndefined()
  })

  it('rejects unknown node types and unsupported parts', () => {
    expect(parse(withEditorTab({ type: 'tabgroup', children: [] }))).toBeUndefined()
    expect(parse(stored({ ...defaultLayout(), layout: { type: 'column', children: [] } }))).toBeUndefined()
    expect(parse(stored({ ...defaultLayout(), popouts: { p: { layout: { type: 'row' } } } }))).toBeUndefined()
  })

  it.each(['bottom', 'top'])('rejects a %s border', (location) => {
    const json = defaultLayout()
    json.borders!.push({ type: 'border', location: location as 'bottom', children: [] })
    expect(parse(stored(json))).toBeUndefined()
  })

  it('rejects a layout without a panel, or with two', () => {
    const none = defaultLayout()
    group(none, 'panel').id = 'tools'
    expect(parse(stored(none))).toBeUndefined()
    const two = defaultLayout()
    const extra = { type: 'tabset', id: 'panel', children: [] }
    ;(two.layout.children![0] as IJsonRowNode).children!.push(extra as IJsonTabSetNode)
    expect(parse(stored(two))).toBeUndefined()
  })

  it('adds the views a saved layout lacks to their default regions, and the sidebars it lacks', () => {
    const json = defaultLayout()
    group(json, 'editor').children = [{ type: 'tab', id: 'session', component: 'view' }]
    group(json, 'panel').children = [{ type: 'tab', id: 'mixer', component: 'view' }]
    json.borders = [{ type: 'border', location: 'left', selected: 0, children: [{ type: 'tab', id: 'sounds', component: 'view' }] }]
    const parsed = parse(stored(json))!
    expect(tabsOf(parsed, 'editor')).toEqual(['session', 'arrangement', 'wave'])
    expect(tabsOf(parsed, 'panel')).toEqual(['mixer', 'instrument', 'effects', 'notes', 'clip'])
    expect(borderTabs(parsed, 'left')).toEqual(['sounds', 'samples', 'library'])
    expect(parsed.borders!.map((border) => [border.location, border.show])).toEqual([['left', undefined], ['right', false]])
    expect(() => Model.fromJson(parsed)).not.toThrow()
  })

  it("puts a missing editor view into the first group that isn't the panel", () => {
    const json = defaultLayout()
    const column = json.layout.children![0] as IJsonRowNode
    column.children = [column.children![1]!, column.children![0]!] // the panel above the editor area
    group(json, 'editor').children = [{ type: 'tab', id: 'session', component: 'view' }]
    expect(tabsOf(parse(stored(json))!, 'editor')).toEqual(['session', 'arrangement', 'wave'])
  })

  it("gives tabs the registry's names and tooltips, the panel its attributes, and every layout today's global attributes", () => {
    const json = defaultLayout()
    json.global = { tabEnableClose: true }
    group(json, 'editor').children![0] = { type: 'tab', id: 'session', component: 'view', name: 'Old name', helpText: 'old' }
    group(json, 'panel').enableDeleteWhenEmpty = true
    const parsed = parse(stored(json))!
    expect(parsed.global).toEqual(GLOBAL_ATTRIBUTES)
    expect(group(parsed, 'editor').children![0]).toMatchObject({ name: 'Session', helpText: 'Session view (Tab)' })
    expect(group(parsed, 'panel').enableDeleteWhenEmpty).toBe(false)
  })
})

describe('parseStoredLayout with a version-1 layout', () => {
  const PANEL_VIEWS = ['instrument', 'effects', 'notes', 'clip', 'mixer', 'samples', 'sounds', 'library']
  const tab = (id: string) => ({ type: 'tab', id, component: 'view' })
  /** What round 2 saved: the panel as the bottom border, the editor area as the main row. */
  const v1 = (bottom: Record<string, unknown> | undefined, editor: unknown[] = [{ type: 'tabset', id: 'editor', selected: 1, children: [tab('session'), tab('arrangement')] }]) => stored({
    global: {},
    borders: [
      ...(bottom ? [{ type: 'border', location: 'bottom', children: PANEL_VIEWS.map(tab), ...bottom }] : []),
      { type: 'border', location: 'left', show: false, selected: -1, children: [] },
      { type: 'border', location: 'right', show: false, selected: -1, children: [] },
    ],
    layout: { type: 'row', children: editor },
  }, 1)

  it('moves an open bottom border into the panel under the editor area, keeping its order, open tab and height', () => {
    const parsed = parseStoredLayout(v1({ show: true, selected: 4, size: 300 }))!
    expect(parsed.migrated).toBe(true)
    const [column] = parsed.model.layout.children!
    expect(parsed.model.layout.children).toHaveLength(1)
    expect((column as IJsonRowNode).children!.map((child) => [child.id, child.weight])).toEqual([['editor', 70], ['panel', 30]])
    expect(group(parsed.model, 'panel')).toMatchObject({ selected: 4, enableDeleteWhenEmpty: false })
    expect(group(parsed.model, 'panel')).not.toHaveProperty('maxHeight')
    expect(tabsOf(parsed.model, 'panel')).toEqual(PANEL_VIEWS)
    expect(group(parsed.model, 'editor')).toMatchObject({ selected: 1 })
    expect(tabsOf(parsed.model, 'editor')).toEqual(['session', 'arrangement', 'wave'])
    expect(parsed.model.borders!.map((border) => border.location)).toEqual(['left', 'right'])
    const model = Model.fromJson(parsed.model)
    expect((model.getNodeById('panel') as TabSetNode).getSelectedNode()?.getId()).toBe('mixer')
  })

  it.each([
    ['collapsed', { show: true, selected: -1 }],
    ['hidden', { show: false, selected: 2 }],
  ])('turns a %s bottom border into a collapsed panel', (_, bottom) => {
    const parsed = parseStoredLayout(v1(bottom))!
    expect(group(parsed.model, 'panel')).toMatchObject({ maxHeight: 0, selected: bottom.selected === -1 ? 0 : 2, weight: 52 })
    expect(tabsOf(parsed.model, 'panel')).toEqual(PANEL_VIEWS)
  })

  it('turns an emptied bottom border into a collapsed, empty panel', () => {
    const parsed = parseStoredLayout(v1({ show: true, selected: -1, children: [] }, [
      { type: 'tabset', id: 'editor', children: [tab('session'), tab('arrangement'), ...PANEL_VIEWS.map(tab)] },
    ]))!
    expect(group(parsed.model, 'panel')).toMatchObject({ maxHeight: 0, selected: -1, children: [] })
  })

  it('keeps a split editor area together above the panel', () => {
    const parsed = parseStoredLayout(v1({ show: true, selected: 0 }, [
      { type: 'tabset', id: 'editor', weight: 60, children: [tab('session'), tab('arrangement')] },
      { type: 'tabset', id: '#right', weight: 40, children: [tab('mixer')] },
    ]).replace('{"type":"tab","id":"mixer","component":"view"},', ''))!
    const column = parsed.model.layout.children![0] as IJsonRowNode
    expect(column.children!.map((child) => child.type)).toEqual(['row', 'tabset'])
    expect((column.children![0] as IJsonRowNode).children!.map((child) => [child.id, child.weight])).toEqual([['editor', 60], ['#right', 40]])
    const model = Model.fromJson(parsed.model)
    expect(model.getNodeById('editor')!.getParent()!.getOrientation().getName()).toBe('horz')
  })

  it('adds a panel when the bottom border is missing, with the missing views in their default regions', () => {
    const parsed = parseStoredLayout(v1(undefined))!
    expect(group(parsed.model, 'panel')).toMatchObject({ maxHeight: 0 })
    expect(tabsOf(parsed.model, 'panel')).toEqual(['instrument', 'effects', 'notes', 'clip', 'mixer'])
    expect(borderTabs(parsed.model, 'left')).toEqual(['samples', 'library'])
    expect(borderTabs(parsed.model, 'right')).toEqual(['sounds'])
  })

  it('still rejects a version-1 layout with an unknown view', () => {
    expect(parseStoredLayout(v1({ show: true, selected: 0, children: [tab('tuner')] }))).toBeUndefined()
  })
})

describe('migratedLayout', () => {
  it('takes the editor view and panel height the old keys remembered', () => {
    const json = migratedLayout(JSON.stringify('arrangement'), JSON.stringify(320))
    expect(group(json, 'editor')).toMatchObject({ selected: 1, weight: 68 })
    expect(group(json, 'panel')).toMatchObject({ weight: 32 })
  })

  it('ignores old values it cannot use', () => {
    expect(migratedLayout('not json', JSON.stringify('tall'))).toEqual(defaultLayout())
    expect(migratedLayout(JSON.stringify('mixer'), null)).toEqual(defaultLayout())
    expect(group(migratedLayout(null, JSON.stringify(40)), 'panel')).toMatchObject({ weight: 10 })
  })
})
