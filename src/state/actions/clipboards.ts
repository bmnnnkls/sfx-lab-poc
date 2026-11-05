import type { AudioClip, AutomationSlot, Clip, CopiedNodes, TrackGraph } from '@core'
import { createClipboard } from '../clipboard'
import type { SubjectOf } from './types'

/** A copied clip value and the kind of track it came from; no ids, so it still pastes after its track is gone. */
export interface CopiedClip {
  readonly clip: Clip | AudioClip
  readonly kind: 'instrument' | 'audio'
}

/** Session clips and arrangement regions share one clipboard: a region's content is a clip. */
export const clipClipboard = createClipboard<CopiedClip | null>(null)

/** A copied automation slot of the master or a return. */
export const automationSlotClipboard = createClipboard<AutomationSlot | null>(null)

/** Copied nodes and the wires between them, with the kind of graph they came from: an instrument, effects or notes. */
export interface CopiedGraphNodes {
  readonly graph: TrackGraph
  readonly copied: CopiedNodes
}

export const nodeClipboard = createClipboard<CopiedGraphNodes | null>(null)

/**
 * What the Library's ⌘C, ⌘X and Copy, Cut take, as they would be dragged: items and folders of My library or the
 * Factory, or one thing of *This project* (a graph, a session clip, a sample, a project preset).
 */
export type LibraryClipEntry = SubjectOf<'library-item' | 'library-folder' | 'project-graph' | 'clip' | 'sample' | 'sound'>

/**
 * Library things cut or copied, for *Paste here* on a folder or *My library*. Cut ones are My library's, move on paste
 * and show dimmed until then (Esc clears them); copied ones are copied in, and stay on the clipboard.
 */
export interface LibraryClip {
  readonly mode: 'cut' | 'copy'
  readonly entries: readonly LibraryClipEntry[]
}

/** The library's own clipboard, apart from the project's: cutting a folder doesn't replace a copied clip. */
export const libraryClipboard = createClipboard<LibraryClip | null>(null)

/** Puts things on the library clipboard as copied: ⌘C in the Library. */
export const copyToLibraryClipboard = (entries: readonly LibraryClipEntry[]): void => libraryClipboard.set({ mode: 'copy', entries })
