import * as Menu from '@radix-ui/react-dropdown-menu'
import { type ReactElement, type RefObject, useRef } from 'react'
import { MenuEntries } from './MenuEntries'
import type { MenuEntry } from './menu-types'
import styles from './Menu.module.css'

const PARTS = { Item: Menu.Item, Separator: Menu.Separator, Sub: Menu.Sub, SubTrigger: Menu.SubTrigger, SubContent: Menu.SubContent, Portal: Menu.Portal }

interface PopupMenuProps {
  /**
   * What the menu offers. A function builds the list only while the menu is open, inside the menu, so it may call
   * hooks to subscribe to what it reads (*Hide panel* turning into *Show panel*).
   */
  readonly entries: readonly MenuEntry[] | (() => readonly MenuEntry[])
  /** The single element (usually a button) that opens the menu when clicked. */
  readonly children: ReactElement
}

/** Entries whose choice takes the focus note it, so the menu leaves the focus where the entry put it. */
const noting = (entries: readonly MenuEntry[], focusTaken: RefObject<boolean>): readonly MenuEntry[] =>
  entries.map((entry) => {
    if (entry.kind === 'separator') return entry
    if (entry.kind === 'submenu') return { ...entry, entries: noting(entry.entries, focusTaken) }
    return { ...entry, onSelect: () => {
      focusTaken.current = !!entry.takesFocus
      entry.onSelect()
    } }
  })

/** Builds the entries while the menu is open; `build` calls the same hooks on every render. */
const OpenEntries = ({ build, focusTaken }: { build: () => readonly MenuEntry[]; focusTaken: RefObject<boolean> }) =>
  <MenuEntries entries={noting(build(), focusTaken)} parts={PARTS} />

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
            : <MenuEntries entries={noting(entries, focusTaken)} parts={PARTS} />}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  )
}
