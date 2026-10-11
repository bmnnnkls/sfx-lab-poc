import * as Menu from '@radix-ui/react-dropdown-menu'
import type { ReactElement } from 'react'
import { MenuEntries } from './MenuEntries'
import type { MenuEntry } from './menu-types'
import styles from './Menu.module.css'

interface PopupMenuProps {
  readonly entries: readonly MenuEntry[]
  /** The single element (usually a button) that opens the menu when clicked. */
  readonly children: ReactElement
}

/**
 * A menu that opens from a click on its trigger (a "+" button, a "more" button), looking and behaving
 * exactly like `ContextMenu`: same entries, same styling, same keyboard handling.
 */
export const PopupMenu = ({ entries, children }: PopupMenuProps) => (
  <Menu.Root>
    <Menu.Trigger asChild>{children}</Menu.Trigger>
    <Menu.Portal>
      <Menu.Content className={styles.menu} collisionPadding={8} align="start" sideOffset={4}>
        <MenuEntries entries={entries} parts={{ Item: Menu.Item, Separator: Menu.Separator }} />
      </Menu.Content>
    </Menu.Portal>
  </Menu.Root>
)
