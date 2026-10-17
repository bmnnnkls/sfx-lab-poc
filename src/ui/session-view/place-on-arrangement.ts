import { arrangementEnd } from '@core'
import type { ArrangementClip, AudioClip, Clip } from '@core'
import { useProjectStore } from '@state'

/**
 * Places a copy of a session clip on the arrangement timeline of its own track: at the end of the
 * track's regions (or beat 0 when it has none), so a clip can join the timeline from the session
 * view — the two views are exclusive, so dragging a slot onto a lane is not possible.
 */
export const placeOnArrangement = (trackId: string, clip: Clip | AudioClip): void => {
  const { addArrangementClip, project } = useProjectStore.getState()
  const endOf = (regions: readonly ArrangementClip[]): number =>
    Math.max(0, ...regions.filter((region) => region.trackId === trackId).map(arrangementEnd))
  addArrangementClip(trackId, endOf(project.arrangement ?? []), clip)
}
