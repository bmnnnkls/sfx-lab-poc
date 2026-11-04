import type { SampleInfo } from '../sample'
import type { Project } from './types'

/**
 * Applies one change to a library sample's markers, regions or loop (`addMarker`, `updateRegion`, `setLoop`, … from
 * `core/sample`). The project is unchanged when the sample isn't there or the change does nothing.
 */
export const updateSampleMarks = (project: Project, sampleId: string, change: (info: SampleInfo) => SampleInfo): Project => {
  const index = project.samples.findIndex((sample) => sample.id === sampleId)
  if (index < 0) return project
  const before = project.samples[index]!
  const after = change(before)
  if (after === before) return project
  return { ...project, samples: project.samples.map((sample, at) => (at === index ? after : sample)) }
}
