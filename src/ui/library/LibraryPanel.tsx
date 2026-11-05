import { type LibraryBundleSelection, type LibraryBundleStage, type LibraryCatalog } from '@core'
import { type LibraryRowRef, type Subject, commitRename, runAction, useLibraryStore, usePersonalLibrary, useSelectionStore } from '@state'
import { type DragEvent, useEffect, useRef, useState } from 'react'
import { PopupMenu, useActionContext, useActionEntries } from '../shared/menu'
import { BundleDialog } from './BundleDialog'
import { KIND_NAMES, LibraryDetails, primaryOf } from './LibraryDetails'
import type { LibraryRow } from './library-tree'
import { LibraryTree, previewIdOf, subjectOf } from './LibraryTree'
import styles from './LibraryPanel.module.css'

const BUNDLE_LIMIT = 128 * 1024 * 1024
/** An `.sfxlib` among the files a drag carries; only those open the review. */
const isBundleFile = (file: File) => file.name.toLowerCase().endsWith('.sfxlib')

/**
 * The personal library: a header (search, type filter, ⋯), a status line while there is something to say, the tree,
 * and the active row's details. Bundles are reviewed in a dialog, opened from a menu or by dropping an `.sfxlib` here.
 *
 * The view's own buttons run the library's actions through `run`, which sequences them with an operation token: a
 * result that comes back after a newer operation started is dropped. Hiding the view drops results and stops the
 * preview; showing it reads the catalog again.
 */
