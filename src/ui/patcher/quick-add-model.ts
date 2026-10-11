import { type Catalog, type CatalogCategory, type CatalogEntry, searchCatalog } from './node-catalog'

/** What the quick-add popup remembers: the text, the category drilled into (if any), and the highlighted row. */
export interface QuickAddState {
  readonly query: string
  readonly scope: CatalogCategory | null
  readonly active: number
}

export const INITIAL: QuickAddState = { query: '', scope: null, active: 0 }

/** A row of the list: a category to drill into, or a node to add. */
export type Row =
  | { readonly kind: 'category'; readonly name: CatalogCategory; readonly count: number }
  | { readonly kind: 'entry'; readonly entry: CatalogEntry }

/**
 * With nothing typed and nothing drilled into, the categories; drilled into one, its nodes; with anything typed, the
 * ranked matches across everything (typing is how you skip the drilling).
 */
export const rowsOf = (catalog: Catalog, { query, scope }: QuickAddState): readonly Row[] => {
  if (query.trim() === '' && scope === null) return catalog.categories.map((category): Row => ({ kind: 'category', ...category }))
  return searchCatalog(catalog, query, scope ?? undefined).map((entry): Row => ({ kind: 'entry', entry }))
}

export type QuickAddAction =
  | { readonly type: 'input'; readonly query: string }
  | { readonly type: 'key'; readonly key: string }
  | { readonly type: 'hover'; readonly index: number }
  | { readonly type: 'activate'; readonly index: number }

export interface QuickAddResult {
  readonly state: QuickAddState
  /** The user chose this entry: add it and close. */
  readonly pick?: CatalogEntry
  readonly close?: boolean
  /** The key did something the page must not also do (a Backspace that went up a level, an arrow). */
  readonly handled: boolean
}

const wrap = (index: number, length: number): number => (length === 0 ? 0 : ((index % length) + length) % length)

const activate = (catalog: Catalog, state: QuickAddState, index: number): QuickAddResult => {
  const row = rowsOf(catalog, state)[index]
  if (!row) return { state, handled: true }
  if (row.kind === 'category') return { state: { query: '', scope: row.name, active: 0 }, handled: true }
  return { state, pick: row.entry, close: true, handled: true }
}

/** The whole behaviour of the popup as a pure step, so it is tested without a DOM; the component only forwards events. */
export const step = (catalog: Catalog, state: QuickAddState, action: QuickAddAction): QuickAddResult => {
  switch (action.type) {
    case 'input':
      return { state: { ...state, query: action.query, active: 0 }, handled: false }
    case 'hover':
      return { state: { ...state, active: action.index }, handled: false }
    case 'activate':
      return activate(catalog, state, action.index)
    case 'key': {
      const rows = rowsOf(catalog, state).length
      switch (action.key) {
        case 'ArrowDown':
          return { state: { ...state, active: wrap(state.active + 1, rows) }, handled: true }
        case 'ArrowUp':
          return { state: { ...state, active: wrap(state.active - 1, rows) }, handled: true }
        case 'Enter':
          return activate(catalog, state, state.active)
        case 'Backspace':
          // On an empty field, Backspace goes back up to the categories; otherwise it is just editing.
          return state.query === '' && state.scope !== null
            ? { state: { query: '', scope: null, active: 0 }, handled: true }
            : { state, handled: false }
        case 'Escape':
          return { state, close: true, handled: true }
        default:
          return { state, handled: false }
      }
    }
  }
}
