import { type ControlOwner, EFFECT_INPUTS, type LibraryCatalog, type LibraryItem, type Project, isFactoryId, libraryDependencies, linkOf, originOwner } from '@core'
import { type LibraryRowRef, type Subject, clipTrackFor, graphFitsOwner, insertionScope, libraryClipFitsSlot, subjectName, useLibraryStore, useProjectStore, useSelectionStore } from '@state'
import { PopupMenu, useActionContext, useActionEntries } from '../shared/menu'
import { type ProjectEntry, projectModel, projectNodeOf } from './library-tree'
import styles from './LibraryPanel.module.css'

/** What a kind is called in the details and the type filter. */
export const KIND_NAMES: Record<LibraryItem['content']['kind'], string> = {
  instrument: 'Instrument',
  'audio-effect': 'Audio effect',
  'note-effect': 'Note effect',
  preset: 'Preset',
  'midi-clip': 'MIDI clip',
  'audio-clip': 'Audio clip',
  sample: 'Sample',
}

const plural = (count: number, one: string, many = `${one}s`) => (count === 0 ? `no ${many}` : `${count} ${count === 1 ? one : many}`)
const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** The graph kind an item puts into a project: its own, or its sound's for a preset. */
const graphKind = (catalog: LibraryCatalog, item: LibraryItem) =>
  item.content.kind === 'preset' ? catalog.revisions.find((revision) => item.content.kind === 'preset' && revision.id === item.content.revisionId)?.payload.kind : item.content.kind

const ownerName = (owner: ControlOwner) => subjectName(owner.kind === 'track' ? { kind: 'track', trackId: owner.trackId } : owner.kind === 'group' ? { kind: 'group', groupId: owner.groupId } : { kind: 'master' })

/** Where effects were made to go, by the input their graph starts from, as a hint to select it. */
const EFFECT_HOMES: Readonly<Record<string, string>> = { trackIn: 'Select a track', returnIn: 'Select a return track', groupIn: 'Select a bus', masterIn: 'Select the master' }
const effectHome = (catalog: LibraryCatalog, item: LibraryItem): string => {
  const revisionId = 'revisionId' in item.content ? item.content.revisionId : undefined
  const payload = catalog.revisions.find((revision) => revision.id === revisionId)?.payload
  const input = payload?.kind === 'audio-effect' ? [payload.graph, ...payload.modules.map((module) => module.patch)].flatMap((graph) => graph.nodes).find((node) => EFFECT_INPUTS.includes(node.type))?.type : undefined
  return (input && EFFECT_HOMES[input]) ?? 'Select a track, bus or the master'
}

/** The details' main button for an item: the action it runs, its label, and why it can't run, if it can't. */
export interface Primary {
  readonly id: string
  readonly label: string
  readonly choice?: string
  readonly refusal?: string
  readonly tooltip?: string
}

/** What Enter on a row and the details' main button do with an item. */
export const primaryOf = (catalog: LibraryCatalog, item: LibraryItem): Primary => {
  if (item.trashed) return { id: 'library-item.restore', label: 'Restore', tooltip: 'Back where it was, with its presets' }
  const kind = graphKind(catalog, item)
  if (kind === 'instrument') return { id: 'library-item.insert-track', label: 'Add as new track', tooltip: 'A new instrument track with this sound and its presets. The project keeps its own copy.' }
  if (kind === 'audio-effect' || kind === 'note-effect') {
    const owner = insertionScope(item).owner, name = ownerName(owner)
    const label = `Replace ${kind === 'audio-effect' ? 'effects' : 'notes'} on ${name}`
    const refusal = graphFitsOwner(item, owner) ? undefined : kind === 'note-effect' ? 'Select an instrument track' : effectHome(catalog, item)
    return { id: 'library-item.replace', label, refusal, tooltip: `Replaces only ${name}'s ${kind === 'audio-effect' ? 'effects' : 'note effects'}. Its automation and mappings stay, and may become unavailable.` }
  }
  if (item.content.kind === 'midi-clip' || item.content.kind === 'audio-clip') {
    const track = clipTrackFor(item)
    const scene = track && track.kind !== 'return' ? track.clips.findIndex((_, index) => libraryClipFitsSlot(item, track.id, index)) : -1
    if (!track) return { id: 'library-item.insert-into', label: 'Insert into a scene', refusal: item.content.kind === 'midi-clip' ? 'There is no instrument track' : 'There is no audio track' }
    if (scene < 0) return { id: 'library-item.insert-into', label: `Insert into ${track.name}`, refusal: 'No empty slot' }
    return { id: 'library-item.insert-into', label: `Insert into scene ${scene + 1} of ${track.name}`, choice: String(scene), tooltip: 'A copy goes into the first empty slot of the selected track of its kind' }
  }
  return { id: 'library-item.replace', label: 'Add to project', tooltip: 'Adds the sample to the project, for samplers and audio clips' }
}

