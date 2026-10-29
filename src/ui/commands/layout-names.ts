import { useSyncExternalStore } from 'react'
import type { LayoutPersistence } from '../layout/use-layout-persistence'

/**
 * The layouts saved under a name, for the commands and menus that list them. The shell's persistence owns them; the
 * command host attaches it, and only the commands here change the names, so they are read again after each change.
 */
let persistence: LayoutPersistence | null = null
let names: readonly string[] = []
const listeners = new Set<() => void>()

const refresh = () => {
  names = persistence?.names() ?? []
  for (const listener of listeners) listener()
}

/** The command host's: where the named layouts are kept. Returns the detach function. */
export const attachLayoutNames = (next: LayoutPersistence): (() => void) => {
  persistence = next
  refresh()
  return () => {
    if (persistence !== next) return
    persistence = null
    refresh()
  }
}

export const layoutNames = (): readonly string[] => names

export const deleteNamedLayout = (name: string): void => {
  persistence?.deleteNamed(name)
  refresh()
}

/** After *Save layout as…*, which the layout store carries out. */
export const layoutNamesChanged = refresh

export const useLayoutNames = (): readonly string[] =>
  useSyncExternalStore((listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }, layoutNames)
