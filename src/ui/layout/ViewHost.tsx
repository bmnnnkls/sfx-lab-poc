import { type ViewId, useLayoutStore } from '@state'
import type { TabNode } from 'flexlayout-react'
import { Activity, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { VIEW_HIDE } from './view-events'
import { views } from './views'
import styles from './ViewHost.module.css'

/**
 * One view's root. `data-view` is how tests and popups find the view a node belongs to, and the root is a landmark
 * named after the view: flexlayout's DOM has no element per region to carry one. It takes the focus on a click, so
 * F6 knows which group the user is in. A hidden view stays mounted
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

  const { component: View, title } = views[id]
  return (
    <Activity mode={visible ? 'visible' : 'hidden'}>
      <div ref={attach} data-view={id} className={styles.view} role="region" aria-label={title} tabIndex={-1}>
        <View />
      </div>
    </Activity>
  )
}

/**
 * flexlayout's factory output for a tab. flexlayout renders a tab the first time it is shown and keeps it mounted;
 * its `visibility` event says when the view is shown or hidden, and the layout store when a collapsed panel hides it.
 */
export const ViewTab = ({ node }: { node: TabNode }) => {
  const id = node.getId() as ViewId
  const [visible, setVisible] = useState(() => node.isVisible())
  // A collapsed panel keeps its open tab selected, so flexlayout still calls it visible; the layout store knows better.
  const collapsed = useLayoutStore((state) => !state.visible.includes(id) && state.groups.some((group) => group.active === id))
  useEffect(() => {
    node.setEventListener('visibility', ({ visible: now }: { visible: boolean }) => setVisible(now))
    setVisible(node.isVisible())
    return () => node.removeEventListener('visibility')
  }, [node])
  return <ViewHost id={id} visible={visible && !collapsed} />
}
