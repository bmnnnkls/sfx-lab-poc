import { type ControlOwner, type ControlTarget, controlOwnerId } from '../control'
import { type AssetPayload, type ProjectPreset, type SampleTarget, type SnapshotScope, assetSignature, captureAsset, recallPresetState } from '../preset'
import type { Project } from '../project'
import { createId } from '../shared'
import { saveLibraryItem } from './catalog'
import { LINK_LIMITS, type LibraryCatalog, type LibraryItem, type LibraryLink, type LibraryOrigin } from './types'

/**
 * A stable 64-bit hash of a string, as 16 hex digits: two 32-bit lanes mixed over its UTF-16 code units (cyrb53's
 * scheme, kept to 64 bits). Not cryptographic; a link only compares it with its own graph's.
 */
export const stableHash64 = (text: string): string => {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0')
}

/** A link's `shape`: the hash of a graph's structural signature. */
export const linkShape = (payload: AssetPayload): string => stableHash64(assetSignature(payload))

/** An origin with a link. */
export type LinkedOrigin = LibraryOrigin & { readonly link: LibraryLink }

/** The owner an origin is for: `owner`, or the track of an origin written before owners. */
export const originOwner = (origin: LibraryOrigin): ControlOwner | undefined =>
  origin.owner ?? (origin.trackId !== undefined ? { kind: 'track', trackId: origin.trackId } : undefined)

const sameOwner = (a: ControlOwner | undefined, b: ControlOwner) => !!a && a.kind === b.kind && controlOwnerId(a) === controlOwnerId(b)
const pairsOf = (link: LibraryLink | undefined) => (link ? link.nodes.length + link.modules.length : 0)

/** Whether `link` fits `LINK_LIMITS` beside the project's other links. */
const fits = (project: Project, link: LibraryLink) =>
  link.nodes.length <= LINK_LIMITS.nodes && link.modules.length <= LINK_LIMITS.modules &&
  (project.libraryOrigins ?? []).reduce((sum, origin) => sum + pairsOf(origin.link), 0) + pairsOf(link) <= LINK_LIMITS.pairs

/** The shape of `owner`'s `domain` graph now, or undefined when it can't be captured (external routing, no graph). */
export const currentShape = (project: Project, scope: SnapshotScope): string | undefined => {
  try {
    return linkShape(captureAsset(project, scope))
  } catch {
    return undefined
  }
}

/**
 * The library link of `owner`'s `domain` graph: the latest linked origin whose shape matches the graph now (`live`), or
 * else the latest linked origin (not `live`: the graph was rewired since); undefined when there is none.
 */
export const linkOf = (project: Project, owner: ControlOwner, domain: 'patch' | 'notes' | 'fx'): { readonly origin: LinkedOrigin; readonly live: boolean } | undefined => {
  const linked = (project.libraryOrigins ?? []).filter((origin): origin is LinkedOrigin => !!origin.link && origin.domain === domain && sameOwner(originOwner(origin), owner))
  if (linked.length === 0) return undefined
  const shape = currentShape(project, { owner, domain })
  const live = [...linked].reverse().find((origin) => origin.link.shape === shape)
  return live ? { origin: live, live: true } : { origin: linked.at(-1)!, live: false }
}

interface CopyMaps { readonly payload: AssetPayload; readonly nodes: ReadonlyMap<string, string>; readonly modules: ReadonlyMap<string, string> }

/**
 * The origin `insertLibraryAsset` records for a copy of `itemId` (library revision `revisionId`) onto `scope`, with the
 * link from the copy's maps. With `carry`, the item is a throwaway capture of that scope of `project`: the copy gets the
 * source's live link composed with its maps, or no link. A link past `LINK_LIMITS` is left out.
 */
