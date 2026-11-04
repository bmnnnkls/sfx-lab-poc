import type { LayoutSnapshot, ViewId } from '@state'

/**
 * F6 and Shift+F6: the tab group to move the focus to, as the view whose tab takes it. Cycles through the groups
 * that are showing, editor groups first, then the panel and the sidebars. From outside any group, F6 goes to the
 * first and Shift+F6 to the last. (flexlayout's own `focusNextTabset` skips borders, so the panel would be
 * unreachable.)
 */
export const groupToFocus = (layout: LayoutSnapshot, focusedView: ViewId | undefined, delta: 1 | -1): ViewId | undefined => {
  const groups = layout.groups.filter((group) => !layout.hiddenRegions.includes(group.region) && layout.visible.includes(group.active))
  if (groups.length === 0) return undefined
  const current = focusedView === undefined ? -1 : groups.findIndex((group) => group.views.includes(focusedView))
  const next = current === -1 ? (delta === 1 ? 0 : groups.length - 1) : (current + delta + groups.length) % groups.length
  return groups[next]!.active
}

const TAB_BUTTON_PREFIX = 'flexlayout-tabbutton-'

/** The id flexlayout gives a tab's button. */
export const tabButtonId = (id: ViewId): string => `${TAB_BUTTON_PREFIX}${id}`

/** The view whose tab button the element is on, if it is on one (not on a tab inside a view). */
export const viewOfTab = (element: Element | null): ViewId | undefined => {
  const tab = element?.closest('[role="tab"]')
  return tab?.id.startsWith(TAB_BUTTON_PREFIX) ? tab.id.slice(TAB_BUTTON_PREFIX.length) as ViewId : undefined
}

/** The view the focused element belongs to: inside its root, or on its tab. */
export const viewOfElement = (element: Element | null): ViewId | undefined => {
  const root = element?.closest('[data-view]')
  return root ? root.getAttribute('data-view') as ViewId : viewOfTab(element ?? null)
}
