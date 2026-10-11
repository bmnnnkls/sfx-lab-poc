import { useStatusStore } from '@state'
import { useRef } from 'react'
import { WaveformThumb } from '../shared/WaveformThumb'
import { useElementWidth } from '../shared/use-element-width'
import styles from './AudioClipEditor.module.css'

interface AudioWaveformProps {
  trackId: string
  clipId: string
  sampleId: string
  lengthBeats: number
  /** In re-pitch mode the waveform spans exactly `lengthBeats`, so a beat grid and playhead make sense. */
  locked: boolean
}

const HEIGHT = 140

/**
 * The sample's waveform, stretched across the clip's length with the beat grid drawn over it. Seeing
 * where the beats fall on the audio is how you tell whether the length is right.
 */
export const AudioWaveform = ({ trackId, clipId, sampleId, lengthBeats, locked }: AudioWaveformProps) => {
  const frame = useRef<HTMLDivElement>(null)
  const width = useElementWidth(frame)

  const playhead = useStatusStore((state) => {
    const launcher = state.status?.tracks[trackId]
    if (!locked || !state.status || launcher?.playingClipId !== clipId || launcher.startBeat === null) return null
    return ((state.status.beat - launcher.startBeat) % lengthBeats) / lengthBeats
  })

  const beats = Math.max(1, lengthBeats)
  const gridLines = {
    '--beat': `calc(100% / ${beats})`,
    '--bar': `calc(100% * 4 / ${beats})`,
  } as React.CSSProperties

  return (
    <div ref={frame} className={styles.waveform} style={{ height: HEIGHT }} data-testid="audio-waveform">
      <WaveformThumb sampleId={sampleId} width={width} height={HEIGHT} />
      {locked && <div className={styles.beatGrid} style={gridLines} />}
      {playhead !== null && <div className={styles.playhead} style={{ left: `${playhead * 100}%` }} />}
    </div>
  )
}
