import type { LibraryBundleStage } from '@core'
import { useEffect, useRef, useState } from 'react'
import styles from './LibraryPanel.module.css'

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const size = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`)

interface BundleDialogProps {
  readonly stage: LibraryBundleStage
  /** An export to download, or an import to take in. */
  readonly exporting: boolean
  readonly busy: boolean
  /** Imports the bundle, or downloads it (`partial`: without its missing samples). */
  onConfirm(partial: boolean): void
  onCancel(): void
}

/**
 * *Bundle review*: what an `.sfxlib` holds, in plain words, before it is imported or downloaded. The full list of
 * items, revisions and samples is under *Details*. A bundle with missing samples imports nothing; an export of one asks
 * to go without them.
 */
export const BundleDialog = ({ stage, exporting, busy, onConfirm, onCancel }: BundleDialogProps) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const [partial, setPartial] = useState(false)
  const { manifest, missing } = stage
  const { catalog } = manifest
  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])
  const contents = `${count(catalog.items.length, 'item')}, ${count(catalog.folders.length, 'folder')}, ${count(catalog.samples.length, 'sample')} (${size(stage.expandedBytes)})`
  const blocked = missing.length > 0 && (!exporting || !partial)
  return (
    <dialog ref={dialog} className={styles.dialog} aria-label="Bundle review" onCancel={(event) => { event.preventDefault(); onCancel() }}>
      <form method="dialog" className={styles.dialogForm} onSubmit={(event) => { event.preventDefault(); if (!blocked && !busy) onConfirm(partial) }}>
        <h2>{exporting ? 'Export' : 'Import'} {manifest.name}{manifest.partial ? ' (partial)' : ''}</h2>
        <p>{exporting ? `It holds ${contents}.` : `It holds ${contents}. It goes into a new folder called ${manifest.name}; importing it again makes another copy.`}</p>
        {missing.length > 0 && (
          <p className={styles.warning} role="alert">
            {count(missing.length, 'sample is', 'samples are')} missing: {missing.map((id) => catalog.samples.find((sample) => sample.id === id)?.name ?? id).join(', ')}.
            {exporting ? ' The bundle can go without them, and the sounds that use them will be incomplete.' : ' Import the samples first, or ask for a bundle that has them.'}
          </p>
        )}
        <details className={styles.bundleDetails}>
          <summary>Details</summary>
          {catalog.folders.map((folder) => <p key={folder.id}>Folder: {folder.name}</p>)}
          {catalog.items.map((item) => <p key={item.id}>{item.name} · {item.content.kind}</p>)}
          {catalog.revisions.map((revision) => <p key={revision.id}>Revision {revision.id} · {count(revision.payload.modules.length, 'module')}</p>)}
          {catalog.samples.map((sample) => <p key={sample.id}>{sample.name} · {size(sample.bytes)} · {stage.blobs.has(sample.id) ? 'included' : 'missing'}</p>)}
        </details>
        {exporting && missing.length > 0 && (
          <label className={styles.check}><input type="checkbox" checked={partial} onChange={(event) => setPartial(event.target.checked)} />Export without the missing samples</label>
        )}
        <div className={styles.dialogButtons}>
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="submit" autoFocus disabled={busy || blocked}>{exporting ? 'Download .sfxlib' : 'Import'}</button>
        </div>
      </form>
    </dialog>
  )
}
