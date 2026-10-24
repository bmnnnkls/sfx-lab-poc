import {
  arrangementEnd,
  arrangementLoopEnd,
  arrangementOnTrack,
} from '@core'
import { useEngineControls, useLayoutStore, useProjectStore, useStatusStore } from '@state'
import { Fragment, useState } from 'react'
import { viewTitles } from '../layout/view-titles'
import { ActionMenu } from '../shared/menu'
import { useStoredState } from '../shared/use-stored-state'
import { ArrangementPlayhead } from './ArrangementPlayhead'
import { ArrangementRegion } from './ArrangementRegion'
import styles from './arrangement.module.css'

const BEATS_PER_BAR = 4
const DEFAULT_PX_PER_BEAT = 24
const MIN_PX_PER_BEAT = 8
const MAX_PX_PER_BEAT = 64
/** The timeline is at least this many bars, and always shows 4 empty bars past the last clip. */
const MIN_BARS = 32
const TRAILING_BARS = 4

const isZoom = (value: unknown): value is number =>
  typeof value === 'number' && value >= MIN_PX_PER_BEAT && value <= MAX_PX_PER_BEAT

/** Snap to sixteenth beats. */
const snap = (beats: number): number => Math.round(beats * 4) / 4

/** How to fill the timeline. Shown in the toolbar while it fits, and always its tooltip. */
const HINT =
  'Right-click an empty lane to add a session clip; right-click a session slot to place it here; drag regions to move (across lanes too), the edge to resize.'

/**
 * The "Arrangement" view: copies of session clips on a timeline, one lane per track. Playback follows
 * the transport; ▶ starts it from the beginning (or resumes from where it was stopped). Session slots
 * drag onto a lane, regions drag across lanes, and a region can loop until the next one on its track.
 */
export const ArrangementView = () => {
  const controls = useEngineControls()
  const tracks = useProjectStore((state) => state.project.tracks)
  const placed = useProjectStore((state) => state.project.arrangement)
  const arrangement = placed ?? []
  // The zoom is remembered between sessions, as the piano roll's is.
  const [pxPerBeat, setPxPerBeat] = useStoredState('sfxlab:arrangement-zoom', DEFAULT_PX_PER_BEAT, isZoom)
  const [picked, setPicked] = useState<string | null>(null)
  // A region deleted from its menu (or by undo) drops out of the selection here.
  const selected = arrangement.some((region) => region.id === picked) ? picked : null
  /** Where an empty lane was right-clicked, so "add" places the clip there. */
  const [placedAt, setPlacedAt] = useState(0)

  const end = Math.max(0, ...arrangement.map(arrangementEnd))
  const bars = Math.max(MIN_BARS, Math.ceil(end / BEATS_PER_BAR) + TRAILING_BARS)
  const width = bars * BEATS_PER_BAR * pxPerBeat

  // Read when clicked rather than subscribed to, so the timeline doesn't re-render with the transport.
  const start = () => controls.playArrangement(useStatusStore.getState().status?.playing ? undefined : 0)
  const stop = () => controls.stop()

  return (
    <div className={styles.view} data-testid="arrangement-view">
      <div className={styles.toolbar} title={HINT}>
        <strong>Arrangement</strong>
        <button onClick={start} aria-label="Play arrangement">
          ▶ Arrangement
        </button>
        <button onClick={stop} aria-label="Stop">
          ■
        </button>
        <label className={styles.zoom} title="Zoom">
          <input
            type="range"
            min={MIN_PX_PER_BEAT}
            max={MAX_PX_PER_BEAT}
            value={pxPerBeat}
            onChange={(event) => setPxPerBeat(Number(event.target.value))}
          />
        </label>
        <span className={styles.info}>{HINT}</span>
      </div>
      <div className={styles.scroll} data-scroll="both">
        <div className={styles.rulerRow}>
          <div className={styles.rulerCorner} />
          <div className={styles.ruler} style={{ width }}>
            {Array.from({ length: bars }, (_, bar) => (
              <span key={bar} className={styles.barMark} style={{ left: bar * BEATS_PER_BAR * pxPerBeat }}>
                {bar + 1}
              </span>
            ))}
          </div>
        </div>
        {tracks
          .filter((track) => track.kind !== 'return')
          .map((track) => (
            <div key={track.id} className={styles.lane}>
              <div className={styles.name}>{track.name}</div>
              <div className={styles.row} style={{ width }}>
                <ActionMenu subject={{ kind: 'lane', trackId: track.id, beat: placedAt }}>
                  <div
                    className={styles.laneBody}
                    style={{ width }}
                    data-lane={track.id}
                    onContextMenu={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      setPlacedAt(snap(Math.max(0, (event.clientX - rect.left) / pxPerBeat)))
                    }}
                  />
                </ActionMenu>
                {arrangementOnTrack(arrangement, track.id).map((region) => {
                  const loopEnd = arrangementLoopEnd(region, arrangement)
                  const tailStart = arrangementEnd(region)
                  const tailWidth = Math.max(0, Math.round((loopEnd - tailStart) * pxPerBeat))
                  return (
                    <Fragment key={region.id}>
                      {region.loop && tailWidth > 0 && (
                        <div
                          className={styles.loopTail}
                          data-testid="arrangement-loop-tail"
                          style={{ left: tailStart * pxPerBeat, width: tailWidth }}
                          aria-hidden
                        />
                      )}
                      <ActionMenu subject={{ kind: 'region', regionId: region.id }}>
                        <ArrangementRegion
                          region={region}
                          pxPerBeat={pxPerBeat}
                          selected={selected === region.id}
                          onSelect={() => setPicked(region.id)}
                        />
                      </ActionMenu>
                    </Fragment>
                  )
                })}
                <ArrangementPlayhead pxPerBeat={pxPerBeat} />
              </div>
            </div>
          ))}
        {tracks.every((track) => track.kind === 'return') && (
          <div className={styles.empty}>
            <p>No tracks yet. Add a track and give it clips, then place them on the timeline.</p>
            <button onClick={() => useLayoutStore.getState().revealView('session')}>Show {viewTitles.session.toLowerCase()}</button>
          </div>
        )}
      </div>
    </div>
  )
}
