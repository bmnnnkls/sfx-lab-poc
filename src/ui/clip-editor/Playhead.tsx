import { useStatusStore } from '@state'
import { type RefObject, useEffect } from 'react'
import { KEY_WIDTH } from './piano-roll-geometry'
import styles from './PianoRoll.module.css'

interface PlayheadProps {
  trackId: string
  clipId: string
  lengthBeats: number
  pixelsPerBeat: number
  /** Keep the playhead in view by scrolling the roll (for clips longer than the screen). */
  follow: boolean
  scroller: RefObject<HTMLDivElement | null>
}

/** The moving line showing where the playing clip is. Owns its status subscription so the roll doesn't re-render at 30 Hz. */
export const Playhead = ({ trackId, clipId, lengthBeats, pixelsPerBeat, follow, scroller }: PlayheadProps) => {
  const beat = useStatusStore((state) => {
    const launcher = state.status?.tracks[trackId]
    if (!state.status || launcher?.playingClipId !== clipId || launcher.startBeat === null) return null
    return (state.status.beat - launcher.startBeat) % lengthBeats
  })

  useEffect(() => {
    const element = scroller.current
    if (!follow || beat === null || !element) return
    const x = KEY_WIDTH + beat * pixelsPerBeat
    const outsideLeft = x < element.scrollLeft + KEY_WIDTH
    const outsideRight = x > element.scrollLeft + element.clientWidth - 24
    if (outsideLeft || outsideRight) {
      element.scrollLeft = Math.max(0, x - KEY_WIDTH - element.clientWidth * 0.15)
    }
  }, [beat, follow, pixelsPerBeat, scroller])

  if (beat === null) return null
  return <div className={styles.playhead} style={{ left: beat * pixelsPerBeat }} />
}
