import * as Menu from '@radix-ui/react-context-menu'
import type { ReactElement } from 'react'
import { MenuEntries } from './MenuEntries'
import type { MenuEntry } from './menu-types'
import styles from './Menu.module.css'

interface ContextMenuProps {
  /** What the menu offers. Recomputed on every render, so it can reflect the current selection. */
  readonly entries: readonly MenuEntry[]
  /** The single element that opens the menu when right-clicked (or long-pressed on touch). */
  readonly children: ReactElement
}

/**
 * Right-click menu around `children`. A thin wrapper over Radix's headless context menu, which
 * supplies the accessibility work: keyboard navigation, typeahead, focus return and keeping the
 * menu inside the window. Callers only describe entries, so the library can be swapped here alone.
 *
 * To make entries depend on what was clicked, set state from `children`'s own `onContextMenu`;
 * it runs before the menu opens.
 */
export const ContextMenu = ({ entries, children }: ContextMenuProps) => (
  <Menu.Root>
    <Menu.Trigger asChild>{children}</Menu.Trigger>
    <Menu.Portal>
      <Menu.Content className={styles.menu} collisionPadding={8}>
        <MenuEntries entries={entries} parts={{ Item: Menu.Item, Separator: Menu.Separator }} />
      </Menu.Content>
    </Menu.Portal>
  </Menu.Root>
)
