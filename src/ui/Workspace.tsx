import { ActivityBar } from './layout/ActivityBar'
import { useLayoutPersistence } from './layout/use-layout-persistence'
import { Workbench } from './layout/Workbench'
import { TooltipLayer } from './shared/tooltip/TooltipLayer'
import { useUndoShortcuts } from './shortcuts/use-undo-shortcuts'
import { useViewShortcuts } from './shortcuts/use-view-shortcuts'
import { useStatusStore } from '@state'
import { ToastStack } from './toasts/ToastStack'
import { TransportBar } from './transport-bar/TransportBar'
import styles from './Workspace.module.css'

export const Workspace = () => {
  const layout = useLayoutPersistence()
  useUndoShortcuts()
  useViewShortcuts()
  const audioFailure = useStatusStore((state) => state.audioFailure)

  return (
    <div className={styles.workspace}>
      {audioFailure && <div className={styles.audioFailure} role="alert">{audioFailure}. Your project remains available; save or export your work before reloading.</div>}
      <TransportBar />
      <div className={styles.body}>
        <ActivityBar />
        <Workbench persistence={layout} />
      </div>
      <ToastStack />
      <TooltipLayer />
    </div>
  )
}
