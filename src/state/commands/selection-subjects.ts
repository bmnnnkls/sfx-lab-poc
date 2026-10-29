import { project, sessionClipOf } from '../actions/lookup'
import type { Subject } from '../actions'
import { useSelectionStore } from '../selection-store'

/**
 * What is selected, as subjects, for the palette: the selected region, else the selected session clip (each while
 * it exists), else the selected group, master or track; and the selected sample. At most two. Keys never use these.
 */
export const selectionSubjects = (): readonly Subject[] => {
  const { regionId, clipId, trackId, groupId, master, sampleId } = useSelectionStore.getState()
  const subjects: Subject[] = []
  if (regionId && project().arrangement?.some((region) => region.id === regionId)) subjects.push({ kind: 'region', regionId })
  else if (trackId && clipId && sessionClipOf(trackId, clipId)) subjects.push({ kind: 'clip', trackId, clipId })
  else if (groupId) subjects.push({ kind: 'group', groupId })
  else if (master) subjects.push({ kind: 'master' })
  else if (trackId) subjects.push({ kind: 'track', trackId })
  if (sampleId) subjects.push({ kind: 'sample', sampleId })
  return subjects
}
