import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SMOKE_GROUPS } from './browser/groups'

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

/** Where the theme lives: the colour roles are defined here and nowhere else (docs/active/PLAN-round-13a-ui-foundations.md). */
const THEME_DIR = join(SRC, 'ui', 'theme')
const posix = (file: string): string => relative(SRC, file).split(sep).join('/')

/** The files the colour checks read: the views and the app's, with their styles, without the tests. */
const themedFiles = styledFiles.filter((file) => ['ui', 'app'].includes(layerOf(file)))
const isTheme = (file: string): boolean => file.startsWith(THEME_DIR + sep)
const isCss = (file: string): boolean => file.endsWith('.css')

/**
 * Temporary: the canvas renderers still read tokens with fallbacks and literals, until they move onto the theme-colors
 * helper (round 13a, step 4). Empty this set then; the TS side of the colour checks covers them from that step on.
 */
const CANVAS_PENDING = new Set([
  'ui/arrangement/TimelineLanes.tsx',
  'ui/arrangement/ArrangementRuler.tsx',
  'ui/wave-editor/Ruler.tsx',
  'ui/wave-editor/MarkLane.tsx',
  'ui/wave-editor/Overview.tsx',
  'ui/wave-editor/WaveLane.tsx',
  'ui/shared/WaveformThumb.tsx',
  'ui/wave-editor/spectrogram.ts',
])

const stripCssComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** A stylesheet's declarations (selectors and at-rule preludes, which end in `{`, are left out). */
const cssDeclarations = (css: string): { property: string; value: string }[] => {
  const found: { property: string; value: string }[] = []
  for (const [, body, end] of stripCssComments(css).matchAll(/([^;{}]*)([;{}])/g)) {
    const colon = body!.indexOf(':')
    if (end === '{' || colon < 0) continue
    found.push({ property: body!.slice(0, colon).trim(), value: body!.slice(colon + 1) })
  }
  return found
}

const NAMED_COLOURS = [
  'white', 'black', 'red', 'green', 'blue', 'yellow', 'orange', 'gray', 'grey', 'silver', 'purple', 'pink', 'brown', 'cyan',
  'magenta', 'lime', 'navy', 'teal', 'gold', 'maroon', 'olive', 'aqua', 'fuchsia', 'tomato', 'crimson', 'coral', 'salmon',
  'indigo', 'violet', 'khaki', 'ivory', 'beige', 'tan', 'plum', 'orchid', 'turquoise', 'lavender', 'azure', 'chocolate',
  'gainsboro', 'whitesmoke', 'darkgray', 'darkgrey', 'dimgray', 'dimgrey', 'lightgray', 'lightgrey', 'slategray', 'slategrey',
  'darkred', 'darkgreen', 'darkblue', 'lightblue', 'lightgreen', 'skyblue', 'royalblue', 'steelblue', 'firebrick', 'orangered',
  'hotpink', 'deeppink', 'darkorange', 'goldenrod', 'rebeccapurple', 'seagreen', 'forestgreen', 'limegreen', 'mintcream',
  'snow', 'linen', 'wheat', 'sienna', 'peru', 'moccasin', 'bisque', 'honeydew', 'aliceblue', 'ghostwhite',
]
const HEX_COLOUR = String.raw`(?<![\w&#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])`
const COLOUR_FUNCTION = String.raw`(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(`
const NAMED_COLOUR = String.raw`(?<![\w-])(?:${NAMED_COLOURS.join('|')})(?![\w(-])`

