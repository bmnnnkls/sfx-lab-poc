import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Enforces the layering described in docs/architecture/overview.md:
 *   core  <-  audio, storage, state  <-  ui  <-  app
 * and that modules inside core are only reached through their `index.ts`.
 */

const SRC = resolve(import.meta.dirname, '../src')
const IMPORT_PATTERN = /(?:from|import)\s+['"]([^'"]+)['"]/g

const sourceFiles = (readdirSync(SRC, { recursive: true }) as string[])
  .filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts'))
  .map((file) => join(SRC, file))

/** Source files a view's layout can live in: code and styles. */
const styledFiles = (readdirSync(SRC, { recursive: true }) as string[])
  .filter((file) => /\.(ts|tsx|css)$/.test(file) && !file.endsWith('.d.ts') && !/\.test\.tsx?$/.test(file))
  .map((file) => join(SRC, file))

/**
 * Every file's text, read once while the module loads. The checks then work in memory: when the whole suite runs, the
 * workers compete for the disk, and re-reading every file in every check made them slow enough to time out.
 */
const SOURCES = new Map([...new Set([...sourceFiles, ...styledFiles])].map((file) => [file, readFileSync(file, 'utf8')]))
const sourceOf = (file: string): string => SOURCES.get(file) ?? readFileSync(file, 'utf8')

const importsOf = (file: string): string[] =>
  [...sourceOf(file).matchAll(IMPORT_PATTERN)].map((match) => match[1] as string)

const layerOf = (file: string): string => relative(SRC, file).split(sep)[0] ?? ''

/** Our own path aliases. Anything else starting with `@` is a scoped third-party package. */
const ALIASES = new Set(['@core', '@audio', '@storage', '@state', '@ui'])
const aliasOf = (specifier: string): string | undefined => {
  const root = specifier.split('/')[0] ?? ''
  return ALIASES.has(root) ? root : undefined
}

/** Which `@alias` layers each layer may import. */
const ALLOWED: Record<string, readonly string[]> = {
  core: [],
  audio: ['@core'],
  storage: ['@core'],
  state: ['@core'],
  ui: ['@core', '@state'],
  app: ['@core', '@audio', '@storage', '@state', '@ui'],
}

const EXTERNAL_ALLOWED: Record<string, readonly string[]> = {
  core: [],
  audio: [],
  storage: ['fflate'],
  state: ['react', 'zustand'],
  ui: ['react', 'react-dom', '@radix-ui/react-context-menu', '@radix-ui/react-dropdown-menu', 'flexlayout-react'],
  app: ['react', 'react-dom'],
}

/** Files that place popups and overlays against the window, which is what they are positioned in. */
const WINDOW_SIZED = new Set([
  'ui/patcher/QuickAdd.tsx',
  'ui/shared/tooltip/TooltipLayer.tsx',
  'ui/midi/MidiSettings.module.css',
  'ui/file-menu/ExportAudioDialog.module.css',
  'ui/layout/SaveLayoutDialog.module.css',
])

