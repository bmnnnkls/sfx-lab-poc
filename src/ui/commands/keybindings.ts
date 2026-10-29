import { type Key, keyLabel, normalizeKey } from './keys'

/**
 * Where a key works.
 * * `text`: everywhere, also while typing in a field (the palette's and F6).
 * * `outside-text`: not in a text entry (a text-like input, a textarea, a select, contenteditable).
 * * `workspace`: also not in the workbench's chrome, and not on an element that uses Space or Enter itself.
 */
export type KeyScope = 'text' | 'outside-text' | 'workspace'

/** One row of the table: a command's key. `apple` is the key on Apple when it differs. A command may have several. */
export interface KeyRow {
  readonly command: string
  readonly key: Key
  readonly apple?: Key
  readonly scope?: KeyScope
}

/** The global keys. View-local keys (the piano roll's, the trees', the controls') stay in their views: `VIEW_KEYS`. */
export const DEFAULT_KEYS: readonly KeyRow[] = [
  { command: 'history.undo', key: 'mod+z' },
  { command: 'history.redo', key: 'mod+shift+z' },
  { command: 'history.redo', key: 'mod+y' },
  { command: 'view.toggle-main', key: 'tab', scope: 'workspace' },
  { command: 'view.toggle-main', key: 'shift+tab', scope: 'workspace' },
  { command: 'layout.toggle.primary', key: 'mod+alt+b', apple: 'ctrl+mod+b' },
  { command: 'layout.toggle.panel', key: 'mod+alt+j', apple: 'ctrl+mod+j' },
  { command: 'layout.toggle.secondary', key: 'mod+alt+shift+b', apple: 'ctrl+mod+shift+b' },
  { command: 'layout.maximize', key: 'mod+alt+m', apple: 'ctrl+mod+m' },
  { command: 'transport.play-stop', key: 'space', scope: 'workspace' },
  { command: 'edit.delete', key: 'delete' },
  { command: 'edit.delete', key: 'backspace', apple: 'forwarddelete' },
  { command: 'edit.duplicate', key: 'mod+d' },
  { command: 'edit.copy', key: 'mod+c' },
  { command: 'edit.cut', key: 'mod+x' },
  { command: 'edit.paste', key: 'mod+v' },
  { command: 'edit.rename', key: 'f2' },
]

/** A key in effect: a command, its key on this platform and where it works. */
export interface Binding {
  readonly command: string
  readonly key: Key
  readonly scope: KeyScope
}

/** The changed commands' full key lists, by command id; `[]` for none. Saved per browser. */
export type KeyOverrides = Readonly<Record<string, readonly Key[]>>

/** A command's scope: its first default row's, else `outside-text`. */
export const scopeOf = (command: string, defaults: readonly KeyRow[] = DEFAULT_KEYS): KeyScope =>
  defaults.find((row) => row.command === command)?.scope ?? 'outside-text'

/** A command's default keys on this platform. */
export const defaultKeysOf = (command: string, apple: boolean, defaults: readonly KeyRow[] = DEFAULT_KEYS): readonly Key[] =>
  defaults.filter((row) => row.command === command).map((row) => (apple && row.apple) || row.key)

/**
 * The table in effect: each command's defaults, or its override. A key set in an override is taken off any other
 * command of the same scope that has it by default, so two commands never share a key in a scope.
 */
export const bindingsOf = (defaults: readonly KeyRow[], overrides: KeyOverrides, apple: boolean): readonly Binding[] => {
  const commands = [...new Set([...defaults.map((row) => row.command), ...Object.keys(overrides)])]
  const overridden: Binding[] = commands.flatMap((command) =>
    (overrides[command] ?? []).map((key) => ({ command, key, scope: scopeOf(command, defaults) })))
  const taken = new Set(overridden.map((binding) => `${binding.scope} ${binding.key}`))
  const defaulted: Binding[] = commands
    .filter((command) => !(command in overrides))
    .flatMap((command) => defaultKeysOf(command, apple, defaults).map((key) => ({ command, key, scope: scopeOf(command, defaults) })))
    .filter((binding) => !taken.has(`${binding.scope} ${binding.key}`))
  return [...overridden, ...defaulted]
}

/** The keys of a command in effect, in order. */
export const keysOf = (bindings: readonly Binding[], command: string): readonly Key[] =>
  bindings.filter((binding) => binding.command === command).map((binding) => binding.key)

/**
 * Sets a key on a command: added to its keys in effect, and taken off the command of the same scope that had it,
 * whose id comes back as `moved` (the dialog says "Was *Toggle panel*").
 */
