import { EditorPanel } from './editor-panel/EditorPanel'
import { SessionView } from './session-view/SessionView'
import { TransportBar } from './transport-bar/TransportBar'
import styles from './Workspace.module.css'

export const Workspace = () => (
  <div className={styles.workspace}>
    <TransportBar />
    <main className={styles.session}>
      <SessionView />
    </main>
    <section className={styles.editor}>
      <EditorPanel />
    </section>
  </div>
)
