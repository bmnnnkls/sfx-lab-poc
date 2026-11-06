import { type InstrumentTrack } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import { useProjectStore } from '../project-store'
import { useRenameStore } from '../rename-store'
import { actionsFor, clipClipboard, nodeClipboard, runVerb, type Subject, type SubjectKind, type Verb, verbTarget } from '.'
import { fakeContext, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const track = (name: string) => project().tracks.find((candidate) => candidate.name === name) as InstrumentTrack
const clipOf = (name: string, scene: number) => track(name).clips[scene]
const nodeIdOf = (name: string, type: string) => track(name).patch.nodes.find((node) => node.type === type)!.id
const undoSteps = () => useProjectStore.getState().history.past.length

/** The plan's table: each kind's action per verb. */
const VERBS: Readonly<Record<SubjectKind, Partial<Record<Verb, string>>>> = {
  track: { delete: 'track.delete', duplicate: 'track.duplicate', rename: 'track.rename' },
  group: { rename: 'group.rename' },
  master: {},
  clip: { delete: 'clip.delete', duplicate: 'clip.duplicate', copy: 'clip.copy', cut: 'clip.cut', rename: 'clip.rename' },
  slot: { paste: 'slot.paste' },
  'automation-slot': { delete: 'automation-slot.delete', copy: 'automation-slot.copy', paste: 'automation-slot.paste' },
  scene: { delete: 'scene.delete', duplicate: 'scene.duplicate', rename: 'scene.rename' },
  sample: { delete: 'sample.remove', copy: 'sample.copy', rename: 'sample.rename' },
  'library-item': { delete: 'library-item.trash', duplicate: 'library-item.duplicate', copy: 'library-item.copy', cut: 'library-item.cut', rename: 'library-item.rename' },
  'library-folder': { delete: 'library-folder.trash', duplicate: 'library-folder.duplicate', copy: 'library-folder.copy', cut: 'library-folder.cut', paste: 'library-folder.paste', rename: 'library-folder.rename' },
  'library-root': { paste: 'library-root.paste' },
  'project-graph': { copy: 'project-graph.copy' },
  nodes: { delete: 'nodes.delete', duplicate: 'nodes.duplicate', copy: 'nodes.copy', cut: 'nodes.cut', rename: 'nodes.rename' },
  canvas: { paste: 'canvas.paste' },
  module: { delete: 'module.delete', rename: 'module.rename' },
  region: { delete: 'region.delete', duplicate: 'region.duplicate', copy: 'region.copy' },
  lane: { paste: 'lane.paste' },
  control: {},
  sound: { delete: 'sound.delete', duplicate: 'sound.duplicate', copy: 'sound.copy', rename: 'sound.rename' },
  pin: { delete: 'pin.unpin' },
  'sample-selection': {
    cut: 'sample-selection.cut',
    copy: 'sample-selection.copy',
    paste: 'sample-selection.paste',
    delete: 'sample-selection.delete',
    rename: 'sample-selection.rename-marker',
  },
  'sample-marker': { delete: 'sample-marker.delete', rename: 'sample-marker.rename' },
  'sample-region': { delete: 'sample-region.delete', rename: 'sample-region.rename' },
  'sample-loop': { delete: 'sample-loop.clear' },
  'arrangement-marker': { delete: 'arrangement-marker.delete', rename: 'arrangement-marker.rename' },
  'arrangement-loop': { delete: 'arrangement-loop.remove' },
  'arrangement-timeline': {},
  'timeline-lane': { delete: 'timeline-lane.delete' },
}

/** One subject per kind; the lists don't depend on the ids. */
const anyOf = (kind: SubjectKind) => ({ kind }) as Subject

beforeEach(() => {
  loadDemo()
  clipClipboard.set(null)
  nodeClipboard.set(null)
  useRenameStore.getState().stop()
})

describe('verbs', () => {
  it("name actions of their own kind, at most one per verb, as the plan's table says", () => {
    for (const [kind, expected] of Object.entries(VERBS) as [SubjectKind, Partial<Record<Verb, string>>][]) {
      const withVerbs = actionsFor(anyOf(kind)).filter((action) => action.verb)
      expect(withVerbs.every((action) => action.id.startsWith(`${kind}.`))).toBe(true)
      expect(new Set(withVerbs.map((action) => action.verb)).size).toBe(withVerbs.length)
      expect(Object.fromEntries(withVerbs.map((action) => [action.verb, action.id]))).toEqual(expected)
    }
  })

  it('leave the deletes that remove more than the thing itself to their menus', () => {
    expect(actionsFor(anyOf('group')).find((action) => action.id === 'group.delete')?.verb).toBeUndefined()
    expect(actionsFor(anyOf('lane')).find((action) => action.id === 'lane.clear')?.verb).toBeUndefined()
  })
})

describe('runVerb', () => {
  it('runs nothing, and says so, without a subject or without an action for the verb', () => {
    expect(runVerb('delete', [], fakeContext())).toBe(false)
    expect(runVerb('delete', [{ kind: 'master' }], fakeContext())).toBe(false)
    expect(undoSteps()).toBe(0)
  })

  it('deletes, duplicates, copies and cuts a session clip, each one undo step', () => {
    const bass = track('Bass')
    const clip = (scene: number): Subject => ({ kind: 'clip', trackId: bass.id, clipId: clipOf('Bass', scene)!.id })
    expect(runVerb('duplicate', [clip(0)], fakeContext())).toBe(true)
    expect(track('Bass').clips.filter(Boolean)).toHaveLength(bass.clips.filter(Boolean).length + 1)
    expect(runVerb('copy', [clip(0)], fakeContext())).toBe(true)
    expect(clipClipboard.get()?.clip.name).toBe(clipOf('Bass', 0)!.name)
    expect(runVerb('delete', [clip(0)], fakeContext())).toBe(true)
    expect(clipOf('Bass', 0)).toBeNull()
    expect(runVerb('cut', [clip(1)], fakeContext())).toBe(true)
    expect(clipOf('Bass', 1)).toBeNull()
    expect(undoSteps()).toBe(3)
  })

  it('walks out from the focused thing: Paste on selected nodes pastes on the canvas around them', () => {
    const target = { trackId: track('Bass').id }
    const nodes: Subject = { kind: 'nodes', target, path: [], nodeIds: [nodeIdOf('Bass', 'filter')] }
    const canvas: Subject = { kind: 'canvas', target, path: [], at: { x: 500, y: 500 } }
    const count = track('Bass').patch.nodes.length
    expect(runVerb('paste', [nodes, canvas], fakeContext())).toBe(false)
    expect(runVerb('copy', [nodes, canvas], fakeContext())).toBe(true)
    expect(verbTarget('paste', [nodes, canvas], fakeContext())?.subject).toBe(canvas)
    expect(runVerb('paste', [nodes, canvas], fakeContext())).toBe(true)
    expect(runVerb('duplicate', [nodes, canvas], fakeContext())).toBe(true)
    expect(track('Bass').patch.nodes).toHaveLength(count + 2)
    expect(runVerb('delete', [nodes, canvas], fakeContext())).toBe(true)
    expect(track('Bass').patch.nodes).toHaveLength(count + 1)
  })

  it('lets the innermost subject decide every verb but Paste: Delete on a fader in a strip leaves the track', () => {
    const bass = track('Bass')
    const fader: Subject = { kind: 'control', targets: [{ kind: 'mixer', owner: { kind: 'track', trackId: bass.id }, control: 'volume' }] }
    const strip: Subject = { kind: 'track', trackId: bass.id }
    expect(runVerb('delete', [fader, strip], fakeContext())).toBe(false)
    expect(runVerb('duplicate', [fader, strip], fakeContext())).toBe(false)
    expect(track('Bass')).toBeDefined()
    expect(undoSteps()).toBe(0)
  })

  it('skips an action that is disabled: Paste with an empty clipboard', () => {
    const slot: Subject = { kind: 'slot', trackId: track('Lead').id, scene: 1 }
    expect(verbTarget('paste', [slot], fakeContext())).toBeUndefined()
    clipClipboard.set({ clip: clipOf('Bass', 0)!, kind: 'instrument' })
    expect(runVerb('paste', [slot], fakeContext())).toBe(true)
    expect(clipOf('Lead', 1)).not.toBeNull()
  })

  it('deletes and duplicates a track, a scene and a region', () => {
    const tracks = project().tracks.length
    expect(runVerb('duplicate', [{ kind: 'track', trackId: track('Pad').id }], fakeContext())).toBe(true)
    expect(project().tracks).toHaveLength(tracks + 1)
    expect(runVerb('delete', [{ kind: 'track', trackId: track('Pad').id }], fakeContext())).toBe(true)
    expect(project().tracks).toHaveLength(tracks)
    const scenes = project().sceneCount
    expect(runVerb('duplicate', [{ kind: 'scene', scene: 0 }], fakeContext())).toBe(true)
    expect(runVerb('delete', [{ kind: 'scene', scene: 1 }], fakeContext())).toBe(true)
    expect(project().sceneCount).toBe(scenes)
    useProjectStore.getState().addArrangementClip(track('Bass').id, 0, clipOf('Bass', 0)!)
    const region: Subject = { kind: 'region', regionId: project().arrangement![0]!.id }
    expect(runVerb('duplicate', [region], fakeContext())).toBe(true)
    expect(project().arrangement).toHaveLength(2)
    expect(runVerb('delete', [region], fakeContext())).toBe(true)
    expect(project().arrangement).toHaveLength(1)
  })

  it('unpins a pin and removes a sample', () => {
    const pin = { owner: { kind: 'track' as const, trackId: track('Lead').id }, graph: 'patch' as const }
    useProjectStore.getState().pinPanel(pin)
    expect(runVerb('delete', [{ kind: 'pin', ...pin }], fakeContext())).toBe(true)
    expect(project().pins ?? []).toHaveLength(0)
    expect(runVerb('delete', [{ kind: 'sample', sampleId: 'kick' }], fakeContext())).toBe(true)
    expect(project().samples).toHaveLength(0)
  })

  it('starts a rename in place in the view it was pressed in', () => {
    const subject: Subject = { kind: 'track', trackId: track('Bass').id }
    expect(runVerb('rename', [subject], fakeContext({ origin: 'mixer' }))).toBe(true)
    expect(useRenameStore.getState()).toMatchObject({ renaming: { subject, origin: 'mixer' } })
  })
})
