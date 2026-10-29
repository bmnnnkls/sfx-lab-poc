import { describe, expect, it } from 'vitest'
import {
  assignKey, bindingsOf, DEFAULT_KEYS, keptKeyReason, KEYBINDINGS_KEY, keysOf, type KeyRow, loadOverrides, parseOverrides, removeKey,
  replaceKeys, resetKeys, saveOverrides, scopeOf, serializeOverrides, usedKeyWarning, VIEW_KEYS,
} from './keybindings'
import { normalizeKey } from './keys'
import { COMMANDS } from './registry'

const ROWS: readonly KeyRow[] = [
  { command: 'a', key: 'mod+alt+b', apple: 'ctrl+mod+b' },
  { command: 'b', key: 'mod+alt+j', apple: 'ctrl+mod+j' },
  { command: 'b', key: 'f9' },
  { command: 'c', key: 'space', scope: 'workspace' },
]

describe('the default table', () => {
  it('names only commands in the registry, with keys written in order, and no key twice in a scope', () => {
    const ids = new Set(COMMANDS.map((command) => command.id))
    for (const row of DEFAULT_KEYS) {
      expect(ids.has(row.command), row.command).toBe(true)
      expect(normalizeKey(row.key)).toBe(row.key)
      if (row.apple) expect(normalizeKey(row.apple)).toBe(row.apple)
    }
    for (const apple of [true, false]) {
      const bindings = bindingsOf(DEFAULT_KEYS, {}, apple)
      expect(new Set(bindings.map((binding) => `${binding.scope} ${binding.key}`)).size).toBe(bindings.length)
    }
  })

  it('lists the view keys as keys', () => {
    for (const row of VIEW_KEYS) for (const key of row.keys) expect(normalizeKey(key), key).toBe(key)
  })

  it('binds nothing a browser keeps', () => {
    for (const apple of [true, false]) {
      for (const binding of bindingsOf(DEFAULT_KEYS, {}, apple)) expect(keptKeyReason(binding.key, apple, false), binding.key).toBeUndefined()
    }
  })
})

describe('bindingsOf', () => {
  it('takes the Apple key on Apple, the other elsewhere, and the scope of the first row', () => {
    expect(keysOf(bindingsOf(ROWS, {}, true), 'a')).toEqual(['ctrl+mod+b'])
    expect(keysOf(bindingsOf(ROWS, {}, false), 'a')).toEqual(['mod+alt+b'])
    expect(bindingsOf(ROWS, {}, false).find((binding) => binding.command === 'c')?.scope).toBe('workspace')
    expect(scopeOf('unbound', ROWS)).toBe('outside-text')
  })

  it("replaces a command's keys with its override, [] for none, and binds a command that had no default", () => {
    const bindings = bindingsOf(ROWS, { b: ['alt+p'], a: [], d: ['f4'] }, true)
    expect(keysOf(bindings, 'a')).toEqual([])
    expect(keysOf(bindings, 'b')).toEqual(['alt+p'])
    expect(bindings.find((binding) => binding.command === 'd')).toEqual({ command: 'd', key: 'f4', scope: 'outside-text' })
  })

  it("takes an overridden key off another command's defaults in the same scope", () => {
    const bindings = bindingsOf(ROWS, { a: ['f9'] }, false)
    expect(keysOf(bindings, 'a')).toEqual(['f9'])
    expect(keysOf(bindings, 'b')).toEqual(['mod+alt+j'])
  })
})

describe('changing keys', () => {
  it('adds a key, moving it off the command that had it, and says which', () => {
    const { overrides, moved } = assignKey(ROWS, {}, true, 'a', 'f9')
    expect(moved).toBe('b')
    expect(overrides).toEqual({ a: ['ctrl+mod+b', 'f9'], b: ['ctrl+mod+j'] })
    expect(keysOf(bindingsOf(ROWS, overrides, true), 'b')).toEqual(['ctrl+mod+j'])
  })

  it('changes a command to one key, taking it off the command that had it', () => {
    const { overrides, moved } = replaceKeys(ROWS, {}, true, 'b', 'ctrl+mod+b')
    expect(moved).toBe('a')
    expect(overrides).toEqual({ a: [], b: ['ctrl+mod+b'] })
    expect(replaceKeys(ROWS, {}, true, 'a', 'alt+p')).toEqual({ overrides: { a: ['alt+p'] } })
  })

  it("doesn't move a key across scopes", () => {
    const { moved } = assignKey(ROWS, {}, true, 'a', 'space')
    expect(moved).toBeUndefined()
  })

  it('removes one key, and resets a command to its defaults', () => {
    const overrides = removeKey(ROWS, {}, false, 'b', 'f9')
    expect(overrides).toEqual({ b: ['mod+alt+j'] })
    expect(resetKeys(overrides, 'b')).toEqual({})
  })
})

describe('kept and used keys', () => {
  it('refuses the keys a browser keeps, with the reason, and Firefox its ⇧⌘P', () => {
    expect(keptKeyReason('mod+t', true, false)).toBe('The browser keeps ⌘T: it opens a new tab.')
    expect(keptKeyReason('mod+5', false, false)).toBe('The browser keeps Ctrl+5: it switches to a tab.')
    expect(keptKeyReason('mod+shift+p', true, false)).toBeUndefined()
    expect(keptKeyReason('mod+shift+p', true, true)).toBe('The browser keeps ⇧⌘P: it opens a private window in Firefox.')
    expect(keptKeyReason('alt+p', true, true)).toBeUndefined()
  })

  it('warns about the keys a browser uses but lets the page take', () => {
    expect(usedKeyWarning('mod+d', true)).toBe("⌘D is also the browser's Bookmark; here it runs this command instead.")
    expect(usedKeyWarning('alt+p', true)).toBeUndefined()
  })
})

describe('saved overrides', () => {
  it('read back what was written, keeping ids this build does not know', () => {
    const overrides = { 'layout.toggle.panel': ['alt+p'], 'someday.command': ['f8'], 'edit.copy': [] }
    expect(parseOverrides(serializeOverrides(overrides))).toEqual(overrides)
  })

  it.each([
    ['nothing', null],
    ['not JSON', '{'],
    ['another version', JSON.stringify({ version: 2, keys: { a: ['f1'] } })],
    ['no keys', JSON.stringify({ version: 1 })],
    ['keys as a list', JSON.stringify({ version: 1, keys: [] })],
  ])('are ignored when unreadable: %s', (_name, raw) => {
    expect(parseOverrides(raw)).toEqual({})
  })

  it('drop an entry that is not a list of keys, and put keys in order', () => {
    const raw = JSON.stringify({ version: 1, keys: { a: 'f1', b: [1], c: ['hyper+x'], d: ['Shift+Mod+K', 'mod+shift+k'] } })
    expect(parseOverrides(raw)).toEqual({ d: ['mod+shift+k'] })
  })

  it('are kept under sfxlab:keybindings, and removed when none are left', () => {
    const stored = new Map<string, string>()
    const storage = { getItem: (key: string) => stored.get(key) ?? null, setItem: (key: string, value: string) => void stored.set(key, value), removeItem: (key: string) => void stored.delete(key) }
    expect(saveOverrides({ a: ['f1'] }, storage)).toBe(true)
    expect(stored.has(KEYBINDINGS_KEY)).toBe(true)
    expect(loadOverrides(storage)).toEqual({ a: ['f1'] })
    saveOverrides({}, storage)
    expect(stored.has(KEYBINDINGS_KEY)).toBe(false)
    expect(loadOverrides({ getItem: () => { throw new Error('denied') } })).toEqual({})
  })
})
