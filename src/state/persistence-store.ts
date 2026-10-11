import { create } from 'zustand'

export type SaveState = 'saved' | 'unsaved' | 'error' | 'memory-only'
export type NoticeKind = 'info' | 'warning' | 'error'

export interface Notice {
  readonly id: number
  readonly kind: NoticeKind
  readonly message: string
  /** Extra lines, e.g. each thing an import had to repair. */
  readonly details: readonly string[]
}

interface PersistenceState {
  readonly saveState: SaveState
  readonly saveError: string | null
  readonly hasBackup: boolean
  readonly notices: readonly Notice[]
  setSaveState(state: SaveState, error?: string): void
  setHasBackup(hasBackup: boolean): void
  notify(kind: NoticeKind, message: string, details?: readonly string[]): void
  dismiss(id: number): void
}

let nextNoticeId = 1

/** Whether work is safely stored, plus user-facing messages about loading and saving. */
export const usePersistenceStore = create<PersistenceState>((set) => ({
  saveState: 'saved',
  saveError: null,
  hasBackup: false,
  notices: [],
  setSaveState: (saveState, error) => set({ saveState, saveError: error ?? null }),
  setHasBackup: (hasBackup) => set({ hasBackup }),
  notify: (kind, message, details = []) =>
    set((state) => ({
      notices: [...state.notices, { id: nextNoticeId++, kind, message, details }],
    })),
  dismiss: (id) => set((state) => ({ notices: state.notices.filter((n) => n.id !== id) })),
}))
