import type { CommandContext } from '@state'
import { useSyncExternalStore } from 'react'

/** The command host's popups and dialogs; at most one is open. */
export type HostDialog =
  | { readonly kind: 'palette'; readonly context: CommandContext; readonly returnTo: HTMLElement | null }

let open: HostDialog | null = null
const listeners = new Set<() => void>()

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Opens one of the host's dialogs (closing any other), or closes it with null. Commands call this. */
export const showDialog = (dialog: HostDialog | null): void => {
  open = dialog
  for (const listener of listeners) listener()
}

export const openDialog = (): HostDialog | null => open

/** The dialog the host shows now. */
export const useOpenDialog = (): HostDialog | null => useSyncExternalStore(subscribe, openDialog)

/** The element the focus is on, if it is one that can take it back. */
export const focusedElement = (): HTMLElement | null =>
  document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null
