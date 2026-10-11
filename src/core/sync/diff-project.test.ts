import type { InstrumentTrack } from '../project'
import { describe, expect, it } from 'vitest'
import { exposeNoteKnob, renameNoteModule, setNoteEffectParamIn, setNoteModuleEffects } from '../notefx'
import { exposeKnob, moveNode, setModulePatch, setNodeParam, setNodeSample } from '../patch'
import {
  addNoteEffect,
  addNoteModuleUse,
  editNoteChain,
  groupEffectsAsModule,
  updateNoteModule as updateNoteModuleDef,
  setNoteEffectParam,
  addModuleUse,
  editPatchAt,
  groupNodesAsModule,
  updateModule,
  createDemoProject,
  setClipAt,
  setTempo,
  setTrackPatch,
  setTrackVoices,
  setTrackVolume,
} from '../project'
import { addAudioTrackWithClip, addSamples, createAudioTrack, addTrack, setTrackVolume as setVolume, updateAudioClip, isAudioTrack } from '../project'
import { diffProject } from './diff-project'

describe('diffProject', () => {
  const project = createDemoProject()
  const track = project.tracks[0] as InstrumentTrack

  it('describes a whole project as tempo + one add per track when starting from nothing', () => {
    const commands = diffProject(null, project)
    expect(commands.map((c) => c.type)).toEqual(['transport/setTempo', 'track/add', 'track/add', 'track/add'])
  })

  it('emits nothing for an identical project', () => {
    expect(diffProject(project, project)).toEqual([])
  })

  it('maps param edits to setParam without rebuilding the patch', () => {
    const osc = track.patch.nodes.find((n) => n.type === 'oscillator')!
    const next = setTrackPatch(project, track.id, setNodeParam(track.patch, osc.id, 'detune', 12))

    expect(diffProject(project, next)).toEqual([
      { type: 'track/setParam', trackId: track.id, nodeId: osc.id, paramId: 'detune', value: 12 },
    ])
  })

  it('ignores canvas position changes', () => {
    const node = track.patch.nodes[0]!
    const next = setTrackPatch(project, track.id, moveNode(track.patch, node.id, 500, 500))

    expect(diffProject(project, next)).toEqual([])
  })

  it('maps a sample change on a node to setSample, without rebuilding the patch', () => {
    const osc = track.patch.nodes.find((n) => n.type === 'oscillator')!
    const next = setTrackPatch(project, track.id, setNodeSample(track.patch, osc.id, 'f'.repeat(64)))

    expect(diffProject(project, next)).toEqual([
      { type: 'track/setSample', trackId: track.id, nodeId: osc.id, sampleId: 'f'.repeat(64) },
    ])
  })

  it('maps a voice-count change to its own command', () => {
    const next = setTrackVoices(project, track.id, 3)
    expect(diffProject(project, next)).toEqual([{ type: 'track/setVoices', trackId: track.id, voices: 3 }])
  })

  it('maps clip, volume and tempo edits to their own commands', () => {
    let next = setClipAt(project, track.id, 0, null)
    next = setTrackVolume(next, track.id, 0.5)
    next = setTempo(next, 140)

    expect(diffProject(project, next).map((c) => c.type)).toEqual([
      'transport/setTempo',
      'track/setClips',
      'track/setVolume',
    ])
  })

  describe('audio tracks', () => {
    const sample = { id: 'a'.repeat(64), name: 'Loop', extension: 'wav', durationSeconds: 2, sampleRate: 44100, channels: 1, bytes: 1 }
    const base = addAudioTrackWithClip(addSamples(project, [sample]), sample)
    const audio = base.tracks[base.tracks.length - 1]!

    it('adds an audio track as an audio track, with no patch or voices', () => {
      const commands = diffProject(project, base)
      expect(commands).toContainEqual(
        expect.objectContaining({ type: 'track/add', kind: 'audio', trackId: audio.id }),
      )
      expect(commands.find((c) => c.type === 'track/add' && c.kind === 'audio')).not.toHaveProperty('patch')
    })

    it('maps clip edits to setAudioClips and volume to setVolume', () => {
      const clipId = isAudioTrack(audio) ? audio.clips[0]!.id : ''
      const edited = setVolume(updateAudioClip(base, audio.id, clipId, { gain: 0.4 }), audio.id, 0.3)

      expect(diffProject(base, edited).map((c) => c.type)).toEqual(['track/setAudioClips', 'track/setVolume'])
    })

    it('emits nothing for an unchanged audio track', () => {
      expect(diffProject(base, { ...base })).toEqual([])
    })

    it('replaces a track whose kind changed under the same id', () => {
      const asInstrument = { ...base, tracks: [...base.tracks.slice(0, -1), { ...project.tracks[0]!, id: audio.id }] }
      expect(diffProject(base, asInstrument).map((c) => c.type)).toEqual(['track/remove', 'track/add'])
    })

    it('adding an empty audio track works too', () => {
      const next = addTrack(project, createAudioTrack('Empty', project.sceneCount))
      expect(diffProject(project, next).at(-1)).toMatchObject({ type: 'track/add', kind: 'audio', clips: [null, null, null, null] })
    })
  })

  describe('with modules', () => {
    const ids = ['oscillator', 'filter'].map((type) => track.patch.nodes.find((n) => n.type === type)!.id)
    const grouped = groupNodesAsModule(project, { trackId: track.id }, ids, 'Core')
    const second = addModuleUse(grouped, { trackId: (project.tracks[1] as InstrumentTrack).id }, grouped.modules[0]!.id, 0, 0)

    it('sends the engine plain nodes, never a module', () => {
      const commands = diffProject(null, grouped)
      const add = commands.find((c) => c.type === 'track/add' && c.trackId === track.id)!
      expect(add.type === 'track/add' && add.kind === 'instrument' && add.patch.nodes.some((n) => n.type === 'module')).toBe(false)
    })

    it('grouping renames the inner nodes for the engine, so it rebuilds that one track (and nothing else)', () => {
      expect(diffProject(project, grouped).map((c) => [c.type, 'trackId' in c ? c.trackId : ''])).toEqual([
        ['track/setPatch', track.id],
      ])
    })

    it('a knob on a module use arrives as an ordinary parameter change', () => {
      const knob = grouped.modules[0]!
      const filter = knob.patch.nodes.find((n) => n.type === 'filter')!
      const exposed = updateModule(grouped, knob.id, (m) => exposeKnob(m, filter.id, 'cutoff', 'Tone'))
      const useId = (exposed.tracks[0] as InstrumentTrack).patch.nodes.find((n) => n.type === 'module')!.id
      const tuned = editPatchAt(exposed, { trackId: track.id }, (patch) => setNodeParam(patch, useId, `${filter.id}:cutoff`, 4321))

      expect(diffProject(exposed, tuned)).toEqual([
        { type: 'track/setParam', trackId: track.id, nodeId: `${useId}/${filter.id}`, paramId: 'cutoff', value: 4321 },
      ])
    })

    it('editing a module definition updates every track that uses it, and only them', () => {
      const definition = second.modules[0]!
      const filter = definition.patch.nodes.find((n) => n.type === 'filter')!
      const edited = updateModule(second, definition.id, (m) => setModulePatch(m, setNodeParam(m.patch, filter.id, 'cutoff', 999)))
      const commands = diffProject(second, edited)
      expect(commands.map((c) => ('trackId' in c ? c.trackId : ''))).toEqual([track.id, (project.tracks[1] as InstrumentTrack).id])
      expect(commands.every((c) => c.type === 'track/setParam' && c.value === 999)).toBe(true)
    })

    it('rewiring inside a module rebuilds the patch of the tracks that use it', () => {
      const definition = second.modules[0]!
      const edited = updateModule(second, definition.id, (m) => setModulePatch(m, { ...m.patch, connections: [] }))
      expect(diffProject(second, edited).every((c) => c.type === 'track/setPatch')).toBe(true)
    })
  })

  describe('MIDI effects', () => {
    it('sends the whole chain with a new track', () => {
      const withFx = addNoteEffect(project, track.id, 'chord')
      const add = diffProject(null, withFx).find((c) => c.type === 'track/add' && c.trackId === track.id)!
      expect(add.type === 'track/add' && add.kind === 'instrument' && add.noteEffects.map((e) => e.type)).toEqual(['chord'])
    })

    it('sends the new chain when it changes, and nothing else', () => {
      const withFx = addNoteEffect(project, track.id, 'transpose')
      const commands = diffProject(project, withFx)
      expect(commands).toHaveLength(1)
      expect(commands[0]).toMatchObject({ type: 'track/setNoteEffects', trackId: track.id })

      const id = (withFx.tracks[0] as InstrumentTrack).noteEffects[0]!.id
      const turned = setNoteEffectParam(withFx, track.id, id, 'semitones', 5)
      expect(diffProject(withFx, turned).map((c) => c.type)).toEqual(['track/setNoteEffects'])
      expect(diffProject(turned, turned)).toEqual([])
    })
  })

  describe('MIDI effect modules', () => {
    const chained = ['scaleLock', 'chord', 'arpeggiator'].reduce((p, type) => addNoteEffect(p, track.id, type), project)
    const ids = (chained.tracks[0] as InstrumentTrack).noteEffects.slice(1).map((e) => e.id)
    const grouped = groupEffectsAsModule(chained, { trackId: track.id }, ids, 'Chord arp')

    it('sends the engine plain effects, never a module', () => {
      const add = diffProject(null, grouped).find((c) => c.type === 'track/add' && c.trackId === track.id)!
      expect(add.type === 'track/add' && add.kind === 'instrument' && add.noteEffects.map((e) => e.type)).toEqual(['scaleLock', 'chord', 'arpeggiator'])
    })

    it('grouping renames the inner effects for the engine, so the chain is sent once', () => {
      expect(diffProject(chained, grouped).map((c) => c.type)).toEqual(['track/setNoteEffects'])
    })

    it('editing the module updates every track that uses it', () => {
      const second = addNoteModuleUse(grouped, { trackId: (project.tracks[1] as InstrumentTrack).id }, grouped.noteModules[0]!.id)
      const edited = updateNoteModuleDef(second, second.noteModules[0]!.id, (m) => setNoteModuleEffects(m, m.effects.slice(0, 1)))
      const commands = diffProject(second, edited)
      expect(commands.map((c) => ('trackId' in c ? c.trackId : ''))).toEqual([track.id, (project.tracks[1] as InstrumentTrack).id])
      expect(commands.every((c) => c.type === 'track/setNoteEffects')).toBe(true)
    })

    it('a module knob arrives as a changed chain with the same ids (so the running arpeggio keeps its state)', () => {
      const module = grouped.noteModules[0]!
      const arp = module.effects[1]!
      const exposed = updateNoteModuleDef(grouped, module.id, (m) => exposeNoteKnob(m, arp.id, 'gate', 'Length'))
      const useId = (exposed.tracks[0] as InstrumentTrack).noteEffects.find((e) => e.type === 'module')!.id
      const tuned = editNoteChain(exposed, { trackId: track.id }, (effects, modules) => setNoteEffectParamIn(effects, useId, `${arp.id}:gate`, 0.95, modules))
      const [command] = diffProject(exposed, tuned)
      expect(command).toMatchObject({ type: 'track/setNoteEffects' })
      const before = diffProject(null, exposed).find((c) => c.type === 'track/add' && c.trackId === track.id)!
      const ids = (c: unknown) => ((c as { noteEffects?: { id: string }[]; effects?: { id: string }[] }).noteEffects ?? (c as { effects: { id: string }[] }).effects).map((e) => e.id)
      expect(ids(command)).toEqual(ids(before))
    })

    it('nothing is sent when a module edit does not change what plays', () => {
      const edited = updateNoteModuleDef(grouped, grouped.noteModules[0]!.id, (m) => renameNoteModule(m, 'Other name'))
      expect(diffProject(grouped, edited)).toEqual([])
    })
  })
})
