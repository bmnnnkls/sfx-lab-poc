import { afterEach, describe, expect, it, vi } from 'vitest'

/** A fresh `theme.ts` over the given storage, as a page load reads it; `document` is a stand-in with only `<html>`'s dataset. */
const load = async (storage: Partial<Storage> | 'blocked') => {
  vi.resetModules()
  const html = { dataset: {} as Record<string, string> }
  vi.stubGlobal('document', { documentElement: html })
  vi.stubGlobal('localStorage', storage === 'blocked'
    ? { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
    : storage)
  return { theme: await import('./theme'), html }
}

const memoryStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial))
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the theme preference', () => {
  it('reads the saved theme, and Dark when there is none, it is invalid or storage is blocked', async () => {
    expect((await load(memoryStorage({ 'sfxlab:theme': 'light' }))).theme.getTheme()).toBe('light')
    expect((await load(memoryStorage())).theme.getTheme()).toBe('dark')
    expect((await load(memoryStorage({ 'sfxlab:theme': 'sepia' }))).theme.getTheme()).toBe('dark')
    expect((await load('blocked')).theme.getTheme()).toBe('dark')
  })

  it('saves a change, writes data-theme on <html> and tells its subscribers', async () => {
    const storage = memoryStorage()
    const { theme, html } = await load(storage)
    const listener = vi.fn()
    theme.subscribeTheme(listener)
    theme.setTheme('contrast')
    expect(storage.values.get('sfxlab:theme')).toBe('contrast')
    expect(html.dataset.theme).toBe('contrast')
    expect(listener).toHaveBeenCalledTimes(1)
    theme.setTheme('contrast')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('keeps a change for the page when storage is blocked', async () => {
    const { theme, html } = await load('blocked')
    theme.setTheme('light')
    expect(theme.getTheme()).toBe('light')
    expect(html.dataset.theme).toBe('light')
  })

  it('goes Dark, Light, High contrast and round again', async () => {
    const { theme } = await load(memoryStorage())
    expect([theme.nextTheme('dark'), theme.nextTheme('light'), theme.nextTheme('contrast')]).toEqual(['light', 'contrast', 'dark'])
  })
})

describe('the theme commands', () => {
  it('offer the three themes with the one in use checked, and switch to the chosen one or the next', async () => {
    const { theme } = await load(memoryStorage())
    const { commandById } = await import('../commands/registry')
    const context = {} as never
    const choose = commandById('view.theme')!
    expect(choose.choices!(context)).toEqual([
      { id: 'dark', title: 'Dark', checked: true },
      { id: 'light', title: 'Light', checked: false },
      { id: 'contrast', title: 'High contrast', checked: false },
    ])
    choose.run(context, 'contrast')
    expect(theme.getTheme()).toBe('contrast')
    choose.run(context, 'sepia')
    expect(theme.getTheme()).toBe('contrast')
    const next = commandById('view.theme.next')!
    expect(next.label!(context)).toBe('Next theme (Dark)')
    next.run(context)
    expect(theme.getTheme()).toBe('dark')
  })
})