export const insertedOrigin = (project: Project, itemId: string, revisionId: string, scope: SnapshotScope, copy: CopyMaps, carry?: SnapshotScope): LibraryOrigin => {
  const { owner } = scope, domain = scope.domain as 'patch' | 'notes' | 'fx'
  const where = { ...(owner.kind === 'track' && { trackId: owner.trackId }), owner, domain }
  const shape = linkShape(copy.payload)
  if (carry) {
    const source = carry.domain === 'track' ? undefined : linkOf(project, carry.owner, carry.domain)
    if (!source?.live) return { itemId, revisionId, ...where }
    const compose = (pairs: LibraryLink['nodes'], map: ReadonlyMap<string, string>) => pairs.flatMap(([library, from]) => (map.has(from) ? [[library, map.get(from)!] as const] : []))
    const link = { shape, nodes: compose(source.origin.link.nodes, copy.nodes), modules: compose(source.origin.link.modules, copy.modules) }
    return { itemId: source.origin.itemId, ...(source.origin.revisionId !== undefined && { revisionId: source.origin.revisionId }), ...where, ...(fits(project, link) && { link }) }
  }
  const link = { shape, nodes: [...copy.nodes], modules: [...copy.modules] }
  return { itemId, revisionId, ...where, ...(fits(project, link) && { link }) }
}

/**
 * A duplicate's links: the library link of each of `from`'s graphs (as `linkOf` finds it, live or not), copied onto
 * track `to`. `duplicateTrack` keeps node and module IDs, so the maps stay as they are. Left out past the origin or
 * link bounds.
 */
export const carryLibraryLinks = (project: Project, from: string, to: string): Project => {
  let origins = project.libraryOrigins ?? []
  for (const domain of ['patch', 'notes', 'fx'] as const) {
    const found = linkOf(project, { kind: 'track', trackId: from }, domain)
    if (!found || origins.length >= 4096 || !fits({ ...project, libraryOrigins: origins }, found.origin.link)) continue
    origins = [...origins, { ...found.origin, trackId: to, owner: { kind: 'track', trackId: to } }]
  }
  return origins === (project.libraryOrigins ?? []) ? project : { ...project, libraryOrigins: origins }
}

/** What a library sound offers a link: the sound, whether it is trashed, and its states that fit the link's graph. */
export interface LinkedSounds {
  /** The library sound the origin names (its sound, for an origin naming a preset); undefined when it is gone. */
  readonly sound: LibraryItem | undefined
  readonly trashed: boolean
  /** The sound itself and its live presets, those whose revision has the inserted revision's signature, sound first. */
  readonly states: readonly LibraryItem[]
}

/** The library sound an origin names, and its states that recall through the link. */
export const linkedSounds = (catalog: LibraryCatalog, origin: LibraryOrigin): LinkedSounds => {
  const named = catalog.items.find((item) => item.id === origin.itemId)
  const sound = named?.content.kind === 'preset' ? catalog.items.find((item) => item.id === (named.content as { assetId: string }).assetId) : named
  if (!sound) return { sound: undefined, trashed: false, states: [] }
  if (sound.trashed) return { sound, trashed: true, states: [] }
  const signature = catalog.revisions.find((revision) => revision.id === origin.revisionId)?.signature
  const fits = (item: LibraryItem) => 'revisionId' in item.content && catalog.revisions.find((revision) => revision.id === (item.content as { revisionId: string }).revisionId)?.signature === signature
  const presets = catalog.items.filter((item) => !item.trashed && item.content.kind === 'preset' && item.content.assetId === sound.id)
  return { sound, trashed: false, states: signature === undefined ? [] : [sound, ...presets].filter(fits) }
}

/** A target with its node and module IDs put through `nodes` and `modules`, onto `owner`. IDs not in the maps stay. */
const translate = <T extends ControlTarget | SampleTarget>(target: T, owner: ControlOwner, nodes: ReadonlyMap<string, string>, modules: ReadonlyMap<string, string>): T =>
  target.kind === 'graph'
    ? { ...target, owner, nodeId: nodes.get(target.nodeId) ?? target.nodeId, path: target.path.map((step) => ({ nodeId: nodes.get(step.nodeId) ?? step.nodeId, moduleId: modules.get(step.moduleId) ?? step.moduleId })) }
    : { ...target, owner }

/** The domains a state of `kind` spans: an instrument's include its notes. */
const domainsOf = (state: ProjectPreset) => (state.scope.domain === 'patch' ? ['patch', 'notes'] : [state.scope.domain])

/** Throws unless every value and sample choice of `state` is a graph control of its own scope. */
const checkOwnState = (state: ProjectPreset) => {
  const belongs = (target: ControlTarget | SampleTarget) => target.kind === 'graph' && domainsOf(state).includes(target.domain) && JSON.stringify(target.owner) === JSON.stringify(state.scope.owner)
  if (state.values.some((value) => !belongs(value.target)) || state.samples.some((binding) => !belongs(binding.target))) throw new Error('Preset contains controls outside its sound')
}

