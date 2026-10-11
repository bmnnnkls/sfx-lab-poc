import { describe, expect, it } from 'vitest'
import { createDefaultPatch, exposeKnob, flattenPatch, groupIntoModule, setNodeParam } from '../patch'
import { SampleBank } from '../sample'
import { Instrument } from './instrument'

const SAMPLE_RATE = 48000

const render = (patch: ReturnType<typeof createDefaultPatch>, seconds = 0.5): Float32Array => {
  const instrument = new Instrument(patch, SAMPLE_RATE, 4, new SampleBank())
  for (const pitch of [48, 55]) instrument.noteOn(pitch)
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE))
  for (let offset = 0; offset < out.length; offset += 128) {
    const frames = Math.min(128, out.length - offset)
    out.set(instrument.render(frames).subarray(0, frames), offset)
  }
  return out
}

describe('modules in the engine', () => {
  const patch = createDefaultPatch()
  const pick = (type: string) => patch.nodes.find((node) => node.type === type)!.id

  it('a grouped patch sounds sample-for-sample like the original', () => {
    const { patch: grouped, module } = groupIntoModule(patch, [pick('oscillator'), pick('filter'), pick('envelope'), pick('gain')], 'Voice', [])!
    const original = render(patch)
    const viaModule = render(flattenPatch(grouped, [module]))
    expect(Math.max(...original.map(Math.abs))).toBeGreaterThan(0.01)
    expect(Array.from(viaModule)).toEqual(Array.from(original))
  })

  it('a knob on a use sounds like changing that parameter in the plain patch', () => {
    const { patch: grouped, module, use } = groupIntoModule(patch, [pick('oscillator'), pick('filter')], 'Core', [])!
    const filter = module.patch.nodes.find((node) => node.type === 'filter')!
    const withKnob = exposeKnob(module, filter.id, 'cutoff', 'Tone')
    const tuned = setNodeParam(grouped, use.id, `${filter.id}:cutoff`, 4000)
    const direct = setNodeParam(patch, pick('filter'), 'cutoff', 4000)
    expect(Array.from(render(flattenPatch(tuned, [withKnob])))).toEqual(Array.from(render(direct)))
  })
})
