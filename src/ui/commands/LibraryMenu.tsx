import { PopupMenu } from '../shared/menu'
import { useCommandEntries } from './menu-entries'
import { LIBRARY_MENU } from './menus'

const libraryEntries = () => useCommandEntries(LIBRARY_MENU)

/** Library, after View: save what is selected, *New folder*, import and export, and *Show Library*. */
export const LibraryMenu = () => (
  <PopupMenu entries={libraryEntries}>
    <button>Library</button>
  </PopupMenu>
)
