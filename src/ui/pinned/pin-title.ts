import { type PanelPin, type Project } from '@core'

const GRAPH_NAMES = { patch: 'instrument', fx: 'effects', notes: 'notes' } as const

/**
 * A pin's title, as the editors title their graphs, except that an instrument says so: *Bass instrument*, *Bass
 * effects*, *Bass notes*, *Drums effects*, *Master effects*. Undefined when the owner is gone.
 */
export const pinTitle = (project: Project, { owner, graph }: Pick<PanelPin, 'owner' | 'graph'>): string | undefined => {
  if (owner.kind === 'master') return 'Master effects'
  const name = owner.kind === 'track'
    ? project.tracks.find((track) => track.id === owner.trackId)?.name
    : project.groups?.find((group) => group.id === owner.groupId)?.name
  return name === undefined ? undefined : `${name} ${GRAPH_NAMES[graph]}`
}
