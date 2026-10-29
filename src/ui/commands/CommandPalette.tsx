import { type CommandContext, runAction, runCommand, selectionSubjects } from '@state'
import { useEffect, useId, useRef, useState } from 'react'
import { useKeybindingsContext } from './CommandHost'
import { keysOf } from './keybindings'
import { IS_APPLE, keyLabel } from './keys'
import { INITIAL, type PaletteAction, type PaletteRow, type PaletteState, rankRows, step, withRecent } from './palette-model'
import { commandRows, subjectRows } from './palette-rows'
import { COMMANDS, commandById } from './registry'
import styles from './CommandPalette.module.css'

/** The commands run from the palette in this session, newest first; nothing about the palette is saved. */
let recent: readonly string[] = []

interface CommandPaletteProps {
  /** What the palette was opened over: the focused view and its subjects. */
  readonly context: CommandContext
  /** Where the focus goes back to on closing. */
  readonly returnTo: HTMLElement | null
  onClose(): void
}

/**
 * Finds any command, and anything that can be done to what is focused or selected, by typing. A `combobox` field that
 * owns a `listbox`, as QuickAdd; its behaviour is in `palette-model.ts`. The rows are built when it opens and after
 * each keystroke. Closing puts the focus back where it was, except after an action that takes it (*Rename*).
 */
export const CommandPalette = ({ context, returnTo, onClose }: CommandPaletteProps) => {
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const { bindings } = useKeybindingsContext()
  const [state, setState] = useState<PaletteState>(INITIAL)
  const keyOf = (command: string) => {
    const key = keysOf(bindings, command)[0]
    return key === undefined ? undefined : keyLabel(key, IS_APPLE)
  }
  const rows = rankRows(
    [...commandRows(COMMANDS, context, keyOf), ...subjectRows(context.focus, selectionSubjects(), context)],
    state.query,
    recent,
  )

  const close = (focusBack = true) => {
    onClose()
    if (focusBack) returnTo?.focus({ preventScroll: true })
  }

  const run = (row: PaletteRow) => {
    close(!row.takesFocus)
    recent = withRecent(recent, row)
    const { target } = row
    if (target.kind === 'action') void runAction(target.action, target.subject, context, { choice: target.choice })
    else {
      const command = commandById(target.command)
      if (command) void runCommand(command, context, target.choice)
    }
  }

  /** Runs one step of the model and acts on what it says. */
  const send = (action: PaletteAction): boolean => {
    const result = step(rows, state, action)
    setState(result.state)
    if (result.run) run(result.run)
    else if (result.close) close()
    return result.handled
  }

  useEffect(() => {
    input.current?.focus()
    // A press anywhere else closes it, leaving the focus where the press puts it.
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
    // Opened once per use; `onClose` is stable for that long.
  }, [])

  useEffect(() => {
    root.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [state.active, rows.length])

  const optionId = (index: number) => `${listId}-${index}`

  return (
    <div
      ref={root}
      className={styles.palette}
      role="dialog"
      aria-label="Commands"
      data-testid="command-palette"
      // The focus leaving it (Tab) closes it too.
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null)) onClose()
      }}
    >
      <input
        ref={input}
        className={styles.field}
        type="text"
        role="combobox"
        aria-label="Command"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={rows.length > 0 ? optionId(state.active) : undefined}
        aria-autocomplete="list"
        placeholder="Type a command, or what to do to the selection"
        value={state.query}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => send({ type: 'input', query: event.target.value })}
        onKeyDown={(event) => {
          if (send({ type: 'key', key: event.key })) {
            event.preventDefault()
            event.stopPropagation()
          }
        }}
      />
      {rows.length === 0 && <div className={styles.empty}>Nothing matches</div>}
      <ul id={listId} role="listbox" aria-label="Commands" className={styles.list}>
        {rows.map((row, index) => (
          <li
            key={row.id}
            id={optionId(index)}
            role="option"
            aria-selected={index === state.active}
            aria-disabled={!row.enabled || undefined}
            title={row.tooltip}
            className={`${styles.row} ${index === state.active ? styles.active : ''}`}
            // Keep the focus in the field: a press on a row must not blur it.
            onPointerDown={(event) => event.preventDefault()}
            onPointerEnter={() => state.active !== index && send({ type: 'hover', index })}
            onClick={() => send({ type: 'activate', index })}
          >
            <span className={styles.label}>{row.label}</span>
            {row.key && <kbd className={styles.key}>{row.key}</kbd>}
          </li>
        ))}
      </ul>
    </div>
  )
}
