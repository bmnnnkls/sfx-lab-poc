import { FACTORY_PREFIX, type LibraryCatalog, type LibraryItem, captureLibraryAsset, captureLibraryClip, emptyLibrary, saveLibraryFolder } from '../../library'
import type { SnapshotScope } from '../../preset'
import type { Project } from '../../project'
import { createGlassRain } from '../generative'
import { createLowLight } from '../tech-house'
import { plainNotes } from '../tracks'
import { FACTORY_CONTENT, type FactoryEntry, type FactorySourceProject } from './content'
import { createStarters } from './starters'

export { FACTORY_CONTENT, type FactoryEntry, type FactorySource, type FactorySourceProject } from './content'
export { STARTER_TRACKS, createStarters } from './starters'

/** A name as an id part: lower case, words joined by hyphens. */
export const slugOf = (name: string): string => name.toLocaleLowerCase('en').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item'

const pathOf = (folder: readonly string[]) => folder.map(slugOf).join('/')

/** The stable id a row of the table gets: `factory:effects/returns/hall-low-light`. */
export const factoryIdOf = (entry: Pick<FactoryEntry, 'folder' | 'name' | 'key'>): string => `${FACTORY_PREFIX}${pathOf(entry.folder)}/${entry.key ?? slugOf(entry.name)}`

/** Each item's line for the details, by its stable id. A side table: the catalog format has no description. */
export const factoryNotes: Readonly<Record<string, string>> = Object.fromEntries(FACTORY_CONTENT.map((entry) => [factoryIdOf(entry), entry.note]))

/**
 * Renames a catalog's folder, item, revision and preset-state ids to stable paths under `prefix`, and every reference to
 * them (`parentId`, `folderId`, `revisionId`, `assetId`): a folder is `prefix:drums`, an item `prefix:drums/kick` (or
 * the `keys` entry for its id in place of its name), a preset `prefix:drums/kick/bright`, a revision `prefix:rev/drums/kick`
 * and a preset state `prefix:state/drums/kick`. Throws on two items with one path, so a collision never passes silently.
 */
export const withStableIds = (catalog: LibraryCatalog, prefix: string, keys: ReadonlyMap<string, string> = new Map()): LibraryCatalog => {
  const root = `${prefix}:`
  const folderById = new Map(catalog.folders.map((folder) => [folder.id, folder]))
  const folderPath = (id: string | null, seen = new Set<string>()): string => {
    const folder = id === null ? undefined : folderById.get(id)
    if (!folder || seen.has(folder.id)) return ''
    const above = folderPath(folder.parentId, new Set([...seen, folder.id]))
    return above ? `${above}/${slugOf(folder.name)}` : slugOf(folder.name)
  }
  const unique = (ids: Map<string, string>, what: string) => {
    const values = [...ids.values()]
    if (new Set(values).size !== values.length) throw new Error(`Two ${what} share a stable id: ${values.find((value, index) => values.indexOf(value) !== index)}`)
  }
  const folders = new Map(catalog.folders.map((folder) => [folder.id, `${root}${folderPath(folder.id)}`]))
  unique(folders, 'folders')
  const itemPath = (item: LibraryItem): string => {
    const name = keys.get(item.id) ?? slugOf(item.name)
    if (item.content.kind === 'preset') {
      const assetId = item.content.assetId
      const sound = catalog.items.find((candidate) => candidate.id === assetId)
      if (sound && sound.content.kind !== 'preset') return `${itemPath(sound)}/${name}`
    }
    const above = folderPath(item.folderId)
    return above ? `${above}/${name}` : name
  }
  const paths = new Map(catalog.items.map((item) => [item.id, itemPath(item)]))
  const items = new Map([...paths].map(([id, path]) => [id, `${root}${path}`]))
  unique(items, 'items')
  // A revision is named after the first sound that holds it (a preset's when no sound does).
  const holders = [...catalog.items.filter((item) => item.content.kind !== 'preset'), ...catalog.items.filter((item) => item.content.kind === 'preset')]
  const revisions = new Map(catalog.revisions.map((revision, index) => {
    const holder = holders.find((item) => 'revisionId' in item.content && item.content.revisionId === revision.id)
    return [revision.id, `${root}rev/${holder ? paths.get(holder.id) : index}`]
  }))
  unique(revisions, 'revisions')
  const folderOf = (id: string | null) => (id === null ? null : (folders.get(id) ?? id))
  return {
    ...catalog,
    folders: catalog.folders.map((folder) => ({ ...folder, id: folders.get(folder.id)!, parentId: folderOf(folder.parentId) })),
    items: catalog.items.map((item): LibraryItem => {
      const content = item.content
      const renamed = { ...item, id: items.get(item.id)!, folderId: folderOf(item.folderId) }
      if (!('revisionId' in content)) return renamed
      const revisionId = revisions.get(content.revisionId) ?? content.revisionId
      const state = { ...content.state, id: `${root}state/${paths.get(item.id)}`, revisionId }
      return { ...renamed, content: content.kind === 'preset' ? { ...content, revisionId, assetId: items.get(content.assetId) ?? content.assetId, state } : { ...content, revisionId, state } }
    }),
    revisions: catalog.revisions.map((revision) => ({ ...revision, id: revisions.get(revision.id)! })),
  }
}

