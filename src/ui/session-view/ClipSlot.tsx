import type { Track } from '@core'
import { AudioClipSlot } from './AudioClipSlot'
import { MidiClipSlot } from './MidiClipSlot'
import { AutomationSlotCell } from './AutomationSlotCell'

/** One cell of the session grid; which kind depends on the track it belongs to. */
export const ClipSlot = ({ track, scene }: { track: Track; scene: number }) => {
  if (track.kind === 'return') return <AutomationSlotCell owner={{ kind: 'track', trackId: track.id }} scene={scene} />
  return track.kind === 'audio' ? (
    <AudioClipSlot trackId={track.id} scene={scene} clip={track.clips[scene] ?? null} />
  ) : (
    <MidiClipSlot trackId={track.id} scene={scene} clip={track.clips[scene] ?? null} />
  )
}
