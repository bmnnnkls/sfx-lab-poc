/**
 * Undo/redo over immutable snapshots. Because values are never mutated, a snapshot is
 * just a reference and unchanged parts are shared between entries, so keeping many is cheap.
 */
export interface History<T> {
  readonly past: readonly T[]
  readonly present: T
  readonly future: readonly T[]
  /** The most recent keyed edit, used to merge rapid edits of the same thing into one step. */
  readonly lastEdit: { readonly key: string; readonly at: number } | null
}

export interface CommitOptions {
  /** Edits sharing a key within `mergeWindowMs` of each other become a single undo step. */
  readonly key?: string
  /** Current time in ms; passed in so behaviour is deterministic in tests. */
  readonly now: number
  readonly mergeWindowMs?: number
  readonly limit?: number
}

export const DEFAULT_MERGE_WINDOW_MS = 800
export const DEFAULT_HISTORY_LIMIT = 200

export const createHistory = <T>(present: T): History<T> => ({
  past: [],
  present,
  future: [],
  lastEdit: null,
})

export const canUndo = <T>(history: History<T>): boolean => history.past.length > 0
export const canRedo = <T>(history: History<T>): boolean => history.future.length > 0

/** Records `next` as the new present. Any redo stack is discarded. */
export const commit = <T>(
  history: History<T>,
  next: T,
  {
    key,
    now,
    mergeWindowMs = DEFAULT_MERGE_WINDOW_MS,
    limit = DEFAULT_HISTORY_LIMIT,
  }: CommitOptions,
): History<T> => {
  if (Object.is(next, history.present)) return history

  const lastEdit = key === undefined ? null : { key, at: now }
  const merges =
    key !== undefined && history.lastEdit?.key === key && now - history.lastEdit.at <= mergeWindowMs

  if (merges) return { ...history, present: next, future: [], lastEdit }

  return {
    past: [...history.past, history.present].slice(-limit),
    present: next,
    future: [],
    lastEdit,
  }
}

export const undo = <T>(history: History<T>): History<T> => {
  const previous = history.past[history.past.length - 1]
  if (previous === undefined) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    lastEdit: null,
  }
}

export const redo = <T>(history: History<T>): History<T> => {
  const [next, ...rest] = history.future
  if (next === undefined) return history
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
    lastEdit: null,
  }
}
