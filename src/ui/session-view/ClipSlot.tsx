import type { Track } from '@core'
import { AudioClipSlot } from './AudioClipSlot'
import { MidiClipSlot } from './MidiClipSlot'

/** One cell of the session grid; which kind depends on the track it belongs to. */
export const ClipSlot = ({ track, scene }: { track: Track; scene: number }) =>
  track.kind === 'audio' ? (
    <AudioClipSlot trackId={track.id} scene={scene} clip={track.clips[scene] ?? null} />
  ) : (
    <MidiClipSlot trackId={track.id} scene={scene} clip={track.clips[scene] ?? null} />
  )
