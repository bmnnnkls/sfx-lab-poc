import { createDemoProject, createEmptyProject, serializeProject } from '@core'
import { describe, expect, it } from 'vitest'
import { type KeyValueStore, createMemoryStore } from './key-value-store'
import { projectFileName } from './project-file'
import { ProjectStorage } from './project-storage'

describe('ProjectStorage', () => {
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

  it('loads what serializeProject wrote', () => {
    const store = createMemoryStore()
    store.setItem('sfxlab:project', serializeProject(createEmptyProject(), 2))
    expect(new ProjectStorage(store).loadCurrent().status).toBe('loaded')
  })
})

describe('projectFileName', () => {
  it('slugifies the project name', () => {
    expect(projectFileName('My Cool Project!')).toBe('my-cool-project.sfxlab.json')
    expect(projectFileName('  ')).toBe('project.sfxlab.json')
  })
})
