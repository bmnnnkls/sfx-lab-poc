import { type ClipRef, type EngineStatus, regionPhaseAt } from '@core'
import { useProjectStore } from './project-store'

/**
 * Where a clip is playing, in beats from its start, for a playhead: a session clip while its launcher plays it, a
 * region while the arrangement plays inside it (wrapped while it loops); null otherwise. A selector over the status.
 */
export const clipPhase = (ref: ClipRef, trackId: string, clipId: string, lengthBeats: number) => (status: EngineStatus | null): number | null => {
  if (!status) return null
  if (ref.kind === 'region') {
    if (!status.playing || status.mode !== 'arrangement') return null
    const regions = useProjectStore.getState().project.arrangement ?? []
    const region = regions.find((candidate) => candidate.id === ref.regionId)
    return region ? regionPhaseAt(region, regions, status.beat) : null
  }
  const launcher = status.tracks[trackId]
  if (launcher?.playingClipId !== clipId || launcher.startBeat === null) return null
  return (status.beat - launcher.startBeat) % lengthBeats
}
