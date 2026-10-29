import { useProjectFiles } from '@state'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { useActionContext } from '../shared/menu'
import { type Binding, bindingsOf, DEFAULT_KEYS, type KeyOverrides, keysOf, loadOverrides, saveOverrides } from './keybindings'
import { IS_APPLE, keyLabel } from './keys'
import { type CommandServices, useKeybindings } from './use-keybindings'

interface Keybindings {
  /** The table in effect: the defaults and this browser's overrides. */
  readonly bindings: readonly Binding[]
  readonly overrides: KeyOverrides
  /** Changes the overrides, and saves them in this browser. */
  setOverrides(next: KeyOverrides): void
  /** What every command runs with but the focus. */
  readonly services: CommandServices
}

const KeybindingsContext = createContext<Keybindings | null>(null)

/**
 * Mounted once around the workspace: the keys in effect (read once, saved on each change), the global key listener,
 * and the context the labels read. It renders only when the bindings change, so a tooltip with a key re-renders then
 * and only then.
 */
export const CommandHost = ({ children }: { children: ReactNode }) => {
  const [overrides, setState] = useState(loadOverrides)
  const bindings = useMemo(() => bindingsOf(DEFAULT_KEYS, overrides, IS_APPLE), [overrides])
  const setOverrides = useCallback((next: KeyOverrides) => {
    setState(next)
    saveOverrides(next)
  }, [])
  const { engine, samples, library } = useActionContext()
  const files = useProjectFiles()
  const services = useMemo(() => ({ engine, samples, library, files }), [engine, samples, library, files])
  useKeybindings(bindings, services)
  const value = useMemo(() => ({ bindings, overrides, setOverrides, services }), [bindings, overrides, setOverrides, services])
  return <KeybindingsContext.Provider value={value}>{children}</KeybindingsContext.Provider>
}

export const useKeybindingsContext = (): Keybindings => {
  const value = useContext(KeybindingsContext)
  if (!value) throw new Error('useKeybindingsContext must be used inside CommandHost')
  return value
}

/** The first key of a command in effect, drawn for this platform ("⌃⌘J"); undefined when it has none. */
export const useKeyLabel = (command: string): string | undefined => {
  const value = useContext(KeybindingsContext)
  const key = value ? keysOf(value.bindings, command)[0] : undefined
  return key === undefined ? undefined : keyLabel(key, IS_APPLE)
}

/** "Undo (⌘Z)", or the text alone when the command has no key. */
export const withKey = (text: string, label: string | undefined): string => (label ? `${text} (${label})` : text)
