import { type ControlOwner, type Project, captureSnapshot, controlFromNormalized, controlToNormalized, editControlBase, enumerateControlTargets, putSnapshot, resolveControlTarget, saveProjectPreset } from '@core'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, useLayoutStore } from '../layout-store'
import { editPresetProject } from '../preset-actions'
import { useProjectStore } from '../project-store'
import { sameSubject, useRenameStore } from '../rename-store'
import { useSelectionStore } from '../selection-store'
import { editorTabOf, isStillRecalled, morphPair, soundsTabsOf, tabFor, useSoundsStore } from '../sounds-store'
import { describeActions, nextSoundName, runAction, saveSound, soundSubject } from '.'
import { fakeContext, loadDemo } from './test-support'

const project = () => useProjectStore.getState().project
const trackNamed = (name: string) => project().tracks.find((track) => track.name === name)!
const owner = (name: string): ControlOwner => ({ kind: 'track', trackId: trackNamed(name).id })
/** The first continuous knob of `who`'s instrument, as a control target. */
const knobOf = (value: Project, who: ControlOwner) =>
  enumerateControlTargets(value).find((target) => {
    const resolved = resolveControlTarget(value, target)
    return target.kind === 'graph' && target.domain === 'patch' && JSON.stringify(target.owner) === JSON.stringify(who) && resolved.status === 'available' && resolved.interpolation !== 'hold'
  })!
/** Its value, normalized from 0 to 1. */
const valueOf = (who: ControlOwner) => {
  const resolved = resolveControlTarget(project(), knobOf(project(), who))
  return resolved.status === 'available' ? controlToNormalized(resolved.spec, resolved.baseValue) : undefined
}
const setKnob = (who: ControlOwner, normalized: number) => {
  const target = knobOf(project(), who), resolved = resolveControlTarget(project(), target)
  if (resolved.status !== 'available') throw new Error('No knob')
  const edited = editControlBase(project(), target, controlFromNormalized(resolved.spec, normalized))
  if (edited.status !== 'applied') throw new Error(edited.reason)
  useProjectStore.getState().resetProject(edited.project)
}

beforeEach(() => {
  loadDemo()
  useSelectionStore.getState().reset()
  useRenameStore.getState().stop()
  useSoundsStore.setState({ tab: 'patch', a: null, b: null, showAll: false, recalled: null })
  useLayoutStore.setState(DEFAULT_LAYOUT)
})

describe('sound.recall', () => {
  /** Bass with a preset, and a copy of Bass whose graph matches it, with Bass's first knob at 0.2 and the copy's at 0.7. */
  const presetAndCopy = () => {
    const bass = owner('Bass')
    const saved = valueOf(bass)!
    useProjectStore.getState().resetProject(saveProjectPreset(project(), { owner: bass, domain: 'patch' }, 'Deep'))
    const copyId = useProjectStore.getState().duplicateTrack(trackNamed('Bass').id)!
    const copy: ControlOwner = { kind: 'track', trackId: copyId }
    setKnob(bass, 0.2)
    setKnob(copy, 0.7)
    return { bass, copy, saved, preset: project().presets![0]! }
  }

  it("recalls onto the preset's own owner without `onto`", async () => {
    const { bass, copy, saved, preset } = presetAndCopy()
    await runAction('sound.recall', soundSubject(preset.id, true), fakeContext())
    expect(valueOf(bass)).toBeCloseTo(saved)
    expect(valueOf(copy)).toBeCloseTo(0.7)
  })

  it('recalls onto `onto`, in the preset\'s domain, and marks the row until that graph is edited', async () => {
    const { bass, copy, saved, preset } = presetAndCopy()
    await runAction('sound.recall', soundSubject(preset.id, true, copy), fakeContext())
    expect(valueOf(copy)).toBeCloseTo(saved)
    expect(valueOf(bass)).toBeCloseTo(0.2)
    const mark = useSoundsStore.getState().recalled!
    expect(mark).toMatchObject({ soundId: preset.id, scope: { owner: copy, domain: 'patch' } })
    expect(isStillRecalled(project(), mark, true)).toBe(true)
    setKnob(bass, 0.4)
    expect(isStillRecalled(project(), mark, true)).toBe(true)
    setKnob(copy, 0.4)
    expect(isStillRecalled(project(), mark, true)).toBe(false)
  })

  it('is disabled onto an owner whose graph is not the preset\'s, saying why', () => {
    const { preset } = presetAndCopy()
    const recall = describeActions(soundSubject(preset.id, true, owner('Lead')), fakeContext()).find((item) => item.id === 'sound.recall')!
    expect(recall.enabled).toBe(false)
    expect(recall.tooltip).toBe("Lead's graph isn't this preset's")
  })

  it('offers Set as A and Set as B on snapshots only', () => {
    const { preset } = presetAndCopy()
    const snapshot = captureSnapshot(project(), { owner: owner('Bass'), domain: 'track' }, 'Loud')
    useProjectStore.getState().resetProject(putSnapshot(project(), snapshot))
    const titles = (subject: ReturnType<typeof soundSubject>) => describeActions(subject, fakeContext()).map((item) => item.title)
    expect(titles(soundSubject(snapshot.id, false))).toEqual(['Recall', 'Set as A', 'Set as B', 'Update', 'Rename', 'Duplicate', 'Delete'])
    expect(titles(soundSubject(preset.id, true))).toEqual(['Recall', 'Update', 'Save to library', 'Rename', 'Duplicate', 'Delete'])
  })
})

