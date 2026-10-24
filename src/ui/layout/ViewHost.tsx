import type { ViewId } from '@state'
import type { TabNode } from 'flexlayout-react'
import { Activity, useEffect, useLayoutEffect, useRef, useState } from 'react'
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

/**
 * flexlayout's factory output for a tab. flexlayout renders a tab the first time it is shown and keeps it mounted;
 * its `visibility` event says when the view is shown or hidden.
 */
export const ViewTab = ({ node }: { node: TabNode }) => {
  const [visible, setVisible] = useState(() => node.isVisible())
  useEffect(() => {
    node.setEventListener('visibility', ({ visible: now }: { visible: boolean }) => setVisible(now))
    setVisible(node.isVisible())
    return () => node.removeEventListener('visibility')
  }, [node])
  return <ViewHost id={node.getId() as ViewId} visible={visible} />
}
