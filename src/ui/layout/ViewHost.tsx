import type { ViewId } from '@state'
import { Activity, useLayoutEffect, useRef } from 'react'
import { VIEW_HIDE } from './view-events'
import { views } from './views'
import styles from './ViewHost.module.css'

/**
 * One view's root. `data-view` is how tests and popups find the view a node belongs to. A hidden view stays mounted
 * inside `<Activity mode="hidden">`: it keeps its state and scroll offsets, and its Effects are cleaned up until it
 * shows again.
 */
export const ViewHost = ({ id, visible }: { id: ViewId; visible: boolean }) => {
  // `<Activity>` detaches refs while hidden, so keep the element from the last time it was attached.
  const root = useRef<HTMLDivElement | null>(null)
  const attach = (element: HTMLDivElement | null) => {
    if (element) root.current = element
  }
  // A layout Effect out here runs before the hidden view's own Effects are cleaned up.
  useLayoutEffect(() => {
    if (!visible) root.current?.dispatchEvent(new Event(VIEW_HIDE))
  }, [visible])

  const View = views[id].component
  return (
    <Activity mode={visible ? 'visible' : 'hidden'}>
      <div ref={attach} data-view={id} className={styles.view}>
        <View />
      </div>
    </Activity>
  )
}
