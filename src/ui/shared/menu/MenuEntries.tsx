import type { ComponentType, ReactNode } from 'react'
import type { MenuEntry } from './menu-types'
import styles from './Menu.module.css'

/** The pieces of a Radix menu that entries are drawn with; context and dropdown menus both provide them. */
export interface MenuParts {
  Item: ComponentType<{ className?: string; disabled?: boolean; onSelect?: () => void; children?: ReactNode }>
  Separator: ComponentType<{ className?: string }>
}

/** Draws a list of entries. Shared so right-click menus and popup menus look and behave identically. */
export const MenuEntries = ({ entries, parts }: { entries: readonly MenuEntry[]; parts: MenuParts }) => (
  <>
    {entries.map((entry, index) =>
      entry.kind === 'separator' ? (
        <parts.Separator key={`separator-${index}`} className={styles.separator} />
      ) : (
        <parts.Item
          key={`${index}-${entry.label}`}
          className={`${styles.item} ${entry.danger ? styles.danger : ''}`}
          disabled={entry.disabled}
          onSelect={entry.onSelect}
        >
          <span>{entry.label}</span>
          {entry.shortcut && <span className={styles.shortcut}>{entry.shortcut}</span>}
        </parts.Item>
      ),
    )}
  </>
)
