import { EditorPanel } from './editor-panel/EditorPanel'
import { SessionView } from './session-view/SessionView'
import { useUndoShortcuts } from './shortcuts/use-undo-shortcuts'
import { ToastStack } from './toasts/ToastStack'
import { TransportBar } from './transport-bar/TransportBar'
import styles from './Workspace.module.css'

export const Workspace = () => {
  useUndoShortcuts()

  return (
    <div className={styles.workspace}>
      <TransportBar />
      <main className={styles.session}>
        <SessionView />
      </main>
      <section className={styles.editor}>
        <EditorPanel />
      </section>
      <ToastStack />
    </div>
  )
}
