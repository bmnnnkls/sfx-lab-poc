import { type MidiTrackInput, midiInputMatches, sanitizeMidiTrackInput } from '../midi'
import { updateInstrument } from './edit'
import type { InstrumentTrack, Project } from './types'

const sameInput = (a: MidiTrackInput | undefined, b: MidiTrackInput | undefined): boolean =>
  a === b || (!!a && !!b && a.deviceId === b.deviceId && a.deviceName === b.deviceName && a.channel === b.channel)

/**
 * Gives an instrument track its own MIDI input (`{}` for any input on any channel), or, with undefined, lets it follow
 * the selection again. Malformed parts are left out. The same project when nothing changes.
 */
export const setTrackMidiInput = (project: Project, trackId: string, input: MidiTrackInput | undefined): Project => {
  const next = input === undefined ? undefined : sanitizeMidiTrackInput(input)
  return updateInstrument(project, trackId, (track) => {
    if (sameInput(track.midiInput, next)) return track
    const { midiInput: _previous, ...rest } = track
    return next === undefined ? rest : { ...rest, midiInput: next }
  })
}

/** What a live note is routed by, besides the tracks' own inputs. */
export interface MidiFollow {
  /** The pinned or selected instrument track, if any. */
  readonly trackId: string | null
  /** The only channel (zero-based) the followed track listens to; null for all. */
  readonly channel: number | null
}

const instruments = (project: Project): readonly InstrumentTrack[] => project.tracks.filter((track): track is InstrumentTrack => track.kind === 'instrument')

/**
 * The instrument tracks a live note from this input and channel goes to. Every track with its own input that matches
 * gets it (several make a layer). Only when none does, the followed track gets it, if it has no input of its own and
 * the follow channel allows it: so a pad on its own channel plays only its track, while the keyboard plays whatever is
 * selected.
 */
export const liveNoteTracks = (project: Project, deviceId: string, channel: number, follow: MidiFollow): readonly string[] => {
  const tracks = instruments(project)
  const own = tracks.filter((track) => track.midiInput && midiInputMatches(track.midiInput, deviceId, channel)).map((track) => track.id)
  if (own.length > 0) return own
  const followed = tracks.find((track) => track.id === follow.trackId)
  return followed && !followed.midiInput && (follow.channel === null || follow.channel === channel) ? [followed.id] : []
}

/**
 * A text that changes whenever where live notes go may change: the followed track and every track's own input. Held
 * notes are released when it changes, so a key-up never has to find a note on a track that no longer takes it.
 */
export const liveNoteRouting = (project: Project, follow: MidiFollow): string =>
  JSON.stringify([
    follow,
    instruments(project).some((track) => track.id === follow.trackId) ? follow.trackId : null,
    instruments(project).flatMap((track) => (track.midiInput ? [[track.id, track.midiInput.deviceId ?? null, track.midiInput.channel ?? null]] : [])),
  ])
