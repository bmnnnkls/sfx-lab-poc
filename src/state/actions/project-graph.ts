import { type ControlOwner, type LibraryCatalog, type LibraryItem, type Project, type SnapshotScope, captureLibraryAsset, controlGraph, emptyLibrary } from '@core'
import { openPinnedEditor } from '../navigation'
import { previewLibraryItem } from './library'
import { libraryNameOf, routingRefusal, saveToLibrary } from './library-save'
import { project } from './lookup'
import { GRAPH_TITLES } from './pin'
import type { Action, SubjectOf } from './types'

type GraphSubject = SubjectOf<'project-graph'>

/**
 * The ID a graph of the project gets as a throwaway library item: `project:track:<id>:patch`, `project:master:fx`. A
 * copy's library origin names it, informational only; a preview's ■ is shown for it.
 */
export const projectGraphItemId = (owner: ControlOwner, domain: GraphSubject['domain']): string =>
  `project:${owner.kind === 'track' ? `track:${owner.trackId}` : owner.kind === 'group' ? `group:${owner.groupId}` : 'master'}:${domain}`

/**
 * A graph of `value` captured into a throwaway catalog holding only it and its compatible presets, as a library save
 * would capture it, so it can be inserted or previewed as a library item is. Throws what the capture refuses.
 */
export const projectGraphItem = (value: Project, owner: ControlOwner, domain: GraphSubject['domain'], name: string): { readonly catalog: LibraryCatalog; readonly item: LibraryItem } => {
  const captured = captureLibraryAsset(emptyLibrary(), value, { owner, domain }, name, null)
  const sound = captured.items.find((candidate) => candidate.content.kind !== 'preset')!
  const id = projectGraphItemId(owner, domain)
  const items = captured.items.map((candidate): LibraryItem =>
    candidate.id === sound.id ? { ...candidate, id } : candidate.content.kind === 'preset' && candidate.content.assetId === sound.id ? { ...candidate, content: { ...candidate.content, assetId: id } } : candidate,
  )
  return { catalog: { ...captured, items }, item: items.find((candidate) => candidate.id === id)! }
}

const scopeOf = ({ owner, domain }: GraphSubject): SnapshotScope => ({ owner, domain })
const exists = (subject: GraphSubject) => !!controlGraph(project(), subject.owner, subject.domain)
const refusal = (subject: GraphSubject) => routingRefusal(scopeOf(subject))
const isInstrument = (subject: GraphSubject) => subject.domain === 'patch' && subject.owner.kind === 'track'

/** The name a graph's capture gets: *Bass*, *Bass effects*, *Master effects*, as a save names it. */
const nameOf = (subject: GraphSubject) => libraryNameOf({ kind: 'asset', scope: scopeOf(subject) })

/** What *Copy to new track* makes: "Bass copy". */
export const copyName = (subject: GraphSubject): string => `${nameOf(subject)} copy`

/**
 * A graph of an owner in *This project*: its instrument (with its note effects), effects or note effects. It saves,
 * copies and previews as a library item does, from a throwaway capture; a graph that reads another track refuses
 * those three and says why.
 */
export const projectGraphActions: readonly Action<GraphSubject>[] = [
  {
    id: 'project-graph.preview',
    title: 'Preview',
    group: 'open',
    applies: exists,
    enabled: (subject) => !refusal(subject),
    tooltip: (subject) => refusal(subject),
    run: (subject, context) => {
      const { catalog, item } = projectGraphItem(project(), subject.owner, subject.domain, nameOf(subject))
      return previewLibraryItem(item, context, catalog)
    },
  },
  {
    id: 'project-graph.show',
    title: 'Show',
    group: 'open',
    tooltip: (subject) => `Select it and open its ${GRAPH_TITLES[subject.domain]} view`,
    applies: exists,
    run: ({ owner, domain }) => openPinnedEditor({ owner, graph: domain }),
  },
  {
    id: 'project-graph.save-to-library',
    title: 'Save to library',
    group: 'edit',
    applies: exists,
    enabled: (subject) => !refusal(subject),
    tooltip: (subject) => refusal(subject) ?? (isInstrument(subject) ? 'Saves the instrument with its note effects and presets' : undefined),
    run: (subject, context) => saveToLibrary({ kind: 'asset', scope: scopeOf(subject) }, context),
  },
  {
    id: 'project-graph.copy-to-new-track',
    title: 'Copy to new track',
    group: 'edit',
    applies: (subject) => exists(subject) && isInstrument(subject),
    enabled: (subject) => !refusal(subject),
    tooltip: (subject) => refusal(subject) ?? `A new track, "${copyName(subject)}", with this instrument, its note effects and presets`,
    // One undo step; the copy is independent of the original, as a library insert is.
    run: (subject, { library }) => {
      const { catalog, item } = projectGraphItem(project(), subject.owner, subject.domain, copyName(subject))
      return library.insert(item, { mode: 'new-track' }, undefined, undefined, catalog)
    },
  },
]