const SOURCES: Readonly<Record<FactorySourceProject, () => Project>> = { 'low-light': createLowLight, 'glass-rain': createGlassRain, starters: createStarters }

/**
 * The Factory catalog: each row of `FACTORY_CONTENT` captured from its example (or the starters) into a fresh catalog, then
 * given stable `factory:` ids. The same JSON on every build: the examples are deterministic, and the ids capture makes up
 * are all renamed.
 */
export const createFactoryCatalog = (): LibraryCatalog => {
  const projects = new Map<FactorySourceProject, Project>()
  const projectOf = (from: FactorySourceProject) => {
    if (!projects.has(from)) projects.set(from, SOURCES[from]())
    return projects.get(from)!
  }
  let catalog = emptyLibrary()
  const folders = new Map<string, string>()
  const folderFor = (path: readonly string[]): string => {
    let parent: string | null = null
    for (let depth = 1; depth <= path.length; depth++) {
      const id = `${FACTORY_PREFIX}${pathOf(path.slice(0, depth))}`
      if (!folders.has(id)) {
        catalog = saveLibraryFolder(catalog, path[depth - 1]!, parent, id)
        folders.set(id, id)
      }
      parent = id
    }
    return parent!
  }
  const keys = new Map<string, string>()
  for (const entry of FACTORY_CONTENT) {
    const folderId = folderFor(entry.folder)
    const before = new Set(catalog.items.map((item) => item.id))
    const source = entry.source
    let project = projectOf(source.from)
    if ('track' in source) {
      const track = project.tracks.find((candidate) => candidate.id === source.track)
      const clip = track && track.kind !== 'return' ? track.clips[source.scene] : undefined
      if (!clip) throw new Error(`Factory: no clip in ${source.from} ${source.track} scene ${source.scene + 1}`)
      catalog = captureLibraryClip(catalog, project, source.track, clip.id, entry.name, folderId)
    } else {
      if (source.plainNotes) project = { ...project, tracks: project.tracks.map((track) => (track.id === source.owner && track.kind === 'instrument' ? { ...track, noteGraph: plainNotes() } : track)) }
      const scope: SnapshotScope = { owner: source.owner === 'master' ? { kind: 'master' } : { kind: 'track', trackId: source.owner }, domain: source.domain }
      catalog = captureLibraryAsset(catalog, project, scope, entry.name, folderId)
    }
    const added = catalog.items.find((item) => !before.has(item.id) && item.content.kind !== 'preset')!
    if (entry.key) keys.set(added.id, entry.key)
  }
  return withStableIds(catalog, FACTORY_PREFIX.slice(0, -1), keys)
}
