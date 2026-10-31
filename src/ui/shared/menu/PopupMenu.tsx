import * as Menu from '@radix-ui/react-dropdown-menu'
import { type ReactElement, type RefObject, useRef } from 'react'
import { MenuEntries } from './MenuEntries'
import type { MenuEntry } from './menu-types'
import { notingFocus } from './noting-focus'
import styles from './Menu.module.css'

const PARTS = { Item: Menu.Item, CheckboxItem: Menu.CheckboxItem, Separator: Menu.Separator, Sub: Menu.Sub, SubTrigger: Menu.SubTrigger, SubContent: Menu.SubContent, Portal: Menu.Portal }

interface PopupMenuProps {
  /**
   * What the menu offers. A function builds the list only while the menu is open, inside the menu, so it may call
   * hooks to subscribe to what it reads (*Hide panel* turning into *Show panel*).
   */
  readonly entries: readonly MenuEntry[] | (() => readonly MenuEntry[])
  /** The single element (usually a button) that opens the menu when clicked. */
  readonly children: ReactElement
}

/** Builds the entries while the menu is open; `build` calls the same hooks on every render. */
const OpenEntries = ({ build, focusTaken }: { build: () => readonly MenuEntry[]; focusTaken: RefObject<boolean> }) =>
  <MenuEntries entries={notingFocus(build(), focusTaken)} parts={PARTS} />

/**
 * A menu that opens from a click on its trigger (a "+" button, the File menu), looking and behaving exactly like
 * `ContextMenu`: same entries, same styling, same keyboard handling.
 */
export const PopupMenu = ({ entries, children }: PopupMenuProps) => {
  const focusTaken = useRef(false)
  return (
    <Menu.Root>
      <Menu.Trigger asChild>{children}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          className={styles.menu}
          collisionPadding={8}
          align="start"
          sideOffset={4}
          onCloseAutoFocus={(event) => {
            if (focusTaken.current) event.preventDefault()
            focusTaken.current = false
          }}
        >
          {typeof entries === 'function'
            ? <OpenEntries build={entries} focusTaken={focusTaken} />
            : <MenuEntries entries={notingFocus(entries, focusTaken)} parts={PARTS} />}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
