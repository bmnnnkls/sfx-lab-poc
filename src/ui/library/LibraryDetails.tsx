import { type ControlOwner, EFFECT_INPUTS, type LibraryCatalog, type LibraryItem, libraryDependencies } from '@core'
import { type LibraryRowRef, type Subject, clipTrackFor, graphFitsOwner, insertionScope, libraryClipFitsSlot, subjectName, useProjectStore, useSelectionStore } from '@state'
import { PopupMenu, useActionContext, useActionEntries } from '../shared/menu'
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
  readonly active: LibraryRowRef | null
  readonly busy: boolean
  onRun(id: string, subject: Subject, choice?: string): void
}

/** What the active row is, in one line of facts, with its main button and ⋯ for the rest. */
export const LibraryDetails = ({ catalog, active, busy, onRun }: LibraryDetailsProps) => {
  // The main button names the selected track, so it follows the project and the selection.
  useProjectStore((state) => state.project)
  useSelectionStore((state) => [state.trackId, state.groupId, state.master].join())
  const live = catalog.items.filter((item) => !item.trashed)
  const item = active?.kind === 'item' ? catalog.items.find((candidate) => candidate.id === active.id) : undefined
  const folder = active?.kind === 'folder' ? catalog.folders.find((candidate) => candidate.id === active.id) : undefined
  if (item) {
    const subject: Subject = { kind: 'library-item', itemId: item.id }
    const primary = primaryOf(catalog, item)
    const samples = libraryDependencies(catalog, item).sampleIds.map((id) => catalog.samples.find((sample) => sample.id === id) ?? { id, name: 'Missing sample', durationSeconds: 0 })
    return (
      <article className={styles.details} aria-label="Library details">
        <header className={styles.detailsHead}>
          <h3>{item.name}</h3>
          <span className={styles.kind}>{item.trashed ? `${KIND_NAMES[item.content.kind]} · in the trash` : KIND_NAMES[item.content.kind]}</span>
        </header>
        <p className={styles.facts}>{factsOf(catalog, item)}</p>
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
          <span className={styles.kind}>{folder.trashed ? 'Folder · in the trash' : 'Folder'}</span>
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

/** An empty library says how things get in, and offers to save the selected instrument, as its menu would. */
const EmptyLibrary = ({ busy, onRun }: Pick<LibraryDetailsProps, 'busy' | 'onRun'>) => {
  const project = useProjectStore((state) => state.project)
  const selected = useSelectionStore((state) => state.trackId)
  const instrument = project.tracks.find((track) => track.id === selected && track.kind === 'instrument') ?? project.tracks.find((track) => track.kind === 'instrument')
  return (
    <article className={`${styles.details} ${styles.empty}`} aria-label="Library details">
      <p>Right-click a track, clip or sample and choose <em>Save to library</em>, or drop an <code>.sfxlib</code> file here.</p>
      {instrument && (
        <button className={styles.primary} disabled={busy} onClick={() => onRun('track.save-to-library', { kind: 'track', trackId: instrument.id }, 'patch')}>
          Save {instrument.name} to library
        </button>
      )}
    </article>
  )
}