export const LibraryPanel = () => {
  const library = usePersonalLibrary(), context = useActionContext()
  const catalog = useLibraryStore((s) => s.catalog), setCatalog = useLibraryStore((s) => s.setCatalog)
  const active = useLibraryStore((s) => s.active), selected = useLibraryStore((s) => s.selected), previewing = useLibraryStore((s) => s.previewing), request = useLibraryStore((s) => s.request)
  const selection = useSelectionStore()
  const [query, setQuery] = useState(''), [kind, setKind] = useState('')
  const [bundle, setBundle] = useState<{ stage: LibraryBundleStage; exporting: boolean } | null>(null)
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [readFailed, setReadFailed] = useState(false)
  const [droppingFile, setDroppingFile] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const operationId = useRef(0), previewOperation = useRef(false)
  const stopPreview = () => {
    library.stopPreview()
    useLibraryStore.getState().setPreviewing(null)
    if (previewOperation.current) { operationId.current++; previewOperation.current = false; setBusy(false) }
  }
  const run = async (operation: () => Promise<string | void | false | LibraryCatalog>, preview = false) => {
    const token = ++operationId.current
    previewOperation.current = preview
    setBusy(true)
    try {
      const result = await operation()
      if (token !== operationId.current || result === false) return
      const next = result && typeof result !== 'string' ? result : await library.read()
      if (token !== operationId.current) return
      setCatalog(next); setMessage(typeof result === 'string' ? result : 'Library saved'); setReadFailed(false)
    } catch (error) { if (token === operationId.current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { if (token === operationId.current) { previewOperation.current = false; setBusy(false) } }
  }
  // Also runs each time the hidden view is shown again. Hiding drops the result of an operation still running (its
  // work finishes in storage) and stops the preview; showing reads the catalog again, which picks that work up.
  useEffect(() => {
    let current = true
    const token = operationId.current
    void library.read().then((value) => { if (current && operationId.current === token) setCatalog(value) }).catch((error) => {
      if (current && operationId.current === token) { setMessage(error instanceof Error ? error.message : String(error)); setReadFailed(true) }
    })
    return () => { current = false; operationId.current++; previewOperation.current = false; setBusy(false); library.stopPreview(); useLibraryStore.getState().setPreviewing(null) }
  }, [library])
  const activeKey = active ? `${active.kind}:${active.id}` : ''
  useEffect(() => { stopPreview() }, [library, query, kind, activeKey, selection.trackId, selection.master, selection.groupId, selection.clipId])
  /** Runs one of the library's actions from here: busy while it runs, its message on the status line. */
  const act = (id: string, subject: Subject, choice?: string, preview = false) => void run(async () => {
    await runAction(id, subject, context, { choice, report: (_kind, text) => setMessage(text) })
    return false
  }, preview)
  const preview = (row: LibraryRow) => {
    const id = previewIdOf(row)
    if (id === undefined) return
    if (previewing === id) return stopPreview()
    if (row.kind === 'project') act('project-graph.preview', subjectOf(row)!, undefined, true)
    else act('library-item.preview', { kind: 'library-item', itemId: id }, undefined, true)
  }
  const primary = (row: LibraryRow) => {
    // A graph of This project: Save to library, or why it can't be saved.
    if (row.kind === 'project' && row.entry.kind === 'graph') {
      if (row.entry.reason) setMessage(row.entry.reason)
      else act('project-graph.save-to-library', subjectOf(row)!)
      return
    }
    if (row.kind !== 'item' && row.kind !== 'preset') return
    const item = catalog.items.find((candidate) => candidate.id === row.id)
    if (!item) return
    const action = primaryOf(catalog, item)
    if (!action.refusal) act(action.id, { kind: 'library-item', itemId: row.id }, action.choice)
    else setMessage(action.refusal)
  }
  const reviewExport = (selection: LibraryBundleSelection, name: string) => run(async () => {
    stopPreview(); setBundle(null)
    setBundle({ stage: await library.prepareBundle(selection, name), exporting: true })
    return 'Review the bundle before downloading'
  })
  const stage = (file: File) => void run(async () => {
    stopPreview(); setBundle(null)
    if (file.size > BUNDLE_LIMIT) throw new Error('Library bundle compressed byte limit exceeded (128 MiB)')
    setBundle({ stage: await library.stageBundle(new Uint8Array(await file.arrayBuffer())), exporting: false })
    return 'Review the bundle before importing; the library is unchanged'
  })
  // A menu's Export as .sfxlib… or Import .sfxlib…, which only this view can open.
  useEffect(() => {
    if (!request) return
    useLibraryStore.getState().setRequest(null)
    if (request.kind === 'import') input.current?.click()
    else void reviewExport(request.selection, request.name)
  }, [request])
  // Items that are gone, or in the trash, leave the selection.
  useEffect(() => {
    const available = new Set(catalog.items.filter((item) => !item.trashed).map((item) => item.id))
    if (selected.some((id) => !available.has(id))) useLibraryStore.getState().select(selected.filter((id) => available.has(id)))
  }, [catalog, selected])

  const activate = (ref: LibraryRowRef, items: readonly string[]) => {
    useLibraryStore.getState().setActive(ref)
    useLibraryStore.getState().select(items)
  }
  const rename = (subject: Subject, typed: string) => void run(async () => (await commitRename(subject, typed, context)) ?? false)
  const filesIn = (event: DragEvent) => event.dataTransfer.types.includes('Files')

  return (
    <section
      className={`${styles.panel} ${droppingFile ? styles.droppingFile : ''}`}
      aria-label="Personal library"
      onDragOver={(event) => {
        if (!filesIn(event)) return
        event.preventDefault()
        setDroppingFile(true)
      }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDroppingFile(false) }}
      onDrop={(event) => {
        if (!filesIn(event)) return
        event.preventDefault()
        setDroppingFile(false)
        const file = Array.from(event.dataTransfer.files).find(isBundleFile)
        if (file) stage(file)
        else setMessage('Drop an .sfxlib file to import it')
      }}
    >
      <div className={styles.header}>
        <input className={styles.search} type="search" aria-label="Search library" placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="Library type filter" value={kind} onChange={(event) => setKind(event.target.value)}>
          <option value="">All types</option>
          {(['instrument', 'audio-effect', 'note-effect', 'preset', 'midi-clip', 'audio-clip', 'sample'] as const).map((value) => <option key={value} value={value}>{KIND_NAMES[value] === 'Preset' ? 'Presets' : `${KIND_NAMES[value]}s`}</option>)}
        </select>
        <PopupMenu entries={() => [
          ...useActionEntries({ kind: 'library-root', root: 'mine' }, context),
          { kind: 'separator' as const },
          { label: `Export selection…${selected.length > 1 ? ` (${selected.length})` : ''}`, disabled: selected.length === 0 || busy, takesFocus: true, onSelect: () => void reviewExport({ itemIds: selected }, selected.length === 1 ? (catalog.items.find((item) => item.id === selected[0])?.name ?? 'Selection') : 'Selection') },
        ]}>
          <button className={styles.more} aria-label="Library actions" title="Library actions">⋯</button>
        </PopupMenu>
      </div>
      {message && (
        <div className={styles.status}>
          <output role="status">{message}</output>
          {readFailed && <button disabled={busy} onClick={() => void run(async () => { stopPreview(); return library.read() })}>Retry</button>}
        </div>
      )}
      <input ref={input} type="file" accept=".sfxlib" hidden aria-label="Import library bundle" disabled={busy} onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) stage(file)
      }} />
      <div className={styles.columns}>
        <div className={styles.treeColumn}>
          <LibraryTree catalog={catalog} query={query} kind={kind} active={active} selected={selected} previewing={previewing} onActivate={activate} onPrimary={primary} onPreview={preview} onRename={rename} />
        </div>
        <LibraryDetails catalog={catalog} active={active} busy={busy} onRun={act} />
      </div>
      {bundle && (
        <BundleDialog
          stage={bundle.stage}
          exporting={bundle.exporting}
          busy={busy}
          onCancel={() => setBundle(null)}
          onConfirm={(partial) => void run(async () => {
            const result = bundle.exporting ? await library.exportBundle(bundle.stage, partial) : await library.importBundle(bundle.stage)
            setBundle(null)
            return result
          })}
        />
      )}
    </section>
  )
}