export const assignKey = (defaults: readonly KeyRow[], overrides: KeyOverrides, apple: boolean, command: string, key: Key): { overrides: KeyOverrides; moved?: string } => {
  const bindings = bindingsOf(defaults, overrides, apple)
  const scope = scopeOf(command, defaults)
  const holder = bindings.find((binding) => binding.key === key && binding.scope === scope && binding.command !== command)?.command
  const own = keysOf(bindings, command)
  const next: Record<string, readonly Key[]> = { ...overrides, [command]: own.includes(key) ? own : [...own, key] }
  if (holder) next[holder] = keysOf(bindings, holder).filter((candidate) => candidate !== key)
  return { overrides: next, ...(holder && { moved: holder }) }
}

/** Takes one key off a command. */
export const removeKey = (defaults: readonly KeyRow[], overrides: KeyOverrides, apple: boolean, command: string, key: Key): KeyOverrides => ({
  ...overrides,
  [command]: keysOf(bindingsOf(defaults, overrides, apple), command).filter((candidate) => candidate !== key),
})

/** Brings back a command's defaults. */
export const resetKeys = (overrides: KeyOverrides, command: string): KeyOverrides => {
  const { [command]: _reset, ...rest } = overrides
  return rest
}

const KEPT: Readonly<Record<string, string>> = {
  'mod+n': 'opens a new window',
  'mod+t': 'opens a new tab',
  'mod+w': 'closes the tab',
  'mod+q': 'quits the browser',
  'mod+shift+n': 'opens a private window',
  'mod+shift+t': 'reopens a closed tab',
  'mod+shift+w': 'closes the window',
  'mod+tab': 'switches tabs',
  ...Object.fromEntries(Array.from({ length: 9 }, (_, index) => [`mod+${index + 1}`, 'switches to a tab'])),
}

/** Why the browser keeps a key from the page, so it can't be recorded; undefined when the page gets it. */
export const keptKeyReason = (key: Key, apple: boolean, firefox: boolean): string | undefined => {
  const kept = KEPT[key] ?? (firefox && key === 'mod+shift+p' ? 'opens a private window in Firefox' : undefined)
  return kept && `The browser keeps ${keyLabel(key, apple)}: it ${kept}.`
}

const USED: Readonly<Record<string, string>> = {
  'mod+f': 'Find',
  'mod+l': 'the address bar',
  'mod+r': 'Reload',
  'mod+p': 'Print',
  'mod+s': 'Save page',
  'mod+d': 'Bookmark',
  'mod+o': 'Open file',
  'mod+h': 'Hide or History',
  'mod+m': 'Minimize',
}

/** A warning for a key the browser uses but lets the page take; undefined for a free key. */
export const usedKeyWarning = (key: Key, apple: boolean): string | undefined => {
  const used = USED[key]
  return used && `${keyLabel(key, apple)} is also the browser's ${used}; here it runs this command instead.`
}

export const KEYBINDINGS_KEY = 'sfxlab:keybindings'

/**
 * The overrides saved per browser, as `{ version: 1, keys: { [commandId]: string[] } }`. Anything unreadable is
 * ignored and the defaults apply; an id this build doesn't know is kept for the build that does.
 */
export const parseOverrides = (raw: string | null): KeyOverrides => {
  if (!raw) return {}
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return {}
  }
  if (typeof data !== 'object' || data === null || (data as { version?: unknown }).version !== 1) return {}
  const keys = (data as { keys?: unknown }).keys
  if (typeof keys !== 'object' || keys === null || Array.isArray(keys)) return {}
  const overrides: Record<string, readonly Key[]> = {}
  for (const [command, list] of Object.entries(keys)) {
    if (!Array.isArray(list) || !list.every((key) => typeof key === 'string')) continue
    const parsed = (list as string[]).map(normalizeKey)
    if (parsed.some((key) => key === undefined)) continue
    overrides[command] = [...new Set(parsed as Key[])]
  }
  return overrides
}

export const serializeOverrides = (overrides: KeyOverrides): string => JSON.stringify({ version: 1, keys: overrides })

/** The overrides saved in this browser; none when storage can't be read. */
export const loadOverrides = (storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): KeyOverrides => {
  try {
    return parseOverrides(storage?.getItem(KEYBINDINGS_KEY) ?? null)
  } catch {
    return {}
  }
}

/** Saves the overrides in this browser; with none left, the entry is removed. Says whether it could. */
export const saveOverrides = (overrides: KeyOverrides, storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = globalThis.localStorage): boolean => {
  try {
    if (Object.keys(overrides).length === 0) storage?.removeItem(KEYBINDINGS_KEY)
    else storage?.setItem(KEYBINDINGS_KEY, serializeOverrides(overrides))
    return !!storage
  } catch {
    return false
  }
}
