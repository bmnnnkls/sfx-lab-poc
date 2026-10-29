export interface MenuAction {
  readonly kind?: 'action'
  readonly label: string
  /** Display only, e.g. "Ctrl+C". The shortcut itself is wired up by whoever owns it. */
  readonly shortcut?: string
  readonly disabled?: boolean
  /** Styles the item as destructive (red). */
  readonly danger?: boolean
  /** Says more than the label, on hover. */
  readonly tooltip?: string
  /** It moves the focus to a dialog or field of its own, so the menu doesn't give it back to its button as it closes. */
  readonly takesFocus?: boolean
  onSelect(): void
}

export interface MenuSeparator {
  readonly kind: 'separator'
}

/** A nested menu, opened from an item with this label. */
export interface MenuSubmenu {
  readonly kind: 'submenu'
  readonly label: string
  readonly entries: readonly MenuEntry[]
}

export type MenuEntry = MenuAction | MenuSeparator | MenuSubmenu
