import { createEmptyProject } from '@core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAutosaver } from './autosaver'

describe('createAutosaver', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const setup = (ok = true) => {
    const save = vi.fn(() => (ok ? { ok: true as const } : { ok: false as const, error: 'full' }))
    const onStatus = vi.fn()
    return { save, onStatus, autosaver: createAutosaver({ save, onStatus, delayMs: 500 }) }
  }

  it('coalesces a burst of edits into one save of the latest project', () => {
    const { save, onStatus, autosaver } = setup()
    const first = createEmptyProject()
    const last = { ...first, tempo: 99 }

    autosaver.schedule(first)
    vi.advanceTimersByTime(300)
    autosaver.schedule(last)
    vi.advanceTimersByTime(499)
    expect(save).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save).toHaveBeenCalledWith(last)
    expect(onStatus).toHaveBeenLastCalledWith('saved')
  })

  it('flushes immediately and does not save twice', () => {
    const { save, autosaver } = setup()
    autosaver.schedule(createEmptyProject())
    autosaver.flush()
    vi.advanceTimersByTime(1000)

    expect(save).toHaveBeenCalledTimes(1)
  })

  it('reports save failures', () => {
    const { onStatus, autosaver } = setup(false)
    autosaver.schedule(createEmptyProject())
    autosaver.flush()

    expect(onStatus).toHaveBeenLastCalledWith('error', 'full')
  })

  it('does nothing when there is nothing pending', () => {
    const { save, autosaver } = setup()
    autosaver.flush()
    expect(save).not.toHaveBeenCalled()
  })
})
