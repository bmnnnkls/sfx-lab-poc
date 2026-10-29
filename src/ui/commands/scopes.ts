import type { KeyScope } from './keybindings'

/** What the scope rules read of the focused element, so they are tested without a DOM. */
export interface ElementLike {
  readonly tagName: string
  readonly type?: string
  readonly isContentEditable?: boolean
  getAttribute(name: string): string | null
  hasAttribute(name: string): boolean
  closest(selector: string): unknown
}

const TEXT_INPUT_TYPES = new Set(['text', 'number', 'search', 'email', 'url', 'password', 'tel'])

/** A text entry keeps its keys: text-like inputs, textareas, selects and contenteditable. One rule for every key. */
export const isTextEntry = (element: ElementLike | null): boolean => {
  if (!element) return false
  if (element.isContentEditable || element.tagName === 'TEXTAREA' || element.tagName === 'SELECT') return true
  return element.tagName === 'INPUT' && TEXT_INPUT_TYPES.has(element.type ?? 'text')
}

/**
 * The workbench's own chrome, where Tab moves the focus as usual: a tab, a splitter, the activity bar, the region
 * toggles, a tab group's buttons (flexlayout marks them with their layout path) and dialogs.
 */
export const isChromeTarget = (element: ElementLike | null): boolean =>
  !!element?.closest('[role="tab"], [role="separator"], [data-activity-bar], [data-region-toggles], button[data-layout-path], dialog')

const SPACE_ROLES = new Set(['button', 'link', 'checkbox', 'switch', 'radio', 'option', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'treeitem'])
const SPACE_INPUTS = new Set(['button', 'submit', 'reset', 'checkbox', 'radio'])

/** An element that does something on Space or Enter itself: a button, link, checkbox, switch, option, menu or tree item. */
export const usesSpaceOrEnter = (element: ElementLike | null): boolean => {
  if (!element) return false
  const role = element.getAttribute('role')
  if (role) return SPACE_ROLES.has(role)
  if (element.tagName === 'BUTTON' || element.tagName === 'SUMMARY') return true
  if (element.tagName === 'A') return element.hasAttribute('href')
  return element.tagName === 'INPUT' && SPACE_INPUTS.has(element.type ?? '')
}

/** Whether a key of this scope works with the focus on `element` (null: nothing, the page's background). */
export const scopeHolds = (scope: KeyScope, element: ElementLike | null): boolean => {
  if (scope === 'text') return true
  if (isTextEntry(element)) return false
  return scope === 'outside-text' || !(isChromeTarget(element) || usesSpaceOrEnter(element))
}
