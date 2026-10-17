import {
  type ArrangementClip,
  arrangementEnd,
  arrangementLoopEnd,
  arrangementOnTrack,
} from '@core'
import { useEngineControls, useProjectStore, useStatusStore } from '@state'
import { Fragment, useState } from 'react'
import { ContextMenu } from '../shared/menu'
import { ArrangementRegion } from './ArrangementRegion'
import styles from './arrangement.module.css'

const BEATS_PER_BAR = 4
const DEFAULT_PX_PER_BEAT = 24
const MIN_PX_PER_BEAT = 8
const MAX_PX_PER_BEAT = 64
/** The timeline is at least this many bars, and always shows 4 empty bars past the last clip. */
const MIN_BARS = 32
const TRAILING_BARS = 4

/** Snap to sixteenth beats. */
const snap = (beats: number): number => Math.round(beats * 4) / 4

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
  const addRegion = useProjectStore((state) => state.addArrangementClip)
  const updateRegion = useProjectStore((state) => state.updateArrangementClip)
  const removeRegion = useProjectStore((state) => state.removeArrangementClip)
  const playing = useStatusStore((state) => state.status?.playing ?? false)
  const beat = useStatusStore((state) => state.status?.beat ?? 0)
  const [pxPerBeat, setPxPerBeat] = useState(DEFAULT_PX_PER_BEAT)
  const [selected, setSelected] = useState<string | null>(null)
  /** Where an empty lane was right-clicked, so "add" places the clip there. */
  const [placedAt, setPlacedAt] = useState(0)

  const end = Math.max(0, ...arrangement.map(arrangementEnd))
  const bars = Math.max(MIN_BARS, Math.ceil(end / BEATS_PER_BAR) + TRAILING_BARS)
  const width = bars * BEATS_PER_BAR * pxPerBeat

  const start = () => controls.playArrangement(playing ? undefined : 0)
  const stop = () => controls.stop()

  const clipsOf = (trackId: string) => {
    const track = tracks.find((candidate) => candidate.id === trackId)
    return track && track.kind !== 'return' ? track.clips.filter((clip) => clip !== null) : []
  }

  const regionMenu = (region: ArrangementClip) => [
    { label: 'Duplicate', onSelect: () => addRegion(region.trackId, arrangementEnd(region), region.content) },
    { label: region.loop ? 'Stop looping' : 'Loop until next region', onSelect: () => updateRegion(region.id, { loop: !region.loop }) },
    {
      label: 'Delete',
      danger: true,
      onSelect: () => {
        removeRegion(region.id)
        setSelected(null)
      },
    },
  ]

  return (
    <div className={styles.view} data-testid="arrangement-view">
      <div className={styles.toolbar}>
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
        <span className={styles.info}>
          Right-click an empty lane to add a session clip; right-click a session slot to place it here; drag regions to move (across lanes too), the edge to resize.
        </span>
      </div>
      <div className={styles.scroll}>
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
                <ContextMenu
                  entries={[
                    ...clipsOf(track.id).map((clip) => ({
                      label: `Add ${clip.name}`,
                      onSelect: () => addRegion(track.id, placedAt, clip),
                    })),
                    {
                      kind: 'separator' as const,
                    },
                    {
                      label: 'Clear this track',
                      danger: true,
                      disabled: !arrangement.some((region) => region.trackId === track.id),
                      onSelect: () => {
                        for (const region of arrangementOnTrack(arrangement, track.id)) removeRegion(region.id)
                        setSelected(null)
                      },
                    },
                  ]}
                >
                  <div
                    className={styles.laneBody}
                    style={{ width }}
                    data-lane={track.id}
                    onContextMenu={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      setPlacedAt(snap(Math.max(0, (event.clientX - rect.left) / pxPerBeat)))
                    }}
                  />
                </ContextMenu>
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
                      <ContextMenu entries={regionMenu(region)}>
                        <ArrangementRegion
                          region={region}
                          pxPerBeat={pxPerBeat}
                          selected={selected === region.id}
                          onSelect={() => setSelected(region.id)}
                        />
                      </ContextMenu>
                    </Fragment>
                  )
                })}
                {playing && <div className={styles.playhead} style={{ left: beat * pxPerBeat }} />}
              </div>
            </div>
          ))}
        {tracks.every((track) => track.kind === 'return') && (
          <p className={styles.empty}>Add a track in the session view first; its clips can then be placed on the timeline.</p>
        )}
      </div>
    </div>
  )
}
