import { type ControlOwner, timelineLanesOf, timelineLanesOpen } from '@core'
import { useProjectStore } from '@state'
import styles from './arrangement.module.css'

/**
 * The lanes twisty on an owner's header: opens its automation lanes under its row. Closed, it shows how many lanes the
 * owner has. Whether it is open is a view field: saved with the song, not an undo step.
 */
export const LanesTwisty = ({ owner, name }: { owner: ControlOwner; name: string }) => {
  const open = useProjectStore((state) => timelineLanesOpen(state.project, owner))
  const count = useProjectStore((state) => timelineLanesOf(state.project, owner).length)
  return (
    <button
      className={`${styles.twisty} ${styles.lanesTwisty}`}
      aria-label={`${open ? 'Hide' : 'Show'} automation lanes of ${name}`}
      aria-expanded={open}
      title={`${open ? 'Hide' : 'Show'} automation lanes${count ? ` (${count})` : ''}`}
      data-lanes={count || undefined}
      onClick={(event) => {
        event.stopPropagation()
        useProjectStore.getState().setTimelineLanesOpen(owner, !open)
      }}
    >
      {open ? '▾' : '▸'}
      {!open && count > 0 && <span className={styles.laneCount}>{count}</span>}
    </button>
  )
}
