import { createDemoProject, createEmptyProject, serializeProject } from '@core'
import { describe, expect, it } from 'vitest'
import { type KeyValueStore, createMemoryStore } from './key-value-store'
import { ProjectStorage } from './project-storage'

describe('ProjectStorage', () => {
  it('preserves the exact old envelope once before rewriting it as the current version', () => {
    const store = createMemoryStore()
    const old = JSON.stringify({ ...JSON.parse(serializeProject(createDemoProject())), version: 8 }, null, 2)
    store.setItem('sfxlab:project', old)
    const storage = new ProjectStorage(store)
    expect(storage.loadCurrent().status).toBe('loaded')
    expect(storage.saveCurrent(createEmptyProject())).toEqual({ ok: true })
    expect(store.getItem('sfxlab:pre-signature-v9')).toBe(old)
    expect(JSON.parse(store.getItem('sfxlab:project')!).version).toBe(13)
    storage.saveCurrent(createDemoProject())
    storage.saveBackup(createEmptyProject())
    expect(store.getItem('sfxlab:pre-signature-v9')).toBe(old)
  })

  it('leaves the old current project untouched if its migration backup cannot be saved', () => {
    const store = createMemoryStore()
    const old = JSON.stringify({ ...JSON.parse(serializeProject(createDemoProject())), version: 8 })
    store.setItem('sfxlab:project', old)
    const storage = new ProjectStorage({ ...store, setItem: (key, value) => {
      if (key === 'sfxlab:pre-signature-v9') throw new Error('QuotaExceededError')
      store.setItem(key, value)
    } })
    expect(storage.saveCurrent(createEmptyProject())).toEqual({ ok: false, error: 'QuotaExceededError' })
    expect(store.getItem('sfxlab:project')).toBe(old)
  })

  it('reports empty storage', () => {
    expect(new ProjectStorage(createMemoryStore()).loadCurrent()).toEqual({ status: 'empty' })
  })

  it('saves and reloads the current project', () => {
    const storage = new ProjectStorage(createMemoryStore())
    const project = createDemoProject()

    expect(storage.saveCurrent(project)).toEqual({ ok: true })
    expect(storage.loadCurrent()).toEqual({ status: 'loaded', project, warnings: [] })
  })

  it('keeps the backup separate from the current project', () => {
    const storage = new ProjectStorage(createMemoryStore())
    const backup = createDemoProject()
    expect(storage.hasBackup()).toBe(false)

    storage.saveBackup(backup)
    storage.saveCurrent(createEmptyProject())

    expect(storage.hasBackup()).toBe(true)
    expect(storage.loadBackup()).toMatchObject({ status: 'loaded', project: backup })
  })

  it('quarantines unreadable data instead of losing it', () => {
    const store = createMemoryStore()
    store.setItem('sfxlab:project', '{"format":"sfx-lab-project","version":99}')
    const storage = new ProjectStorage(store)

    expect(storage.loadCurrent()).toMatchObject({ status: 'corrupt' })
    expect(store.getItem('sfxlab:corrupt')).toContain('"version":99')
    expect(storage.loadCurrent()).toEqual({ status: 'empty' })
  })

  it('reports a failed write (e.g. quota exceeded) instead of throwing', () => {
    const full: KeyValueStore = {
      ...createMemoryStore(),
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(new ProjectStorage(full).saveCurrent(createDemoProject())).toEqual({
      ok: false,
      error: 'QuotaExceededError',
    })
  })

  it('remembers that a browser has been welcomed, and never throws about it', () => {
    const store = createMemoryStore()
    expect(new ProjectStorage(store).hasWelcomed()).toBe(false)
    new ProjectStorage(store).markWelcomed()
    expect(new ProjectStorage(store).hasWelcomed()).toBe(true)

    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    }
    expect(() => new ProjectStorage(broken).markWelcomed()).not.toThrow()
    expect(new ProjectStorage(broken).hasWelcomed()).toBe(false)
  })

  it('loads what serializeProject wrote', () => {
    const store = createMemoryStore()
    store.setItem('sfxlab:project', serializeProject(createEmptyProject(), 2))
    expect(new ProjectStorage(store).loadCurrent().status).toBe('loaded')
  })
})
