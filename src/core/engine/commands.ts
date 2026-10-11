import type { Patch } from '../patch'
import type { Clip } from '../project'

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
    }
  | { readonly type: 'track/remove'; readonly trackId: string }
  | { readonly type: 'track/setPatch'; readonly trackId: string; readonly patch: Patch }
  | { readonly type: 'track/setClips'; readonly trackId: string; readonly clips: readonly (Clip | null)[] }
  | { readonly type: 'track/setVolume'; readonly trackId: string; readonly volume: number }
  | {
      readonly type: 'track/setParam'
      readonly trackId: string
      readonly nodeId: string
      readonly paramId: string
      readonly value: number
    }
  | { readonly type: 'track/stop'; readonly trackId: string }
  | { readonly type: 'clip/launch'; readonly trackId: string; readonly clipId: string }
  | { readonly type: 'scene/launch'; readonly scene: number }
