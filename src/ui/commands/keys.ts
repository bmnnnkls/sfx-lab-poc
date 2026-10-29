/**
 * Keys as strings: the modifiers, then the key, lower case, joined by `+`: `mod+shift+z`, `ctrl+mod+b`, `f6`,
 * `shift+f6`, `delete`, `space`. `mod` is ⌘ on Apple and Ctrl elsewhere; `ctrl` is ⌃ on Apple; `meta` is the Windows
 * key elsewhere; `alt` is ⌥. Pure, so the tables are tested without a DOM.
 */
export type Key = string

const MODIFIERS = ['ctrl', 'meta', 'mod', 'alt', 'shift'] as const
type Modifier = (typeof MODIFIERS)[number]

/** What `keyOf` reads of a `KeyboardEvent`. */
export interface KeyEventLike {
  readonly key: string
  readonly code: string
  readonly ctrlKey: boolean
  readonly metaKey: boolean
  readonly altKey: boolean
  readonly shiftKey: boolean
}

const MODIFIER_KEYS = new Set(['Control', 'Meta', 'Alt', 'AltGraph', 'Shift', 'CapsLock', 'Fn', 'FnLock', 'Hyper', 'Super', 'OS'])
const LATIN = /^[a-z0-9]$/i
const NAMED: Readonly<Record<string, string>> = { ' ': 'space', '+': 'plus', Esc: 'escape', Spacebar: 'space' }

/** The key itself, without modifiers. Letters and digits by `event.key` when it is a Latin one, else by `event.code`. */
const baseOf = (event: KeyEventLike, apple: boolean): string | undefined => {
  if (MODIFIER_KEYS.has(event.key)) return undefined
  if (LATIN.test(event.key)) return event.key.toLowerCase()
  // ⌥ on a Mac, AltGr and non-Latin layouts change `event.key` (⌥B is "∫"); the physical key still says which letter.
  const code = /^Key([A-Z])$/.exec(event.code) ?? /^Digit([0-9])$/.exec(event.code)
  if (code) return code[1]!.toLowerCase()
  // A Mac's ⌫ is labelled delete; its ⌦ is the forward delete.
  if (apple && event.key === 'Backspace') return 'delete'
  if (apple && event.key === 'Delete') return 'forwarddelete'
  const named = NAMED[event.key]
  if (named) return named
  if (event.key === 'Dead' || event.key === 'Unidentified' || event.key === '') return undefined
  return event.key.toLowerCase()
}

/** The key an event is, or undefined for a modifier pressed alone or a key no binding can name. */
export const keyOf = (event: KeyEventLike, apple: boolean): Key | undefined => {
  const base = baseOf(event, apple)
  if (base === undefined) return undefined
  const held: Record<Modifier, boolean> = apple
    ? { ctrl: event.ctrlKey, meta: false, mod: event.metaKey, alt: event.altKey, shift: event.shiftKey }
    : { ctrl: false, meta: event.metaKey, mod: event.ctrlKey, alt: event.altKey, shift: event.shiftKey }
  return [...MODIFIERS.filter((modifier) => held[modifier]), base].join('+')
}

/** A key written in any order of modifiers, in the canonical one; undefined when it isn't a key. */
export const normalizeKey = (key: string): Key | undefined => {
  const parts = key.toLowerCase().split('+')
  const base = parts.pop()
  if (!base || parts.some((part) => !(MODIFIERS as readonly string[]).includes(part)) || new Set(parts).size !== parts.length) return undefined
  if ((MODIFIERS as readonly string[]).includes(base)) return undefined
  return [...MODIFIERS.filter((modifier) => parts.includes(modifier)), base].join('+')
}

const APPLE_MODIFIERS: Readonly<Record<Modifier, string>> = { ctrl: '⌃', alt: '⌥', shift: '⇧', mod: '⌘', meta: '' }
const OTHER_MODIFIERS: Readonly<Record<Modifier, string>> = { ctrl: 'Ctrl', mod: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Meta' }
const APPLE_ORDER: readonly Modifier[] = ['ctrl', 'alt', 'shift', 'mod']
const OTHER_ORDER: readonly Modifier[] = ['mod', 'ctrl', 'meta', 'alt', 'shift']

const APPLE_NAMES: Readonly<Record<string, string>> = {
  delete: '⌫', forwarddelete: '⌦', enter: '↩', escape: 'Esc', tab: 'Tab', space: 'Space',
  arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', pageup: 'Page Up', pagedown: 'Page Down', plus: '+',
}
const OTHER_NAMES: Readonly<Record<string, string>> = {
  delete: 'Delete', backspace: 'Backspace', enter: 'Enter', escape: 'Esc', tab: 'Tab', space: 'Space',
  arrowup: '↑', arrowdown: '↓', arrowleft: '←', arrowright: '→', pageup: 'Page Up', pagedown: 'Page Down', plus: '+',
}

const nameOf = (base: string, apple: boolean): string =>
  (apple ? APPLE_NAMES : OTHER_NAMES)[base] ?? (base.length === 1 ? base.toUpperCase() : base.charAt(0).toUpperCase() + base.slice(1))

/** How a key is drawn: "⌃⇧⌘B" on Apple (in Apple's order ⌃⌥⇧⌘), "Ctrl+Alt+Shift+B" elsewhere. */
export const keyLabel = (key: Key, apple: boolean): string => {
  const parts = key.split('+')
  const base = nameOf(parts.pop()!, apple)
  const held = new Set(parts)
  if (apple) return `${APPLE_ORDER.filter((modifier) => held.has(modifier)).map((modifier) => APPLE_MODIFIERS[modifier]).join('')}${base}`
  // `ctrl` and `mod` are one key elsewhere.
  const names = [...new Set(OTHER_ORDER.filter((modifier) => held.has(modifier)).map((modifier) => OTHER_MODIFIERS[modifier]))]
  return [...names, base].join('+')
}

/** Whether this browser runs on an Apple device, where `mod` is ⌘. */
export const IS_APPLE = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
