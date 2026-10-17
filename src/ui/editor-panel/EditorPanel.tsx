import { lazy, Suspense } from 'react'
const LibraryPanel = lazy(() => import('../library/LibraryPanel').then(module => ({ default: module.LibraryPanel })))
import { PresetsPanel } from '../presets/PresetsPanel'
import { useSelectionStore } from '@state'
import { ClipEditor } from '../clip-editor/ClipEditor'
import { MixerPanel } from '../mixer/MixerPanel'
import { FxPanel } from '../patcher/FxPanel'
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
        <button className={tab === 'fx' ? styles.active : ''} onClick={() => setTab('fx')} title="Effects: process the track's sound after the instrument (or the samples) and before the fader">
          Effects
        </button>
        <button className={tab === 'notes' ? styles.active : ''} onClick={() => setTab('notes')} title="MIDI effects: change the notes before they reach the instrument">
          Notes
        </button>
        <button className={tab === 'clip' ? styles.active : ''} onClick={() => setTab('clip')}>
          Clip
        </button>
        <button className={tab === 'mixer' ? styles.active : ''} onClick={() => setTab('mixer')} title="Mixer: a channel strip for every track, the returns and the master">
          Mixer
        </button>
        <button className={tab === 'samples' ? styles.active : ''} onClick={() => setTab('samples')}>
          Samples
        </button>
        <button className={tab === 'presets' ? styles.active : ''} onClick={() => setTab('presets')}>Sounds</button>
        <button className={tab === 'library' ? styles.active : ''} onClick={() => setTab('library')}>Library</button>
      </nav>
      <div className={styles.body}>
        {tab === 'library' ? <Suspense fallback={<p>Opening library…</p>}><LibraryPanel /></Suspense> : tab === 'presets' ? <PresetsPanel /> : tab === 'device' ? <Patcher /> : tab === 'fx' ? <FxPanel /> : tab === 'notes' ? <NoteEffectsPanel /> : tab === 'clip' ? <ClipEditor /> : tab === 'mixer' ? <MixerPanel /> : <SamplesPanel />}
      </div>
    </div>
  )
}
