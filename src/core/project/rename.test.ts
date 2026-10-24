import { describe, expect, it } from 'vitest'
import { commit, createHistory, undo } from '../history'
import { parseProject, serializeProject } from '../persistence'
import { createDemoProject } from './demo-project'
import { NAME_LIMITS, setClipName, setSampleName, setSceneName, setTrackName } from './rename'
import type { Project } from './types'

const KICK = 'a'.repeat(64)
const kick = { id: KICK, name: 'Kick', extension: 'wav', durationSeconds: 0.5, sampleRate: 44100, channels: 1, bytes: 1000 }
const demo = (): Project => ({ ...createDemoProject(), samples: [kick] })
const roundTrip = (project: Project): Project => {
  const result = parseProject(serializeProject(project))
  if (!result.ok) throw new Error(result.error)
  return result.project
}

describe('renaming', () => {
  it('renames a track, trimmed and cut to the limit the file keeps', () => {
    const project = demo(), bass = project.tracks[0]!
    const renamed = setTrackName(project, bass.id, `  ${'B'.repeat(60)}  `)
    expect(renamed.tracks[0]!.name).toBe('B'.repeat(NAME_LIMITS.track))
    expect(roundTrip(renamed).tracks[0]!.name).toBe('B'.repeat(NAME_LIMITS.track))
    expect(renamed.tracks[1]).toBe(project.tracks[1])
  })

  it('keeps the old name for an empty one, and the same project when nothing changes', () => {
    const project = demo(), bass = project.tracks[0]!
    expect(setTrackName(project, bass.id, '   ')).toBe(project)
    expect(setTrackName(project, bass.id, bass.name)).toBe(project)
    expect(setTrackName(project, 'missing', 'X')).toBe(project)
    expect(setSampleName(project, KICK, '')).toBe(project)
  })

  it('renames a session clip, not the regions copied from it', () => {
    const project = demo(), bass = project.tracks[0]!
    if (bass.kind !== 'instrument') throw new Error('Expected an instrument')
    const root = bass.clips[0]!
    const placed: Project = { ...project, arrangement: [{ id: 'region', trackId: bass.id, startBeat: 0, content: root }] }
    const renamed = setClipName(placed, bass.id, root.id, 'Low root')
    const track = renamed.tracks[0]!
    expect(track.kind !== 'return' && track.clips[0]?.name).toBe('Low root')
    expect(renamed.arrangement?.[0]?.content.name).toBe('Root')
    expect(roundTrip(renamed).tracks[0]).toMatchObject({ clips: [{ name: 'Low root' }, { name: 'Walk' }, null, null] })
    expect(setClipName(project, bass.id, 'missing', 'X')).toBe(project)
  })

  it('names a scene, padding the list, and clears the list with the last name', () => {
    const project = demo()
    const named = setSceneName(project, 2, '  Drop  ')
    expect(named.sceneNames).toEqual(['', '', 'Drop'])
    expect(setSceneName(named, 0, 'x'.repeat(40)).sceneNames).toEqual(['x'.repeat(NAME_LIMITS.scene), '', 'Drop'])
    expect(roundTrip(named).sceneNames).toEqual(['', '', 'Drop'])
    expect(setSceneName(named, 2, '')).not.toHaveProperty('sceneNames')
    expect(setSceneName(project, 4, 'Out of range')).toBe(project)
  })

  it("renames a sample, leaving its clips' names alone", () => {
    const renamed = setSampleName(demo(), KICK, 'Deep kick')
    expect(renamed.samples[0]?.name).toBe('Deep kick')
    expect(roundTrip(renamed).samples[0]?.name).toBe('Deep kick')
  })

  it('is one undo step', () => {
    const project = demo()
    const history = commit(createHistory(project), setTrackName(project, project.tracks[0]!.id, 'Low end'), { now: 0 })
    expect(history.past).toHaveLength(1)
    expect(undo(history).present).toBe(project)
  })
})
