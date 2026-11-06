import { useRecordStore, useStatusStore } from '@state'
import { useMemo } from 'react'
import styles from './arrangement.module.css'

/** The ids of the regions being recorded into, for the view to draw red and lock. */
export const useRecordingRegions = (): ReadonlySet<string> => {
  // A string, so the selector's result compares equal while the set doesn't change.
  const ids = useRecordStore((state) => Object.values(state.takes).flatMap((take) => take.regions ?? []).join('\n'))
  return useMemo(() => new Set(ids ? ids.split('\n') : []), [ids])
}

/**
 * What an armed track is recording into the arrangement before it has a region there (before its first note, or past
 * its last region's end): a dashed red outline from where it would start up to the playhead. Only a recording lane
 * follows the playhead, so other lanes don't re-render at the status rate.
 */
export const RecordingOutline = ({ trackId, pxPerBeat }: { trackId: string; pxPerBeat: number }) => {
  const from = useRecordStore((state) => {
    const take = state.takes[trackId]
    return take?.kind === 'region' && take.state === 'recording' ? (take.outlineFrom ?? null) : null
  })
  return from === null ? null : <Outline from={from} pxPerBeat={pxPerBeat} />
}

const Outline = ({ from, pxPerBeat }: { from: number; pxPerBeat: number }) => {
  const beat = useStatusStore((state) => (state.status?.playing && state.status.mode === 'arrangement' ? state.status.beat : null))
  if (beat === null || beat <= from) return null
  return <div className={styles.recordingOutline} data-testid="arrangement-recording-outline" style={{ left: from * pxPerBeat, width: Math.max(2, (beat - from) * pxPerBeat) }} aria-hidden />
}
