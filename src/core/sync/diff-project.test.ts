import type { InstrumentTrack } from '../project'
import { describe, expect, it } from 'vitest'
import { createDefaultFxGraph, exposeKnob, moveNode, noteGraphFrom, renameModule, setModulePatch, setNodeParam, setNodeSample, setNodeStereo, setNodeTrack } from '../patch'
import {
  addModuleUse,
  editPatchAt,
  groupNodesAsModule,
  updateModule,
  createDemoProject,
  createReturnTrack,
  removeTrack,
  setClipAt,
  setTrackSend,
  setTempo,
  setTrackPatch,
  setTrackVoices,
  setTrackVolume,
  setMasterVolume,
  setTrackMuted,
  setTrackPan,
  setTrackSoloed,
} from '../project'
import { addAudioTrackWithClip, addSamples, createAudioTrack, addTrack, setTrackVolume as setVolume, updateAudioClip, isAudioTrack } from '../project'
import { diffProject } from './diff-project'

describe('diffProject', () => {
  const project = createDemoProject()
  const track = project.tracks[0] as InstrumentTrack

  it('describes a whole project as tempo + master graph + one add per track when starting from nothing', () => {
    const commands = diffProject(null, project)
    expect(commands.map((c) => c.type)).toEqual(['transport/setTempo', 'master/setFx', 'track/add', 'track/add', 'track/add'])
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

  describe('insert graphs', () => {
    const effect = (type: string) => noteGraphFrom([{ id: 'in', type: 'trackIn' }, { id: 'e', type, params: {} }, { id: 'out', type: 'trackOut' }], ['in.out>e.in', 'e.out>out.in'])
    const withFx = (fx: ReturnType<typeof effect>) => editPatchAt(project, { trackId: track.id, graph: 'fx' }, () => fx)

    it('adds every track with its insert graph', () => {
      const adds = diffProject(null, project).filter((c) => c.type === 'track/add')
      expect(adds.every((c) => c.fx.nodes.some((n) => n.type === 'trackIn') && c.fx.nodes.some((n) => n.type === 'trackOut'))).toBe(true)
    })

    it('sends the new graph when its wiring changes, and nothing for the sound patch', () => {
      const next = withFx(effect('reverb'))
      expect(diffProject(project, next)).toEqual([{ type: 'track/setFx', trackId: track.id, graph: next.tracks[0]!.fx }])
    })

    it('maps a knob on an effect to setParam, so its tail survives', () => {
      const first = withFx(effect('delay'))
      const delay = first.tracks[0]!.fx.nodes.find((n) => n.type === 'delay')!
      const next = editPatchAt(first, { trackId: track.id, graph: 'fx' }, (fx) => setNodeParam(fx, delay.id, 'feedback', 0.7))
      expect(diffProject(first, next)).toEqual([{ type: 'track/setParam', trackId: track.id, nodeId: delay.id, paramId: 'feedback', value: 0.7 }])
    })

    it('switching a node to stereo rebuilds the graph, since its ports change', () => {
      const first = withFx(effect('filter'))
      const filter = first.tracks[0]!.fx.nodes.find((n) => n.type === 'filter')!
      const next = editPatchAt(first, { trackId: track.id, graph: 'fx' }, (fx) => setNodeStereo(fx, filter.id, true))
      expect(diffProject(first, next).map((c) => c.type)).toEqual(['track/setFx'])
    })

    it('ignores moving a node of the insert graph', () => {
      const next = editPatchAt(project, { trackId: track.id, graph: 'fx' }, (fx) => moveNode(fx, fx.nodes[0]!.id, 300, 300))
      expect(diffProject(project, next)).toEqual([])
    })

    it('treats an audio track the same way', () => {
      const base = addTrack(project, createAudioTrack('Loop', project.sceneCount))
      const audio = base.tracks.at(-1)!
      const next = editPatchAt(base, { trackId: audio.id, graph: 'fx' }, () => effect('filter'))
      expect(diffProject(base, next)).toEqual([{ type: 'track/setFx', trackId: audio.id, graph: next.tracks.at(-1)!.fx }])
    })

    it('a default graph for a fresh track is what the model starts with', () => {
      expect(createAudioTrack('x', 1).fx.nodes.map((n) => n.type)).toEqual(createDefaultFxGraph().nodes.map((n) => n.type))
    })
  })

  describe('Track audio', () => {
    const other = project.tracks[1]!
    const taking = (source: string, tap = 1) =>
      noteGraphFrom([{ id: 'in', type: 'trackIn' }, { id: 'ta', type: 'trackAudio', trackId: source, params: { tap } }, { id: 'out', type: 'trackOut' }], ['ta.out>out.in'])
    const withTake = editPatchAt(project, { trackId: track.id, graph: 'fx' }, () => taking(other.id))

    it('rebuilds the graph when another track is chosen, and sends a new Take as a parameter', () => {
      expect(diffProject(project, withTake).map((c) => c.type)).toEqual(['track/setFx'])
      const retargeted = editPatchAt(withTake, { trackId: track.id, graph: 'fx' }, (fx) => setNodeTrack(fx, 'ta', project.tracks[2]!.id))
      expect(diffProject(withTake, retargeted).map((c) => c.type)).toEqual(['track/setFx'])
      const before = editPatchAt(withTake, { trackId: track.id, graph: 'fx' }, (fx) => setNodeParam(fx, 'ta', 'tap', 0))
      expect(diffProject(withTake, before)).toEqual([{ type: 'track/setParam', trackId: track.id, nodeId: 'ta', paramId: 'tap', value: 0 }])
    })

    it('removing the source removes the track and clears the input in one go', () => {
      expect(diffProject(withTake, removeTrack(withTake, other.id)).map((c) => c.type)).toEqual(['track/remove', 'track/setFx'])
    })
  })

  describe('the master bus', () => {
    const reverb = noteGraphFrom([{ id: 'in', type: 'masterIn' }, { id: 'r', type: 'stereoReverb' }, { id: 'out', type: 'trackOut' }], ['in.out>r.in', 'r.out>out.in'])
    const withMaster = editPatchAt(project, { master: true }, () => reverb)

    it('sends the master graph when the project is loaded', () => {
      expect(diffProject(null, withMaster).filter((c) => c.type === 'master/setFx')).toEqual([{ type: 'master/setFx', graph: reverb }])
    })

    it('rebuilds it when its wiring changes, and only then', () => {
      expect(diffProject(project, withMaster)).toEqual([{ type: 'master/setFx', graph: reverb }])
      expect(diffProject(withMaster, editPatchAt(withMaster, { master: true }, (fx) => moveNode(fx, 'r', 400, 100)))).toEqual([])
    })

    it('maps a knob on a master effect to master/setParam, so its tail survives', () => {
      const next = editPatchAt(withMaster, { master: true }, (fx) => setNodeParam(fx, 'r', 'mix', 0.9))
      expect(diffProject(withMaster, next)).toEqual([{ type: 'master/setParam', nodeId: 'r', paramId: 'mix', value: 0.9 }])
    })

    it('flattens a module used on the master, like everywhere else', () => {
      const grouped = groupNodesAsModule(withMaster, { master: true }, ['r'], 'Wash')
      const [command] = diffProject(null, grouped).filter((c) => c.type === 'master/setFx')
      expect(command?.type === 'master/setFx' && command.graph.nodes.some((n) => n.type === 'module')).toBe(false)
    })
  })

  describe('return tracks and sends', () => {
    const ret = createReturnTrack('Return A')
    const withReturn = addTrack(project, ret)
    const send = noteGraphFrom([{ id: 'in', type: 'trackIn' }, { id: 's', type: 'send', trackId: ret.id }, { id: 'out', type: 'trackOut' }], ['in.out>out.in', 'in.out>s.in'])

    it('adds a return track as a return track: effects and volume, no clips or patch', () => {
      const add = diffProject(project, withReturn).find((c) => c.type === 'track/add')!
      expect(add).toMatchObject({ type: 'track/add', kind: 'return', trackId: ret.id, volume: ret.volume })
      expect(add).not.toHaveProperty('clips')
      expect(add).not.toHaveProperty('patch')
    })

    it('maps the effects and the volume of a return to setFx / setParam / setVolume', () => {
      const withReverb = editPatchAt(withReturn, { trackId: ret.id, graph: 'fx' }, (fx) => ({ ...fx, nodes: [...fx.nodes, ...noteGraphFrom([{ id: 'r', type: 'reverb' }], []).nodes] }))
      expect(diffProject(withReturn, withReverb).map((c) => c.type)).toEqual(['track/setFx'])
      expect(diffProject(withReturn, setVolume(withReturn, ret.id, 0.3)).map((c) => c.type)).toEqual(['track/setVolume'])
    })

    it('a Send gets its return from the node, and a new target rebuilds the graph while a new amount does not', () => {
      const sending = editPatchAt(withReturn, { trackId: track.id, graph: 'fx' }, () => send)
      expect(diffProject(withReturn, sending).map((c) => c.type)).toEqual(['track/setFx'])
      const quieter = editPatchAt(sending, { trackId: track.id, graph: 'fx' }, (fx) => setNodeParam(fx, 's', 'amount', 0.4))
      expect(diffProject(sending, quieter)).toEqual([{ type: 'track/setParam', trackId: track.id, nodeId: 's', paramId: 'amount', value: 0.4 }])
      const other = createReturnTrack('Return B')
      const both = addTrack(sending, other)
      const retargeted = editPatchAt(both, { trackId: track.id, graph: 'fx' }, (fx) => setNodeTrack(fx, 's', other.id))
      expect(diffProject(both, retargeted).map((c) => c.type)).toEqual(['track/setFx'])
    })

    it('maps a send knob to setSends, for instrument and audio tracks alike, and adds tracks with theirs', () => {
      const turned = setTrackSend(withReturn, track.id, ret.id, 0.5)
      expect(diffProject(withReturn, turned)).toEqual([{ type: 'track/setSends', trackId: track.id, sends: { [ret.id]: 0.5 } }])
      expect(diffProject(turned, setTrackSend(turned, track.id, ret.id, 0.5))).toEqual([]) // no change, no command
      const add = diffProject(null, turned).find((c) => c.type === 'track/add' && c.trackId === track.id)!
      expect(add.type === 'track/add' && add.kind === 'instrument' && add.sends).toEqual({ [ret.id]: 0.5 })
    })

    it('removing a return removes it from the engine and clears the Sends to it in one go', () => {
      const sending = editPatchAt(withReturn, { trackId: track.id, graph: 'fx' }, () => send)
      const removed = removeTrack(sending, ret.id)
      expect(diffProject(sending, removed).map((c) => c.type)).toEqual(['track/remove', 'track/setFx'])
    })
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

  describe('note graphs', () => {
    const noteTarget = { trackId: track.id, graph: 'notes' as const }
    const withArp = editPatchAt(project, noteTarget, () =>
      noteGraphFrom(
        [{ id: 'c', type: 'clipNotes' }, { id: 'a', type: 'arpeggiator' }, { id: 'o', type: 'noteOut' }],
        ['c.out>a.in', 'a.out>o.in'],
      ),
    )

    it('sends the whole graph with a new track', () => {
      const add = diffProject(null, withArp).find((c) => c.type === 'track/add' && c.trackId === track.id)!
      expect(add.type === 'track/add' && add.kind === 'instrument' && add.noteGraph.nodes.map((n) => n.type)).toEqual(['clipNotes', 'arpeggiator', 'noteOut'])
    })

    it('sends the new graph when it changes, and nothing else', () => {
      const commands = diffProject(project, withArp)
      expect(commands).toHaveLength(1)
      expect(commands[0]).toMatchObject({ type: 'track/setNoteGraph', trackId: track.id })
      expect(diffProject(withArp, withArp)).toEqual([])
    })

    it('a knob turn sends the graph again, with the same node ids (so running nodes keep their state)', () => {
      const turned = editPatchAt(withArp, noteTarget, (patch) => setNodeParam(patch, 'a', 'gate', 0.9))
      const [command] = diffProject(withArp, turned)
      expect(command).toMatchObject({ type: 'track/setNoteGraph' })
      expect(command!.type === 'track/setNoteGraph' && command.graph.nodes.map((n) => n.id)).toEqual(['c', 'a', 'o'])
    })

    it('moving nodes on the canvas sends nothing', () => {
      const moved = editPatchAt(withArp, noteTarget, (patch) => moveNode(patch, 'a', 500, 500))
      expect(diffProject(withArp, moved)).toEqual([])
    })

    it('sends the engine plain nodes, never a module, and edits to a module reach every track using it', () => {
      const grouped = groupNodesAsModule(withArp, noteTarget, ['a'], 'Arp box')
      const add = diffProject(null, grouped).find((c) => c.type === 'track/add' && c.trackId === track.id)!
      expect(add.type === 'track/add' && add.kind === 'instrument' && add.noteGraph.nodes.some((n) => n.type === 'module')).toBe(false)

      const lead = (project.tracks[1] as InstrumentTrack).id
      const withUse = addModuleUse(grouped, { trackId: lead, graph: 'notes' }, grouped.modules[0]!.id, 0, 0)
      const moduleId = withUse.modules[0]!.id
      const inner = withUse.modules[0]!.patch.nodes.find((n) => n.type === 'arpeggiator')!
      const edited = updateModule(withUse, moduleId, (m) => setModulePatch(m, setNodeParam(m.patch, inner.id, 'rate', 3)))
      expect(diffProject(withUse, edited).map((c) => [c.type, 'trackId' in c ? c.trackId : ''])).toEqual([
        ['track/setNoteGraph', track.id],
        ['track/setNoteGraph', lead],
      ])
    })

    it('a module knob arrives as a changed graph with the same ids', () => {
      const grouped = groupNodesAsModule(withArp, noteTarget, ['a'], 'Arp box')
      const module = grouped.modules[0]!
      const inner = module.patch.nodes.find((n) => n.type === 'arpeggiator')!
      const exposed = updateModule(grouped, module.id, (m) => exposeKnob(m, inner.id, 'gate', 'Length'))
      const useId = (exposed.tracks[0] as InstrumentTrack).noteGraph.nodes.find((n) => n.type === 'module')!.id
      const tuned = editPatchAt(exposed, noteTarget, (patch) => setNodeParam(patch, useId, `${inner.id}:gate`, 0.95))
      const [command] = diffProject(exposed, tuned)
      expect(command).toMatchObject({ type: 'track/setNoteGraph' })
      const ids = (c: unknown) => (c as { graph: { nodes: { id: string }[] } }).graph.nodes.map((n) => n.id)
      const initial = diffProject(null, exposed).find((c) => c.type === 'track/add' && c.trackId === track.id) as unknown as { noteGraph: { nodes: { id: string }[] } }
      expect(ids(command)).toEqual(initial.noteGraph.nodes.map((n) => n.id))
    })

    it('nothing is sent when a module edit does not change what plays (a rename)', () => {
      const grouped = groupNodesAsModule(withArp, noteTarget, ['a'], 'Arp box')
      const renamed = updateModule(grouped, grouped.modules[0]!.id, (m) => renameModule(m, 'Other'))
      expect(diffProject(grouped, renamed)).toEqual([])
    })
  })
})

describe('diffProject: mixer settings', () => {
  const project = createDemoProject()
  const id = project.tracks[0]!.id

  it('sends one command per change, and none for a no-op', () => {
    expect(diffProject(project, setTrackPan(project, id, 0.5))).toEqual([{ type: 'track/setPan', trackId: id, pan: 0.5 }])
    expect(diffProject(project, setTrackMuted(project, id, true))).toEqual([{ type: 'track/setMute', trackId: id, muted: true }])
    expect(diffProject(project, setTrackSoloed(project, id, true))).toEqual([{ type: 'track/setSolo', trackId: id, soloed: true }])
    expect(diffProject(project, setMasterVolume(project, 0.4))).toEqual([{ type: 'master/setVolume', volume: 0.4 }])
    expect(diffProject(project, setTrackMuted(project, id, false))).toEqual([])
    expect(diffProject(project, setTrackPan(project, id, 0))).toEqual([])
  })

  it('sends the reset when a setting returns to its default', () => {
    const panned = setTrackPan(project, id, 0.5)
    expect(diffProject(panned, project)).toEqual([{ type: 'track/setPan', trackId: id, pan: 0 }])
    expect(diffProject(setMasterVolume(project, 0.4), project)).toEqual([{ type: 'master/setVolume', volume: 1 }])
  })

  it('carries the settings in the add command of a track, and the master volume when starting from nothing', () => {
    const mixed = setMasterVolume(setTrackSoloed(setTrackMuted(setTrackPan(project, id, -0.5), id, true), id, true), 0.5)
    const commands = diffProject(null, mixed)
    expect(commands).toContainEqual({ type: 'master/setVolume', volume: 0.5 })
    expect(commands.find((c) => c.type === 'track/add' && c.trackId === id)).toMatchObject({ pan: -0.5, muted: true, soloed: true })
  })
})
