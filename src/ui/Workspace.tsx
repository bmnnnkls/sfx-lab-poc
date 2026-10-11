import { useEffect, useState } from 'react'
import { EditorPanel } from './editor-panel/EditorPanel'
import { SessionView } from './session-view/SessionView'
import { Splitter } from './shared/Splitter'
import { TooltipLayer } from './shared/tooltip/TooltipLayer'
import { useStoredState } from './shared/use-stored-state'
import { useUndoShortcuts } from './shortcuts/use-undo-shortcuts'
import { ToastStack } from './toasts/ToastStack'
import { TransportBar } from './transport-bar/TransportBar'
import styles from './Workspace.module.css'

const DEFAULT_EDITOR_HEIGHT = 460
const MIN_EDITOR_HEIGHT = 180
/** Always leave this much of the window for the transport bar and session grid. */
const MIN_SESSION_HEIGHT = 140

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export const Workspace = () => {
  useUndoShortcuts()
  const [stored, setEditorHeight] = useStoredState('sfxlab:editor-height', DEFAULT_EDITOR_HEIGHT, isNumber)
  const [windowHeight, setWindowHeight] = useState(window.innerHeight)

  useEffect(() => {
    const onResize = () => setWindowHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // The saved height is clamped on use, so a smaller window never hides the session grid.
  const max = Math.max(MIN_EDITOR_HEIGHT, windowHeight - MIN_SESSION_HEIGHT)
  const editorHeight = Math.min(max, Math.max(MIN_EDITOR_HEIGHT, stored))

  return (
    <div className={styles.workspace}>
      <TransportBar />
      <main className={styles.session}>
        <SessionView />
      </main>
      <Splitter size={editorHeight} min={MIN_EDITOR_HEIGHT} max={max} onResize={setEditorHeight} />
      <section className={styles.editor} style={{ height: editorHeight }}>
        <EditorPanel />
      </section>
      <ToastStack />
      <TooltipLayer />
    </div>
  )
}
