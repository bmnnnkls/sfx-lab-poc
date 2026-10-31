import { type SampleInfo, originOf, tempoFromName } from '@core'
import {
  type Subject,
  type WaveAt,
  toggleWavePreview,
  useProjectStore,
  useSampleLibrary,
  useStatusStore,
  useWaveAudioStore,
  useWaveEditSettings,
  useWaveEditorStore,
  useWavePanesStore,
  waveViewKey,
  waveViewOf,
} from '@state'
import { useMemo, useRef } from 'react'
import { useStoredState } from '../shared/use-stored-state'
import { EditorSettings } from './EditorSettings'
import { EditToolbar } from './EditToolbar'
import { ProcessMenu } from './ProcessMenu'
import { PaneSplitter } from './PaneSplitter'
import { PaneTitle, SampleFacts } from './PaneTitle'
import { isRulerMode, isRulerTempo } from './ruler-ticks'
import { ViewMenu } from './ViewMenu'
import { WavePane, usePaneSample } from './WavePane'
import styles from './WaveEditor.module.css'

/**
 * The library sample open in the Wave editor: a toolbar of groups (preview; the edits used most; *Process ▾* and *View
 * ▾*; the sample's facts; ⚙ and ×) that wraps a whole group at a time, over its pane (`WavePane`), or two with *View ▾ →
 * Second pane*: then a splitter sets their heights, each has a title row with its sample, and the toolbar acts on the
 * active one, marked with the accent. Zoom, scroll, cursor and selection live in `useWaveEditorStore`, so they survive
 * tab switches.
 */
export const SampleEditor = ({ sample, onClose }: { sample: SampleInfo; onClose(): void }) => {
  const library = useSampleLibrary()
  const [ruler, setRuler] = useStoredState('sfxlab:wave-ruler', 'time', isRulerMode)
  const [rulerTempo, setRulerTempo] = useStoredState('sfxlab:wave-ruler-tempo', 'project', isRulerTempo)
  const projectTempo = useProjectStore((state) => state.project.tempo)
  const loop = useWaveEditSettings((state) => state.loop)

  const split = useWavePanesStore((state) => state.second.open)
  const share = useWavePanesStore((state) => state.second.share)
  const secondSample = usePaneSample('second')
  const panes = useRef<HTMLDivElement>(null)

  // The toolbar's pane and sample: the active one.
  const pane = useWavePanesStore((state) => (state.second.open ? state.active : 'main'))
  const activeSample = usePaneSample(pane) ?? sample
  const at = useMemo<WaveAt>(() => ({ sampleId: activeSample.id, pane }), [activeSample.id, pane])
  const subject = useMemo<Subject>(() => ({ kind: 'sample-selection', ...at }), [at])
  const key = waveViewKey(pane, originOf(activeSample))
  const wave = useWaveAudioStore((state) => (state.panes[pane]?.sampleId === activeSample.id ? state.panes[pane] : null))
  const selection = useWaveEditorStore((state) => waveViewOf(state.views, key).selection)
  const previewing = useStatusStore((state) => state.status?.preview?.sampleId === activeSample.id)
  const sampleTempo = tempoFromName(activeSample.name)

  return (
    <div className={styles.editor} data-testid="sample-editor">
      <div className={styles.editorToolbar}>
        <span className={styles.toolGroup} role="group" aria-label="Preview">
          <button
            onClick={() => toggleWavePreview(library, at)}
            aria-label={previewing ? 'Stop preview' : selection ? 'Play selection' : 'Play from cursor'}
            title={previewing ? 'Stop' : selection ? 'Play the selection' : 'Play from the cursor'}
          >
            {previewing ? '■' : '▶'}
          </button>
          <button aria-pressed={loop} onClick={() => useWaveEditSettings.getState().setLoop(!loop)} title="Loop the preview">
            Loop
          </button>
        </span>
        <EditToolbar sample={activeSample} pane={pane} wave={wave} selection={selection} />
        <span className={styles.toolGroup} role="group" aria-label="Menus">
          <ProcessMenu subject={subject} />
          <ViewMenu
            subject={subject}
            ruler={ruler}
            onRuler={setRuler}
            tempo={rulerTempo}
            onTempo={setRulerTempo}
            projectTempo={projectTempo}
            sampleTempo={sampleTempo}
          />
        </span>
        {!split && (
          // While split, each pane's title row says what it shows.
          <span className={styles.facts} role="group" aria-label="Sample">
            <strong className={styles.title} title={activeSample.name}>
              {activeSample.name}
            </strong>
            <SampleFacts sample={activeSample} pane={pane} />
          </span>
        )}
        <span className={`${styles.toolGroup} ${styles.end}`} role="group" aria-label="Editor">
          <EditorSettings />
          <button onClick={onClose} aria-label="Close sample" title="Close this sample">
            ×
          </button>
        </span>
      </div>
      <div ref={panes} className={`${styles.panes} ${split ? styles.split : ''}`}>
        <WavePane
          pane="main"
          sample={sample}
          ruler={ruler}
          rulerTempo={rulerTempo}
          title={split && <PaneTitle pane="main" sample={sample} />}
          className={split && pane === 'main' ? styles.active : undefined}
          style={split ? { flexGrow: share } : undefined}
        />
        {split && secondSample && (
          <>
            <PaneSplitter panes={panes} />
            <WavePane
              pane="second"
              sample={secondSample}
              ruler={ruler}
              rulerTempo={rulerTempo}
              title={<PaneTitle pane="second" sample={secondSample} />}
              className={pane === 'second' ? styles.active : undefined}
              style={{ flexGrow: 1 - share }}
            />
          </>
        )}
      </div>
    </div>
  )
}
