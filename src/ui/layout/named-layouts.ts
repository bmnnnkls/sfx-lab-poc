import type { IJsonModel } from 'flexlayout-react'
import { LAYOUT_VERSION, parseLayoutModel } from './layout-storage'

/** Where layouts saved under a name are kept, per browser, beside the current layout. */
export const NAMED_LAYOUTS_KEY = 'sfxlab:layouts'

export interface StoredNamedLayouts {
  /** The layout version every model in `layouts` was saved by. */
  readonly version: number
  readonly layouts: Readonly<Record<string, IJsonModel>>
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The stored layouts as saved, or none for anything that isn't a container of them. */
const read = (raw: string | null): { version: unknown; layouts: Record<string, unknown> } => {
  try {
    const parsed: unknown = raw === null ? undefined : JSON.parse(raw)
    if (isRecord(parsed) && isRecord(parsed.layouts)) return { version: parsed.version, layouts: parsed.layouts }
  } catch {
    // Not JSON: as if nothing were saved.
  }
  return { version: LAYOUT_VERSION, layouts: {} }
}

/** The saved names, sorted for the menu. */
export const namedLayoutNames = (raw: string | null): string[] =>
  Object.keys(read(raw).layouts).sort((a, b) => a.localeCompare(b))

/**
 * The layout saved under a name, ready to load: checked and migrated like the current layout, so one saved before a
 * later round's views gets them repaired in. Undefined if there is none or it can't be used.
 */
export const namedLayout = (raw: string | null, name: string): IJsonModel | undefined => {
  const { version, layouts } = read(raw)
  return Object.hasOwn(layouts, name) ? parseLayoutModel(version, layouts[name])?.model : undefined
}

/** Every saved layout at today's version (migrating older ones, dropping any that can't be used), changed by `edit`. */
const rewrite = (raw: string | null, edit: (layouts: Map<string, IJsonModel>) => void): string => {
  const layouts = new Map<string, IJsonModel>()
  for (const name of namedLayoutNames(raw)) {
    const model = namedLayout(raw, name)
    if (model) layouts.set(name, model)
  }
  edit(layouts)
  // A Map and `fromEntries`, so any name is an ordinary key ("__proto__" included).
  return JSON.stringify({ version: LAYOUT_VERSION, layouts: Object.fromEntries(layouts) } satisfies StoredNamedLayouts)
}

/** Saves a model under a name; the same name is replaced. */
export const withNamedLayout = (raw: string | null, name: string, model: IJsonModel): string =>
  rewrite(raw, (layouts) => layouts.set(name, model))

export const withoutNamedLayout = (raw: string | null, name: string): string =>
  rewrite(raw, (layouts) => layouts.delete(name))
