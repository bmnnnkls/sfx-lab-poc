import * as Menu from '@radix-ui/react-context-menu'
import type { KeyboardEvent, ReactElement, Ref } from 'react'
import { MenuEntries } from './MenuEntries'
import type { MenuEntry } from './menu-types'
import styles from './Menu.module.css'

const PARTS = { Item: Menu.Item, Separator: Menu.Separator, Sub: Menu.Sub, SubTrigger: Menu.SubTrigger, SubContent: Menu.SubContent, Portal: Menu.Portal }

interface ContextMenuProps {
  /**
   * What the menu offers. A list is recomputed on every render, so it can reflect the current selection. A function
   * builds the list only while the menu is open, inside the menu, so it may call hooks to subscribe to what it reads.
   */
  readonly entries: readonly MenuEntry[] | (() => readonly MenuEntry[])
  /** The single element that opens the menu when right-clicked (or long-pressed on touch). */
  readonly children: ReactElement
  /** Called as the menu closes, before the focus returns to the trigger; preventing the event keeps it where it is. */
  onCloseAutoFocus?(event: Event): void
  /** The trigger's element, `children`'s own root. */
  readonly triggerRef?: Ref<HTMLElement>
}

/** Builds the entries while the menu is open; `build` calls the same hooks on every render. */
const OpenEntries = ({ build }: { build: () => readonly MenuEntry[] }) => <MenuEntries entries={build()} parts={PARTS} />

/**
 * Shift+F10 opens the menu of the focused element. Browsers fire `contextmenu` for it on Windows and Linux but not on
 * macOS (where only the Menu key does), so the key is handled here alike everywhere: the browser's own event is
 * prevented, and one is sent from the element's bottom-left corner, where the menu opens.
 */
const openFromKeyboard = (event: KeyboardEvent<HTMLElement>) => {
  if (event.key !== 'F10' || !event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return
  event.preventDefault()
  const box = event.currentTarget.getBoundingClientRect()
  event.currentTarget.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left, clientY: box.bottom }))
}

/**
 * Right-click menu around `children`. A thin wrapper over Radix's headless context menu, which
 * supplies the accessibility work: keyboard navigation, typeahead, focus return and keeping the
 * menu inside the window. Callers only describe entries, so the library can be swapped here alone.
 *
 * Shift+F10 and the Menu key open it on the focused element too. Inside another menu's trigger (a fader in a mixer
 * strip), the innermost menu opens.
 *
 * To make entries depend on what was clicked, set state from `children`'s own `onContextMenu`;
 * it runs before the menu opens.
 */
export const ContextMenu = ({ entries, children, onCloseAutoFocus, triggerRef }: ContextMenuProps) => (
  <Menu.Root>
    <Menu.Trigger asChild ref={triggerRef} onKeyDown={openFromKeyboard} onContextMenu={(event) => event.stopPropagation()}>
      {children}
    </Menu.Trigger>
    <Menu.Portal>
      <Menu.Content className={styles.menu} collisionPadding={8} onCloseAutoFocus={onCloseAutoFocus}>
        {typeof entries === 'function' ? <OpenEntries build={entries} /> : <MenuEntries entries={entries} parts={PARTS} />}
      </Menu.Content>
    </Menu.Portal>
  </Menu.Root>
)
