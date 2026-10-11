import { type ParamSpec, findNodeDefinition } from '../dsp'
import { type Patch, type PortRef, addNode, connect } from '../patch'
import { clamp } from '../shared'
import { LIMITS } from './format'
import { type Raw, type Warn, asList, finiteNumber, isRecord } from './raw'

const sanitizeParams = (specs: readonly ParamSpec[], raw: unknown): Record<string, number> => {
  const source = isRecord(raw) ? raw : {}
  return Object.fromEntries(
    specs.map((spec) => [
      spec.id,
      clamp(finiteNumber(source[spec.id], spec.default), spec.min, spec.max),
    ]),
  )
}

const readPortRef = (raw: unknown): PortRef | null =>
  isRecord(raw) && typeof raw.node === 'string' && typeof raw.port === 'string'
    ? { node: raw.node, port: raw.port }
    : null

/**
 * Rebuilds a patch from untrusted data using the normal edit operations, so every
 * invariant (known node types, valid ports, no cycles) is enforced by the same code
 * the editor uses. Anything that doesn't fit is dropped and reported.
 */
export const sanitizePatch = (raw: unknown, where: string, warn: Warn): Patch => {
  const source: Raw = isRecord(raw) ? raw : {}
  let patch: Patch = { nodes: [], connections: [] }

  const rawNodes = asList(source.nodes)
  if (rawNodes.length > LIMITS.nodesPerPatch) {
    warn(`${where}: only the first ${LIMITS.nodesPerPatch} nodes were kept`)
  }

  const nodeIds = new Set<string>()
  for (const rawNode of rawNodes.slice(0, LIMITS.nodesPerPatch)) {
    if (!isRecord(rawNode) || typeof rawNode.id !== 'string' || nodeIds.has(rawNode.id)) {
      warn(`${where}: skipped a malformed or duplicate node`)
      continue
    }
    const definition = typeof rawNode.type === 'string' ? findNodeDefinition(rawNode.type) : undefined
    if (!definition) {
      warn(`${where}: skipped unknown node type "${String(rawNode.type)}"`)
      continue
    }
    nodeIds.add(rawNode.id)
    patch = addNode(patch, {
      id: rawNode.id,
      type: definition.type,
      x: finiteNumber(rawNode.x, 0),
      y: finiteNumber(rawNode.y, 0),
      params: sanitizeParams(definition.params, rawNode.params),
    })
  }

  let dropped = 0
  const wireIds = new Set<string>()
  for (const rawConnection of asList(source.connections)) {
    const connection = isRecord(rawConnection) ? rawConnection : {}
    const from = readPortRef(connection.from)
    const to = readPortRef(connection.to)
    const id =
      typeof connection.id === 'string' && !wireIds.has(connection.id) ? connection.id : undefined

    const next = from && to ? connect(patch, from, to, id) : patch
    if (next === patch) {
      dropped++
    } else {
      patch = next
      wireIds.add(patch.connections[patch.connections.length - 1]?.id ?? '')
    }
  }
  if (dropped > 0) warn(`${where}: dropped ${dropped} invalid connection(s)`)

  return patch
}
