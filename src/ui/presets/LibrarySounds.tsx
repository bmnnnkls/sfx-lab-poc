import { type ControlOwner, type LibraryItem, type ProjectPreset, controlOwnerId, linkOf, linkedSounds } from '@core'
import { type KeyboardEvent, useEffect, useId, useMemo } from 'react'
import { isStillRecalled, recallLinkedSound, scopeState, useLibraryStore, useProjectStore, useSoundsStore } from '@state'
import { useActionContext } from '../shared/menu'
import styles from './SoundsPanel.module.css'

interface LibrarySoundsProps {
  readonly owner: ControlOwner
  readonly domain: 'patch' | 'fx' | 'notes'
  readonly ownerName: string
  onReport(text: string): void
}

const stateOf = (item: LibraryItem) => (item.content as { readonly state: ProjectPreset }).state

/** A library state's row: click, Enter or Space recalls it onto the selection. */
const LibraryRow = ({ item, sound, hint, recalled, onRecall }: { item: LibraryItem; sound: boolean; hint: string; recalled: boolean; onRecall(): void }) => {
  const kindId = useId()
  const keys = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onRecall()
  }
  return (
    <li>
      <div className={styles.row} role="button" tabIndex={0} aria-label={`Recall ${item.name}`} aria-describedby={kindId} title={hint} data-recalled={recalled || undefined} onClick={onRecall} onKeyDown={keys}>
        <span className={styles.mark} aria-hidden>{recalled ? '●' : ''}</span>
        <span className={styles.name}>{item.name}</span>
        <span id={kindId} className={styles.kind}>{sound ? 'Library sound' : 'Library preset'}{recalled && <span className={styles.hidden}>, recalled</span>}</span>
      </div>
    </li>
  )
}

/**
 * *From the library · Big bass*: the library sound the selection's graph was inserted from, and its presets, recalled
 * onto it through the link. Shows a line instead when the graph has been rewired since, or the sound is in the trash;
 * nothing when the graph has no link, or the sound is gone. It reads the catalog, which stays empty until the Library
 * has been shown.
 */
export const LibrarySounds = ({ owner, domain, ownerName, onReport }: LibrarySoundsProps) => {
  const project = useProjectStore((state) => state.project)
  const catalog = useLibraryStore((state) => state.catalog)
  const mark = useSoundsStore((state) => state.recalled)
  const { library } = useActionContext()
  const ownerKey = JSON.stringify(owner)
  const link = useMemo(() => linkOf(project, owner, domain), [project, ownerKey, domain])
  const itemId = link?.origin.itemId
  useEffect(() => {
    if (!itemId) return
    let current = true
    library.read().then((value) => { if (current) useLibraryStore.getState().setCatalog(value) }).catch(() => undefined)
    return () => { current = false }
  }, [itemId, library])
  if (!link) return null
  const { sound, trashed, states } = linkedSounds(catalog, link.origin)
  if (!sound) return null
  const scope = { owner, domain }
  const recalledId = mark && mark.scope.owner.kind === owner.kind && controlOwnerId(mark.scope.owner) === controlOwnerId(owner) && mark.scope.domain === domain && isStillRecalled(project, mark, domain === 'patch') ? mark.soundId : null
  const recall = (item: LibraryItem) => {
    try {
      onReport(recallLinkedSound(link.origin, stateOf(item)))
      useSoundsStore.getState().markRecalled({ soundId: item.id, scope, state: scopeState(useProjectStore.getState().project, scope, domain === 'patch') })
    } catch (error) {
      onReport(error instanceof Error ? error.message : 'Recall failed')
    }
  }
  const title = `From the library · ${sound.name}`
  return (
    <section className={styles.group} aria-label={title}>
      <h3>{title}</h3>
      {!link.live ? (
        <p className={styles.empty}>This sound has changed since it came from the library</p>
      ) : trashed ? (
        <p className={styles.empty}>The library sound is in the trash</p>
      ) : (
        <ul className={styles.list} aria-label={`Library sounds of ${ownerName}`}>
          {states.map((item) => <LibraryRow key={item.id} item={item} sound={item.id === sound.id} hint={`Recall onto ${ownerName}`} recalled={recalledId === item.id} onRecall={() => recall(item)} />)}
        </ul>
      )}
    </section>
  )
}