/** One line of what an item holds. */
const factsOf = (catalog: LibraryCatalog, item: LibraryItem): string => {
  const content = item.content
  const dependencies = libraryDependencies(catalog, item)
  const samples = plural(dependencies.sampleIds.length, 'sample')
  switch (content.kind) {
    case 'preset': {
      const sound = catalog.items.find((candidate) => candidate.id === content.assetId && !!candidate.trashed === !!item.trashed)
      return [sound ? `Preset of ${sound.name}` : 'Preset · sound unavailable', samples].join(' · ')
    }
    case 'midi-clip':
      return `${plural(content.clip.lengthBeats / 4, 'bar')} · ${plural(content.clip.notes.length, 'note')}`
    case 'audio-clip':
      return `${plural(content.clip.lengthBeats / 4, 'bar')} · ${catalog.samples.find((sample) => sample.id === content.clip.sampleId)?.name ?? 'sample missing'}`
    case 'sample': {
      const sample = catalog.samples.find((candidate) => candidate.id === content.sampleId)
      return sample ? `${sample.durationSeconds.toFixed(2)} s · ${sample.sampleRate} Hz · ${megabytes(sample.bytes)}` : 'Sample missing'
    }
    default:
      return `${plural(dependencies.modules, 'module')} · ${plural(dependencies.presets, 'preset')} · ${samples}`
  }
}

/**
 * The owners of the open project whose graph is linked, live, to a library sound: "Used on Bass, Bass copy". A link's
 * origin may name one of the sound's presets. Informational: it follows the project, not the library.
 */
const usedOn = (project: Project, catalog: LibraryCatalog, item: LibraryItem): readonly string[] => {
  if (item.trashed || item.content.kind === 'preset' || !('state' in item.content)) return []
  const names = new Set<string>()
  for (const origin of project.libraryOrigins ?? []) {
    const named = origin.link && catalog.items.find((candidate) => candidate.id === origin.itemId)
    const soundId = named?.content.kind === 'preset' ? named.content.assetId : named?.id
    const owner = originOwner(origin)
    if (soundId !== item.id || !owner || !origin.domain) continue
    const found = linkOf(project, owner, origin.domain)
    if (found?.live && found.origin === origin) names.add(ownerName(owner))
  }
  return [...names]
}

/** ⋯: the subject's menu, the same as a right-click on its row. */
const More = ({ subject, label }: { subject: Subject; label: string }) => {
  const context = useActionContext()
  return (
    <PopupMenu entries={() => useActionEntries(subject, context)}>
      <button className={styles.more} aria-label={label} title="More">⋯</button>
    </PopupMenu>
  )
}

interface LibraryDetailsProps {
  readonly catalog: LibraryCatalog
  /** The Factory's catalog; null while it loads. */
  readonly factory: LibraryCatalog | null
  readonly active: LibraryRowRef | null
  readonly busy: boolean
  onRun(id: string, subject: Subject, choice?: string): void
}

