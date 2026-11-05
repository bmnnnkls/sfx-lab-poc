import type { LibraryCatalog } from './types'

/**
 * The Factory library: ready-made sounds, effects, note effects and clips built from code, the same on every build, and
 * read-only. Its folder, item, revision and preset-state ids all start with this prefix, so a link or a row knows where
 * its item lives without asking.
 */
export const FACTORY_PREFIX = 'factory:'

/** Whether an id names something in the Factory catalog. */
export const isFactoryId = (id: string): boolean => id.startsWith(FACTORY_PREFIX)

/** What the lazily loaded Factory gives: its catalog, and a description per item id (a side table, not a catalog field). */
export interface FactoryLibrary {
  readonly catalog: LibraryCatalog
  readonly notes: Readonly<Record<string, string>>
}
