// What the app itself says it offers, read from the source through Vite: checks compare the page with this instead of
// keeping their own lists, which went stale every time a node or a category was added.
//
//   import { pickerCategories } from './registry.mjs'
//   await pickerCategories('patch', 'instrument')   // ['Sources', 'Controls', …, 'Examples']
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

let loaded = null
const load = () =>
  (loaded ??= (async () => {
    const { createServer } = await import(join(ROOT, 'node_modules', 'vite', 'dist', 'node', 'index.js'))
    const server = await createServer({ root: ROOT, configFile: join(ROOT, 'vite.config.ts'), server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
    try {
      const [palette, catalog, core] = await Promise.all([
        server.ssrLoadModule('/src/ui/patcher/palette.ts'),
        server.ssrLoadModule('/src/ui/patcher/node-catalog.ts'),
        server.ssrLoadModule('/src/core/index.ts'),
      ])
      return { palette, catalog, core }
    } finally {
      await server.close()
    }
  })())

/**
 * The categories the picker lists, in order, for a graph of a project without modules (as the starter is): `graph` is
 * `patch`, `fx` or `notes`, `kind` the track's kind or `master`.
 */
export const pickerCategories = async (graph, kind) => {
  const { palette, catalog, core } = await load()
  const examples = graph === 'notes' ? [] : core.exampleModules
  return catalog.buildCatalog(palette.paletteFor(graph, kind), [], examples).categories.map((category) => category.name)
}

/** How many demo samples *Add demo samples* puts in the library. */
export const demoSampleCount = async () => (await load()).core.createDemoSamples().length
