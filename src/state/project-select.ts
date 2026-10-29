import type { Project } from '@core'
import { useRef, useSyncExternalStore } from 'react'
import { useProjectStore } from './project-store'

/**
 * A value worked out from the project, re-rendering only when `equal` says it changed: a component that reads a few
 * values out of the project doesn't re-render on every edit elsewhere. `select` may be a new function each render.
 */
export const useProjectSelect = <T>(select: (project: Project) => T, equal: (a: T, b: T) => boolean): T => {
  const cache = useRef<{ project: Project; select: (project: Project) => T; value: T } | null>(null)
  const snapshot = () => {
    const project = useProjectStore.getState().project
    const last = cache.current
    if (last && last.project === project && last.select === select) return last.value
    const next = select(project)
    const value = last && equal(last.value, next) ? last.value : next
    cache.current = { project, select, value }
    return value
  }
  return useSyncExternalStore(useProjectStore.subscribe, snapshot, snapshot)
}

/** For `useProjectSelect`: two lists with the same items in the same order. */
export const sameItems = <T>(a: readonly T[], b: readonly T[]): boolean => a.length === b.length && a.every((item, index) => Object.is(item, b[index]))
