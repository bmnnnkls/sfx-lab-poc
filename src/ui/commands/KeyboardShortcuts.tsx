import type { Command } from '@state'
import { useEffect, useRef, useState } from 'react'
import { norm, tierOf } from '../shared/search-match'
import { useKeybindingsContext } from './CommandHost'
import { DEFAULT_KEYS, keptKeyReason, keysOf, replaceKeys, removeKey, resetKeys, usedKeyWarning, VIEW_KEYS } from './keybindings'
import { IS_APPLE, keyLabel, keyOf } from './keys'
import { CATEGORY_ORDER } from './palette-model'
import { COMMANDS } from './registry'
import styles from './KeyboardShortcuts.module.css'

const IS_FIREFOX = typeof navigator !== 'undefined' && /Firefox\//.test(navigator.userAgent)

/** Every command a key can be set on, by category, as the dialog lists them. */
const BINDABLE: readonly Command[] = CATEGORY_ORDER.flatMap((category) =>
  COMMANDS.filter((command) => command.category === category && command.bindable !== false))

/** What the last change said: why a key was refused, that it is the browser's too, or which command lost it. */
interface Note {
  readonly command: string
  readonly kind: 'refused' | 'warning' | 'moved'
  readonly text: string
}

/**
 * The keys in effect, by command, each changeable: *Change* records the next key pressed (Escape cancels), *Remove*
 * takes the keys off, *Reset* brings the defaults back. A key the browser keeps is refused, one it uses is warned
 * about, and one set on another command moves, the dialog saying which. The view-local keys follow, read only.
 */
export const KeyboardShortcuts = ({ onClose }: { onClose(): void }) => {
  const dialog = useRef<HTMLDialogElement>(null)
  const { bindings, overrides, setOverrides } = useKeybindingsContext()
  const [query, setQuery] = useState('')
  const [recording, setRecording] = useState<string | null>(null)
  const [note, setNote] = useState<Note | null>(null)
  const label = (key: string) => keyLabel(key, IS_APPLE)
  const titleOf = (id: string) => COMMANDS.find((command) => command.id === id)?.title ?? id

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  // While recording, the next key is the new one: nothing else gets it, the dispatcher included.
  useEffect(() => {
    if (!recording) return
    const onKey = (event: KeyboardEvent) => {
      const key = keyOf(event, IS_APPLE)
      if (!key) return
      event.preventDefault()
      event.stopImmediatePropagation()
      setRecording(null)
      if (key === 'escape') return
      const kept = keptKeyReason(key, IS_APPLE, IS_FIREFOX)
      if (kept) return setNote({ command: recording, kind: 'refused', text: kept })
      const changed = replaceKeys(DEFAULT_KEYS, overrides, IS_APPLE, recording, key)
      setOverrides(changed.overrides)
      const warning = usedKeyWarning(key, IS_APPLE)
      if (changed.moved) setNote({ command: recording, kind: 'moved', text: `${label(key)} was ${titleOf(changed.moved)}'s.` })
      else if (warning) setNote({ command: recording, kind: 'warning', text: warning })
      else setNote(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [recording, overrides, setOverrides])

  const wanted = norm(query).trim()
  const matches = (command: Command) =>
    wanted === '' || tierOf(wanted, command.title, [[command.category], keysOf(bindings, command.id).map(label)]) !== undefined
  const shown = BINDABLE.filter(matches)

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-label="Keyboard shortcuts"
      onCancel={(event) => {
        event.preventDefault()
        if (!recording) onClose()
      }}
    >
      <div className={styles.body}>
        <header className={styles.header}>
          <h2>Keyboard shortcuts</h2>
          <input aria-label="Search shortcuts" placeholder="Search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </header>
        <div className={styles.list}>
          {CATEGORY_ORDER.map((category) => {
            const commands = shown.filter((command) => command.category === category)
            if (commands.length === 0) return null
            return (
              <section key={category} aria-label={category}>
                <h3>{category}</h3>
                {commands.map((command) => {
                  const keys = keysOf(bindings, command.id)
                  const changed = command.id in overrides
                  return (
                    <div key={command.id} role="group" aria-label={command.title} className={styles.row}>
                      <span className={styles.title}>{command.title}</span>
                      <span className={styles.keys}>
                        {recording === command.id
                          ? <em>Press a key… (Esc cancels)</em>
                          : keys.length === 0 ? <span className={styles.none}>—</span> : keys.map((key) => <kbd key={key}>{label(key)}</kbd>)}
                      </span>
                      <span className={styles.buttons}>
                        <button type="button" onClick={() => { setNote(null); setRecording(command.id) }}>Change</button>
                        <button type="button" disabled={keys.length === 0} onClick={() => setOverrides(keys.reduce((next, key) => removeKey(DEFAULT_KEYS, next, IS_APPLE, command.id, key), overrides))}>Remove</button>
                        {changed && <button type="button" onClick={() => setOverrides(resetKeys(overrides, command.id))}>Reset</button>}
                      </span>
                      {note?.command === command.id && (
                        <p className={styles.note} role={note.kind === 'refused' ? 'alert' : 'status'}>{note.text}</p>
                      )}
                    </div>
                  )
                })}
              </section>
            )
          })}
          {wanted === '' && (
            <section aria-label="In the views">
              <h3>In the views</h3>
              {VIEW_KEYS.map((row) => (
                <div key={`${row.where} ${row.what}`} className={styles.row}>
                  <span className={styles.title}>{row.where}: {row.what}</span>
                  <span className={styles.keys}>{row.keys.map((key) => <kbd key={key}>{label(key)}</kbd>)}</span>
                </div>
              ))}
            </section>
          )}
        </div>
        <footer className={styles.footer}>
          <button type="button" disabled={Object.keys(overrides).length === 0} onClick={() => setOverrides({})}>Reset all</button>
          <button type="button" onClick={onClose}>Close</button>
        </footer>
      </div>
    </dialog>
  )
}
