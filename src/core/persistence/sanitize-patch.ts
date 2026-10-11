import type { ParamSpec } from '../dsp'
import {
  MODULE_NODE_TYPE,
  type ModuleLibrary,
  type Patch,
  type PortRef,
  addNode,
  connect,
  describeNode,
} from '../patch'
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
export const sanitizePatch = (
  raw: unknown,
  where: string,
  sampleIds: ReadonlySet<string>,
  modules: ModuleLibrary,
  warn: Warn,
): Patch => {
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
    const type = typeof rawNode.type === 'string' ? rawNode.type : ''
    const moduleId = type === MODULE_NODE_TYPE && typeof rawNode.moduleId === 'string' ? rawNode.moduleId : undefined
    const definition = describeNode({ id: rawNode.id, type, x: 0, y: 0, params: {}, moduleId }, modules)
    if (!definition) {
      warn(
        type === MODULE_NODE_TYPE
          ? `${where}: skipped a use of a module that is not in the project`
          : `${where}: skipped unknown node type "${type}"`,
      )
      continue
    }
    nodeIds.add(rawNode.id)

    let sampleId: string | undefined
    if (definition.usesSample === true && typeof rawNode.sampleId === 'string') {
      if (sampleIds.has(rawNode.sampleId)) sampleId = rawNode.sampleId
      else warn(`${where}: a ${definition.label} pointed at a sample that is not in the project`)
    }

    patch = addNode(patch, {
      id: rawNode.id,
      type,
      ...(moduleId === undefined ? {} : { moduleId }),
      x: finiteNumber(rawNode.x, 0),
      y: finiteNumber(rawNode.y, 0),
      params: sanitizeParams(definition.params, rawNode.params),
      ...(sampleId === undefined ? {} : { sampleId }),
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

    const next = from && to ? connect(patch, from, to, { id, modules }) : patch
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
