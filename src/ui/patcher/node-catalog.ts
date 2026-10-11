import { NODE_CATEGORIES, type ModuleLibrary, type NodeCategory } from '@core'

/** What the picker needs to know about a kind of node (a `NodeDefinition` or a `NoteNodeDefinition` fits). */
export interface CatalogSource {
  readonly type: string
  readonly label: string
  readonly description?: string
  readonly category?: NodeCategory
  readonly keywords?: readonly string[]
}

export type CatalogCategory = NodeCategory | 'Modules'

/** One thing that can be added: a kind of node, or a use of a module of the project. */
export interface CatalogEntry {
  readonly id: string
  readonly kind: 'node' | 'module'
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

/** The picker's list for a graph: its node types, then the modules that may be placed in it. */
export const buildCatalog = (sources: readonly CatalogSource[], modules: ModuleLibrary): Catalog => {
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
  ]
  const order: readonly CatalogCategory[] = [...NODE_CATEGORIES, 'Modules']
  const categories = order
    .map((name) => ({ name, count: entries.filter((entry) => entry.category === name).length }))
    .filter((category) => category.count > 0)
  return { entries, categories }
}

const norm = (text: string): string => text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

const wordsOf = (text: string): string[] => norm(text).split(/[^a-z0-9]+/).filter(Boolean)

/** True when every letter of `query` appears in `text`, in order ("mdhz" is in "midi to hz"). */
const isSubsequence = (query: string, text: string): boolean => {
  let at = 0
  for (const letter of text) if (letter === query[at] && ++at === query.length) return true
  return query.length === 0
}

/** How well the whole query matches the label: lower is better, undefined for no match. */
const labelTier = (query: string, label: string): number | undefined => {
  const text = norm(label)
  if (text === query) return 0
  if (text.startsWith(query)) return 1
  if (wordsOf(label).some((word) => word.startsWith(query))) return 2
  if (text.includes(query)) return 3
  if (isSubsequence(query.replace(/\s+/g, ''), text.replace(/\s+/g, ''))) return 4
  return undefined
}

/** One word of the query against what is not the label: category, keywords, then the description. */
const otherTier = (word: string, entry: CatalogEntry): number | undefined => {
  if (norm(entry.category).includes(word)) return 5
  if (entry.keywords.some((keyword) => norm(keyword).includes(word))) return 6
  if (norm(entry.description).includes(word)) return 7
  return undefined
}

/**
 * The tier of an entry for a query (undefined: not a match). The whole query is first tried against the label; failing
 * that, every word of it must be found somewhere (in the label, category, keywords or description) and the entry ranks by
 * its weakest word.
 */
const tierOf = (query: string, entry: CatalogEntry): number | undefined => {
  const whole = labelTier(query, entry.label)
  if (whole !== undefined) return whole
  const words = query.split(/\s+/).filter(Boolean)
  if (words.length === 0) return undefined
  let weakest = 0
  for (const word of words) {
    const tier = labelTier(word, entry.label) ?? otherTier(word, entry)
    if (tier === undefined) return undefined
    weakest = Math.max(weakest, tier === 4 ? 5 : tier) // a stray subsequence is no better than a category hit
  }
  return Math.max(weakest, 5) // several words, none of them the whole label: below any label match
}

/**
 * The entries that match, best first: label equal, label prefix, a word of the label, label contains, letters in order,
 * then category, keywords and description; ties go to the shorter label, then to catalog order. An empty query matches
 * everything, in catalog order (or only `category`, when given).
 */
export const searchCatalog = (catalog: Catalog, query: string, category?: CatalogCategory): readonly CatalogEntry[] => {
  const wanted = norm(query).trim()
  if (wanted === '') return category === undefined ? catalog.entries : catalog.entries.filter((entry) => entry.category === category)
  return catalog.entries
    .map((entry, index) => ({ entry, index, tier: tierOf(wanted, entry) }))
    .filter((hit): hit is { entry: CatalogEntry; index: number; tier: number } => hit.tier !== undefined)
    .sort((a, b) => a.tier - b.tier || a.entry.label.length - b.entry.label.length || a.index - b.index)
    .map((hit) => hit.entry)
}
