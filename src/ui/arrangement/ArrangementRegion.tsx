import {
  type ArrangementClip,
  MIN_CLIP_BEATS,
  isAudioContent,
} from '@core'
import { useProjectStore } from '@state'
import { useRef } from 'react'
import { WaveformThumb } from '../shared/WaveformThumb'
import styles from './arrangement.module.css'

const MIN_PITCH = 21
const MAX_PITCH = 108

interface RegionProps {
  region: ArrangementClip
  pxPerBeat: number
  selected: boolean
  onSelect(): void
}

interface DragState {
  readonly startX: number
  readonly origin: number
  readonly resizing: boolean
}

/**
 * One clip on the timeline: drag the body to move it in time, drag the right edge to resize.
 * A drag merges into one undo step. Moving across tracks is not in the prototype.
 */
export const ArrangementRegion = ({ region, pxPerBeat, selected, onSelect }: RegionProps) => {
  const update = useProjectStore((state) => state.updateArrangementClip)
  const drag = useRef<DragState | null>(null)

  const startDrag = (event: React.PointerEvent, resizing: boolean) => {
    event.stopPropagation()
    onSelect()
    drag.current = {
      startX: event.clientX,
      origin: resizing ? region.content.lengthBeats : region.startBeat,
      resizing,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onMove = (event: React.PointerEvent) => {
    const state = drag.current
    if (!state) return
    const deltaBeats = (event.clientX - state.startX) / pxPerBeat
    if (state.resizing) {
      const lengthBeats = Math.max(MIN_CLIP_BEATS, Math.round((state.origin + deltaBeats) * 4) / 4)
      update(region.id, { content: { ...region.content, lengthBeats } }, `arr-size:${region.id}`)
    } else {
      const startBeat = Math.max(0, Math.round((state.origin + deltaBeats) * 4) / 4)
      update(region.id, { startBeat }, `arr-move:${region.id}`)
    }
  }

  const endDrag = (event: React.PointerEvent) => {
    if (!drag.current) return
    drag.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const audio = isAudioContent(region.content)
  const width = Math.max(8, Math.round(region.content.lengthBeats * pxPerBeat))

  return (
    <div
      className={`${styles.region} ${selected ? styles.selected : ''}`}
      style={{ left: region.startBeat * pxPerBeat, width }}
      data-testid="arrangement-region"
      onPointerDown={(event) => startDrag(event, false)}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span className={styles.regionName}>{region.content.name}</span>
      {audio ? (
        <div className={styles.waveform}>
          <WaveformThumb sampleId={region.content.sampleId} width={width} height={22} />
        </div>
      ) : (
        <div className={styles.notes}>
          {region.content.notes.slice(0, 200).map((note) => (
            <span
              key={note.id}
              className={styles.noteRect}
              style={{
                left: note.start * pxPerBeat,
                width: Math.max(2, note.duration * pxPerBeat),
                top: `${(1 - (note.pitch - MIN_PITCH) / (MAX_PITCH - MIN_PITCH)) * 100}%`,
              }}
            />
          ))}
        </div>
      )}
      <div
        className={styles.handle}
        data-testid="arrangement-region-handle"
        onPointerDown={(event) => startDrag(event, true)}
        onPointerMove={onMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      />
    </div>
  )
}
