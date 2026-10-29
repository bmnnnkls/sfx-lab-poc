import type { ComponentType, ReactNode } from 'react'
import type { MenuEntry } from './menu-types'
import styles from './Menu.module.css'

/** The pieces of a Radix menu that entries are drawn with; context and dropdown menus both provide them. */
export interface MenuParts {
  Item: ComponentType<{ className?: string; disabled?: boolean; title?: string; onSelect?: () => void; children?: ReactNode }>
  Separator: ComponentType<{ className?: string }>
  Sub: ComponentType<{ children?: ReactNode }>
  SubTrigger: ComponentType<{ className?: string; children?: ReactNode }>
  SubContent: ComponentType<{ className?: string; collisionPadding?: number; children?: ReactNode }>
  Portal: ComponentType<{ children?: ReactNode }>
}

/** Draws a list of entries. Shared so right-click menus and popup menus look and behave identically. */
export const MenuEntries = ({ entries, parts }: { entries: readonly MenuEntry[]; parts: MenuParts }) => (
  <>
    {entries.map((entry, index) =>
      entry.kind === 'separator' ? (
        <parts.Separator key={`separator-${index}`} className={styles.separator} />
      ) : entry.kind === 'submenu' ? (
        <parts.Sub key={`${index}-${entry.label}`}>
          <parts.SubTrigger className={styles.item}>
            <span>{entry.label}</span>
            <span className={styles.shortcut} aria-hidden="true">▸</span>
          </parts.SubTrigger>
          <parts.Portal>
            <parts.SubContent className={styles.menu} collisionPadding={8}>
              <MenuEntries entries={entry.entries} parts={parts} />
            </parts.SubContent>
          </parts.Portal>
        </parts.Sub>
      ) : (
        <parts.Item
          key={`${index}-${entry.label}`}
          className={`${styles.item} ${entry.danger ? styles.danger : ''}`}
          disabled={entry.disabled}
          title={entry.tooltip}
          onSelect={entry.onSelect}
        >
          <span>{entry.label}</span>
          {entry.shortcut && <span className={styles.shortcut}>{entry.shortcut}</span>}
        </parts.Item>
      ),
    )}
  </>
)
