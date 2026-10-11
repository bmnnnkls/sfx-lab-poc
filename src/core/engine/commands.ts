import type { Patch } from '../patch'
import type { Clip } from '../project'
import type { SampleData } from '../sample'

/** Everything the outside world can ask the engine to do. Plain data, safe to post across threads. */
export type EngineCommand =
  | { readonly type: 'transport/play' }
  | { readonly type: 'transport/stop' }
  | { readonly type: 'transport/setTempo'; readonly bpm: number }
  | {
      readonly type: 'track/add'
      readonly trackId: string
      readonly patch: Patch
      readonly clips: readonly (Clip | null)[]
      readonly volume: number
      readonly voices: number
    }
  | { readonly type: 'track/remove'; readonly trackId: string }
  | { readonly type: 'track/setPatch'; readonly trackId: string; readonly patch: Patch }
  | { readonly type: 'track/setVoices'; readonly trackId: string; readonly voices: number }
  | { readonly type: 'track/setClips'; readonly trackId: string; readonly clips: readonly (Clip | null)[] }
  | { readonly type: 'track/setVolume'; readonly trackId: string; readonly volume: number }
  | {
      readonly type: 'track/setParam'
      readonly trackId: string
      readonly nodeId: string
      readonly paramId: string
      readonly value: number
    }
  | {
      readonly type: 'track/setSample'
      readonly trackId: string
      readonly nodeId: string
      readonly sampleId: string | null
    }
  | { readonly type: 'track/stop'; readonly trackId: string }
  | {
      readonly type: 'track/audition'
      readonly trackId: string
      readonly pitch: number
      readonly velocity: number
    }
  | { readonly type: 'sample/add'; readonly sample: SampleData }
  | { readonly type: 'sample/remove'; readonly sampleId: string }
  | { readonly type: 'sample/preview'; readonly sampleId: string }
  | { readonly type: 'sample/stopPreview' }
  | { readonly type: 'clip/launch'; readonly trackId: string; readonly clipId: string }
  | { readonly type: 'scene/launch'; readonly scene: number }
