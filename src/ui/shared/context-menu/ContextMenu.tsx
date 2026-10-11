import * as Menu from '@radix-ui/react-context-menu'
import type { ReactElement } from 'react'
import styles from './ContextMenu.module.css'

export interface MenuAction {
  readonly kind?: 'action'
  readonly label: string
  /** Display only, e.g. "Ctrl+C". The shortcut itself is wired up by whoever owns it. */
  readonly shortcut?: string
  readonly disabled?: boolean
  /** Styles the item as destructive (red). */
  readonly danger?: boolean
  onSelect(): void
}

export interface MenuSeparator {
  readonly kind: 'separator'
}

export type MenuEntry = MenuAction | MenuSeparator

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
        {entries.map((entry, index) =>
          entry.kind === 'separator' ? (
            <Menu.Separator key={`separator-${index}`} className={styles.separator} />
          ) : (
            <Menu.Item
              key={entry.label}
              className={`${styles.item} ${entry.danger ? styles.danger : ''}`}
              disabled={entry.disabled}
              onSelect={entry.onSelect}
            >
              <span>{entry.label}</span>
              {entry.shortcut && <span className={styles.shortcut}>{entry.shortcut}</span>}
            </Menu.Item>
          ),
        )}
      </Menu.Content>
    </Menu.Portal>
  </Menu.Root>
)
