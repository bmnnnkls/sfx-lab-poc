import { useEffect, useRef, useState } from 'react'
import { type LibraryBundleStage, type LibraryBundleSelection, libraryBundleConflicts, type LibraryCatalog, type LibraryItem, type SnapshotScope, emptyLibrary, browseLibrary, libraryDependencies, saveLibraryFolder, saveLibraryItem, trashLibraryEntry } from '@core'
import { usePersonalLibrary, useProjectStore, useSelectionStore } from '@state'
import styles from './LibraryPanel.module.css'

export const LibraryPanel = () => {
  const library = usePersonalLibrary(), project = useProjectStore(s => s.project), selection = useSelectionStore()
  const [catalog, setCatalog] = useState<LibraryCatalog>(emptyLibrary), [folder, setFolder] = useState<string | null>(null), [selected, setSelected] = useState('')
  const [name, setName] = useState('My sound'), [query, setQuery] = useState(''), [kind, setKind] = useState(''), [trash, setTrash] = useState(false)
  const [domain, setDomain] = useState<'patch' | 'fx' | 'notes'>('patch'), [sampleId, setSampleId] = useState(''), [scene, setScene] = useState(0)
  const [bundle, setBundle] = useState<{ stage: LibraryBundleStage; exporting: boolean } | null>(null), [partial, setPartial] = useState(false), [checked, setChecked] = useState<string[]>([])
  const [moveTo, setMoveTo] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false)
  const track = project.tracks.find(t => t.id === selection.trackId) ?? project.tracks[0]
  const scope: SnapshotScope = { owner: selection.master ? { kind: 'master' } : { kind: 'track', trackId: track?.id ?? '' }, domain: selection.master ? 'fx' : domain }
  const item = catalog.items.find(i => i.id === selected), currentFolder = catalog.folders.find(f => f.id === folder)
  const operationId = useRef(0), previewOperation = useRef(false)
  const stopPreview = () => {
    library.stopPreview()
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
      setCatalog(next); setMessage(typeof result === 'string' ? result : 'Library saved')
    } catch (error) { if (token === operationId.current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { if (token === operationId.current) { previewOperation.current = false; setBusy(false) } }
  }
  useEffect(() => {
    let active = true
    const token = operationId.current
    void library.read().then(value => { if (active && operationId.current === token) setCatalog(value) }).catch(error => { if (active && operationId.current === token) setMessage(String(error)) })
    return () => { active = false; operationId.current++; library.stopPreview() }
  }, [library])
  useEffect(() => { stopPreview() }, [library, query, kind, trash, selection.trackId, selection.master, selection.clipId])
  const reviewExport = (selection: LibraryBundleSelection, bundleName: string) => run(async () => {
    stopPreview(); setBundle(null); setPartial(false)
    setBundle({ stage: await library.prepareBundle(selection, bundleName), exporting: true })
    return 'Review bundle dependencies before downloading'
  })
  const navigate = (id: string | null) => { stopPreview(); setFolder(id); setSelected('') }
  const choose = (i: LibraryItem) => { stopPreview(); setSelected(i.id); setName(i.name) }
  const tree = (parent: string | null, depth = 0): React.ReactNode => catalog.folders.filter(f => f.parentId === parent && !f.trashed).map(f => <div key={f.id}><button className={folder === f.id ? styles.active : ''} style={{ marginLeft: depth * 12 }} onClick={() => navigate(f.id)}>{f.name}</button>{tree(f.id, depth + 1)}</div>)
  useEffect(() => {
    const available = new Set(catalog.items.filter(i => !i.trashed).map(i => i.id))
    setChecked(ids => ids.filter(id => available.has(id)))
    if (selected && !catalog.items.some(i => i.id === selected && Boolean(i.trashed) === trash)) setSelected('')
  }, [catalog, trash, selected])
  useEffect(() => { setScene(value => Number.isInteger(value) && value >= project.sceneCount ? project.sceneCount - 1 : value) }, [project.sceneCount])
  const validScene = Number.isInteger(scene) && scene >= 0 && scene < project.sceneCount
  const visibleItems = browseLibrary(catalog, { ...(query || trash ? {} : { folderId: folder }), query, kind, trash })
  const hiddenChecked = checked.filter(id => !visibleItems.some(i => i.id === id)).length
  const dependencies = item && libraryDependencies(catalog, item)
  const insertionScope: SnapshotScope = { ...scope, domain: item?.content.kind === 'instrument' ? 'patch' : item?.content.kind === 'note-effect' ? 'notes' : item?.content.kind === 'audio-effect' ? 'fx' : item?.content.kind === 'preset' ? item.content.state.scope.domain : scope.domain }
  const instrumentItem = item?.content.kind === 'instrument' || item?.content.kind === 'preset' && catalog.revisions.find(r => item.content.kind === 'preset' && r.id === item.content.revisionId)?.payload.kind === 'instrument'
  return <section className={styles.panel} aria-label="Personal library">
    <div className={styles.toolbar}>
      <input aria-label="Library name" value={name} maxLength={80} onChange={e => setName(e.target.value)} />
      <button disabled={busy || trash} onClick={() => void run(() => library.update(c => saveLibraryFolder(c, name, folder)))}>New folder</button>
      <select aria-label="Library save scope" value={scope.domain} onChange={e => setDomain(e.target.value as typeof domain)}><option value="patch">Instrument + notes</option><option value="fx">Audio effects</option><option value="notes">Note effects</option></select>
      <button disabled={busy || trash} onClick={() => void run(() => library.saveAsset(scope, name, folder))}>Save asset + presets</button>
      <button disabled={busy || trash || !selection.clipId} onClick={() => void run(() => library.saveClip(track?.id ?? '', selection.clipId ?? '', name, folder))}>Save selected clip</button>
      <select aria-label="Project sample to catalog" value={sampleId} onChange={e => setSampleId(e.target.value)}><option value="">Choose sample</option>{project.samples.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <button disabled={busy || trash || !sampleId} onClick={() => void run(() => library.saveSample(sampleId, name, folder))}>Catalog sample</button>
    </div>
    <div className={styles.toolbar}>
      <input aria-label="Search library" placeholder="Search all folders" value={query} onChange={e => setQuery(e.target.value)} />
      <select aria-label="Library type filter" value={kind} onChange={e => setKind(e.target.value)}><option value="">All types</option>{['instrument', 'audio-effect', 'note-effect', 'preset', 'midi-clip', 'audio-clip', 'sample'].map(k => <option key={k}>{k}</option>)}</select>
      <button onClick={() => { stopPreview(); setTrash(!trash); setSelected('') }}>{trash ? 'Back to library' : 'Trash'}</button>
      <button disabled={busy} onClick={() => void run(async () => { stopPreview(); return library.read() })}>Refresh</button>
      <output role="status">{message}</output>
    </div>
    <div className={styles.toolbar}>
      <span>{checked.length} selected · {hiddenChecked} hidden</span><button disabled={!checked.length} onClick={() => setChecked([])}>Clear selection</button>
      <button disabled={busy || trash || !(checked.length || item)} onClick={() => void reviewExport({ itemIds: checked.length ? checked : [item!.id] }, name)}>Review selected items export</button>
      <button disabled={busy || trash || !currentFolder} onClick={() => void reviewExport({ folderIds: [currentFolder!.id] }, currentFolder!.name)}>Review folder export</button>
      <label>Import .sfxlib<input aria-label="Import library bundle" type="file" accept=".sfxlib" disabled={busy} onChange={e => {
        const file = e.target.files?.[0]; e.target.value = ''; if (!file) return
        void run(async () => {
          stopPreview(); setBundle(null); setPartial(false)
          if (file.size > 128 * 1024 * 1024) throw new Error('Library bundle compressed byte limit exceeded (128 MiB)')
          const stage = await library.stageBundle(new Uint8Array(await file.arrayBuffer()))
          setBundle({ stage, exporting: false }); return 'Review bundle before importing; catalog unchanged'
        })
      }} /></label>
    </div>
    {bundle && <section aria-label="Bundle review">
      <h3>{bundle.exporting ? 'Export' : 'Import'} {bundle.stage.manifest.name}{bundle.stage.manifest.partial ? ' · PARTIAL' : ''}</h3>
      <p>{bundle.stage.manifest.catalog.items.length} items · {bundle.stage.manifest.catalog.folders.length} folders · {bundle.stage.manifest.catalog.revisions.length} immutable revisions · {bundle.stage.manifest.catalog.samples.length} samples · {bundle.stage.expandedBytes} expanded bytes</p>
      <p>{libraryBundleConflicts(catalog, bundle.stage.manifest.catalog)} logical ID conflicts; imports always copy into a new folder named {bundle.stage.manifest.name}. Repeated imports create independent copies; identical sample bytes are shared.</p>
      <p>{bundle.stage.missing.length} missing sample files. {bundle.stage.missing.join(', ')}</p>
      <details><summary>Included items and dependencies</summary>
        {bundle.stage.manifest.catalog.folders.map(f => <p key={f.id}>Folder: {f.name} · parent {f.parentId ?? 'bundle root'}</p>)}
        {bundle.stage.manifest.catalog.items.map(i => <p key={i.id}>{i.name} · {i.content.kind}{i.content.kind === 'preset' ? ` · asset ${i.content.assetId}` : ''}</p>)}
        {bundle.stage.manifest.catalog.revisions.map(r => <p key={r.id}>Revision {r.id} · {r.payload.modules.length} nested modules</p>)}
        {bundle.stage.manifest.catalog.samples.map(s => <p key={s.id}>{s.name} · {s.bytes} bytes · {bundle.stage.blobs.has(s.id) ? 'included' : 'MISSING'}</p>)}
      </details>
      {bundle.exporting && bundle.stage.missing.length > 0 && <label><input type="checkbox" checked={partial} onChange={e => setPartial(e.target.checked)} />Explicitly allow a partial export</label>}
      {bundle.exporting ? <button disabled={busy || bundle.stage.missing.length > 0 && !partial} onClick={() => void run(async () => { const message = await library.exportBundle(bundle.stage, partial); setBundle(null); return message })}>Download .sfxlib</button>
        : <button disabled={busy || bundle.stage.missing.length > 0} onClick={() => void run(async () => { const result = await library.importBundle(bundle.stage); setBundle(null); setChecked([]); return result })}>Import into new folder</button>}
      <button disabled={busy} onClick={() => setBundle(null)}>Cancel bundle</button>
    </section>}
    <div className={styles.columns}>
      <aside aria-label="Library folders"><button onClick={() => navigate(null)}>All / root</button>{tree(null)}
        {currentFolder && !trash && <><hr /><strong>{currentFolder.name}</strong><button disabled={busy} onClick={() => void run(() => library.update(c => saveLibraryFolder(c, name, currentFolder.parentId, currentFolder.id)))}>Rename folder</button><button disabled={busy} onClick={() => void run(async () => { const value = await library.update(c => trashLibraryEntry(c, currentFolder.id)); navigate(null); return value })}>Trash folder and contents</button><button disabled={busy} onClick={() => void run(() => library.update(c => saveLibraryFolder(c, currentFolder.name, moveTo || null, currentFolder.id)))}>Move folder</button></>}
        <label>Move destination<select aria-label="Move destination" value={moveTo} onChange={e => setMoveTo(e.target.value)}><option value="">Root</option>{catalog.folders.filter(f => !f.trashed).map(f => <option key={f.id} value={f.id}>{f.name} · {f.id.slice(-6)}</option>)}</select></label>
        {trash && catalog.folders.filter(f => f.trashed).map(f => <button key={f.id} disabled={busy} onClick={() => void run(() => library.update(c => trashLibraryEntry(c, f.id, false)))}>Restore folder {f.name}</button>)}
      </aside>
      <div className={styles.items} aria-label="Library items">{visibleItems.map(i => <div className={styles.itemRow} key={i.id}><input aria-label={`Include ${i.name} in bundle`} type="checkbox" checked={checked.includes(i.id)} onChange={e => setChecked(ids => e.target.checked ? [...ids, i.id] : ids.filter(id => id !== i.id))} /><button className={selected === i.id ? styles.active : ''} onClick={() => choose(i)}><strong>{i.name}</strong><small>{i.content.kind}{i.content.kind === 'preset' ? ` · ${catalog.items.find(a => i.content.kind === 'preset' && a.id === i.content.assetId)?.name ?? 'Unavailable asset'}` : ''}</small></button></div>)}</div>
      <article aria-label="Library item details">{item && dependencies ? <>
        <h3>{item.name}</h3><p>{item.content.kind} · {dependencies.modules} modules · {dependencies.presets} presets · {dependencies.sampleIds.length} samples</p>
        <p>{dependencies.routing}</p>
        {dependencies.presets > 0 && <section aria-label="Associated presets"><strong>Presets</strong>{catalog.items.filter(i => !i.trashed && i.content.kind === 'preset' && i.content.assetId === item.id).map(preset => <button key={preset.id} onClick={() => choose(preset)}>Select preset {preset.name}</button>)}</section>}
        {dependencies.sampleIds.map(id => { const sample = catalog.samples.find(s => s.id === id); return <p key={id}>{sample?.name ?? 'Missing metadata'} · {sample?.durationSeconds.toFixed(2)} s · {sample?.sampleRate} Hz · {sample?.bytes} bytes <small>{id}</small></p> })}
        <p>Destination: {selection.master ? 'Master' : track?.name ?? 'Select a track'}. Replacement changes only the chosen graph; instruments also replace notes and voices. Existing automation/mappings stay and may become unavailable.</p>
        {!trash ? <>
          <button disabled={busy} onClick={() => void run(async () => { return await library.preview(item) === 'cancelled' ? false : 'Preview in isolated engine · effects use a test tone' }, true)}>Preview</button><button onClick={stopPreview}>Stop preview</button>
          <button disabled={busy || !instrumentItem} onClick={() => void run(() => library.insert(item, { mode: 'new-track' }))}>Insert new instrument track</button>
          <button disabled={busy || ['audio-clip', 'midi-clip'].includes(item.content.kind)} onClick={() => void run(() => library.insert(item, { mode: 'replace', scope: insertionScope }))}>{item.content.kind === 'sample' ? 'Add sample to project' : 'Replace selected graph'}</button>
          {['audio-clip', 'midi-clip'].includes(item.content.kind) && <><label>Scene <input aria-label="Library destination scene" type="number" min={1} max={project.sceneCount} value={Number.isNaN(scene) ? '' : scene + 1} onChange={e => setScene(e.target.value === '' ? NaN : Number(e.target.value) - 1)} /></label><button disabled={busy || !validScene} onClick={() => void run(() => library.insert(item, { mode: 'replace', scope }, scene))}>Insert into empty slot</button><button disabled={busy || !validScene} onClick={() => void run(() => library.insert(item, { mode: 'replace', scope }, scene, true))}>Replace clip in slot</button></>}
          <hr /><button disabled={busy} onClick={() => void run(() => library.update(c => saveLibraryItem(c, { ...c.items.find(i => i.id === item.id)!, name })))}>Rename item</button>
          <button disabled={busy} onClick={() => void run(() => library.update(c => saveLibraryItem(c, { ...c.items.find(i => i.id === item.id)!, folderId: moveTo || null })))}>Move item</button>
          <button disabled={busy} onClick={() => void run(() => library.update(c => {
            const id = crypto.randomUUID(); let next = saveLibraryItem(c, { ...item, id, name: `${item.name} copy` })
            for (const preset of c.items) if (!preset.trashed && preset.content.kind === 'preset' && preset.content.assetId === item.id) next = saveLibraryItem(next, { ...preset, id: crypto.randomUUID(), content: { ...preset.content, assetId: id } })
            return next
          }))}>Duplicate item</button>
          <button disabled={busy} title="Retains dependencies and all sample bytes. Restore from Trash." onClick={() => void run(async () => { stopPreview(); return library.update(c => trashLibraryEntry(c, item.id)) })}>Trash item + associated presets</button>
        </> : <button disabled={busy} onClick={() => void run(() => library.update(c => trashLibraryEntry(c, item.id, false)))}>Restore item</button>}
        <p>Project copies are independent. Trash retains library records and sample bytes; it has no effect on project undo.</p>
      </> : <p>Select a library item for dependencies, preview and explicit load scope. Save includes nested modules, sample choices and compatible project presets. Duplicate names are allowed.</p>}</article>
    </div>
  </section>
}
