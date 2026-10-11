import {
  type ModuleDefinition,
  type ModuleKnob,
  type ModuleLibrary,
  type ModulePort,
  type PortRef,
  exposedKnobId,
  exposedPortId,
  pruneModuleInterface,
} from '../patch'
import { LIMITS } from './format'
import { type Raw, type Warn, asList, isRecord, nonEmptyText } from './raw'
import { sanitizePatch } from './sanitize-patch'

const readRef = (raw: unknown): PortRef | null =>
  isRecord(raw) && typeof raw.node === 'string' && typeof raw.port === 'string' ? { node: raw.node, port: raw.port } : null

const readPorts = (raw: unknown): ModulePort[] =>
  asList(raw)
    .slice(0, LIMITS.portsPerModule)
    .flatMap((item) => {
      const inner = isRecord(item) ? readRef(item.inner) : null
      return inner && isRecord(item)
        ? [{ id: exposedPortId(inner), label: nonEmptyText(item.label, inner.port, 40), inner }]
        : []
    })

const readKnobs = (raw: unknown): ModuleKnob[] =>
  asList(raw)
    .slice(0, LIMITS.portsPerModule)
    .flatMap((item) =>
      isRecord(item) && typeof item.node === 'string' && typeof item.param === 'string'
        ? [{ id: exposedKnobId(item.node, item.param), label: nonEmptyText(item.label, item.param, 40), node: item.node, param: item.param }]
        : [],
    )

/** One module, built against the modules that are already known to be valid. Invalid ports and knobs are dropped. */
const sanitizeModule = (raw: Raw, id: string, sampleIds: ReadonlySet<string>, library: ModuleLibrary, warn: Warn): ModuleDefinition => {
  const name = nonEmptyText(raw.name, 'Module', 60)
  const where = `Module "${name}"`
  const definition: ModuleDefinition = {
    id,
    name,
    patch: sanitizePatch(raw.patch, where, sampleIds, library, warn),
    inputs: readPorts(raw.inputs),
    outputs: readPorts(raw.outputs),
    knobs: readKnobs(raw.knobs),
  }
  const pruned = pruneModuleInterface(definition, library)
  if (pruned !== definition) warn(`${where}: dropped ports or knobs that point at things that do not exist`)
  return pruned
}

const referencedModules = (raw: Raw): string[] =>
  asList(isRecord(raw.patch) ? raw.patch.nodes : []).flatMap((node) =>
    isRecord(node) && node.type === 'module' && typeof node.moduleId === 'string' ? [node.moduleId] : [],
  )

/**
 * The module library of a file. Modules can contain uses of other modules, so a module is only built once the
 * ones it uses are; a module that (directly or not) contains itself can never be built and is dropped.
 */
export const sanitizeModules = (raw: unknown, sampleIds: ReadonlySet<string>, warn: Warn): ModuleDefinition[] => {
  const rawList = asList(raw)
  if (rawList.length > LIMITS.modules) warn(`Only the first ${LIMITS.modules} modules were kept`)

  const seen = new Set<string>()
  const entries: { raw: Raw; id: string; index: number }[] = []
  for (const item of rawList.slice(0, LIMITS.modules)) {
    if (!isRecord(item) || typeof item.id !== 'string' || seen.has(item.id)) {
      warn('Skipped a malformed or duplicate module')
      continue
    }
    seen.add(item.id)
    entries.push({ raw: item, id: item.id, index: entries.length })
  }

  const built = new Map<string, { module: ModuleDefinition; index: number }>()
  let pending = entries
  while (pending.length > 0) {
    const pendingIds = new Set(pending.map((entry) => entry.id))
    // A reference to a module that is not in the file at all is fine: its uses are dropped when the patch is read.
    const ready = pending.filter((entry) => referencedModules(entry.raw).every((id) => built.has(id) || !pendingIds.has(id)))
    if (ready.length === 0) {
      warn(`Dropped ${pending.length} module(s) that contain themselves`)
      break
    }
    for (const entry of ready) {
      const library = [...built.values()].map((item) => item.module)
      built.set(entry.id, { module: sanitizeModule(entry.raw, entry.id, sampleIds, library, warn), index: entry.index })
    }
    pending = pending.filter((entry) => !built.has(entry.id))
  }
  return [...built.values()].sort((a, b) => a.index - b.index).map((item) => item.module)
}
