import type { Raw } from './raw'

export interface Entry {
  readonly raw: Raw
  readonly id: string
}

/**
 * Builds modules that may use each other in an order where each is built after the ones it uses, whatever order
 * the file lists them in. `usedBy(raw)` gives the module ids a raw module refers to; ids that are not in the file
 * at all do not block (their uses are dropped when the module is read). Whatever can never be built (it contains
 * itself, directly or not) is left out and counted in `onCycle`. The result keeps the file's order.
 */
export const buildInDependencyOrder = <T extends { readonly id: string }>(
  entries: readonly Entry[],
  usedBy: (raw: Raw) => string[],
  build: (entry: Entry, built: readonly T[]) => T,
  onCycle: (count: number) => void,
): T[] => {
  const built = new Map<string, { value: T; index: number }>()
  let pending = entries.map((entry, index) => ({ entry, index }))
  while (pending.length > 0) {
    const pendingIds = new Set(pending.map(({ entry }) => entry.id))
    const ready = pending.filter(({ entry }) => usedBy(entry.raw).every((id) => built.has(id) || !pendingIds.has(id)))
    if (ready.length === 0) {
      onCycle(pending.length)
      break
    }
    for (const { entry, index } of ready) {
      built.set(entry.id, { value: build(entry, [...built.values()].map((item) => item.value)), index })
    }
    pending = pending.filter(({ entry }) => !built.has(entry.id))
  }
  return [...built.values()].sort((a, b) => a.index - b.index).map((item) => item.value)
}
