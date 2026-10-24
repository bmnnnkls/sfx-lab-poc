import { describe, expect, it } from 'vitest'
import { Actions, DockLocation, type IJsonRowNode, type IJsonTabSetNode, Model } from 'flexlayout-react'
import { defaultLayout } from './default-layout'
import { namedLayout, namedLayoutNames, withNamedLayout, withoutNamedLayout } from './named-layouts'

const moved = () => {
  const model = Model.fromJson(defaultLayout())
  model.doAction(Actions.moveNode('mixer', 'editor', DockLocation.RIGHT, -1))
  return model.toJson()
}
const tabSets = (row: IJsonRowNode): IJsonTabSetNode[] =>
  (row.children ?? []).flatMap((child) => (child.type === 'tabset' ? [child as IJsonTabSetNode] : tabSets(child as IJsonRowNode)))

describe('named layouts', () => {
  it('saves, lists and loads layouts by name', () => {
    let raw: string | null = null
    raw = withNamedLayout(raw, 'Mix', moved())
    raw = withNamedLayout(raw, 'Compose', defaultLayout())
    expect(JSON.parse(raw)).toMatchObject({ version: 2 })
    expect(namedLayoutNames(raw)).toEqual(['Compose', 'Mix'])
    const mix = Model.fromJson(namedLayout(raw, 'Mix')!)
    expect(mix.getNodeById('mixer')?.getParent()?.getParent()).toBe(mix.getNodeById('editor')?.getParent())
    expect(namedLayout(raw, 'Missing')).toBeUndefined()
  })

  it('replaces a layout saved under the same name', () => {
    const raw = withNamedLayout(withNamedLayout(null, 'Mix', defaultLayout()), 'Mix', moved())
    expect(namedLayoutNames(raw)).toEqual(['Mix'])
    expect(tabSets(namedLayout(raw, 'Mix')!.layout).map((group) => group.children!.map((tab) => tab.id))).toContainEqual(['mixer'])
  })

  it('deletes one by name', () => {
    const raw = withoutNamedLayout(withNamedLayout(withNamedLayout(null, 'A', defaultLayout()), 'B', defaultLayout()), 'A')
    expect(namedLayoutNames(raw)).toEqual(['B'])
    expect(namedLayoutNames(withoutNamedLayout(raw, 'Nope'))).toEqual(['B'])
  })

  it('takes any name as a plain key', () => {
    const raw = withNamedLayout(null, '__proto__', defaultLayout())
    expect(namedLayoutNames(raw)).toEqual(['__proto__'])
    expect(namedLayout(raw, '__proto__')).toBeDefined()
    expect(namedLayout(raw, 'toString')).toBeUndefined()
  })

  it('loads a layout saved by an older version, migrated, with views added since repaired in', () => {
    const tab = (id: string) => ({ type: 'tab', id, component: 'view' })
    const raw = JSON.stringify({
      version: 1,
      layouts: {
        Old: {
          borders: [{ type: 'border', location: 'bottom', show: true, selected: 1, size: 400, children: ['instrument', 'mixer'].map(tab) }],
          layout: { type: 'row', children: [{ type: 'tabset', id: 'editor', children: ['session', 'arrangement'].map(tab) }] },
        },
      },
    })
    const old = namedLayout(raw, 'Old')!
    const panel = tabSets(old.layout).find((group) => group.id === 'panel')!
    expect(panel).toMatchObject({ selected: 1, weight: 40 })
    expect(panel.children!.slice(0, 2).map((t) => t.id)).toEqual(['instrument', 'mixer'])
    expect(tabSets(old.layout).find((group) => group.id === 'editor')!.children!.map((t) => t.id)).toEqual(['session', 'arrangement', 'wave'])
    // Saving another layout rewrites the old one at today's version.
    const rewritten = JSON.parse(withNamedLayout(raw, 'New', defaultLayout()))
    expect(rewritten.version).toBe(2)
    expect(rewritten.layouts.Old.borders.map((border: { location: string }) => border.location)).toEqual(['left', 'right'])
  })

  it('ignores what it cannot use: no storage, garbage, and layouts it cannot read, which a save drops', () => {
    expect(namedLayoutNames(null)).toEqual([])
    expect(namedLayoutNames('not json')).toEqual([])
    expect(namedLayoutNames(JSON.stringify({ version: 2, layouts: [] }))).toEqual([])
    const raw = JSON.stringify({ version: 2, layouts: { Broken: { layout: { type: 'column' } } } })
    expect(namedLayoutNames(raw)).toEqual(['Broken'])
    expect(namedLayout(raw, 'Broken')).toBeUndefined()
    expect(namedLayoutNames(withNamedLayout(raw, 'Fine', defaultLayout()))).toEqual(['Fine'])
    expect(namedLayout(JSON.stringify({ version: 99, layouts: { Future: defaultLayout() } }), 'Future')).toBeUndefined()
  })
})
