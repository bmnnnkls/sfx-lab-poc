import { isInstrumentTrack } from '@core'
import { useMidiStore, useProjectStore, useSelectionStore } from '@state'
import styles from './TransportBar.module.css'

const TITLES = {
  off: 'Use a MIDI keyboard or controller (the browser asks first)',
  unsupported: 'This browser has no Web MIDI (Chromium-based browsers and Firefox do)',
  denied: 'MIDI was not allowed: allow it in the site settings, then click again',
} as const

/**
 * The MIDI switch and what it is doing: off until clicked (the browser asks for permission), then the devices, where the
 * keys play (the selected instrument track) and the last message, so a controller can be seen to arrive.
 */
export const MidiStatus = () => {
  const status = useMidiStore((state) => state.status)
  const devices = useMidiStore((state) => state.devices)
  const last = useMidiStore((state) => state.last)
  const learning = useMidiStore((state) => state.learning)
  const enable = useMidiStore((state) => state.enable)
  const trackId = useSelectionStore((state) => state.trackId)
  const track = useProjectStore((state) => state.project.tracks.find((candidate) => candidate.id === trackId))

  if (status !== 'on') {
    return (
      <button className={styles.midi} onClick={enable} title={TITLES[status]} data-midi={status}>
        MIDI {status === 'off' ? 'off' : status === 'denied' ? 'blocked' : 'n/a'}
      </button>
    )
  }
  const target = track && isInstrumentTrack(track) ? track.name : 'no instrument track selected'
  const where = devices.length === 0 ? 'no device connected' : devices.join(', ')
  return (
    <span className={styles.midiOn} data-midi="on" title={`MIDI from ${where}. Keys play: ${target}.`} aria-live="polite">
      <span className={styles.midiLabel}>MIDI</span>
      <span className={styles.midiText} data-testid="midi-status">
        {learning ? 'Move a controller to learn…' : (last ?? (devices.length === 0 ? 'no device' : `${devices.length} device${devices.length === 1 ? '' : 's'}`))}
      </span>
    </span>
  )
}
