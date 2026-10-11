import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Enforces the layering described in ARCHITECTURE.md:
 *   core  <-  audio, state  <-  ui  <-  app
 * and that modules inside core are only reached through their `index.ts`.
 */

const SRC = resolve(import.meta.dirname, '../src')
const IMPORT_PATTERN = /(?:from|import)\s+['"]([^'"]+)['"]/g

const sourceFiles = (readdirSync(SRC, { recursive: true }) as string[])
  .filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts'))
  .map((file) => join(SRC, file))

const importsOf = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(IMPORT_PATTERN)].map((match) => match[1] as string)

const layerOf = (file: string): string => relative(SRC, file).split(sep)[0] ?? ''

/** Which `@alias` layers each layer may import. */
const ALLOWED: Record<string, readonly string[]> = {
  core: [],
  audio: ['@core'],
  state: ['@core'],
  ui: ['@core', '@state'],
  app: ['@core', '@audio', '@state', '@ui'],
}

const EXTERNAL_ALLOWED: Record<string, readonly string[]> = {
  core: [],
  audio: [],
  state: ['react', 'zustand'],
  ui: ['react', 'react-dom'],
  app: ['react', 'react-dom'],
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
        if (!specifier.startsWith('@')) continue
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
        const isExternal = !specifier.startsWith('.') && !specifier.startsWith('@')
        const isVite = specifier.startsWith('vite') || specifier.endsWith('.css')
        if (isExternal && !isVite && !allowed.includes(specifier)) {
          violations.push(`${relative(SRC, file)} imports ${specifier}`)
        }
      }
    }
    expect(violations).toEqual([])
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
