export type { SampleAudio, SampleData, SampleInfo, SampleLookup, SampleMarker, SampleRegion } from './types'
export { SAMPLE_MARK_LIMITS, bytesKeyOf, originOf, savedFrameCount } from './marks'
export { type FrameMap, type SampleRemap, cropMap, identityMap, mirrorMap, spliceMap } from './remap'
export { type SampleChannel, channelAt, decodedBytes, frameCount, monoAt } from './channels'
export { SampleBank } from './sample-bank'
export { computePeaks, toMono } from './audio-math'
export { type WavBitDepth, encodeWav, encodeWavChannels } from './wav'
export {
  type Crossfade,
  DEFAULT_CROSSFADE,
  EDIT_WAV_BIT_DEPTH,
  type EdgeRamp,
  type EditChannels,
  type EditSelection,
  type EditSetting,
  type FrameRange,
  GAIN_RANGE_DB,
  MAX_CROSSFADE_SECONDS,
  NORMALIZE_DEFAULT_DB,
  SAMPLE_EDITS,
  SILENT_PEAK,
  type SampleEdit,
  type SampleEditAfter,
  type SampleEditContext,
  type SampleEditEntry,
  type SampleEditKind,
  type SampleEditVariant,
  afterEdit,
  applySampleEdit,
  changedFrames,
  clampCrossfadeSeconds,
  editSuffix,
  peakOfRange,
  remapFrame,
  remapRange,
  sampleEditEntry,
  sampleRemap,
} from './edits'
export { type AudioCopy, CLIPBOARD_HANDLE_SECONDS, type JoinFade, copyAudioRange, fitChannels, joinChannel, silenceCopy, spliceAudio } from './crossfade'
export { CROSSFADE_CURVES, type CrossfadeCurve, FADE_CURVES, type FadeCurve, type FadeCurveEntry, fadeShape, isCrossfadeCurve, isFadeCurve } from './fade-curves'
export { type PeakPyramid, type WaveColumns, type WaveDraw, type WaveView, buildPeakPyramid, columnsFor, updatePeakPyramid, waveDrawFor } from './pyramid'
export { createDemoSamples, type DemoSample } from './demo-samples'
