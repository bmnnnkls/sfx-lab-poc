import type { Note } from '@core'
import { useSyncExternalStore } from 'react'
import { noteClipboard } from './note-clipboard'

/** The copied notes, re-rendering the caller whenever something new is copied. */
export const useNoteClipboard = (): readonly Note[] =>
  useSyncExternalStore(noteClipboard.subscribe, noteClipboard.get)
