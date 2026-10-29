import { type Command, useLayoutStore } from '@state'
import { groupToFocus, tabButtonId, viewOfElement } from '../layout/group-focus'
import { focusedElement, openDialog, showDialog } from './dialogs'

/** The tab button of the group to move the focus to; none when no group shows. */
const groupTab = (delta: 1 | -1): HTMLElement | null => {
  const target = groupToFocus(useLayoutStore.getState(), viewOfElement(document.activeElement), delta)
  return target ? document.getElementById(tabButtonId(target)) : null
}

/** F6 and Shift+F6: the focus to the next or previous tab group's open tab, the panel and sidebars included. */
const focusGroup = (delta: 1 | -1): Command => ({
  id: delta === 1 ? 'layout.focus-next-group' : 'layout.focus-previous-group',
  category: 'Layout',
  title: delta === 1 ? 'Focus next group' : 'Focus previous group',
  applies: () => groupTab(delta) !== null,
  run: () => groupTab(delta)?.focus(),
})

/** The commands that need `ui`: they move the DOM focus, open dialogs or read the named layouts. */
export const UI_COMMANDS: readonly Command[] = [
  focusGroup(1),
  focusGroup(-1),
  {
    id: 'palette.show',
    category: 'Help',
    title: 'Show all commands',
    // Its key again closes it, so the browser never gets ⌘K (Firefox's web search) while it is open.
    run: (context) => {
      const open = openDialog()
      if (open?.kind !== 'palette') return showDialog({ kind: 'palette', context, returnTo: focusedElement() })
      showDialog(null)
      open.returnTo?.focus({ preventScroll: true })
    },
  },
]
