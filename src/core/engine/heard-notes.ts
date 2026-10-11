import { NoteChain, type NoteEffect, type NoteModuleLibrary, flattenNoteEffects } from '../notefx'
import type { Clip } from '../project'
import { ClipLauncher, type NoteEvent } from '../session'

/** A note as the instrument receives it: after the clip player and every MIDI effect. */
export interface HeardNote {
  readonly pitch: number
  readonly velocity: number
  /** Beats from the start of the clip's loop. */
  readonly start: number
  readonly duration: number
}

/**
 * What the instrument hears while `clip` loops through `effects`, for display: the same clip player and the
 * same effects the engine runs, so the preview cannot disagree with the sound. It runs two passes and
 * reports the second, so what a note leaves behind (echo repeats, an arpeggio) at the end of one pass is shown
 * where it lands in the next. Notes still sounding at the very end are cut there.
 */
export const heardNotes = (clip: Clip, effects: readonly NoteEffect[], modules: NoteModuleLibrary = []): HeardNote[] => {
  const length = clip.lengthBeats
  const end = length * 2

  const launcher = new ClipLauncher()
  launcher.launch(clip)
  const chain = new NoteChain()
  chain.sync(flattenNoteEffects(effects, modules))
  const events = chain.process(launcher.collectEvents(0, end), 0, end)

  const open = new Map<number, { start: number; velocity: number }[]>()
  const notes: HeardNote[] = []
  const close = (pitch: number, at: number, start: number, velocity: number) => {
    if (start >= length) notes.push({ pitch, velocity, start: start - length, duration: Math.max(0.01, at - start) })
  }
  const finish = (event: NoteEvent) => {
    if (event.kind === 'noteOn') {
      open.set(event.pitch, [...(open.get(event.pitch) ?? []), { start: event.beat, velocity: event.velocity }])
    } else if (event.kind === 'noteOff') {
      const note = open.get(event.pitch)?.shift()
      if (note) close(event.pitch, event.beat, note.start, note.velocity)
    } else {
      for (const [pitch, started] of open) for (const note of started) close(pitch, event.beat, note.start, note.velocity)
      open.clear()
    }
  }
  for (const event of events) finish(event)
  for (const [pitch, started] of open) for (const note of started) close(pitch, end, note.start, note.velocity)

  return notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch)
}
