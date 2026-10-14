import type { MidiInput } from '@audio'
import { type MidiMessage, describeMidiMessage, isInstrumentTrack, pitchName } from '@core'
import { type EngineControls, useMidiStore, useProjectStore, useSelectionStore } from '@state'

/** Remembers that the user turned MIDI on, so it comes back on by itself next time (a per-browser convenience). */
const REMEMBER_KEY = 'sfxlab:midi'

const remembered = (): boolean => {
  try {
    return localStorage.getItem(REMEMBER_KEY) === 'on'
  } catch {
    return false
  }
}

const remember = (): void => {
  try {
    localStorage.setItem(REMEMBER_KEY, 'on')
  } catch {
    // Without storage MIDI simply has to be turned on again next time.
  }
}

/**
 * Connects MIDI input to the app: keys play the selected track's instrument (a note-off goes to the track its note-on
 * went to, even if the selection changed while the key was down), a controller moves the controls bound to it, and while a
 * control is learning the next controller is bound to it instead.
 */
export const connectMidi = (input: MidiInput, engine: EngineControls): (() => void) => {
  const held = new Map<string, string>()
  const keyOf = (channel: number, note: number) => `${channel}:${note}`

  const handle = (message: MidiMessage) => {
    useMidiStore.getState().setLast(describeMidiMessage(message, pitchName))
    switch (message.kind) {
      case 'noteOn': {
        const trackId = useSelectionStore.getState().trackId
        const track = useProjectStore.getState().project.tracks.find((candidate) => candidate.id === trackId)
        if (!track || !isInstrumentTrack(track)) return
        held.set(keyOf(message.channel, message.note), track.id)
        engine.noteOn(track.id, message.note, message.velocity)
        return
      }
      case 'noteOff': {
        const key = keyOf(message.channel, message.note)
        const trackId = held.get(key)
        if (trackId === undefined) return
        held.delete(key)
        engine.noteOff(trackId, message.note)
        return
      }
      case 'cc': {
        const learning = useMidiStore.getState().learning
        if (learning) {
          // Bound on any channel: one controller is the common case, and a stray channel setting should not break it.
          learning.assign({ cc: message.cc })
          useMidiStore.getState().learn(null)
          return
        }
        useProjectStore.getState().applyMidi(message)
      }
    }
  }

  const stopMessages = input.onMessage(handle)
  const stopDevices = input.onDevices((devices) => useMidiStore.getState().setDevices(devices))
  const enable = () => {
    void input.enable().then((result) => {
      useMidiStore.getState().setStatus(result)
      if (result === 'on') {
        remember()
        useMidiStore.getState().setDevices(input.devices())
      }
    })
  }
  useMidiStore.setState({ enable })
  if (remembered()) enable()

  return () => {
    stopMessages()
    stopDevices()
    for (const [key, trackId] of held) engine.noteOff(trackId, Number(key.split(':')[1]))
    held.clear()
  }
}
