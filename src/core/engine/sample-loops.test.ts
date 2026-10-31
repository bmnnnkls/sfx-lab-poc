import { describe, expect, it } from 'vitest'
import { setNodeParam } from '../patch'
import { type InstrumentTrack, addSamplerTrack, addSamples, createClip, createEmptyProject, createNote, setClipAt } from '../project'
import { type SampleData, type SampleInfo, setLoop } from '../sample'
import { diffProject } from '../sync'
import { renderProject } from './bounce'
import type { EngineCommand } from './commands'

const RATE = 48000
/** Silence, then a tone from frame 1000 to 2000, then silence: only a loop over the tone keeps a held note sounding. */
const DATA: SampleData = {
  id: 'c'.repeat(64),
  sampleRate: RATE,
  channels: [Float32Array.from({ length: 4800 }, (_, i) => (i >= 1000 && i < 2000 ? 0.5 * Math.sin((2 * Math.PI * i) / 100) : 0))],
}
const INFO: SampleInfo = { id: DATA.id, name: 'Tone', extension: 'wav', durationSeconds: 0.1, sampleRate: RATE, channels: 1, bytes: 0 }
const LOOP = { from: 1000, to: 2000 }

/** A sampler in *loop* mode playing the sample, a note held for a whole bar. */
const project = (info: SampleInfo) => {
  let next = addSamplerTrack(addSamples(createEmptyProject(), [info]), info)
  const track = next.tracks.at(-1) as InstrumentTrack
  const sampler = track.patch.nodes.find((node) => node.type === 'sampler')!
  next = { ...next, tracks: next.tracks.map((candidate) => (candidate === track ? { ...track, patch: setNodeParam(track.patch, sampler.id, 'mode', 2) } : candidate)) }
  return setClipAt(next, track.id, 0, createClip('held', 4, [createNote(60, 0, 4)]))
}
const loopCommands = (commands: readonly EngineCommand[]) => commands.filter((command) => command.type === 'sample/setLoop')
const rms = (data: Float32Array, from: number, to: number) => Math.sqrt(data.subarray(from, to).reduce((sum, value) => sum + value * value, 0) / (to - from))

describe('sample loops in the engine', () => {
  it('diffProject sends every sample\'s loop on load, and a change, an undo and a removal after', () => {
    const plain = project(INFO)
    const looped = { ...plain, samples: [setLoop(INFO, LOOP)] }
    expect(loopCommands(diffProject(null, plain))).toEqual([{ type: 'sample/setLoop', sampleId: INFO.id, loop: null }])
    expect(loopCommands(diffProject(null, looped))).toEqual([{ type: 'sample/setLoop', sampleId: INFO.id, loop: LOOP }])
    expect(loopCommands(diffProject(plain, looped))).toEqual([{ type: 'sample/setLoop', sampleId: INFO.id, loop: LOOP }])
    expect(loopCommands(diffProject(looped, plain))).toEqual([{ type: 'sample/setLoop', sampleId: INFO.id, loop: null }])
    expect(loopCommands(diffProject(looped, { ...looped, samples: [...looped.samples] }))).toEqual([])
    expect(loopCommands(diffProject(looped, { ...looped, samples: [] }))).toEqual([{ type: 'sample/setLoop', sampleId: INFO.id, loop: null }])
  })

  it('a bounce of a looped sampler repeats the loop while the note is held; the loop arrives before the audio', () => {
    const options = { scope: { kind: 'scene', scene: 0 }, bars: 1, maxTail: 0, bitDepth: 32 } as const
    const withLoop = renderProject({ ...project(INFO), samples: [setLoop(INFO, LOOP)] }, [DATA], options)
    const without = renderProject(project(INFO), [DATA], options)
    // Half a second in, well past the sample's 0.1 s: the loop sounds throughout, the whole sample mostly silence.
    const [from, to] = [RATE / 2, RATE]
    expect(rms(withLoop.left, from, to)).toBeGreaterThan(0.1)
    expect(rms(without.left, from, to)).toBeLessThan(rms(withLoop.left, from, to) / 2)
  })
})
