import { type ControlOwner, controlOwnerId } from '../control'
import { type AssetPayload, type SnapshotScope, assetSignature, captureAsset } from '../preset'
import type { Project } from '../project'
import { LINK_LIMITS, type LibraryLink, type LibraryOrigin } from './types'

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
