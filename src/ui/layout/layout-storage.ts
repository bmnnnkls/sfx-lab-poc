import type { RegionId, ViewId } from '@state'
import type { IBorderLocation, IJsonBorderNode, IJsonModel, IJsonRowNode, IJsonTabNode, IJsonTabSetNode } from 'flexlayout-react'
import { BORDER_LOCATIONS, defaultLayout, defaultRegionOf, GLOBAL_ATTRIBUTES, MIN_PANEL_SIZE, viewTab } from './default-layout'
import { viewTitles } from './view-titles'

/** Where the layout is saved, per browser. */
export const LAYOUT_KEY = 'sfxlab:layout'
export const LAYOUT_VERSION = 1

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
        return { ...child, children: children(child).map((tab) => checkTab(tab, seen)) } as IJsonTabSetNode
      }
      return checkRow(child, seen)
    }),
  } as IJsonRowNode
}

const BORDER_ORDER = Object.values(BORDER_LOCATIONS) as IBorderLocation[]

const checkBorders = (value: unknown, seen: Set<string>): IJsonBorderNode[] => {
  if (value === undefined) return []
  if (!Array.isArray(value)) return reject('borders are not a list')
  const locations = new Set<string>()
  return value.map((border): IJsonBorderNode => {
    if (!isRecord(border) || border.type !== 'border') return reject('unknown node type in borders')
    if (!BORDER_ORDER.includes(border.location as IBorderLocation)) return reject(`unknown border location ${String(border.location)}`)
    if (locations.has(border.location as string)) return reject(`duplicate border ${String(border.location)}`)
    locations.add(border.location as string)
    return { ...border, children: children(border).map((tab) => checkTab(tab, seen)) } as IJsonBorderNode
  })
}

/** The first tab set in a row, depth first: where a missing editor view goes. */
const firstTabSet = (row: IJsonRowNode): IJsonTabSetNode | undefined => {
  for (const child of row.children ?? []) {
    const found = child.type === 'tabset' ? child as IJsonTabSetNode : firstTabSet(child as IJsonRowNode)
    if (found) return found
  }
  return undefined
}

/**
 * Validates a saved layout and repairs what a later round can make stale: a view the layout doesn't have goes to
 * its default region, and a missing border is added empty and hidden. Every tab gets the registry's name and
 * tooltip, and the global attributes are always today's.
 */
const checkModel = (value: unknown): IJsonModel => {
  if (!isRecord(value)) return reject('the model is not an object')
  for (const key of ['subLayouts', 'popouts'] as const) {
    if (value[key] !== undefined && (!isRecord(value[key]) || Object.keys(value[key]).length > 0)) reject(`${key} are not supported`)
  }
  const seen = new Set<string>()
  const layout = checkRow(value.layout, seen)
  const borders = checkBorders(value.borders, seen)

  for (const location of BORDER_ORDER) {
    if (!borders.some((border) => border.location === location)) borders.push({ type: 'border', location, show: false, selected: -1, children: [] })
  }
  for (const id of Object.keys(viewTitles) as ViewId[]) {
    if (seen.has(id)) continue
    const region: RegionId = defaultRegionOf(id)
    const location = BORDER_LOCATIONS[region]
    const target = location ? borders.find((border) => border.location === location) : firstTabSet(layout)
    if (!target) return reject(`nowhere to put ${id}`)
    target.children = [...(target.children ?? []), viewTab(id)]
  }
  return { global: GLOBAL_ATTRIBUTES, borders, layout }
}

/**
 * Reads what `serializeLayout` wrote. Returns the model to load, or `undefined` for "use the default": anything
 * that isn't JSON, another version, an unknown view or node type, a tab that isn't a view, or duplicate ids.
 */
export const parseStoredLayout = (raw: string | null): IJsonModel | undefined => {
  if (raw === null) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.version !== LAYOUT_VERSION) return undefined
    return checkModel(parsed.model)
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
    ...(typeof panelSize === 'number' && Number.isFinite(panelSize) && panelSize > 0 ? { panelSize: Math.max(MIN_PANEL_SIZE, Math.round(panelSize)) } : {}),
  })
}
