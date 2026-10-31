import { type SampleInfo, frameCount, originOf, tempoFromName } from '@core'
import { type WavePane as Pane, useProjectStore, useSelectionStore, useWaveAudioStore, useWaveEditorStore, useWavePanesStore, waveViewKey, waveViewOf } from '@state'
import { type ReactNode, useEffect, useMemo, useRef } from 'react'
import { currentView } from './current-view'
import { DetailView } from './DetailView'
import { waveformRenderer } from './lane-renderers'
import { MarkLane } from './MarkLane'
import { marksOf } from './mark-geometry'
import { Overview } from './Overview'
import { Ruler } from './Ruler'
import type { RulerMode, RulerTempo } from './ruler-ticks'
import { type RulerNow, waveSnapper } from './snap'
import { resolveZoom } from './wave-geometry'
import { LaneScale } from './WaveLane'
import { WaveStatus } from './WaveStatus'
import styles from './WaveEditor.module.css'

/** The sample a pane shows, as `paneSampleId` decides, rendered when it changes. */
export const usePaneSample = (pane: Pane): SampleInfo | undefined => {
  const first = useSelectionStore((state) => state.sampleId)
  const second = useWavePanesStore((state) => (pane === 'second' && state.second.open ? state.second.sampleId : null))
  const open = useWavePanesStore((state) => pane === 'main' || state.second.open)
  return useProjectStore((state) => {
    if (!open || first === null) return undefined
    const samples = state.project.samples
    return (second !== null ? samples.find((sample) => sample.id === second) : undefined) ?? samples.find((sample) => sample.id === first)
  })
}

/** The tempo a pane's beats count at: the one in its sample's name, when the ruler is set to it and the name has one. */
export const rulerBpm = (sample: SampleInfo, tempo: RulerTempo, projectTempo: number): number => {
  const fromName = tempoFromName(sample.name)
  return tempo === 'sample' && fromName !== null ? fromName : projectTempo
}

/**
 * One pane of the Wave editor: the overview (which is the scrollbar), the ruler, the mark lane, a lane per channel with
 * its level scale, and a status bar, for one sample at the pane's own zoom, scroll, cursor and selection
 * (`waveViewKey(pane, origin)`). Drawn from the pane's working copy (`useWaveAudioStore.panes`). A press or focus inside
 * makes it the active pane, which the toolbar acts on. `title` is the row above it while the editor is split.
 */
export const WavePane = ({
  pane,
  sample,
  ruler,
  rulerTempo,
  title,
  className,
  style,
}: {
  pane: Pane
  sample: SampleInfo
  ruler: RulerMode
  rulerTempo: RulerTempo
  title?: ReactNode
  className?: string
  style?: React.CSSProperties
}) => {
  const wave = useWaveAudioStore((state) => (state.panes[pane]?.sampleId === sample.id ? state.panes[pane] : null))
  const failed = useWaveAudioStore((state) => state.panes[pane] === null && state.loading[pane] === null)
  const key = waveViewKey(pane, originOf(sample))
  const selection = useWaveEditorStore((state) => waveViewOf(state.views, key).selection)
  const cursor = useWaveEditorStore((state) => waveViewOf(state.views, key).cursor)
  const zoomAsked = useWaveEditorStore((state) => waveViewOf(state.views, key).zoomTo !== undefined)
  const projectTempo = useProjectStore((state) => state.project.tempo)
  const detail = useRef<HTMLDivElement>(null)

  // The marks change only with the sample's marks, so the mark lane renders only then.
  const marks = useMemo(() => marksOf(sample), [sample.markers, sample.regions, sample.loop])
  const bpm = rulerBpm(sample, rulerTempo, projectTempo)
  // Gestures snap to the beat grid the ruler shows, read when they ask, so a ruler change doesn't render the lanes.
  const rulerNow = useRef<RulerNow>({ mode: ruler, bpm })
  rulerNow.current = { mode: ruler, bpm }
  const snap = useMemo(() => wave && waveSnapper(wave, () => rulerNow.current), [wave])
  const rate = wave?.audio.sampleRate ?? sample.sampleRate

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

  const activate = () => {
    if (useWavePanesStore.getState().active !== pane) useWavePanesStore.getState().setActive(pane)
  }

  return (
    <div className={`${styles.pane} ${className ?? ''}`} style={style} data-testid={`wave-pane-${pane}`} onPointerDownCapture={activate} onFocusCapture={activate}>
      {title}
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