/**
 * A library state (a sound's own, or one of its presets) as a preset of the linked owner's current graph: its targets
 * put through the link's maps, forward. Recall it with `recallLinkedPreset`.
 */
export const presetFromLibrary = (origin: LinkedOrigin, state: ProjectPreset): ProjectPreset => {
  checkOwnState(state)
  const owner = originOwner(origin)
  if (!owner) throw new Error('The link has no owner')
  const nodes = new Map(origin.link.nodes), modules = new Map(origin.link.modules)
  return { ...state, scope: { ...state.scope, owner }, values: state.values.map((value) => ({ ...value, target: translate(value.target, owner, nodes, modules) })), samples: state.samples.map((binding) => ({ ...binding, target: translate(binding.target, owner, nodes, modules) })) }
}

/** Recalls `presetFromLibrary`'s preset onto its owner, while the owner's graph still has the link's shape. */
export const recallLinkedPreset = (project: Project, origin: LinkedOrigin, preset: ProjectPreset) =>
  recallPresetState(project, preset, preset.scope, (payload) => linkShape(payload) === origin.link.shape, 'This sound has changed since it came from the library')

/**
 * The link a project preset saves back through: the latest linked origin of its owner and domain whose shape is its
 * own revision's. A preset saved after a rewire has none, even while an older one of the same owner has.
 */
export const presetLink = (project: Project, preset: ProjectPreset): LinkedOrigin | undefined => {
  const revision = project.assetRevisions?.find((candidate) => candidate.id === preset.revisionId)
  if (!revision || preset.scope.domain === 'track') return undefined
  const shape = linkShape(revision.payload)
  return (project.libraryOrigins ?? []).filter((origin): origin is LinkedOrigin => !!origin.link && origin.link.shape === shape && origin.domain === preset.scope.domain && sameOwner(originOwner(origin), preset.scope.owner)).at(-1)
}

/**
 * Adds a project preset to the library sound it is linked to, as a new preset of that sound: its targets put through
 * the link's maps, backward, onto the sound's own owner and revision. Refuses when the sound is gone or trashed, or
 * the preset uses a sample the project has no metadata for.
 */
export const presetToLibrary = (project: Project, catalog: LibraryCatalog, origin: LinkedOrigin, preset: ProjectPreset): { readonly catalog: LibraryCatalog; readonly item: LibraryItem; readonly sound: LibraryItem } => {
  const { sound, trashed } = linkedSounds(catalog, origin)
  if (!sound || !('state' in sound.content) || origin.revisionId === undefined || !catalog.revisions.some((revision) => revision.id === origin.revisionId)) throw new Error('The library sound is gone')
  if (trashed) throw new Error('The library sound is in the trash')
  checkOwnState(preset)
  const owner = sound.content.state.scope.owner
  const nodes = new Map(origin.link.nodes.map(([library, copy]) => [copy, library])), modules = new Map(origin.link.modules.map(([library, copy]) => [copy, library]))
  const state: ProjectPreset = { ...preset, revisionId: origin.revisionId, scope: { ...preset.scope, owner }, values: preset.values.map((value) => ({ ...value, target: translate(value.target, owner, nodes, modules) })), samples: preset.samples.map((binding) => ({ ...binding, target: translate(binding.target, owner, nodes, modules) })) }
  const sampleIds = new Set(state.samples.flatMap((binding) => (binding.sampleId ? [binding.sampleId] : [])))
  const missing = [...sampleIds].filter((id) => !catalog.samples.some((known) => known.id === id) && !project.samples.some((known) => known.id === id))
  if (missing.length) throw new Error(`Missing sample metadata: ${missing.join(', ')}`)
  const item: LibraryItem = { id: createId('item'), name: preset.name, folderId: sound.folderId, content: { kind: 'preset', assetId: sound.id, revisionId: origin.revisionId, state } }
  const withSamples: LibraryCatalog = { ...catalog, samples: [...catalog.samples, ...project.samples.filter((known) => sampleIds.has(known.id) && !catalog.samples.some((each) => each.id === known.id))] }
  return { catalog: saveLibraryItem(withSamples, item), item, sound }
}
