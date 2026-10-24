import { useEffect, useState } from 'react'
import { ArrangementView } from './arrangement'
import { EditorPanel } from './editor-panel/EditorPanel'
import { SessionView } from './session-view/SessionView'
import { Splitter } from './shared/Splitter'
import { TooltipLayer } from './shared/tooltip/TooltipLayer'
import { useStoredState } from './shared/use-stored-state'
import { useUndoShortcuts } from './shortcuts/use-undo-shortcuts'
import { useStatusStore } from '@state'
import { ToastStack } from './toasts/ToastStack'
import { TransportBar } from './transport-bar/TransportBar'
import styles from './Workspace.module.css'

export type MainView = 'session' | 'arrangement'

const isMainView = (value: unknown): value is MainView => value === 'session' || value === 'arrangement'

const isTypingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)

const DEFAULT_EDITOR_HEIGHT = 460
const MIN_EDITOR_HEIGHT = 180
/** Always leave this much of the window for the transport bar and session grid. */
const MIN_SESSION_HEIGHT = 140

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

export const Workspace = () => {
  useUndoShortcuts()
  const audioFailure = useStatusStore((state) => state.audioFailure)
  const [stored, setEditorHeight] = useStoredState('sfxlab:editor-height', DEFAULT_EDITOR_HEIGHT, isNumber)
  const [view, setView] = useStoredState<MainView>('sfxlab:main-view', 'session', isMainView)
  const [windowHeight, setWindowHeight] = useState(window.innerHeight)

  useEffect(() => {
    const onResize = () => setWindowHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    // Tab switches between the session grid and the arrangement, as in Ableton.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return
      event.preventDefault()
      setView(view === 'session' ? 'arrangement' : 'session')
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
    }
  }, [setView, view])

  // The saved height is clamped on use, so a smaller window never hides the session grid.
  const max = Math.max(MIN_EDITOR_HEIGHT, windowHeight - MIN_SESSION_HEIGHT)
  const editorHeight = Math.min(max, Math.max(MIN_EDITOR_HEIGHT, stored))

  return (
    <div className={styles.workspace}>
      {audioFailure && <div className={styles.audioFailure} role="alert">{audioFailure}. Your project remains available; save or export your work before reloading.</div>}
      <TransportBar view={view} onView={setView} />
      <main className={styles.session}>
        {view === 'session' ? <SessionView /> : <ArrangementView />}
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
