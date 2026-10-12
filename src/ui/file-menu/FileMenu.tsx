import { exampleProjects } from '@core'
import { useProjectFiles, usePersistenceStore, useProjectStore } from '@state'
import { useRef, useState } from 'react'
import { ExportAudioDialog } from './ExportAudioDialog'
import styles from './FileMenu.module.css'
import { SaveIndicator } from './SaveIndicator'

/** Project name, save status and the File dropdown (export / import / export audio / new / restore). */
export const FileMenu = () => {
  const files = useProjectFiles()
  const name = useProjectStore((state) => state.project.name)
  const setName = useProjectStore((state) => state.setName)
  const hasBackup = usePersistenceStore((state) => state.hasBackup)
  const menu = useRef<HTMLDetailsElement>(null)
  const [exportingAudio, setExportingAudio] = useState(false)

  /** Runs an action, then closes the dropdown. */
  const choose = (action: () => void | Promise<void>) => () => {
    if (menu.current) menu.current.open = false
    void action()
  }

  return (
    <div className={styles.file}>
      <input
        className={styles.name}
        value={name}
        aria-label="Project name"
        onChange={(event) => setName(event.target.value)}
      />
      <SaveIndicator />
      <details ref={menu} className={styles.menu}>
        <summary>File</summary>
        <div className={styles.items}>
          <button onClick={choose(files.exportProject)}>Export to file…</button>
          <button onClick={choose(() => setExportingAudio(true))}>Export audio (WAV)…</button>
          <button onClick={choose(files.importProject)}>Import from file…</button>
          <hr />
          <button onClick={choose(files.newProject)}>New project</button>
          <hr />
          <span className={styles.heading}>Examples</span>
          {exampleProjects.map((example) => (
            <button key={example.id} className={styles.example} onClick={choose(() => files.loadExample(example.id))}>
              {example.title}
              <small>{example.tagline}</small>
            </button>
          ))}
          <button className={styles.example} onClick={choose(files.loadDemo)}>
            Starter
            <small>Three plain tracks to start from</small>
          </button>
          <hr />
          <button
            disabled={!hasBackup}
            title="Swap back to the project you most recently replaced"
            onClick={choose(files.restorePrevious)}
          >
            Restore previous
          </button>
        </div>
      </details>
      {exportingAudio && <ExportAudioDialog onClose={() => setExportingAudio(false)} />}
    </div>
  )
}
