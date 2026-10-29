import type { AutomationTrack } from '../automation'
import type { ControlValue } from '../control'
import type { LiveNoteAddress } from './live-notes'
import type { Patch } from '../patch'
import type { ArrangementClip, AudioClip, Clip, SendLevels } from '../project'
import type { SampleData } from '../sample'

/** Everything the outside world can ask the engine to do. Plain data, safe to post across threads. */
export type EngineCommand =
  | { readonly type: 'automation/launch'; readonly owner: import('../control').ControlOwner; readonly slotId: string | null }
  | { readonly type: 'automation/configure'; readonly tracks: readonly AutomationTrack[] }
  | { readonly type: 'automation/overrides'; readonly values: readonly ControlValue[]; readonly revision?: number }
  | { readonly type: 'track/noteOn'; readonly trackId: string; readonly note: LiveNoteAddress; readonly pitch: number; readonly velocity: number }
  | { readonly type: 'track/noteOff'; readonly trackId: string; readonly note: LiveNoteAddress }
  | { readonly type: 'notes/sustain'; readonly sourceId: string; readonly channel: number; readonly down: boolean }
  /** Disconnect, disable or destination change: cancels this source everywhere, including delayed notes. */
  | { readonly type: 'notes/releaseSource'; readonly sourceId: string; readonly channel?: number }
  /** Releases voices and cancels pending note events, retaining effect/envelope tails and clip playback. */
  | { readonly type: 'notes/panic' }
  | { readonly type: 'transport/play' }
  | { readonly type: 'transport/stop' }
  | { readonly type: 'transport/setTempo'; readonly bpm: number }
  | { readonly type: 'arrangement/set'; readonly clips: readonly ArrangementClip[] }
  | { readonly type: 'arrangement/play'; readonly fromBeat?: number }
  | { readonly type: 'arrangement/stop' }
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
      /** The bus it sums into; absent = the master. */
      readonly output?: string
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
      readonly output?: string
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
      readonly output?: string
    }
  | {
      /** A group's bus; `trackId` is the group's id. */
      readonly type: 'track/add'
      readonly kind: 'group'
      readonly trackId: string
      readonly fx: Patch
      readonly volume: number
      readonly pan?: number
      readonly muted?: boolean
      readonly soloed?: boolean
      /** Absent means nothing is sent. */
      readonly sends?: SendLevels
      /** The bus it sums into; absent = the master. */
      readonly output?: string
    }
  | { readonly type: 'track/remove'; readonly trackId: string }
  /** Where a track or a bus sums into: a bus (a group's id), or null for the master. */
  | { readonly type: 'track/setOutput'; readonly trackId: string; readonly output: string | null }
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
      readonly graph?: 'patch' | 'fx' | 'notes'
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
  /**
   * Auditions a sample straight to the master: the whole sample, or frames `from` up to `to`, once or (`loop`) until
   * stopped. Its position is reported in `EngineStatus.preview`.
   */
  | { readonly type: 'sample/preview'; readonly sampleId: string; readonly from?: number; readonly to?: number; readonly loop?: boolean }
  | { readonly type: 'sample/stopPreview' }
  | { readonly type: 'clip/launch'; readonly trackId: string; readonly clipId: string }
  /** Every track's clip in that scene; with `trackIds`, only those tracks' (a collapsed group's cell). */
  | { readonly type: 'scene/launch'; readonly scene: number; readonly trackIds?: readonly string[] }
