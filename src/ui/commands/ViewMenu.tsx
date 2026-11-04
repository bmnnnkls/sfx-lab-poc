import { PopupMenu } from '../shared/menu'
import { useCommandEntries } from './menu-entries'
import { VIEW_MENU } from './menus'

const viewEntries = () => useCommandEntries(VIEW_MENU)

/** View, after File: the palette, *Show ▸* every view, the region toggles, maximize and the layouts. */
export const ViewMenu = () => (
  <PopupMenu entries={viewEntries}>
    <button>View</button>
  </PopupMenu>
)
