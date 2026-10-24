import { LIBRARY_CATALOG_VERSION, validateBundleObjectBudget, type LibraryCatalog } from '../library'
import { compareCodeUnits } from '../shared'
import { canonicalRecord } from './validate-library'
import { sanitizePresetFields } from './sanitize-presets'
import { isRecord } from './raw'

const fail = (): never => { throw new Error('Unsupported or malformed legacy library signature. Original data retained; open the previous app to recover/re-export the asset.') }
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256
const parse = (signature: unknown): unknown => {
  if (typeof signature !== 'string' || signature.length > 1024 * 1024) return fail()
  let value: unknown
  try { value = JSON.parse(signature) } catch { return fail() }
  validateBundleObjectBudget(value)
  return value
}
const tupleOrder = (a: unknown, b: unknown): number => compareCodeUnits(JSON.stringify(a), JSON.stringify(b))

/** Only legacy order-insensitive positions are reordered. Unknown fields remain for the exact comparison. */
const assetShape = (value: unknown): unknown => {
  if (!isRecord(value) || !Array.isArray(value.nodes) || !Array.isArray(value.connections)) return fail()
  const nodes = value.nodes
  if (nodes.some(n => !isRecord(n) || !text(n.id))) return fail()
  return { ...value, nodes: [...nodes].sort((a, b) => compareCodeUnits(a.id, b.id)), connections: [...value.connections].sort(tupleOrder) }
}
const legacyAssetIdentity = (signature: unknown): string => {
  const value = parse(signature)
  if (!Array.isArray(value) || value.length !== 3 || !Array.isArray(value[2])) return fail()
  const [kind, shape, modules] = value
  const normalized = kind === 'instrument'
    ? Array.isArray(shape) && shape.length === 3 ? [assetShape(shape[0]), assetShape(shape[1]), shape[2]] : fail()
    : assetShape(shape)
  const sortedModules = modules.map((m: unknown) => {
    if (!Array.isArray(m) || m.length !== 5 || !text(m[0]) || ![m[1], m[2], m[3]].every(Array.isArray)) return fail()
    // These lists were already sorted with the default UTF-16 tuple order in v1.
    return [m[0], [...m[1]].sort(), [...m[2]].sort(), [...m[3]].sort(), assetShape(m[4])]
  }).sort((a, b) => compareCodeUnits(a[0] as string, b[0] as string))
  return canonicalRecord([kind, normalized, sortedModules])
}

/** Portable signatures have no source graph. Validate the exact bounded shape, retaining node-index meaning. */
export const canonicalPortableSignature = (signature: unknown): string => {
  const value = parse(signature)
  if (!Array.isArray(value) || value.length !== 2) return fail()
  const [nodes, connections] = value
  if (!Array.isArray(nodes) || nodes.length > 10000 || !Array.isArray(connections) || connections.length > 100000) return fail()
  const normalized = nodes.map((node: unknown) => {
    if (!Array.isArray(node) || node.length !== 4 || !text(node[0]) || typeof node[1] !== 'boolean' || typeof node[2] !== 'boolean') return fail()
    const config = node[3]
    const configurable = ['control', 'xy', 'switch', 'selector'].includes(node[0])
    if (!configurable) { if (config !== null) return fail(); return node }
    if (!Array.isArray(config) || config.length > 256 || config.some(entry => !Array.isArray(entry) || entry.length !== 2 || !text(entry[0]) || typeof entry[1] !== 'number' || !Number.isFinite(entry[1]))) return fail()
    if (new Set(config.map(entry => entry[0])).size !== config.length) return fail()
    return [node[0], node[1], node[2], [...config].sort()]
  })
  for (const c of connections) {
    if (!Array.isArray(c) || c.length !== 4 || !Number.isInteger(c[0]) || c[0] < 0 || c[0] >= nodes.length || !text(c[1]) || !Number.isInteger(c[2]) || c[2] < 0 || c[2] >= nodes.length || !text(c[3])) return fail()
  }
  return JSON.stringify([normalized, [...connections].sort(tupleOrder)])
}

/** A preserving v1→v2 conversion, shared by local storage and strict bundle staging. Never publishes data. */
export const upgradeLibraryCatalog = (input: unknown): LibraryCatalog => {
  validateBundleObjectBudget(input)
  if (!isRecord(input) || ![1, LIBRARY_CATALOG_VERSION].includes(input.version as number)) throw new Error('Unsupported library version; update SFX Lab. Original data retained.')
  if (input.version === LIBRARY_CATALOG_VERSION) return input as unknown as LibraryCatalog
  if (!Array.isArray(input.revisions) || !Array.isArray(input.items) || !Array.isArray(input.samples) || !Array.isArray(input.folders)
    || input.revisions.length > 4096 || input.items.length > 4096 || input.samples.length > 4096 || input.folders.length > 1024) return fail()
  const ids = new Set<string>()
  for (const sample of input.samples) { if (!isRecord(sample) || !text(sample.id)) return fail(); ids.add(sample.id) }
  const revisions = input.revisions.map(entry => {
    if (!isRecord(entry)) return fail()
    const parsed = sanitizePresetFields({ assetRevisions: [entry] }, ids, fail).assetRevisions?.[0]
    if (!parsed || canonicalRecord(entry) !== canonicalRecord({ ...parsed, signature: entry.signature })
      || legacyAssetIdentity(entry.signature) !== canonicalRecord(JSON.parse(parsed.signature))) return fail()
    return parsed
  })
  const items = input.items.map(item => {
    if (!isRecord(item) || !isRecord(item.content)) return fail()
    const content = item.content
    if (content.kind !== 'midi-clip' && content.kind !== 'audio-clip') return item
    if (!Array.isArray(content.lanes) || content.lanes.length > 64) return fail()
    const lanes = content.lanes.map(lane => {
      if (!isRecord(lane) || !isRecord(lane.target)) return fail()
      if (lane.target.kind !== 'graph') return lane
      const graphSignature = canonicalPortableSignature(lane.graphSignature)
      const nodes = JSON.parse(graphSignature)[0] as unknown[][]
      if (!Number.isInteger(lane.nodeIndex) || (lane.nodeIndex as number) < 0 || (lane.nodeIndex as number) >= nodes.length || nodes[lane.nodeIndex as number]![0] !== lane.target.nodeType) return fail()
      return { ...lane, graphSignature }
    })
    return { ...item, content: { ...content, lanes } }
  })
  return { ...input, version: LIBRARY_CATALOG_VERSION, revisions, items } as unknown as LibraryCatalog
}