describe('nextSoundName', () => {
  it("names a sound after its owner, skipping the names that owner's sounds use", () => {
    const bass = owner('Bass'), lead = owner('Lead')
    expect(nextSoundName(project(), bass)).toBe('Bass 1')
    let value = putSnapshot(project(), captureSnapshot(project(), { owner: bass, domain: 'track' }, 'Bass 1'))
    value = saveProjectPreset(value, { owner: bass, domain: 'patch' }, 'Bass 3')
    // Another owner's sound named like Bass's doesn't count.
    value = putSnapshot(value, captureSnapshot(value, { owner: lead, domain: 'track' }, 'Bass 2'))
    expect(nextSoundName(value, bass)).toBe('Bass 2')
    expect(nextSoundName(value, lead)).toBe('Lead 1')
    expect(nextSoundName(value, { kind: 'master' })).toBe('Master 1')
  })

  it('saves under that name and starts renaming the new row in Sounds', () => {
    const bass = owner('Bass')
    expect(saveSound('snapshot', { owner: bass, domain: 'patch' }, fakeContext(), bass)).toBe('Saved Bass 1')
    expect(saveSound('preset', { owner: bass, domain: 'patch' }, fakeContext(), bass)).toBe('Saved Bass 2')
    const preset = project().presets!.at(-1)!
    expect(preset.name).toBe('Bass 2')
    expect(project().snapshots!.map((snapshot) => snapshot.name)).toEqual(['Bass 1'])
    const renaming = useRenameStore.getState().renaming!
    expect(renaming.origin).toBe('sounds')
    expect(sameSubject(renaming.subject, soundSubject(preset.id, true, bass))).toBe(true)
    // Both saves are undo steps.
    useProjectStore.getState().undo()
    expect(project().presets ?? []).toEqual([])
  })
})

describe('the sounds store', () => {
  const snapshotOf = (name: string, scope = { owner: owner('Bass'), domain: 'track' as const }) => {
    const snapshot = captureSnapshot(project(), scope, name)
    editPresetProject((value) => putSnapshot(value, snapshot))
    return snapshot
  }

  it('keeps A and B across selection changes while their snapshots exist', async () => {
    const one = snapshotOf('One'), two = snapshotOf('Two')
    await runAction('sound.set-a', soundSubject(one.id, false), fakeContext())
    await runAction('sound.set-b', soundSubject(two.id, false), fakeContext())
    useSelectionStore.getState().selectTrack(trackNamed('Lead').id)
    useSelectionStore.getState().selectMaster()
    expect(useSoundsStore.getState()).toMatchObject({ a: one.id, b: two.id })
    expect(morphPair(project(), one.id, two.id)?.map((snapshot) => snapshot.name)).toEqual(['One', 'Two'])
    await runAction('sound.delete', soundSubject(one.id, false), fakeContext())
    expect(useSoundsStore.getState()).toMatchObject({ a: null, b: two.id })
  })

  it('pairs only snapshots of one scope for the morph', () => {
    const one = snapshotOf('One'), lead = snapshotOf('Lead', { owner: owner('Lead'), domain: 'track' })
    expect(morphPair(project(), one.id, lead.id)).toBeUndefined()
    expect(morphPair(project(), one.id, one.id)).toBeUndefined()
    expect(morphPair(project(), one.id, null)).toBeUndefined()
  })

  it('follows the editor shown last, until another is', () => {
    expect(editorTabOf(['session', 'effects'], ['session'])).toBe('fx')
    expect(editorTabOf(['session', 'mixer'], ['session'])).toBeUndefined()
    expect(editorTabOf(['notes', 'instrument'], [])).toBe('patch')
    useLayoutStore.setState({ visible: ['session', 'notes', 'sounds'] })
    expect(useSoundsStore.getState().tab).toBe('notes')
    useSoundsStore.getState().setTab('track')
    // Showing another view keeps a tab chosen by hand; an editor shown moves it.
    useLayoutStore.setState({ visible: ['session', 'notes', 'sounds', 'mixer'] })
    expect(useSoundsStore.getState().tab).toBe('track')
    useLayoutStore.setState({ visible: ['session', 'effects', 'sounds', 'mixer'] })
    expect(useSoundsStore.getState().tab).toBe('fx')
  })

  it("shows the effects of an owner without an instrument for the instrument's tabs", () => {
    const bass = soundsTabsOf(project(), owner('Bass')), master = soundsTabsOf(project(), { kind: 'master' })
    expect(bass).toEqual(['patch', 'fx', 'notes', 'track'])
    expect(soundsTabsOf(project(), owner('Kick'))).toEqual(['fx', 'track'])
    expect(tabFor('patch', master)).toBe('fx')
    expect(tabFor('track', master)).toBe('track')
    expect(tabFor('notes', bass)).toBe('notes')
  })
})
