import { CommandHost } from './commands/CommandHost'
import { ActivityBar } from './layout/ActivityBar'
import { StatusBar } from './layout/StatusBar'
import { useLayoutPersistence } from './layout/use-layout-persistence'
import { Workbench } from './layout/Workbench'
import { TooltipLayer } from './shared/tooltip/TooltipLayer'
import { ToastStack } from './toasts/ToastStack'
import { TransportBar } from './transport-bar/TransportBar'
import styles from './Workspace.module.css'

/** The transport bar, the activity bar beside the layout, and the status bar; the command host around them holds the keys. */
export const Workspace = () => {
  const layout = useLayoutPersistence()

  return (
    <CommandHost persistence={layout}>
    <div className={styles.workspace}>
      <TransportBar />
      <div className={styles.body}>
        <ActivityBar />
        <Workbench persistence={layout} />
      </div>
      <StatusBar />
      <ToastStack />
      <TooltipLayer />
    </div>
    </CommandHost>
  )
}
