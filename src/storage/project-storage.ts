import { type Project, parseProject, serializeProject } from '@core'
import type { KeyValueStore } from './key-value-store'

const KEYS = {
  current: 'sfxlab:project',
  backup: 'sfxlab:backup',
  corrupt: 'sfxlab:corrupt',
  welcomed: 'sfxlab:welcomed',
} as const

export type LoadOutcome =
  | { readonly status: 'empty' }
  | { readonly status: 'loaded'; readonly project: Project; readonly warnings: readonly string[] }
  | { readonly status: 'corrupt'; readonly error: string }

export type SaveResult = { readonly ok: true } | { readonly ok: false; readonly error: string }

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * Persists the current project and a one-slot backup (the project most recently replaced
 * by an import / new / restore). Unreadable data is quarantined, never silently overwritten.
 */
export class ProjectStorage {
  constructor(private readonly store: KeyValueStore) {}

  loadCurrent(): LoadOutcome {
    const outcome = this.read(KEYS.current)
    if (outcome.status === 'corrupt') this.quarantine()
    return outcome
  }

  saveCurrent(project: Project): SaveResult {
    return this.write(KEYS.current, project)
  }

  loadBackup(): LoadOutcome {
    return this.read(KEYS.backup)
  }

  saveBackup(project: Project): SaveResult {
    return this.write(KEYS.backup, project)
  }

  /** Whether this browser has already been welcomed (shown how to start the example it opens on), so the welcome comes once. */
  hasWelcomed(): boolean {
    try {
      return this.store.getItem(KEYS.welcomed) !== null
    } catch {
      return false
    }
  }

  markWelcomed(): void {
    try {
      this.store.setItem(KEYS.welcomed, '1')
    } catch {
      // Storage is full or refused: the welcome simply shows again next time.
    }
  }

  hasBackup(): boolean {
    try {
      return this.store.getItem(KEYS.backup) !== null
    } catch {
      return false
    }
  }

  private read(key: string): LoadOutcome {
    let text: string | null
    try {
      text = this.store.getItem(key)
    } catch (error) {
      return { status: 'corrupt', error: describe(error) }
    }
    if (text === null) return { status: 'empty' }

    const result = parseProject(text)
    return result.ok
      ? { status: 'loaded', project: result.project, warnings: result.warnings }
      : { status: 'corrupt', error: result.error }
  }

  private write(key: string, project: Project): SaveResult {
    try {
      this.store.setItem(key, serializeProject(project))
      return { ok: true }
    } catch (error) {
      return { ok: false, error: describe(error) }
    }
  }

  /** Keep the unreadable text so the user (or we) can recover it later. */
  private quarantine(): void {
    try {
      const text = this.store.getItem(KEYS.current)
      if (text !== null) this.store.setItem(KEYS.corrupt, text)
      this.store.removeItem(KEYS.current)
    } catch {
      // Nothing more we can do; the caller falls back to a fresh project.
    }
  }
}
