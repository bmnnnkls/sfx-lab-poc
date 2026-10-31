import { type SampleInfo, frameCount, originOf, savedFrameCount, tempoFromName } from '@core'
import { type Subject, type WaveAt, toggleWavePreview, useProjectStore, useSampleLibrary, useStatusStore, useWaveAudioStore, useWaveEditSettings, useWaveEditorStore, waveViewKey, waveViewOf } from '@state'
import { useEffect, useMemo, useRef } from 'react'
import { useStoredState } from '../shared/use-stored-state'
import { currentView } from './current-view'
import { DetailView } from './DetailView'
import { EditorSettings } from './EditorSettings'
import { EditToolbar } from './EditToolbar'
import { waveformRenderer } from './lane-renderers'
import { Overview } from './Overview'
import { ProcessMenu } from './ProcessMenu'
import { Ruler } from './Ruler'
import { formatTime, isRulerMode, isRulerTempo } from './ruler-ticks'
import { type RulerNow, waveSnapper } from './snap'
import { ViewMenu } from './ViewMenu'
import { resolveZoom } from './wave-geometry'
import { MarkLane } from './MarkLane'
import { marksOf } from './mark-geometry'
import { LaneScale } from './WaveLane'
import { WaveStatus } from './WaveStatus'
import styles from './WaveEditor.module.css'

/** A sample rate as the toolbar shows it: "44.1 kHz", "48 kHz". */
const formatRate = (rate: number) => `${Number((rate / 1000).toFixed(1))} kHz`

/**
 * One library sample in the Wave editor: a toolbar of groups (preview; the edits used most; *Process ▾* and *View ▾*;
 * the sample's facts; ⚙ and ×) that wraps a whole group at a time, the overview (which is the scrollbar), the ruler, a
 * lane per channel with its level scale, and a status bar. Drawn from the open sample's working copy (`useWaveAudioStore`); zoom, scroll, cursor and
 * selection live in `useWaveEditorStore`, so they survive tab switches.
 */
export const SampleEditor = ({ sample, onClose }: { sample: SampleInfo; onClose(): void }) => {
  const library = useSampleLibrary()
  const wave = useWaveAudioStore((state) => (state.current?.sampleId === sample.id && state.current.pane === 'main' ? state.current : null))
  const failed = useWaveAudioStore((state) => state.current === null && state.loading === null)
  const key = waveViewKey('main', originOf(sample))
  const selection = useWaveEditorStore((state) => waveViewOf(state.views, key).selection)
  const cursor = useWaveEditorStore((state) => waveViewOf(state.views, key).cursor)
  const previewing = useStatusStore((state) => state.status?.preview?.sampleId === sample.id)
  const projectTempo = useProjectStore((state) => state.project.tempo)
  const [ruler, setRuler] = useStoredState('sfxlab:wave-ruler', 'time', isRulerMode)
  const [rulerTempo, setRulerTempo] = useStoredState('sfxlab:wave-ruler-tempo', 'project', isRulerTempo)
  const loop = useWaveEditSettings((state) => state.loop)
  const zoomAsked = useWaveEditorStore((state) => waveViewOf(state.views, key).zoomTo !== undefined)
  const detail = useRef<HTMLDivElement>(null)

  // The marks change only with the sample's marks, so the mark lane renders only then.
  const marks = useMemo(() => marksOf(sample), [sample.markers, sample.regions, sample.loop])
  const sampleTempo = tempoFromName(sample.name)
  const bpm = rulerTempo === 'sample' && sampleTempo !== null ? sampleTempo : projectTempo
  // Gestures snap to the beat grid the ruler shows, read when they ask, so a ruler change doesn't render the lanes.
  const rulerNow = useRef<RulerNow>({ mode: ruler, bpm })
  rulerNow.current = { mode: ruler, bpm }
  const snap = useMemo(() => wave && waveSnapper(wave, () => rulerNow.current), [wave])
  const rate = wave?.audio.sampleRate ?? sample.sampleRate

  const at = useMemo<WaveAt>(() => ({ sampleId: sample.id, pane: 'main' }), [sample.id])
  const subject = useMemo<Subject>(() => ({ kind: 'sample-selection', ...at }), [at])
  const channels = wave?.audio.channels.length ?? Math.min(2, sample.channels)
  const length = (wave ? frameCount(wave.audio) : savedFrameCount(sample)) / rate

  // A zoom was asked for (a button, a menu entry, a key, an entry point): do it once the detail has a width and the
  // audio is here.
  useEffect(() => {
    if (!zoomAsked || !wave) return
    let frame = 0
    const tries = { left: 30 }
    const check = () => {
      if (!detail.current?.clientWidth && tries.left-- > 0) return void (frame = requestAnimationFrame(check))
      const store = useWaveEditorStore.getState()
      const asked = store.takeZoom(key)
      if (asked) store.setView(key, resolveZoom(asked, currentView(detail.current, wave).width, frameCount(wave.audio), waveViewOf(store.views, key)))
    }
    check()
    return () => cancelAnimationFrame(frame)
  }, [zoomAsked, wave, key])

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
        <EditToolbar sample={sample} pane="main" wave={wave} selection={selection} />
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
        <span className={styles.facts} role="group" aria-label="Sample">
          <strong className={styles.title} title={sample.name}>
            {sample.name}
          </strong>
          <span>{formatTime(length)}</span>
          <span>{formatRate(rate)}</span>
          <span>{channels > 1 ? 'stereo' : 'mono'}</span>
        </span>
        <span className={`${styles.toolGroup} ${styles.end}`} role="group" aria-label="Editor">
          <EditorSettings />
          <button onClick={onClose} aria-label="Close sample" title="Close this sample">
            ×
          </button>
        </span>
      </div>
      {wave ? (
        <>
          <Overview wave={wave} detail={detail} />
          <Ruler wave={wave} detail={detail} mode={ruler} bpm={bpm} />
          <span className={styles.markLabel} aria-hidden="true">
            Marks
          </span>
          <MarkLane wave={wave} detail={detail} marks={marks} snap={snap!} />
          <div className={styles.scales}>
            {wave.audio.channels.map((_, index) => (
              <LaneScale key={index} renderer={waveformRenderer} />
            ))}
          </div>
          <DetailView wave={wave} frame={detail} snap={snap!} />
        </>
      ) : (
        <p className={styles.loading}>{failed ? 'The audio of this sample is missing; import the file again to edit it.' : 'Loading the waveform…'}</p>
      )}
      <WaveStatus wave={wave} selection={selection} cursor={cursor} rate={rate} />
    </div>
  )
}