/** What the active row is, in one line of facts, with its main button and ⋯ for the rest. */
export const LibraryDetails = ({ catalog: personal, factory, active, busy, onRun }: LibraryDetailsProps) => {
  // The main button names the selected track, so it follows the project and the selection.
  const project = useProjectStore((state) => state.project)
  const notes = useLibraryStore((state) => state.factoryNotes)
  useSelectionStore((state) => [state.trackId, state.groupId, state.master].join())
  // A Factory row's details read the Factory's catalog; everything else the personal one.
  const inFactory = (active?.kind === 'item' || active?.kind === 'folder') && isFactoryId(active.id)
  const catalog = inFactory ? (factory ?? { ...personal, folders: [], items: [] }) : personal
  const live = personal.items.filter((item) => !item.trashed)
  const item = active?.kind === 'item' ? catalog.items.find((candidate) => candidate.id === active.id) : undefined
  const folder = active?.kind === 'folder' ? catalog.folders.find((candidate) => candidate.id === active.id) : undefined
  if (item) {
    const subject: Subject = { kind: 'library-item', itemId: item.id }
    const primary = primaryOf(catalog, item)
    const used = usedOn(project, catalog, item)
    const samples = libraryDependencies(catalog, item).sampleIds.map((id) => catalog.samples.find((sample) => sample.id === id) ?? { id, name: 'Missing sample', durationSeconds: 0 })
    const kind = item.trashed ? `${KIND_NAMES[item.content.kind]} · in the trash` : inFactory ? `${KIND_NAMES[item.content.kind]} · Factory` : KIND_NAMES[item.content.kind]
    return (
      <article className={styles.details} aria-label="Library details">
        <header className={styles.detailsHead}>
          <h3>{item.name}</h3>
          <span className={styles.kind}>{kind}</span>
        </header>
        {inFactory && notes[item.id] && <p className={styles.note}>{notes[item.id]}</p>}
        <p className={styles.facts}>{factsOf(catalog, item)}</p>
        {used.length > 0 && <p className={styles.facts}>Used on {used.join(', ')}</p>}
        {samples.length > 0 && item.content.kind !== 'sample' && (
          <ul className={styles.samples} aria-label="Samples">
            {samples.map((sample) => <li key={sample.id}>{sample.name} · {sample.durationSeconds.toFixed(2)} s</li>)}
          </ul>
        )}
        <div className={styles.buttons}>
          <button className={styles.primary} disabled={busy || !!primary.refusal} title={primary.refusal ?? primary.tooltip} onClick={() => onRun(primary.id, subject, primary.choice)}>{primary.label}</button>
          {primary.refusal && <small className={styles.refusal}>{primary.refusal}</small>}
          <More subject={subject} label={`More for ${item.name}`} />
        </div>
      </article>
    )
  }
  if (folder) {
    const subject: Subject = { kind: 'library-folder', folderId: folder.id }
    const items = catalog.items.filter((candidate) => candidate.folderId === folder.id && !!candidate.trashed === !!folder.trashed && candidate.content.kind !== 'preset').length
    const folders = catalog.folders.filter((candidate) => candidate.parentId === folder.id && !!candidate.trashed === !!folder.trashed).length
    return (
      <article className={styles.details} aria-label="Library details">
        <header className={styles.detailsHead}>
          <h3>{folder.name}</h3>
          <span className={styles.kind}>{folder.trashed ? 'Folder · in the trash' : inFactory ? 'Folder · Factory' : 'Folder'}</span>
        </header>
        <p className={styles.facts}>{plural(items, 'item')} · {plural(folders, 'folder')}</p>
        <div className={styles.buttons}>
          {folder.trashed && <button className={styles.primary} disabled={busy} onClick={() => onRun('library-folder.restore', subject)}>Restore</button>}
          <More subject={subject} label={`More for ${folder.name}`} />
        </div>
      </article>
    )
  }
  if (active?.kind === 'root' && active.id === 'trash') {
    const trashed = catalog.items.filter((candidate) => candidate.trashed).length
    return (
      <article className={styles.details} aria-label="Library details">
        <header className={styles.detailsHead}><h3>Trash</h3></header>
        <p className={styles.facts}>{plural(trashed, 'item')}. Things stay here, samples and all, until you restore them; the trash never touches a project.</p>
        <div className={styles.buttons}>
          <More subject={{ kind: 'library-root', root: 'trash' }} label="More for Trash" />
        </div>
      </article>
    )
  }
  if (active?.kind === 'root' && active.id === 'factory') {
    const items = factory?.items.filter((candidate) => candidate.content.kind !== 'preset').length ?? 0
    return (
      <article className={styles.details} aria-label="Library details">
        <header className={styles.detailsHead}><h3>Factory</h3><span className={styles.kind}>Read-only</span></header>
        <p className={styles.facts}>{factory ? `${plural(items, 'item')} · ${plural(factory.folders.length, 'folder')}. ` : 'Loading… '}Ready-made sounds, effects and clips from the examples. Use them as they are, or copy one to My library to change it.</p>
      </article>
    )
  }
  if (active?.kind === 'project' || (active?.kind === 'root' && active.id === 'project')) return <ProjectDetails rowKey={active.id} busy={busy} onRun={onRun} />
  if (live.length === 0) return <EmptyLibrary busy={busy} onRun={onRun} />
  // As the tree counts: presets under their sound aren't items of their own.
  const rows = live.filter((candidate) => candidate.content.kind !== 'preset' || !live.some((sound) => sound.id === (candidate.content as { assetId: string }).assetId)).length
  return (
    <article className={styles.details} aria-label="Library details">
      <header className={styles.detailsHead}><h3>My library</h3></header>
      <p className={styles.facts}>{plural(rows, 'item')} · {plural(catalog.folders.filter((candidate) => !candidate.trashed).length, 'folder')}</p>
    </article>
  )
}

const TRACK_KINDS = { instrument: 'Instrument track', audio: 'Audio track', return: 'Return track' } as const
const GRAPH_KINDS = { patch: 'Instrument', fx: 'Audio effect', notes: 'Note effect' } as const
const HEADINGS = { clips: 'clip', samples: 'sample', modules: 'module' } as const

