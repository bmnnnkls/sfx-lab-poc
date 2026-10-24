import type { ViewId } from '@state'
import { views } from './views'
import styles from './ViewHost.module.css'

/** One view's root. `data-view` is how tests and popups find the view a node belongs to. */
export const ViewHost = ({ id }: { id: ViewId }) => {
  const View = views[id].component
  return (
    <div data-view={id} className={styles.view}>
      <View />
    </div>
  )
}
