import { type SampleInfo, frameCount, originOf, tempoFromName } from '@core'
import { useProjectStore, useSampleLibrary, useStatusStore, useWaveAudioStore, useWaveEditorStore, waveViewOf } from '@state'
import { useEffect, useRef } from 'react'
import { useStoredState } from '../shared/use-stored-state'
import { currentView } from './current-view'
import { DetailView } from './DetailView'
import { EditToolbar } from './EditToolbar'
import { Overview } from './Overview'
import { Ruler } from './Ruler'
import { formatTime, isRulerMode, isRulerTempo } from './ruler-ticks'
import { zoomTo } from './wave-geometry'
import styles from './WaveEditor.module.css'

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'

/**
 * One library sample in the Wave editor: a toolbar, the overview (which is the scrollbar), the ruler, a lane per channel,
 * and a status line. Drawn from the open sample's working copy (`useWaveAudioStore`); zoom, scroll, cursor and
 * selection live in `useWaveEditorStore`, so they survive tab switches.
 */
export const SampleEditor = ({ sample, onClose }: { sample: SampleInfo; onClose(): void }) => {
  const library = useSampleLibrary()
  const wave = useWaveAudioStore((state) => (state.current?.sampleId === sample.id ? state.current : null))
  const failed = useWaveAudioStore((state) => state.current === null && state.loading === null)
  const key = originOf(sample)
  const selection = useWaveEditorStore((state) => waveViewOf(state.views, key).selection)
  const cursor = useWaveEditorStore((state) => waveViewOf(state.views, key).cursor)
  const previewing = useStatusStore((state) => state.status?.preview?.sampleId === sample.id)
  const projectTempo = useProjectStore((state) => state.project.tempo)
  const [ruler, setRuler] = useStoredState('sfxlab:wave-ruler', 'time', isRulerMode)
  const [rulerTempo, setRulerTempo] = useStoredState('sfxlab:wave-ruler-tempo', 'project', isRulerTempo)
  const [loop, setLoop] = useStoredState('sfxlab:wave-loop', false, isBoolean)
  const zoomPending = useWaveEditorStore((state) => waveViewOf(state.views, key).zoomPending === true)
  const detail = useRef<HTMLDivElement>(null)

  const sampleTempo = tempoFromName(sample.name)
  const bpm = rulerTempo === 'sample' && sampleTempo !== null ? sampleTempo : projectTempo
  const rate = wave?.audio.sampleRate ?? sample.sampleRate

  const play = () => {
    if (previewing) return library.stopPreview()
    library.preview(sample.id, selection ? { from: selection.from, to: selection.to, loop } : { from: cursor, loop })
  }

  const zoom = (range: { from: number; to: number } | null) => {
    if (!wave) return
    const frames = frameCount(wave.audio)
    const store = useWaveEditorStore.getState()
    if (!range) return store.setView(key, { framesPerPixel: null, startFrame: 0 })
    const width = currentView(detail.current, wave).width
    const next = zoomTo(range.from, range.to, width, frames)
    store.setView(key, { framesPerPixel: next.framesPerPixel, startFrame: next.startFrame })
  }

  // An entry point asked to show a part of the sample: zoom to it once the detail has a width and the audio is here.
  useEffect(() => {
    if (!zoomPending || !wave) return
    let frame = 0
    const tries = { left: 30 }
    const check = () => {
      if (!detail.current?.clientWidth && tries.left-- > 0) return void (frame = requestAnimationFrame(check))
      zoom(waveViewOf(useWaveEditorStore.getState().views, key).selection)
      useWaveEditorStore.getState().setView(key, { zoomPending: false })
    }
    check()
    return () => cancelAnimationFrame(frame)
  }, [zoomPending, wave, key])

  return (
    <div className={styles.editor} data-testid="sample-editor">
      <div className={styles.editorToolbar}>
        <strong className={styles.title}>{sample.name}</strong>
        <button onClick={play} aria-label={previewing ? 'Stop preview' : selection ? 'Play selection' : 'Play from cursor'} title={previewing ? 'Stop' : selection ? 'Play the selection' : 'Play from the cursor'}>
          {previewing ? '■' : '▶'}
        </button>
        <button aria-pressed={loop} onClick={() => setLoop(!loop)} title="Loop the preview">
          Loop
        </button>
        <button onClick={() => zoom(selection)} disabled={!wave || !selection} title="Zoom to the selection">
          Zoom to selection
        </button>
        <button onClick={() => zoom(null)} disabled={!wave} title="Show the whole sample">
          Zoom to fit
        </button>
        <button onClick={() => setRuler(ruler === 'time' ? 'beats' : 'time')} title="Switch the ruler between time and bars and beats">
          {ruler === 'time' ? 'Time' : 'Beats'}
        </button>
        {ruler === 'beats' && (
          <button
            onClick={() => setRulerTempo(rulerTempo === 'project' ? 'sample' : 'project')}
            disabled={sampleTempo === null}
            title={sampleTempo === null ? 'The sample has no tempo in its name' : 'Count beats at the project tempo or the tempo in the sample name'}
          >
            {rulerTempo === 'sample' && sampleTempo !== null ? `Sample ${sampleTempo} BPM` : `Project ${projectTempo} BPM`}
          </button>
        )}
        <button onClick={onClose} title="Close this sample">
          Close
        </button>
        <EditToolbar sample={sample} wave={wave} selection={selection} cursor={cursor} />
      </div>
      {wave ? (
        <>
          <Overview wave={wave} detail={detail} />
          <Ruler wave={wave} detail={detail} mode={ruler} bpm={bpm} />
          <DetailView wave={wave} frame={detail} />
        </>
      ) : (
        <p className={styles.loading}>{failed ? 'The audio of this sample is missing; import the file again to edit it.' : 'Loading the waveform…'}</p>
      )}
      <p className={styles.statusLine} data-testid="wave-status">
        {selection
          ? `Selection ${formatTime(selection.from / rate)} – ${formatTime(selection.to / rate)} (${formatTime((selection.to - selection.from) / rate)})${selection.channels === 'both' ? '' : `, ${selection.channels} only`}`
          : `Cursor ${formatTime(cursor / rate)}`}
      </p>
    </div>
  )
}
