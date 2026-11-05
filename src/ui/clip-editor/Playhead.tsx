import type { EngineStatus } from '@core'
import { useStatusStore } from '@state'
import { type RefObject, useEffect } from 'react'
import { KEY_WIDTH } from './piano-roll-geometry'
import styles from './PianoRoll.module.css'

interface PlayheadProps {
  /** Where the clip plays now, in beats from its start (`clipPhase`), or null. */
  phase: (status: EngineStatus | null) => number | null
  pixelsPerBeat: number
  /** Keep the playhead in view by scrolling the roll (for clips longer than the screen). */
  follow: boolean
  scroller: RefObject<HTMLDivElement | null>
}

/** The moving line showing where the playing clip is. Owns its status subscription so the roll doesn't re-render at 30 Hz. */
export const Playhead = ({ phase, pixelsPerBeat, follow, scroller }: PlayheadProps) => {
  const beat = useStatusStore((state) => phase(state.status))

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