/** What reads the window's size: script APIs, viewport units, and `@media` queries other than `prefers-*` ones. */
const windowSizeReads = (source: string): string[] => {
  const found = [
    ...[...source.matchAll(/\b(innerWidth|innerHeight|outerWidth|outerHeight|matchMedia)\b/g)].map((match) => match[1]!),
    ...[...source.matchAll(/\b\d+(?:\.\d+)?(?:[dsl]?v[wh]|vmin|vmax)\b/g)].map((match) => match[0]),
  ]
  for (const [, query] of source.matchAll(/@media([^{]*)\{/g)) {
    const features = query!.match(/\([^)]*\)/g) ?? []
    if (features.length === 0 || features.some((feature) => !/^\(\s*prefers-/.test(feature))) found.push(`@media${query!.trimEnd()}`)
  }
  return found
}

describe('architecture', () => {
  it('finds source files to check', () => {
    expect(sourceFiles.length).toBeGreaterThan(20)
  })

  it('only imports from layers below it', () => {
    const violations: string[] = []
    for (const file of sourceFiles) {
      const layer = layerOf(file)
      const allowed = ALLOWED[layer]
      if (!allowed) continue // top-level files such as main.tsx are composition glue
      for (const specifier of importsOf(file)) {
        if (!aliasOf(specifier)) continue
        if (!allowed.includes(specifier)) violations.push(`${relative(SRC, file)} imports ${specifier}`)
      }
    }
    expect(violations).toEqual([])
  })

  it('keeps third-party dependencies out of layers that must stay pure', () => {
    const violations: string[] = []
    for (const file of sourceFiles) {
      const layer = layerOf(file)
      const allowed = EXTERNAL_ALLOWED[layer]
      if (!allowed || file.endsWith('.test.ts') || file.endsWith('.test.tsx')) continue
      for (const specifier of importsOf(file)) {
        const isExternal = !specifier.startsWith('.') && !aliasOf(specifier)
        const isVite = specifier.startsWith('vite') || specifier.endsWith('.css')
        if (isExternal && !isVite && !allowed.includes(specifier)) {
          violations.push(`${relative(SRC, file)} imports ${specifier}`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('imports the docking library only from ui/layout, so an upgrade touches one folder', () => {
    const layoutRoot = join(SRC, 'ui', 'layout') + sep
    const violations = sourceFiles
      .filter((file) => !file.startsWith(layoutRoot))
      .filter((file) => importsOf(file).some((specifier) => specifier === 'flexlayout-react' || specifier.startsWith('flexlayout-react/')))
      .map((file) => relative(SRC, file))
    expect(violations).toEqual([])
  })

  it('builds right-click menus from actions, except the menus that act on view state', () => {
    const menuRoot = join(SRC, 'ui', 'shared', 'menu') + sep
    const allowed = new Set(['ui/clip-editor/PianoRoll.tsx', 'ui/patcher/GraphEditor.tsx', 'ui/patcher/NodeView.tsx'])
    const importsContextMenu = (source: string) =>
      [...source.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*['"][^'"]*shared\/menu(?:\/[^'"]*)?['"]/g)].some((match) => /\bContextMenu\b/.test(match[1]!))
    const violations = sourceFiles
      .filter((file) => !file.startsWith(menuRoot) && !allowed.has(relative(SRC, file).split(sep).join('/')))
      .filter((file) => importsContextMenu(sourceOf(file)))
      .map((file) => relative(SRC, file))
    expect(violations).toEqual([])
    // The check finds what it looks for.
    expect(importsContextMenu("import { ActionMenu, ContextMenu } from '../shared/menu'")).toBe(true)
    expect(importsContextMenu("import { ActionMenu, type MenuEntry } from '../shared/menu'")).toBe(false)
  })

  it('drags and drops through ui/shared/drag, except the drags that stay inside one view', () => {
    const dragRoot = join(SRC, 'ui', 'shared', 'drag') + sep
    // The panel's control reorder, the Samples and Library file drops, and the region toggles, which cancel drags.
    const allowed = new Set(['ui/panel/ControlCell.tsx', 'ui/samples/SamplesPanel.tsx', 'ui/library/LibraryPanel.tsx', 'ui/layout/RegionToggles.tsx'])
    const withoutComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    const usesDrag = (source: string) => /\bdataTransfer\b|\bdraggable\b|\bonDrag\w*|\bonDrop\b/.test(withoutComments(source))
    const violations = sourceFiles
      .filter((file) => !file.startsWith(dragRoot) && !allowed.has(relative(SRC, file).split(sep).join('/')) && !/\.test\.tsx?$/.test(file))
      .filter((file) => usesDrag(sourceOf(file)))
      .map((file) => relative(SRC, file))
    expect(violations).toEqual([])
    // The check finds what it looks for, and not in comments.
    expect(usesDrag('<span draggable onDragStart={start} />')).toBe(true)
    expect(usesDrag('event.dataTransfer.files')).toBe(true)
    expect(usesDrag('/** A draggable selection. */ // onDrop')).toBe(false)
  })

  it('pins the docking library to an exact version', () => {
    const manifest = JSON.parse(readFileSync(resolve(SRC, '../package.json'), 'utf8')) as { dependencies: Record<string, string> }
    expect(manifest.dependencies['flexlayout-react']).toMatch(/^\d+\.\d+\.\d+$/)
  })

  it("lays views out from their own size, never the window's", () => {
    const violations = styledFiles
      .filter((file) => !WINDOW_SIZED.has(relative(SRC, file).split(sep).join('/')))
      .flatMap((file) => windowSizeReads(sourceOf(file)).map((read) => `${relative(SRC, file)}: ${read}`))
    expect(violations).toEqual([])
    // The check finds what it looks for.
    expect(windowSizeReads('@media (max-width: 600px) { a { width: 50vw } } const w = window.innerWidth')).toEqual(['innerWidth', '50vw', '@media (max-width: 600px)'])
    expect(windowSizeReads('@media (prefers-reduced-motion: reduce) { a { transition: none } } @container view (width < 400px) {}')).toEqual([])
  })

  it('reaches other core modules only through their index', () => {
    const coreRoot = join(SRC, 'core')
    const violations: string[] = []
    for (const file of sourceFiles.filter((f) => layerOf(f) === 'core')) {
      const ownModule = relative(coreRoot, file).split(sep)[0]
      for (const specifier of importsOf(file).filter((s) => s.startsWith('.'))) {
        const target = relative(coreRoot, resolve(dirname(file), specifier)).split(sep)
        const crossesModules = target[0] !== ownModule && target[0] !== '..'
        if (crossesModules && target.length > 1) violations.push(`${relative(SRC, file)} imports ${specifier}`)
      }
    }
    expect(violations).toEqual([])
  })
})
