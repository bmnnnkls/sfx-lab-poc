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

/**
 * The region is the child of a Radix context menu (`asChild`), so it forwards everything it does not
 * use itself — the trigger's handlers, `data-state` and `ref` — onto its root element.
 */
interface RegionProps extends React.ComponentPropsWithRef<'div'> {
  region: ArrangementClip
  pxPerBeat: number
  selected: boolean
  onSelect(): void
}

interface DragState {
  readonly startX: number
  origin: number
  readonly resizing: boolean
  /** The lane the pointer is over, or null while it has not left the region's own lane. */
  targetLane: string | null
  /** The lane element currently highlighted, so the hint moves with the pointer. */
  hover: Element | null
}

/**
 * One clip on the timeline: drag the body to move it in time (and onto another lane to move it across
 * tracks), drag the right edge to resize. A drag merges into one undo step. A looping region shows a
 * repeat badge; the view draws the span it repeats over (up to the next region) beside it.
 */
export const ArrangementRegion = ({ region, pxPerBeat, selected, onSelect, ...domProps }: RegionProps) => {
  const update = useProjectStore((state) => state.updateArrangementClip)
  const drag = useRef<DragState | null>(null)

  const startDrag = (event: React.PointerEvent, resizing: boolean) => {
    event.stopPropagation()
    onSelect()
    drag.current = {
      startX: event.clientX,
      origin: resizing ? region.content.lengthBeats : region.startBeat,
      resizing,
      targetLane: null,
      hover: null,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  /** The lane element the pointer is over, or null when it is not on a lane (the ruler, outside). */
  const laneAt = (x: number, y: number): HTMLElement | null => {
    const lane = document.elementFromPoint(x, y)?.closest('[data-lane]')
    return lane instanceof HTMLElement ? lane : null
  }

  const onMove = (event: React.PointerEvent) => {
    const state = drag.current
    if (!state) return
    if (state.resizing) {
      const deltaBeats = (event.clientX - state.startX) / pxPerBeat
      const lengthBeats = Math.max(MIN_CLIP_BEATS, Math.round((state.origin + deltaBeats) * 4) / 4)
      update(region.id, { content: { ...region.content, lengthBeats } }, `arr-size:${region.id}`)
      return
    }
    const startBeat = Math.max(0, Math.round((state.origin + (event.clientX - state.startX) / pxPerBeat) * 4) / 4)
    update(region.id, { startBeat }, `arr-move:${region.id}`)
    // Vertical dragging onto another lane highlights the target; the move itself happens on the drop.
    const lane = laneAt(event.clientX, event.clientY)
    if ((lane?.dataset.lane ?? null) !== state.targetLane) {
      state.hover?.removeAttribute('data-drag-over')
      state.targetLane = lane?.dataset.lane ?? null
      state.hover = lane
      lane?.setAttribute('data-drag-over', '')
    }
  }

  const endDrag = (event: React.PointerEvent) => {
    const state = drag.current
    if (!state) return
    drag.current = null
    state.hover?.removeAttribute('data-drag-over')
    if (!state.resizing && state.targetLane !== null && state.targetLane !== region.trackId) {
      update(region.id, { trackId: state.targetLane }, `arr-move:${region.id}`)
    }
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const audio = isAudioContent(region.content)
  const width = Math.max(8, Math.round(region.content.lengthBeats * pxPerBeat))
  const looping = region.loop === true

  return (
    <div
      {...domProps}
      className={`${styles.region} ${selected ? styles.selected : ''}`}
      style={{ left: region.startBeat * pxPerBeat, width }}
      data-testid="arrangement-region"
      data-looping={looping ? 'true' : undefined}
      onPointerDown={(event) => startDrag(event, false)}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <span className={styles.regionName}>{region.content.name}</span>
      {looping && (
        <span className={styles.loopBadge} title="Loops until the next region on this track">
          ⟳
        </span>
      )}
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
