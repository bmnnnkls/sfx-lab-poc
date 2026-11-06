import type { AssetRevision, ProjectPreset } from '../preset'
import type { AudioClip, Clip } from '../project'
import type { SampleInfo } from '../sample'
import type { ControlOwner, ControlTarget } from '../control'
import type { AutomationLane } from '../automation'

export interface LibraryFolder { readonly id: string; readonly name: string; readonly parentId: string | null; readonly trashed?: boolean }
export interface PortableLane extends Omit<AutomationLane, 'target'> {
  readonly graphSignature?: string
  readonly nodeIndex?: number
  readonly target: Omit<Extract<ControlTarget, { kind: 'graph' }>, 'owner'> | Omit<Extract<ControlTarget, { kind: 'mixer' }>, 'owner'> | PortableExpressionTarget
}
/** An expression lane's target without its owner: inserting the clip gives it the destination instrument track. */
export type PortableExpressionTarget =
  | { readonly kind: 'expression'; readonly control: 'pitchBend' | 'pressure' }
  | { readonly kind: 'expression'; readonly control: 'cc'; readonly cc: number }
export type LibraryContent =
  | { readonly kind: 'instrument' | 'audio-effect' | 'note-effect'; readonly revisionId: string; readonly state: ProjectPreset }
  | { readonly kind: 'preset'; readonly revisionId: string; readonly assetId: string; readonly state: ProjectPreset }
  | { readonly kind: 'midi-clip'; readonly clip: Omit<Clip, 'automation'>; readonly lanes: readonly PortableLane[] }
  | { readonly kind: 'audio-clip'; readonly clip: Omit<AudioClip, 'automation'>; readonly lanes: readonly PortableLane[] }
  | { readonly kind: 'sample'; readonly sampleId: string }
export type LibraryItem = { readonly id: string; readonly name: string; readonly folderId: string | null; readonly trashed?: boolean; readonly content: LibraryContent }
export const LIBRARY_CATALOG_VERSION = 2
export interface LibraryCatalog {
  readonly version: 2
  readonly folders: readonly LibraryFolder[]
  readonly items: readonly LibraryItem[]
  readonly revisions: readonly AssetRevision[]
  readonly samples: readonly SampleInfo[]
}
export const emptyLibrary = (): LibraryCatalog => ({ version: LIBRARY_CATALOG_VERSION, folders: [], items: [], revisions: [], samples: [] })
/**
 * How a library sound's IDs were mapped when it was inserted, so its library presets recall onto the copy and the
 * copy's presets save back. Targets name nodes and modules only (a leaf node's parameter), so ports and knobs need no
 * map of their own.
 */
export interface LibraryLink {
  /** A stable 64-bit hash (hex) of the inserted graph's assetSignature: the link is live while the owner's graph hashes the same. */
  readonly shape: string
  /** Library node id → project node id. */
  readonly nodes: readonly (readonly [string, string])[]
  /** Library module id → project module id. */
  readonly modules: readonly (readonly [string, string])[]
}
/** The bounds of links in a project file: per link, and every link's pairs together. */
export const LINK_LIMITS = { nodes: 2048, modules: 128, pairs: 16384 } as const
/**
 * Where something in the project came from in the library. The project never consults the library to play or reload;
 * a `link` only lets Sounds offer the library sound's presets. `owner` generalizes `trackId`, which is still written
 * for older readers.
 */
export interface LibraryOrigin {
  readonly itemId: string
  readonly revisionId?: string
  readonly trackId?: string
  readonly owner?: ControlOwner
  readonly domain?: 'patch' | 'notes' | 'fx'
  readonly clipId?: string
  readonly link?: LibraryLink
}
