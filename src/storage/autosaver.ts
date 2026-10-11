import type { Project } from '@core'
import type { SaveResult } from './project-storage'

export type SaveStatus = 'saved' | 'unsaved' | 'error'

export interface Autosaver {
  /** Remember the latest project and save it once edits have settled. */
  schedule(project: Project): void
  /** Save any pending project immediately (e.g. when the tab is being hidden). */
  flush(): void
  dispose(): void
}

interface AutosaverOptions {
  save(project: Project): SaveResult
  onStatus(status: SaveStatus, error?: string): void
  delayMs?: number
}

const DEFAULT_DELAY_MS = 500

/** Trailing-edge debounce: dragging a slider changes the project dozens of times a second. */
export const createAutosaver = ({
  save,
  onStatus,
  delayMs = DEFAULT_DELAY_MS,
}: AutosaverOptions): Autosaver => {
  let pending: Project | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const clearTimer = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  const flush = () => {
    clearTimer()
    if (!pending) return
    const project = pending
    pending = null
    const result = save(project)
    if (result.ok) onStatus('saved')
    else onStatus('error', result.error)
  }

  return {
    schedule(project) {
      pending = project
      onStatus('unsaved')
      clearTimer()
      timer = setTimeout(flush, delayMs)
    },
    flush,
    dispose: flush,
  }
}
