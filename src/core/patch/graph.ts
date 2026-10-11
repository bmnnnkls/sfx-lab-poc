import type { Patch } from './types'

/** Node ids in dependency order (sources first), or null when the patch has a cycle. */
export const topologicalOrder = (patch: Patch): string[] | null => {
  const incoming = new Map(patch.nodes.map((node) => [node.id, 0]))
  for (const { to } of patch.connections) {
    incoming.set(to.node, (incoming.get(to.node) ?? 0) + 1)
  }

  const ready = patch.nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id)
  const order: string[] = []

  while (ready.length > 0) {
    const id = ready.shift() as string
    order.push(id)
    for (const { from, to } of patch.connections) {
      if (from.node !== id) continue
      const remaining = (incoming.get(to.node) ?? 0) - 1
      incoming.set(to.node, remaining)
      if (remaining === 0) ready.push(to.node)
    }
  }

  return order.length === patch.nodes.length ? order : null
}

/** True when `target` can be reached from `start` by following connections downstream. */
export const isDownstream = (patch: Patch, start: string, target: string): boolean => {
  const visited = new Set<string>()
  const stack = [start]
  while (stack.length > 0) {
    const id = stack.pop() as string
    if (id === target) return true
    if (visited.has(id)) continue
    visited.add(id)
    for (const { from, to } of patch.connections) {
      if (from.node === id) stack.push(to.node)
    }
  }
  return false
}
