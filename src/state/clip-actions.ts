import { commit, copySessionClip } from '@core'
import { useProjectStore } from './project-store'
export const duplicateSessionClip = (trackId: string, clipId: string) => {
  const store = useProjectStore.getState(), track = store.project.tracks.find((t) => t.id === trackId)
  if (!track || track.kind === 'return') return
  const scene = track.clips.findIndex((clip) => !clip)
  if (scene < 0) return
  const project = copySessionClip(store.project, trackId, clipId, trackId, scene)
  if (project !== store.project) useProjectStore.setState({ project, history: commit(store.history, project, { now: Date.now() }) })
}
