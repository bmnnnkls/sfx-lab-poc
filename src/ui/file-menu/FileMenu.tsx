import { useProjectStore } from '@state'
import { FILE_MENU } from '../commands/menus'
import { useCommandEntries } from '../commands/menu-entries'
import { PopupMenu } from '../shared/menu'
import styles from './FileMenu.module.css'

const fileEntries = () => useCommandEntries(FILE_MENU)

/** Project name and the File menu, built from the File commands (export, import, new, the examples, restore). */
export const FileMenu = () => {
  const name = useProjectStore((state) => state.project.name)
  const setName = useProjectStore((state) => state.setName)

  return (
    <div className={styles.file}>
      <input
        className={styles.name}
        value={name}
        aria-label="Project name"
        onChange={(event) => setName(event.target.value)}
      />
      <PopupMenu entries={fileEntries}>
        <button className={styles.menu}>File</button>
      </PopupMenu>
    </div>
  )
}
