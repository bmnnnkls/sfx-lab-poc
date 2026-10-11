import { useSelectionStore } from '@state'
import { ClipEditor } from '../clip-editor/ClipEditor'
import { NoteEffectsPanel } from '../note-effects/NoteEffectsPanel'
import { Patcher } from '../patcher/Patcher'
import { SamplesPanel } from '../samples/SamplesPanel'
import styles from './EditorPanel.module.css'

/** Bottom panel: switches between the selected track's patcher and the selected clip's piano roll. */
export const EditorPanel = () => {
  const tab = useSelectionStore((state) => state.tab)
  const setTab = useSelectionStore((state) => state.setTab)

  return (
    <div className={styles.panel}>
      <nav className={styles.tabs}>
        <button className={tab === 'device' ? styles.active : ''} onClick={() => setTab('device')}>
          Instrument
        </button>
        <button className={tab === 'notes' ? styles.active : ''} onClick={() => setTab('notes')} title="MIDI effects: change the notes before they reach the instrument">
          Notes
        </button>
        <button className={tab === 'clip' ? styles.active : ''} onClick={() => setTab('clip')}>
          Clip
        </button>
        <button className={tab === 'samples' ? styles.active : ''} onClick={() => setTab('samples')}>
          Samples
        </button>
      </nav>
      <div className={styles.body}>
        {tab === 'device' ? <Patcher /> : tab === 'notes' ? <NoteEffectsPanel /> : tab === 'clip' ? <ClipEditor /> : <SamplesPanel />}
      </div>
    </div>
  )
}
