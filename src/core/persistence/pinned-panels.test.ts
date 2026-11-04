import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { type Project, createDemoProject, groupTrack, livePins, pinKey, pinPanel, setGroupBus, setPinCollapsed } from '../project'
import { CURRENT_VERSION } from './format'
import { parseProject, serializeProject } from './project-file'

const parseOk = (text: string) => {
  const result = parseProject(text)
  if (!result.ok) throw new Error(result.error)
  return result
}

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')

/** The demo saved with Bass's id `bass`, Lead's `lead`, and `pins` as given. */
const raw = (pins: unknown) => {
  const saved = JSON.parse(serializeProject(createDemoProject())).project
  saved.tracks = saved.tracks.map((track: Record<string, unknown>, index: number) => ({ ...track, id: ['bass', 'lead', 'pad'][index] }))
  saved.pins = pins
  return JSON.stringify({ format: 'sfx-lab-project', version: CURRENT_VERSION, project: saved })
}

const lead = (graph = 'patch', extra: Record<string, unknown> = {}) => ({ owner: { kind: 'track', trackId: 'lead' }, graph, ...extra })

describe('pinned panels in files', () => {
  it('loads the committed fixture with its four shown pins and no warnings', () => {
    const { project, warnings } = parseOk(fixture('v10-pinned-panels.sfxlab.json'))
    expect(warnings).toEqual([])
    const [bass, leadTrack] = project.tracks
    const group = project.groups![0]!
    expect(bass!.groupId).toBe(group.id)
    expect(project.pins!.map(pinKey)).toEqual([`${leadTrack!.id}:patch`, `${leadTrack!.id}:notes`, `${group.id}:fx`, 'master:fx'])
    expect(project.pins![2]!.collapsed).toBe(true)
    expect(livePins(project)).toHaveLength(4)
  })

  it('loads a round-8 file unchanged: it has no pins', () => {
    const { project, warnings } = parseOk(fixture('v10-group-buses.sfxlab.json'))
    expect(warnings).toEqual([])
    expect(project).not.toHaveProperty('pins')
  })

  it('keeps the order and the collapse through save and load', () => {
    const grouped = groupTrack(createDemoProject(), createDemoProject().tracks[0]!.id)
    let project: Project = setGroupBus(grouped.project, grouped.groupId!, true)
    project = pinPanel(project, { owner: { kind: 'master' }, graph: 'fx' })
    project = pinPanel(project, { owner: { kind: 'group', groupId: grouped.groupId! }, graph: 'fx' })
    project = pinPanel(project, { owner: { kind: 'track', trackId: project.tracks[1]!.id }, graph: 'notes' })
    project = setPinCollapsed(project, 'master:fx', true)
    const result = parseOk(serializeProject(project))
    expect(result.warnings).toEqual([])
    expect(result.project).toEqual(project)
  })

  it('drops a pin whose graph is missing silently', () => {
    const { project, warnings } = parseOk(raw([
      { owner: { kind: 'track', trackId: 'gone' }, graph: 'patch' },
      { owner: { kind: 'group', groupId: 'gone' }, graph: 'fx' },
      lead('fx'),
    ]))
    expect(warnings).toEqual([])
    expect(project.pins).toEqual([lead('fx')])
  })

  it('drops a malformed pin and a repeated one with a warning, and reads collapse only as a real true', () => {
    const { project, warnings } = parseOk(raw([
      lead('patch', { collapsed: 'yes', extra: 1 }),
      { owner: { kind: 'nobody' }, graph: 'fx' },
      { owner: { kind: 'master' }, graph: 'patch' },
      lead('sound'),
      'pin',
      lead('patch', { collapsed: true }),
    ]))
    expect(project.pins).toEqual([lead('patch')])
    expect(warnings).toEqual([
      'Pinned panel 2: dropped a pin that names no graph',
      'Pinned panel 3: dropped a pin that names no graph',
      'Pinned panel 4: dropped a pin that names no graph',
      'Pinned panel 5: dropped a pin that names no graph',
      'Pinned panel 6: dropped a second pin of the same panel',
    ])
  })

  it('keeps at most 16 pins, and stores no empty list', () => {
    // Six instrument tracks: 18 panels.
    const text = raw(['bass', 'lead', 'pad', 'b', 'c', 'd'].flatMap((trackId) => ['patch', 'fx', 'notes'].map((graph) => ({ owner: { kind: 'track', trackId }, graph }))))
    const file = JSON.parse(text)
    file.project.tracks = [...file.project.tracks, ...['b', 'c', 'd'].map((id) => ({ ...file.project.tracks[1], id, name: id }))]
    const { project, warnings } = parseOk(JSON.stringify(file))
    expect(project.pins).toHaveLength(16)
    expect(pinKey(project.pins!.at(-1)!)).toBe('d:patch')
    expect(warnings).toEqual(['Only the first 16 pinned panels were kept'])
    expect(parseOk(raw([])).project).not.toHaveProperty('pins')
    expect(parseOk(raw('none')).warnings).toEqual([])
  })
})
