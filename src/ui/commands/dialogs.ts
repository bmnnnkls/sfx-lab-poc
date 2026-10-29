import type { CommandContext } from '@state'
import { useSyncExternalStore } from 'react'

/** The command host's popups and dialogs; at most one is open. */
export type HostDialog =
  | { readonly kind: 'palette'; readonly context: CommandContext; readonly returnTo: HTMLElement | null }
  | { readonly kind: 'save-layout' }
  | { readonly kind: 'export-audio' }
  | { readonly kind: 'shortcuts' }

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

/**
 * The element the focus is on, to give it back later. In a menu, which goes away as it closes, the button that opened
 * it (through each submenu's trigger).
 */
export const focusedElement = (): HTMLElement | null => {
  let element = document.activeElement
  for (let menu = element?.closest('[role="menu"]'); menu; menu = element?.closest('[role="menu"]')) {
    const trigger = menu.getAttribute('aria-labelledby')
    element = trigger ? document.getElementById(trigger) : null
  }
  return element instanceof HTMLElement && element !== document.body ? element : null
}
