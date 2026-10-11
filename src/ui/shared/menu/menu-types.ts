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
