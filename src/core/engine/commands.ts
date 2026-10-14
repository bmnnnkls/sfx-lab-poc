import type { Patch } from '../patch'
import type { AudioClip, Clip, SendLevels } from '../project'
import type { SampleData } from '../sample'

/** Everything the outside world can ask the engine to do. Plain data, safe to post across threads. */
export type EngineCommand =
  | { readonly type: 'transport/play' }
  | { readonly type: 'transport/stop' }
  | { readonly type: 'transport/setTempo'; readonly bpm: number }
  | {
      readonly type: 'track/add'
      readonly kind: 'instrument'
      readonly trackId: string
      readonly patch: Patch
      readonly noteGraph: Patch
      readonly fx: Patch
      readonly clips: readonly (Clip | null)[]
      readonly volume: number
      readonly pan?: number
      readonly muted?: boolean
      readonly soloed?: boolean
      readonly voices: number
      /** Absent means nothing is sent. */
      readonly sends?: SendLevels
    }
  | {
      readonly type: 'track/add'
      readonly kind: 'audio'
      readonly trackId: string
      readonly fx: Patch
      /** Absent means nothing is sent. */
      readonly sends?: SendLevels
      readonly clips: readonly (AudioClip | null)[]
      readonly volume: number
      readonly pan?: number
      readonly muted?: boolean
      readonly soloed?: boolean
    }
  | {
      readonly type: 'track/add'
      readonly kind: 'return'
      readonly trackId: string
      readonly fx: Patch
      readonly volume: number
      readonly pan?: number
      readonly muted?: boolean
      readonly soloed?: boolean
    }
  | { readonly type: 'track/remove'; readonly trackId: string }
  | { readonly type: 'track/setPatch'; readonly trackId: string; readonly patch: Patch }
  | { readonly type: 'track/setFx'; readonly trackId: string; readonly graph: Patch }
  | { readonly type: 'master/setFx'; readonly graph: Patch }
  | { readonly type: 'master/setParam'; readonly nodeId: string; readonly paramId: string; readonly value: number }
  | { readonly type: 'master/setSample'; readonly nodeId: string; readonly sampleId: string | null }
  | { readonly type: 'track/setNoteGraph'; readonly trackId: string; readonly graph: Patch }
  | { readonly type: 'track/setVoices'; readonly trackId: string; readonly voices: number }
  | { readonly type: 'track/setClips'; readonly trackId: string; readonly clips: readonly (Clip | null)[] }
  | { readonly type: 'track/setAudioClips'; readonly trackId: string; readonly clips: readonly (AudioClip | null)[] }
  | { readonly type: 'track/setVolume'; readonly trackId: string; readonly volume: number }
  | { readonly type: 'track/setPan'; readonly trackId: string; readonly pan: number }
  | { readonly type: 'track/setMute'; readonly trackId: string; readonly muted: boolean }
  | { readonly type: 'track/setSolo'; readonly trackId: string; readonly soloed: boolean }
  | { readonly type: 'master/setVolume'; readonly volume: number }
  | { readonly type: 'track/setSends'; readonly trackId: string; readonly sends: SendLevels }
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
  /** A note from a MIDI keyboard: played on the track's instrument straight away, held until its `track/noteOff`. */
  | { readonly type: 'track/noteOn'; readonly trackId: string; readonly pitch: number; readonly velocity: number }
  | { readonly type: 'track/noteOff'; readonly trackId: string; readonly pitch: number }
  | { readonly type: 'sample/add'; readonly sample: SampleData }
  | { readonly type: 'sample/remove'; readonly sampleId: string }
  | { readonly type: 'sample/preview'; readonly sampleId: string }
  | { readonly type: 'sample/stopPreview' }
  | { readonly type: 'clip/launch'; readonly trackId: string; readonly clipId: string }
  | { readonly type: 'scene/launch'; readonly scene: number }
