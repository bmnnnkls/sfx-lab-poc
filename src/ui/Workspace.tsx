import { ActivityBar } from './layout/ActivityBar'
import { StatusBar } from './layout/StatusBar'
import { useLayoutPersistence } from './layout/use-layout-persistence'
import { Workbench } from './layout/Workbench'
import { TooltipLayer } from './shared/tooltip/TooltipLayer'
import { useUndoShortcuts } from './shortcuts/use-undo-shortcuts'
import { useViewShortcuts } from './shortcuts/use-view-shortcuts'
import { ToastStack } from './toasts/ToastStack'
import { TransportBar } from './transport-bar/TransportBar'
import styles from './Workspace.module.css'

/** The transport bar, the activity bar beside the layout, and the status bar. */
export const Workspace = () => {
  const layout = useLayoutPersistence()
  useUndoShortcuts()
  useViewShortcuts()

  return (
    <div className={styles.workspace}>
      <TransportBar />
      <div className={styles.body}>
        <ActivityBar />
        <Workbench persistence={layout} />
      </div>
      <StatusBar persistence={layout} />
      <ToastStack />
      <TooltipLayer />
    </div>
  )
}
