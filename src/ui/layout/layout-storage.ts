import type { RegionId, ViewId } from '@state'
import type { IBorderLocation, IJsonBorderNode, IJsonModel, IJsonRowNode, IJsonTabNode, IJsonTabSetNode } from 'flexlayout-react'
import {
  BORDER_LOCATIONS, DEFAULT_PANEL_WEIGHT, defaultLayout, defaultRegionOf, GLOBAL_ATTRIBUTES, PANEL_ATTRIBUTES, PANEL_GROUP,
  panelWeightOf, viewTab,
} from './default-layout'
import { viewTitles } from './view-titles'

/** Where the layout is saved, per browser. */
export const LAYOUT_KEY = 'sfxlab:layout'
/** Version 2: the panel is a tab group in the main layout. Version 1 had it as the bottom border; it is migrated. */
export const LAYOUT_VERSION = 2

/** The keys the layout replaced. Read once, to build the first saved layout, and never written again. */
export const LEGACY_MAIN_VIEW_KEY = 'sfxlab:main-view'
export const LEGACY_PANEL_SIZE_KEY = 'sfxlab:editor-height'

export interface StoredLayout {
  readonly version: typeof LAYOUT_VERSION
  readonly model: IJsonModel
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isViewId = (value: unknown): value is ViewId => typeof value === 'string' && Object.hasOwn(viewTitles, value)

/** Thrown inside the parser for a layout that can't be used; `parseStoredLayout` turns it into "use the default". */
class Rejected extends Error {}
const reject = (reason: string): never => {
  throw new Rejected(reason)
}

/** Checks a tab and gives it the registry's current name and tooltip. */
const checkTab = (value: unknown, seen: Set<string>): IJsonTabNode => {
  if (!isRecord(value) || value.type !== 'tab') return reject(`unknown node type ${isRecord(value) ? String(value.type) : typeof value}`)
  if (!isViewId(value.id)) return reject(`unknown view ${String(value.id)}`)
  if (value.component !== 'view') return reject(`tab ${value.id} has component ${String(value.component)}`)
  if (seen.has(value.id)) return reject(`duplicate id ${value.id}`)
  seen.add(value.id)
  const { name: _name, helpText: _helpText, ...rest } = value
  return { ...rest, ...viewTab(value.id) }
}

const checkId = (value: Record<string, unknown>, seen: Set<string>) => {
  if (value.id === undefined) return
  if (typeof value.id !== 'string') return reject('a node id is not a string')
  if (seen.has(value.id)) return reject(`duplicate id ${value.id}`)
  seen.add(value.id)
}

const children = (value: Record<string, unknown>): unknown[] => {
  if (value.children === undefined) return []
  return Array.isArray(value.children) ? value.children : reject(`${String(value.type)} children are not a list`)
}

const checkRow = (value: unknown, seen: Set<string>): IJsonRowNode => {
  if (!isRecord(value) || value.type !== 'row') return reject(`unknown node type ${isRecord(value) ? String(value.type) : typeof value}`)
  checkId(value, seen)
  return {
    ...value,
    children: children(value).map((child): IJsonRowNode | IJsonTabSetNode => {
      if (isRecord(child) && child.type === 'tabset') {
        checkId(child, seen)
        const tabs = children(child).map((tab) => checkTab(tab, seen))
        return { ...child, ...(child.id === PANEL_GROUP ? PANEL_ATTRIBUTES : {}), children: tabs } as IJsonTabSetNode
      }
      return checkRow(child, seen)
    }),
  } as IJsonRowNode
}

const SIDEBAR_LOCATIONS = Object.values(BORDER_LOCATIONS) as IBorderLocation[]

/** Checks the borders. Version 1 also had the panel as the bottom border; `migrateV1` takes it out first. */
const checkBorders = (value: unknown, seen: Set<string>): IJsonBorderNode[] => {
  if (value === undefined) return []
  if (!Array.isArray(value)) return reject('borders are not a list')
  const locations = new Set<string>()
  return value.map((border): IJsonBorderNode => {
    if (!isRecord(border) || border.type !== 'border') return reject('unknown node type in borders')
    if (!SIDEBAR_LOCATIONS.includes(border.location as IBorderLocation)) return reject(`unknown border location ${String(border.location)}`)
    if (locations.has(border.location as string)) return reject(`duplicate border ${String(border.location)}`)
    locations.add(border.location as string)
    return { ...border, children: children(border).map((tab) => checkTab(tab, seen)) } as IJsonBorderNode
  })
}

/** Every tab set in a row, depth first. */
const tabSets = (row: IJsonRowNode): IJsonTabSetNode[] =>
  (row.children ?? []).flatMap((child) => (child.type === 'tabset' ? [child as IJsonTabSetNode] : tabSets(child as IJsonRowNode)))

/**
 * A version-1 model as version 2: the bottom border's tabs become the panel's tab group under the editor area, in
 * their order and with the open tab kept. The border's size becomes the panel's weight against 1000 px. A
 * collapsed, hidden or empty border becomes a collapsed panel.
 */
const migrateV1 = (value: unknown): unknown => {
  if (!isRecord(value) || !isRecord(value.layout) || (value.borders !== undefined && !Array.isArray(value.borders))) return value
  const borders = (value.borders ?? []) as unknown[]
  const bottom = borders.find((border) => isRecord(border) && border.location === 'bottom') as Record<string, unknown> | undefined
  const tabs = bottom ? children(bottom) : []
  const selected = typeof bottom?.selected === 'number' ? bottom.selected : -1
  const shown = bottom !== undefined && bottom.show !== false && selected >= 0 && selected < tabs.length
  const panelWeight = typeof bottom?.size === 'number' && Number.isFinite(bottom.size) && bottom.size > 0 ? panelWeightOf(bottom.size) : DEFAULT_PANEL_WEIGHT
  const panel: IJsonTabSetNode = {
    type: 'tabset',
    id: PANEL_GROUP,
    weight: panelWeight,
    ...PANEL_ATTRIBUTES,
    selected: tabs.length === 0 ? -1 : Math.max(0, Math.min(selected, tabs.length - 1)),
    ...(shown ? {} : { maxHeight: 0 }),
    children: tabs as IJsonTabNode[],
  }
  const rows = children(value.layout)
  const editor = rows.length === 1 && isRecord(rows[0]) && rows[0].type === 'tabset'
    ? { ...rows[0], weight: 100 - panelWeight }
    : { type: 'row', weight: 100 - panelWeight, children: rows }
  return {
    ...value,
    borders: borders.filter((border) => border !== bottom),
    layout: { ...value.layout, children: [{ type: 'row', children: [editor, panel] }] },
  }
}

/**
 * Validates a saved layout and repairs what a later round can make stale: a view the layout doesn't have goes to
 * its default region, and a missing sidebar is added empty and hidden. Every tab gets the registry's name and
 * tooltip, the panel its attributes, and the global attributes are always today's.
 */
const checkModel = (value: unknown): IJsonModel => {
  if (!isRecord(value)) return reject('the model is not an object')
  for (const key of ['subLayouts', 'popouts'] as const) {
    if (value[key] !== undefined && (!isRecord(value[key]) || Object.keys(value[key]).length > 0)) reject(`${key} are not supported`)
  }
  const seen = new Set<string>()
  const layout = checkRow(value.layout, seen)
  const borders = checkBorders(value.borders, seen)
  const groups = tabSets(layout)
  const panels = groups.filter((group) => group.id === PANEL_GROUP)
  if (panels.length !== 1) return reject(`${panels.length} panels`)
  const panel = panels[0]!

  for (const location of SIDEBAR_LOCATIONS) {
    if (!borders.some((border) => border.location === location)) borders.push({ type: 'border', location, show: false, selected: -1, children: [] })
  }
  for (const id of Object.keys(viewTitles) as ViewId[]) {
    if (seen.has(id)) continue
    const region: RegionId = defaultRegionOf(id)
    const location = BORDER_LOCATIONS[region]
    const target = location
      ? borders.find((border) => border.location === location)
      : region === 'panel' ? panel : groups.find((group) => group !== panel)
    if (!target) return reject(`nowhere to put ${id}`)
    target.children = [...(target.children ?? []), viewTab(id)]
  }
  return { global: GLOBAL_ATTRIBUTES, borders, layout }
}

export interface ParsedLayout {
  readonly model: IJsonModel
  /** Saved by an older version and migrated: save it again at once. */
  readonly migrated: boolean
}

/**
 * Reads what `serializeLayout` wrote, or a version-1 layout, migrated. Returns `undefined` for "use the default":
 * anything that isn't JSON, an unknown version, an unknown view or node type, a tab that isn't a view, duplicate
 * ids, a bottom or top border, or other than one panel.
 */
export const parseStoredLayout = (raw: string | null): ParsedLayout | undefined => {
  if (raw === null) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return undefined
    if (parsed.version === 1) return { model: checkModel(migrateV1(parsed.model)), migrated: true }
    if (parsed.version !== LAYOUT_VERSION) return undefined
    return { model: checkModel(parsed.model), migrated: false }
  } catch {
    return undefined
  }
}

export const serializeLayout = (model: IJsonModel): string => JSON.stringify({ version: LAYOUT_VERSION, model } satisfies StoredLayout)

/** The first layout for a browser that has none saved yet: the default, with what the old keys remembered. */
export const migratedLayout = (mainViewRaw: string | null, panelSizeRaw: string | null): IJsonModel => {
  const parse = (raw: string | null): unknown => {
    try {
      return raw === null ? undefined : JSON.parse(raw)
    } catch {
      return undefined
    }
  }
  const mainView = parse(mainViewRaw)
  const panelSize = parse(panelSizeRaw)
  return defaultLayout({
    ...(isViewId(mainView) ? { editorView: mainView } : {}),
    ...(typeof panelSize === 'number' && Number.isFinite(panelSize) && panelSize > 0 ? { panelWeight: panelWeightOf(panelSize) } : {}),
  })
}
