import { type History, type Project, type SampleInfo, bytesKeyOf } from '@core'
import type { SampleEditLog, SampleStorage } from '@storage'
import { EDIT_CLEANUP_AGE_MS, EDIT_CLEANUP_DELAY_MS, EDIT_CLEANUP_ENABLED } from './sample-budgets'

/** Where cleanup looks for what still names a file. */
export interface SampleCleanupSources {
  readonly samples: SampleStorage
  readonly edits: SampleEditLog
  /** The raw text of every project slot in this browser. */
  slots(): readonly string[]
  /** The samples of the personal library's catalog. */
  catalog(): Promise<readonly SampleInfo[]>
  /** This tab's undo history: the user may have edited before cleanup ran. */
  history(): History<Project>
  now(): number
  /** `EDIT_CLEANUP_ENABLED` and `EDIT_CLEANUP_AGE_MS` by default. */
  readonly enabled?: boolean
  readonly age?: number
}

const historyKeys = (history: History<Project>): Set<string> => {
  const keys = new Set<string>()
  for (const entry of [...history.past, history.present, ...history.future]) for (const sample of entry.samples) keys.add(bytesKeyOf(sample))
  return keys
}

/**
 * Deletes the files edits wrote that nothing has reached for `age`: for each noted id older than that, its bytes and its
 * note go, unless a project slot's text (even an unreadable one), the library catalog or this tab's history names it.
 * Imported files are never noted, so never deleted. Only with persistent storage. Returns the ids it deleted.
 */
export const cleanUpSampleEdits = async (sources: SampleCleanupSources): Promise<string[]> => {
  if (!(sources.enabled ?? EDIT_CLEANUP_ENABLED) || !sources.samples.persistent || !sources.edits.persistent) return []
  const cutoff = sources.now() - (sources.age ?? EDIT_CLEANUP_AGE_MS)
  const old = (await sources.edits.list()).filter((note) => note.at <= cutoff)
  if (old.length === 0) return []
  const slots = sources.slots()
  const catalog = new Set((await sources.catalog()).map(bytesKeyOf))
  const history = historyKeys(sources.history())
  const deleted: string[] = []
  for (const { id } of old) {
    if (catalog.has(id) || history.has(id) || slots.some((text) => text.includes(id))) continue
    await sources.samples.delete(id)
    await sources.edits.forget(id)
    deleted.push(id)
  }
  return deleted
}

type IdleScheduler = (run: () => void) => () => void

/**
 * `EDIT_CLEANUP_DELAY_MS` after startup, then when the browser is idle (`requestIdleCallback`, where there is one). The
 * delay keeps the start, and its own use of the database, free of it.
 */
const whenIdle: IdleScheduler = (run) => {
  let cancelIdle = () => {}
  const timer = setTimeout(() => {
    if (typeof requestIdleCallback !== 'function') return run()
    const handle = requestIdleCallback(run, { timeout: EDIT_CLEANUP_DELAY_MS })
    cancelIdle = () => cancelIdleCallback(handle)
  }, EDIT_CLEANUP_DELAY_MS)
  return () => {
    clearTimeout(timer)
    cancelIdle()
  }
}

/** Runs the cleanup once, a while after startup when the browser is idle. Returns a cancel. Failures are left for next time. */
export const scheduleSampleCleanup = (sources: SampleCleanupSources, schedule: IdleScheduler = whenIdle): (() => void) =>
  schedule(() => {
    void cleanUpSampleEdits(sources).catch(() => {})
  })
