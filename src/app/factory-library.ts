import { type FactoryLibrary, loadFactoryModule } from '@core'

let pending: Promise<FactoryLibrary> | undefined

/**
 * The Factory library: its code is a chunk of its own, loaded the first time this is called (the first Library mount, or
 * Sounds showing a Factory link), and its catalog is built from the examples then, once. The build is timed as the
 * `sfxlab:factory-catalog` performance measure. A failed load lets the next call try again.
 */
export const loadFactoryLibrary = (): Promise<FactoryLibrary> =>
  (pending ??= loadFactoryModule().then(
    (module) => {
      const start = performance.now()
      const catalog = module.createFactoryCatalog()
      performance.measure('sfxlab:factory-catalog', { start, end: performance.now() })
      return { catalog, notes: module.factoryNotes }
    },
    (error: unknown) => {
      pending = undefined
      throw error
    },
  ))
