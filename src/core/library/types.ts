import type { AssetRevision, ProjectPreset } from '../preset'
import type { AudioClip, Clip } from '../project'
import type { SampleInfo } from '../sample'
import type { ControlTarget } from '../control'
import type { AutomationLane } from '../automation'

export interface LibraryFolder { readonly id: string; readonly name: string; readonly parentId: string | null; readonly trashed?: boolean }
export interface PortableLane extends Omit<AutomationLane, 'target'> {
  readonly graphSignature?: string
  readonly nodeIndex?: number
  readonly target: Omit<Extract<ControlTarget, { kind: 'graph' }>, 'owner'> | Omit<Extract<ControlTarget, { kind: 'mixer' }>, 'owner'>
}
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
/** Informational origin only. The project never consults the library to play or reload. */
export interface LibraryOrigin { readonly itemId: string; readonly revisionId?: string; readonly trackId?: string; readonly domain?: 'patch' | 'notes' | 'fx'; readonly clipId?: string }
