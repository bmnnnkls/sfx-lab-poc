import { NODE_CATEGORIES, type ModuleLibrary, type NodeCategory } from '@core'
import { norm, tierOf } from '../shared/search-match'

/** What the picker needs to know about a kind of node (a `NodeDefinition` or a `NoteNodeDefinition` fits). */
export interface CatalogSource {
  readonly type: string
  readonly label: string
  readonly description?: string
  readonly category?: NodeCategory
  readonly keywords?: readonly string[]
}

export type CatalogCategory = NodeCategory | 'Modules' | 'Examples'

/** One thing that can be added: a kind of node, a use of a module of the project, or an example module that ships with the app. */
export interface CatalogEntry {
  readonly id: string
  readonly kind: 'node' | 'module' | 'example'
  /** The node type, or the module id. */
  readonly ref: string
  readonly label: string
  readonly category: CatalogCategory
  readonly description: string
  readonly keywords: readonly string[]
}

export interface Catalog {
  readonly entries: readonly CatalogEntry[]
  /** The categories that have something, in the picker's order (modules last), with how many. */
  readonly categories: ReadonlyArray<{ readonly name: CatalogCategory; readonly count: number }>
}

const MODULE_DESCRIPTION = 'A module of this project: a saved sub-patch. Editing it changes every use.'
/** What a node without words is filed under, so it can still be found (a test keeps this from happening). */
const FALLBACK: NodeCategory = 'Routing'

/** An example module as the picker lists it (`ExampleModule` of `@core` fits). */
export interface ExampleSource {
  readonly definition: { readonly id: string; readonly name: string }
  readonly description: string
  readonly keywords: readonly string[]
}

/** The picker's list for a graph: its node types, then the modules that may be placed in it, then the examples that ship with the app. */
export const buildCatalog = (sources: readonly CatalogSource[], modules: ModuleLibrary, examples: readonly ExampleSource[] = []): Catalog => {
  const entries: CatalogEntry[] = [
    ...sources.map((source): CatalogEntry => ({
      id: `node:${source.type}`,
      kind: 'node',
      ref: source.type,
      label: source.label,
      category: source.category ?? FALLBACK,
      description: source.description ?? '',
      keywords: source.keywords ?? [],
    })),
    ...modules.map((module): CatalogEntry => ({
      id: `module:${module.id}`,
      kind: 'module',
      ref: module.id,
      label: module.name,
      category: 'Modules',
      description: MODULE_DESCRIPTION,
      keywords: ['module', 'group', 'subpatch'],
    })),
    ...examples.map((example): CatalogEntry => ({
      id: `example:${example.definition.id}`,
      kind: 'example',
      ref: example.definition.id,
      label: example.definition.name,
      category: 'Examples',
      description: example.description,
      keywords: ['example', 'module', ...example.keywords],
    })),
  ]
  const order: readonly CatalogCategory[] = [...NODE_CATEGORIES, 'Modules', 'Examples']
  const categories = order
    .map((name) => ({ name, count: entries.filter((entry) => entry.category === name).length }))
    .filter((category) => category.count > 0)
  return { entries, categories }
}

/** The tier of an entry for a query (undefined: not a match): its label, then its category, keywords and description. */
const entryTier = (query: string, entry: CatalogEntry): number | undefined =>
  tierOf(query, entry.label, [[entry.category], entry.keywords, [entry.description]])

/**
 * The entries that match, best first: label equal, label prefix, a word of the label, label contains, letters in order,
 * then category, keywords and description; ties go to the shorter label, then to catalog order. An empty query matches
 * everything, in catalog order (or only `category`, when given).
 */
export const searchCatalog = (catalog: Catalog, query: string, category?: CatalogCategory): readonly CatalogEntry[] => {
  const wanted = norm(query).trim()
  if (wanted === '') return category === undefined ? catalog.entries : catalog.entries.filter((entry) => entry.category === category)
  return catalog.entries
    .map((entry, index) => ({ entry, index, tier: entryTier(wanted, entry) }))
    .filter((hit): hit is { entry: CatalogEntry; index: number; tier: number } => hit.tier !== undefined)
    .sort((a, b) => a.tier - b.tier || a.entry.label.length - b.entry.label.length || a.index - b.index)
    .map((hit) => hit.entry)
}
