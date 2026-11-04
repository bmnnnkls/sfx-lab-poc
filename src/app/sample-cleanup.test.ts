import { type History, type Project, type SampleInfo, createEmptyProject, createHistory } from '@core'
import { createMemorySampleEditLog, createMemorySampleStorage } from '@storage'
import { describe, expect, it } from 'vitest'
import { EDIT_CLEANUP_AGE_MS } from './sample-budgets'
import { cleanUpSampleEdits, scheduleSampleCleanup } from './sample-cleanup'

const NOW = 10 * EDIT_CLEANUP_AGE_MS
const OLD = NOW - EDIT_CLEANUP_AGE_MS - 1
const id = (letter: string) => letter.repeat(64)
const info = (letter: string): SampleInfo => ({ id: id(letter), name: letter, extension: 'wav', durationSeconds: 1, sampleRate: 48000, channels: 1, bytes: 1 })

/** Persistent storage and an edit log in memory, with a file for each letter and the given notes. */
const setup = (notes: Record<string, number>, persistent = true) => {
  const files = new Map([...'abcdefgh'].map((letter) => [id(letter), Uint8Array.of(1)]))
  const samples = { ...createMemorySampleStorage(files), persistent }
  const edits = { ...createMemorySampleEditLog(new Map(Object.entries(notes).map(([letter, at]) => [id(letter), at]))), persistent }
  return { files, samples, edits }
}

const historyNaming = (letter: string): History<Project> => {
  const history = createHistory({ ...createEmptyProject(), samples: [] })
  return { ...history, past: [{ ...createEmptyProject(), samples: [info(letter)] }] }
}

describe('cleaning up the files edits wrote', () => {
  it('deletes old edit-made files nothing names, with their notes, and keeps everything else', async () => {
    const { files, samples, edits } = setup({ b: NOW - 1000, c: OLD, d: OLD, e: OLD, f: OLD, g: OLD })
    const slots = [
      JSON.stringify({ format: 'sfx-lab-project', version: 11, project: { samples: [info('c')] } }),
      // An unreadable slot still protects what its text names.
      `{"broken": "${id('d')}`,
    ]
    const deleted = await cleanUpSampleEdits({
      samples,
      edits,
      slots: () => slots,
      catalog: async () => [info('e')],
      history: () => historyNaming('f'),
      now: () => NOW,
    })
    expect(deleted).toEqual([id('g')])
    // a: imported (never noted); b: under a day old; c, d: named by a slot; e: the catalog; f: this tab's history.
    expect([...files.keys()].sort()).toEqual([...'abcdefh'].map(id))
    expect((await edits.list()).map((note) => note.id).sort()).toEqual([...'bcdef'].map(id))
  })

  it.each([
    { name: 'on memory storage', persistent: false, enabled: true },
    { name: 'when switched off', persistent: true, enabled: false },
  ])("doesn't run $name", async ({ persistent, enabled }) => {
    const { files, samples, edits } = setup({ g: OLD }, persistent)
    const deleted = await cleanUpSampleEdits({ samples, edits, slots: () => [], catalog: async () => [], history: () => historyNaming('a'), now: () => NOW, enabled })
    expect(deleted).toEqual([])
    expect(files.has(id('g'))).toBe(true)
  })

  it('runs once, when the scheduler says the browser is idle', async () => {
    const { files, samples, edits } = setup({ g: OLD })
    let run: (() => void) | undefined
    const cancel = scheduleSampleCleanup({ samples, edits, slots: () => [], catalog: async () => [], history: () => historyNaming('a'), now: () => NOW }, (task) => {
      run = task
      return () => {}
    })
    expect(files.has(id('g'))).toBe(true)
    run!()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(files.has(id('g'))).toBe(false)
    cancel()
  })
})
