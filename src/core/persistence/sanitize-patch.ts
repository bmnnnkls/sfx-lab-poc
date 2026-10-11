import type { ParamSpec } from '../dsp'
import {
  MODULE_NODE_TYPE,
  type ModuleLibrary,
  type Patch,
  type PortRef,
  CONTROL_DISPLAYS,
  CONTROL_SIZES,
  type NodePanel,
  MAX_NODE_NAME,
  MAX_UNIT,
  addNode,
  connect,
  type NodeDomain,
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

/** Where a control node sits on the front panel: only what differs from the defaults is kept, and only well-formed values. */
const readPanel = (raw: unknown): NodePanel | undefined => {
  if (!isRecord(raw)) return undefined
  const size = CONTROL_SIZES.find((candidate) => candidate === raw.size)
  const order = typeof raw.order === 'number' && Number.isInteger(raw.order) && raw.order >= 0 && raw.order < 100000 ? raw.order : undefined
  const panel: NodePanel = {
    ...(raw.show === false ? { show: false as const } : {}),
    ...(size === undefined ? {} : { size }),
    ...(order === undefined ? {} : { order }),
  }
  return Object.keys(panel).length === 0 ? undefined : panel
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
  /** `any`: a module's inside, which takes the domain of the first node it holds. */
  domain: NodeDomain | 'any' = 'audio',
): Patch => {
  let active: NodeDomain | undefined = domain === 'any' ? undefined : domain
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
    // A patch holds sound nodes and a note graph holds note nodes. A module that is still empty fits either.
    const nodeDomain = definition && (type === MODULE_NODE_TYPE ? definition.domain : (definition.domain ?? 'audio'))
    const fits = definition && (active === undefined || nodeDomain === undefined || nodeDomain === active)
    if (!definition || !fits) {
      if (definition) {
        warn(`${where}: skipped a ${definition.label} node that does not belong with the others (sound and notes do not mix)`)
        continue
      }
      warn(
        type === MODULE_NODE_TYPE
          ? `${where}: skipped a use of a module that is not in the project`
          : `${where}: skipped unknown node type "${type}"`,
      )
      continue
    }
    nodeIds.add(rawNode.id)
    active ??= nodeDomain

    let sampleId: string | undefined
    if (definition.usesSample === true && typeof rawNode.sampleId === 'string') {
      if (sampleIds.has(rawNode.sampleId)) sampleId = rawNode.sampleId
      else warn(`${where}: a ${definition.label} pointed at a sample that is not in the project`)
    }

    const name = typeof rawNode.name === 'string' ? rawNode.name.trim().slice(0, MAX_NODE_NAME) : ''
    // The unit and display belong to controls with a value to show (not switches); anywhere else they would only be clutter.
    const unitOf = (value: unknown) => ((definition.panelKind === 'value' || definition.panelKind === 'xy') && typeof value === 'string' ? value.trim().slice(0, MAX_UNIT) : '')
    const unit = unitOf(rawNode.unit)
    const unitY = definition.panelKind === 'xy' ? unitOf(rawNode.unitY) : ''
    const panel = definition.panelKind === undefined ? undefined : readPanel(rawNode.panel)
    const display = definition.panelKind === 'value' ? CONTROL_DISPLAYS.find((candidate) => candidate === rawNode.display) : undefined
    patch = addNode(patch, {
      id: rawNode.id,
      type,
      ...(name === '' ? {} : { name }),
      ...(unit === '' ? {} : { unit }),
      ...(unitY === '' ? {} : { unitY }),
      ...(panel === undefined ? {} : { panel }),
      ...(display === undefined || display === 'knob' ? {} : { display }),
      ...(moduleId === undefined ? {} : { moduleId }),
      x: finiteNumber(rawNode.x, 0),
      y: finiteNumber(rawNode.y, 0),
      params: sanitizeParams(definition.params, rawNode.params),
      ...(sampleId === undefined ? {} : { sampleId }),
      ...(definition.usesTrack !== undefined && typeof rawNode.trackId === 'string' ? { trackId: rawNode.trackId } : {}),
      ...(definition.bypassable === true && rawNode.bypassed === true ? { bypassed: true } : {}),
      ...(definition.stereoCapable === true && rawNode.stereo === true ? { stereo: true } : {}),
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
