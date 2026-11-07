import { type ControlOwner, timelineLanesOf, timelineLanesOpen } from '@core'
import { useProjectStore } from '@state'
import { Icon } from '../shared/icon'
import styles from './arrangement.module.css'

/**
 * The lanes twisty on an owner's header: opens its automation lanes under its row. Closed, it shows how many lanes the
 * owner has. Whether it is open is a view field: saved with the song, not an undo step. `corner`: in a clip track's
 * tall header it sits in the bottom-left corner, under the indent, so it takes no room from the name and the buttons.
 */
export const LanesTwisty = ({ owner, name, corner = false }: { owner: ControlOwner; name: string; corner?: boolean }) => {
  const open = useProjectStore((state) => timelineLanesOpen(state.project, owner))
  const count = useProjectStore((state) => timelineLanesOf(state.project, owner).length)
  return (
    <button
      className={`${styles.twisty} ${styles.lanesTwisty} ${corner ? styles.cornerTwisty : ''}`}
      aria-label={`${open ? 'Hide' : 'Show'} automation lanes of ${name}`}
      aria-expanded={open}
      title={`${open ? 'Hide' : 'Show'} automation lanes${count ? ` (${count})` : ''}`}
      data-lanes={count || undefined}
      onClick={(event) => {
        event.stopPropagation()
        useProjectStore.getState().setTimelineLanesOpen(owner, !open)
      }}
    >
      <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
      {!open && count > 0 && <span className={styles.laneCount}>{count}</span>}
    </button>
  )
}
