import { describe, expect, it } from 'vitest'
import { MAX_TIMELINE_BEATS, createArrangementClip, createClip, createDemoProject } from '../project'
import { CURRENT_VERSION } from './format'
import { parseProject, serializeProject } from './project-file'

const parseOk = (text: string) => {
  const result = parseProject(text)
  if (!result.ok) throw new Error(result.error)
  return result
}

/** The demo with two regions on its first track: one looping, one plain. */
const arranged = () => {
  const project = createDemoProject()
  const trackId = project.tracks[0]!.id
  const looping = { ...createArrangementClip(trackId, 0, createClip('Loop', 4)), loop: true }
  const plain = createArrangementClip(trackId, 16, createClip('Once', 4))
  return { ...project, arrangement: [looping, plain] }
}

describe('the arrangement in files', () => {
  it('keeps a looping region looping through save and load', () => {
    const { project, warnings } = parseOk(serializeProject(arranged()))
    expect(warnings).toEqual([])
    expect(project.arrangement!.map((region) => region.loop)).toEqual([true, undefined])
  })

  it('drops a region that ends past the timeline, with a warning', () => {
    const saved = JSON.parse(serializeProject(arranged()))
    saved.project.arrangement[1].startBeat = MAX_TIMELINE_BEATS - 2
    const { project, warnings } = parseOk(JSON.stringify({ ...saved, version: CURRENT_VERSION }))
    expect(project.arrangement).toHaveLength(1)
    expect(warnings.some((warning) => warning.includes(`past beat ${MAX_TIMELINE_BEATS}`))).toBe(true)
  })
})
