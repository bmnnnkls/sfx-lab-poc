export type { SampleAudio, SampleData, SampleInfo, SampleLookup, SampleMarker, SampleRegion } from './types'
export { SAMPLE_MARK_LIMITS, bytesKeyOf, originOf, savedFrameCount } from './marks'
export { type FrameMap, type SampleRemap, cropMap, identityMap, mirrorMap, spliceMap } from './remap'
export { type SampleChannel, channelAt, frameCount, monoAt } from './channels'
export { SampleBank } from './sample-bank'
export { computePeaks, toMono } from './audio-math'
export { type WavBitDepth, encodeWav, encodeWavChannels } from './wav'
export {
  EDIT_WAV_BIT_DEPTH,
  type FrameRange,
  SAMPLE_EDITS,
  type SampleEdit,
  type SampleEditContext,
  type SampleEditEntry,
  type SampleEditKind,
  applySampleEdit,
  changedFrames,
  remapFrame,
  remapRange,
  sampleEditEntry,
  sampleRemap,
} from './edits'
export { type PeakPyramid, type WaveColumns, type WaveDraw, type WaveView, buildPeakPyramid, columnsFor, waveDrawFor } from './pyramid'
export { createDemoSamples, type DemoSample } from './demo-samples'