/** The subject of a row of This project, as the tree gives it its menu. */
const entrySubject = (entry: ProjectEntry): Subject | null => {
  switch (entry.kind) {
    case 'owner': return entry.owner.kind === 'track' ? { kind: 'track', trackId: entry.owner.trackId } : entry.owner.kind === 'group' ? { kind: 'group', groupId: entry.owner.groupId } : { kind: 'master' }
    case 'graph': return { kind: 'project-graph', owner: entry.owner, domain: entry.domain }
    case 'project-preset': return { kind: 'sound', soundId: entry.presetId, preset: true }
    case 'clip': return { kind: 'clip', trackId: entry.trackId, clipId: entry.clipId }
    case 'sample': return { kind: 'sample', sampleId: entry.sampleId }
    case 'module': return { kind: 'module', moduleId: entry.moduleId }
    case 'heading': return null
  }
}

/**
 * A row of This project: what it is, a line of facts, and ⋯ for its menu. A graph's main button saves it to the
 * library, or says why it can't (it reads another track).
 */
const ProjectDetails = ({ rowKey, busy, onRun }: { readonly rowKey: string } & Pick<LibraryDetailsProps, 'busy' | 'onRun'>) => {
  const project = useProjectStore((state) => state.project)
  const model = projectModel(project)
  if (rowKey === 'project') {
    const clips = project.tracks.reduce((sum, track) => sum + (track.kind === 'return' ? 0 : track.clips.filter(Boolean).length), 0)
    return (
      <article className={styles.details} aria-label="Library details">
        <header className={styles.detailsHead}><h3>{model.name}</h3><span className={styles.kind}>This project</span></header>
        <p className={styles.facts}>{plural(project.tracks.length, 'track')} · {plural(clips, 'clip')} · {plural(project.samples.length, 'sample')}. Drag a sound, clip or sample onto a folder to save it to the library.</p>
      </article>
    )
  }
  const found = projectNodeOf(model, rowKey)
  if (!found) return <article className={styles.details} aria-label="Library details"><p className={styles.facts}>This row is no longer in the project.</p></article>
  const { node, above } = found
  const entry = node.entry, subject = entrySubject(entry)
  const owner = above.find((candidate) => candidate.entry.kind === 'owner')?.name
  const title = entry.kind === 'graph' ? subjectName(subject!) : node.name
  const kind =
    entry.kind === 'owner'
      ? entry.owner.kind === 'master' ? 'Master' : entry.owner.kind === 'group' ? 'Group bus' : TRACK_KINDS[project.tracks.find((track) => entry.owner.kind === 'track' && track.id === entry.owner.trackId)?.kind ?? 'instrument']
      : entry.kind === 'graph' ? GRAPH_KINDS[entry.domain]
        : entry.kind === 'project-preset' ? 'Preset'
          : entry.kind === 'clip' ? KIND_NAMES[entry.clipKind]
            : entry.kind === 'sample' ? 'Sample' : entry.kind === 'module' ? 'Module' : 'In this project'
  const facts =
    entry.kind === 'graph' ? [plural(entry.presets, 'preset'), ...(entry.reason ? [entry.reason] : [])].join(' · ')
      : entry.kind === 'heading' ? plural(node.children.length, HEADINGS[entry.heading])
        : entry.kind === 'owner' ? plural(node.children.filter((child) => child.entry.kind === 'graph').length, 'sound')
          : owner ? `In ${owner}` : 'In this project'
  return (
    <article className={styles.details} aria-label="Library details">
      <header className={styles.detailsHead}><h3>{title}</h3><span className={styles.kind}>{kind} · This project</span></header>
      <p className={styles.facts}>{facts}</p>
      <div className={styles.buttons}>
        {entry.kind === 'graph' && (
          <>
            <button className={styles.primary} disabled={busy || !!entry.reason} title={entry.reason ?? 'A copy goes into the folder open in the library'} onClick={() => onRun('project-graph.save-to-library', subject!)}>Save to library</button>
            {entry.reason && <small className={styles.refusal}>{entry.reason}</small>}
          </>
        )}
        {subject && <More subject={subject} label={`More for ${title}`} />}
      </div>
    </article>
  )
}

/** An empty library says how things get in, and offers to save the selected instrument, as its menu would. */
const EmptyLibrary = ({ busy, onRun }: Pick<LibraryDetailsProps, 'busy' | 'onRun'>) => {
  const project = useProjectStore((state) => state.project)
  const selected = useSelectionStore((state) => state.trackId)
  const instrument = project.tracks.find((track) => track.id === selected && track.kind === 'instrument') ?? project.tracks.find((track) => track.kind === 'instrument')
  return (
    <article className={`${styles.details} ${styles.empty}`} aria-label="Library details">
      {/* The button first: in a short view it stays in sight under the tree's roots. */}
      {instrument && (
        <button className={styles.primary} disabled={busy} onClick={() => onRun('track.save-to-library', { kind: 'track', trackId: instrument.id }, 'patch')}>
          Save {instrument.name} to library
        </button>
      )}
      <p>Right-click a track, clip or sample and choose <em>Save to library</em>, or drop an <code>.sfxlib</code> file here.</p>
    </article>
  )
}
