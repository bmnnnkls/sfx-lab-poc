import { type ProcessContext, RIGHT, isStereoBuffer } from '../dsp'
import type { CompiledRun, ParamFeed } from './compile'

/** Only a processor with an automation curve (or a wire fed by one) needs samplewise parameter reads. */
export const processAutomatedRun = (run: CompiledRun, context: ProcessContext, curves: ReadonlyMap<string, Float64Array> | undefined, feeds: readonly ParamFeed[]): void => {
  const { dsp, inputs, outputs, sampleInputs, sampleOutputs } = run
  const input = context.input && new Float32Array(context.input.length)
  const tapScratch = new Map<Float32Array, Float32Array>()
  let frame = 0
  const sampleContext: ProcessContext = {
    ...context, frames: 1, input,
    ...(context.sends && { sends: { add: (id, source, amount, count) => context.sends!.add(id, source, amount, count, frame) } }),
    ...(context.taps && { taps: { read: (id, tap) => {
      const source = context.taps!.read(id, tap)
      if (!source) return undefined
      let scratch = tapScratch.get(source)
      if (!scratch) { scratch = new Float32Array(source.length); tapScratch.set(source, scratch) }
      scratch[0] = source[frame] ?? 0
      if (isStereoBuffer(source)) scratch[RIGHT] = source[RIGHT + frame] ?? 0
      return scratch
    } } }),
  }
  for (frame = 0; frame < context.frames; frame++) {
    for (const [id, values] of curves ?? []) dsp.setParam(id, values[frame]!)
    for (const feed of feeds) {
      const value = feed.sources.reduce((sum, source) => sum + (source[frame] ?? 0), 0)
      if (Number.isFinite(value)) { feed.last = value; dsp.setParam(feed.paramId, value) }
    }
    for (let index = 0; index < inputs.length; index++) {
      const source = inputs[index], scratch = sampleInputs[index]
      if (!source || !scratch) continue
      scratch[0] = source[frame] ?? 0
      if (isStereoBuffer(source)) scratch[RIGHT] = source[RIGHT + frame] ?? 0
    }
    if (input && context.input) {
      input[0] = context.input[frame] ?? 0
      if (isStereoBuffer(input)) input[RIGHT] = context.input[RIGHT + frame] ?? 0
    }
    dsp.process(sampleContext, sampleInputs, sampleOutputs)
    for (let index = 0; index < outputs.length; index++) {
      const output = outputs[index]!, scratch = sampleOutputs[index]!
      output[frame] = scratch[0] ?? 0
      if (isStereoBuffer(output)) output[RIGHT + frame] = scratch[RIGHT] ?? 0
    }
  }
}
