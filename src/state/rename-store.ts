import { create } from 'zustand'
import type { Subject } from './actions/types'
import type { ViewId } from './layout-store'

export interface Renaming {
  readonly subject: Subject
  /** The view that draws the name field: the one the menu was opened in. */
  readonly origin: ViewId
}

interface RenameState {
  readonly renaming: Renaming | null
  start(renaming: Renaming): void
  stop(): void
}

/** What is being renamed in place, if anything. Only the *Rename* actions start it; the name field stops it. */
export const useRenameStore = create<RenameState>((set) => ({
  renaming: null,
  start: (renaming) => set({ renaming }),
  stop: () => set({ renaming: null }),
}))

/** Two subjects are the same thing when their kinds and ids match. */
export const sameSubject = (a: Subject, b: Subject): boolean => JSON.stringify(a) === JSON.stringify(b)