/** The colour literals in a CSS value: hex, rgb()/hsl() and the like, and named colours. Strings and url()s are not colours. */
const cssColourLiterals = (value: string): string[] =>
  [...value.replace(/'[^']*'|"[^"]*"|url\([^)]*\)/g, ' ').matchAll(new RegExp(`${HEX_COLOUR}|${COLOUR_FUNCTION}|${NAMED_COLOUR}`, 'gi'))].map((match) => match[0])

/** The colour literals in a string of code: a hex colour, or rgb()/hsl() and the like. */
const codeColourLiterals = (text: string): string[] => [...text.matchAll(new RegExp(`${HEX_COLOUR}|${COLOUR_FUNCTION}`, 'g'))].map((match) => match[0])

/** A var() with a fallback: `var(--x, …)`. */
const FALLBACK = /var\(\s*--[\w-]+\s*,/g

/**
 * The string and template literals in TS/TSX source, comments left out; for a template, its text between the
 * expressions. Quoted strings end at the line's end (a JSX text's apostrophe is not a string). `before` is the code just
 * ahead of the literal, to tell what it is an argument of.
 */
const stringLiterals = (source: string): { text: string; before: string }[] => {
  const found: { text: string; before: string }[] = []
  const expressions: number[] = [] // brace depth at each open `${`
  let depth = 0
  let i = 0
  const before = (at: number): string => source.slice(Math.max(0, at - 40), at)
  const readTemplate = (start: number): void => {
    let text = ''
    while (i < source.length) {
      const char = source[i]!
      if (char === '\\') {
        text += source.slice(i, i + 2)
        i += 2
      } else if (char === '`') {
        found.push({ text, before: before(start) })
        i++
        return
      } else if (char === '$' && source[i + 1] === '{') {
        found.push({ text, before: before(start) })
        expressions.push(depth++)
        i += 2
        return
      } else {
        text += char
        i++
      }
    }
  }
  while (i < source.length) {
    const char = source[i]!
    const next = source[i + 1]
    if (char === '/' && next === '/') {
      const end = source.indexOf('\n', i)
      i = end < 0 ? source.length : end
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2)
      i = end < 0 ? source.length : end + 2
    } else if (char === "'" || char === '"') {
      let end = i + 1
      while (end < source.length && source[end] !== char && source[end] !== '\n') end += source[end] === '\\' ? 2 : 1
      if (source[end] === char) {
        found.push({ text: source.slice(i + 1, end), before: before(i) })
        i = end + 1
      } else i++
    } else if (char === '`') {
      const start = i++
      readTemplate(start)
    } else if (char === '{') {
      depth++
      i++
    } else if (char === '}') {
      depth--
      i++
      if (expressions.length > 0 && expressions[expressions.length - 1] === depth) {
        expressions.pop()
        readTemplate(i)
      }
    } else i++
  }
  return found
}

/** The custom properties a stylesheet sets (`--x:`), comments left out. */
const definedInCss = (css: string): string[] => [...stripCssComments(css).matchAll(/(?<![\w-])(--[\w-]+)\s*:/g)].map((match) => match[1]!)
/** The custom properties a stylesheet reads (`var(--x)`). */
const usedInCss = (css: string): string[] => [...stripCssComments(css).matchAll(/var\(\s*(--[\w-]+)\s*[,)]/g)].map((match) => match[1]!)
const GET_PROPERTY_VALUE = /getPropertyValue\(\s*$/
/** What TS/TSX source sets: a `'--x'` key or `setProperty('--x', …)`. */
const definedInCode = (source: string): string[] =>
  stringLiterals(source)
    .filter((literal) => /^--[\w-]+$/.test(literal.text) && !GET_PROPERTY_VALUE.test(literal.before))
    .map((literal) => literal.text)
/** What TS/TSX source reads: `var(--x)` in a string, and `getPropertyValue('--x')`. */
const usedInCode = (source: string): string[] =>
  stringLiterals(source).flatMap((literal) =>
    GET_PROPERTY_VALUE.test(literal.before) && /^--[\w-]+$/.test(literal.text) ? [literal.text] : usedInCss(literal.text),
  )

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

  it('keeps every browser spec in a folder that a Playwright project runs', () => {
    const browser = resolve(import.meta.dirname, 'browser')
    const specs = (readdirSync(browser, { recursive: true }) as string[]).filter((file) => file.endsWith('.spec.ts'))
    expect(specs.length).toBeGreaterThan(0)
    const folderOf = (file: string): string => (file.includes(sep) ? file.split(sep)[0]! : '')
    const misplaced = specs.filter((file) => {
      const smokeGroup = (SMOKE_GROUPS as readonly string[]).includes(folderOf(file)) && file.split(sep).length === 2
      if (file.endsWith('.smoke.spec.ts')) return !smokeGroup
      if (file.endsWith('.audio.spec.ts')) return folderOf(file) !== 'audio' || file.split(sep).length !== 2
      return true
    })
    expect(misplaced, 'smoke specs go in a group folder (tests/browser/groups.ts), audio specs in audio/').toEqual([])
  })

  it('uses no colour literals outside the theme, so every colour follows the theme', () => {
    const violations: string[] = []
    for (const file of themedFiles) {
      if (isTheme(file) && isCss(file)) continue
      const name = posix(file)
      if (isCss(file)) {
        for (const { property, value } of cssDeclarations(sourceOf(file))) {
          for (const literal of cssColourLiterals(value)) violations.push(`${name}: ${property}: ${literal}`)
        }
      } else if (!CANVAS_PENDING.has(name)) {
        for (const { text } of stringLiterals(sourceOf(file))) {
          for (const literal of codeColourLiterals(text)) violations.push(`${name}: '${text.trim().slice(0, 60)}' has ${literal}`)
        }
      }
    }
    expect(violations, 'use a token from src/ui/theme/dark.css: var(--text), color-mix(in srgb, var(--accent) 12%, transparent)').toEqual([])
    // The check finds what it looks for.
    const css = (source: string) => cssDeclarations(source).flatMap(({ value }) => cssColourLiterals(value))
    expect(css('.a { color: #fff; background: #1b1c1fcc; border: 1px solid rgba(0, 0, 0, 0.5); outline: 1px solid RED }')).toEqual(['#fff', '#1b1c1fcc', 'rgba(', 'RED'])
    expect(css('.a { box-shadow: 0 0 1px hsl(0 0% 0%); fill: white }')).toEqual(['hsl(', 'white'])
    expect(css('.a { color: var(--text); background: transparent; border-color: currentColor; white-space: nowrap; --n: color-mix(in srgb, var(--accent) 12%, transparent) }')).toEqual([])
    expect(css(".red:hover, a[data-colour='red'] { content: 'red #fff'; background: url(#fff); } /* #fff red */")).toEqual([])
    expect(codeColourLiterals('#ff6b6b')).toEqual(['#ff6b6b'])
    expect(codeColourLiterals('1px solid rgba(0,0,0,.5)')).toEqual(['rgba('])
    expect(codeColourLiterals('#root &#39; var(--accent)')).toEqual([])
    expect(stringLiterals("const a = 'x' // 'y'\nconst b = `#abc ${c} rgb(` + \"#fff\" /* 'z' */").map((literal) => literal.text)).toEqual(['x', '#abc ', ' rgb(', '#fff'])
  })

  it('uses no var() fallbacks, so a missing token cannot hide behind one', () => {
    const violations: string[] = []
    for (const file of themedFiles) {
      const name = posix(file)
      if (isCss(file)) {
        for (const match of stripCssComments(sourceOf(file)).matchAll(FALLBACK)) violations.push(`${name}: ${match[0]}…)`)
      } else if (!CANVAS_PENDING.has(name)) {
        for (const { text } of stringLiterals(sourceOf(file))) {
          for (const match of text.matchAll(FALLBACK)) violations.push(`${name}: ${match[0]}…)`)
        }
      }
    }
    expect(violations, 'set a default where the property is meant to be set (on the element or on :root) and write var(--x)').toEqual([])
    // The check finds what it looks for.
    expect(stripCssComments('a { color: var(--play, #4caf50); left: var( --x ,0); top: calc(var(--a) * var(--b)); } /* var(--c, 1) */').match(FALLBACK)).toEqual(['var(--play,', 'var( --x ,'])
  })

  it('defines the same tokens in every theme', () => {
    const themes = readdirSync(THEME_DIR).filter((file) => file.endsWith('.css') && !['scales.css', 'base.css'].includes(file))
    expect(themes).toContain('dark.css')
    const tokensOf = (file: string): Set<string> => new Set(definedInCss(sourceOf(join(THEME_DIR, file))))
    const dark = tokensOf('dark.css')
    expect(dark.size).toBeGreaterThan(40)
    const differences = themes
      .filter((file) => file !== 'dark.css')
      .flatMap((file) => {
        const tokens = tokensOf(file)
        return [
          ...[...dark].filter((token) => !tokens.has(token)).map((token) => `${file} lacks ${token}`),
          ...[...tokens].filter((token) => !dark.has(token)).map((token) => `${file} has ${token}, which dark.css lacks`),
        ]
      })
    expect(differences).toEqual([])
  })

  it('reads only custom properties that something defines', () => {
    const files = [...new Set([...themedFiles, ...styledFiles.filter(isCss)])]
    const defined = new Set(files.flatMap((file) => (isCss(file) ? definedInCss(sourceOf(file)) : definedInCode(sourceOf(file)))))
    const violations: string[] = []
    for (const file of files) {
      const name = posix(file)
      if (CANVAS_PENDING.has(name)) continue
      for (const token of new Set(isCss(file) ? usedInCss(sourceOf(file)) : usedInCode(sourceOf(file)))) {
        if (!defined.has(token)) violations.push(`${name} reads ${token}`)
      }
    }
    expect(violations, 'define it in src/ui/theme (a colour role, in every theme), or set it where it is local').toEqual([])
    // The check finds what it looks for.
    expect(usedInCss('a { color: var(--a); b: calc(var( --b ) + var(--c, 1)); } /* var(--d) */')).toEqual(['--a', '--b', '--c'])
    expect(definedInCss('a { --e: 1; color: var(--f); } /* --g: 2 */')).toEqual(['--e'])
    expect(usedInCode("const a = getComputedStyle(e).getPropertyValue('--h'); const b = 'var(--i)'; const c = `var(--j-${k})`")).toEqual(['--h', '--i'])
    expect(definedInCode("e.style.setProperty('--l', 'x'); const s = { '--m': 1, ['--n' as string]: 2 }; getPropertyValue('--o')")).toEqual(['--l', '--m', '--n'])
  })
})
