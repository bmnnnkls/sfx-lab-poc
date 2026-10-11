import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { type Point } from './geometry'
import { type Catalog, type CatalogEntry } from './node-catalog'
import { popupPosition } from './placement'
import { INITIAL, type QuickAddAction, type QuickAddState, rowsOf, step } from './quick-add-model'
import styles from './QuickAdd.module.css'

interface QuickAddProps {
  catalog: Catalog
  /** Where the popup opens, in window pixels (the pointer, or the Add button). */
  anchor: Point
  /** What the list is limited to, when it is ("Can take Out of Clip notes"); shown in place of "Categories". */
  heading?: string
  onPick(entry: CatalogEntry): void
  onClose(): void
}

const SIZE = { width: 340, height: 380 }

/**
 * The node picker: a text field and a list under it, opened by double-clicking the canvas, Shift+A or the Add button.
 * All behaviour is in `quick-add-model.ts` (pure, tested); this only forwards events to it and draws the rows. A
 * `combobox` that owns a `listbox`, with the highlighted row named by `aria-activedescendant`.
 */
export const QuickAdd = ({ catalog, anchor, heading, onPick, onClose }: QuickAddProps) => {
  const listId = useId()
  const input = useRef<HTMLInputElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState(() => popupPosition(anchor, SIZE, { width: window.innerWidth, height: window.innerHeight }))
  const [state, setState] = useState<QuickAddState>(INITIAL)
  const rows = rowsOf(catalog, state)

  /** Runs one step of the model and acts on what it says. */
  const send = (action: QuickAddAction): boolean => {
    const result = step(catalog, state, action)
    setState(result.state)
    if (result.pick) onPick(result.pick)
    if (result.close) onClose()
    return result.handled
  }

  useEffect(() => {
    input.current?.focus()
    // A press anywhere else closes it, like a menu.
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) onClose()
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
    // The popup is opened once per use; `onClose` is stable for that long.
  }, [])

  // Keep the popup inside the window by its real size once it has one.
  useLayoutEffect(() => {
    const size = root.current?.getBoundingClientRect()
    if (size) setPosition(popupPosition(anchor, size, { width: window.innerWidth, height: window.innerHeight }))
  }, [rows.length])

  useEffect(() => {
    root.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [state.active, rows.length])

  const optionId = (index: number) => `${listId}-${index}`

  return (
    <div ref={root} className={styles.popup} style={{ left: position.x, top: position.y, width: SIZE.width }} data-testid="quick-add">
      <input
        ref={input}
        className={styles.field}
        type="text"
        role="combobox"
        aria-label="Add a node"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={rows.length > 0 ? optionId(state.active) : undefined}
        aria-autocomplete="list"
        placeholder={state.scope ? `${state.scope}: type to search everything` : 'Add a node: type to search'}
        value={state.query}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => send({ type: 'input', query: event.target.value })}
        onKeyDown={(event) => {
          // Shift+A must not type into the field of the popup it opened, and nothing here should reach the canvas.
          event.stopPropagation()
          if (send({ type: 'key', key: event.key })) event.preventDefault()
        }}
      />
      <div className={styles.crumb} aria-live="polite">
        {state.scope && !state.query ? (
          <>
            <button type="button" className={styles.up} onPointerDown={(event) => event.preventDefault()} onClick={() => send({ type: 'key', key: 'Backspace' })}>
              ‹ All
            </button>
            <span>{state.scope}</span>
          </>
        ) : (
          <span>{rows.length === 0 ? 'Nothing matches' : state.query ? `${rows.length} found` : (heading ?? 'Categories')}</span>
        )}
      </div>
      <ul id={listId} role="listbox" aria-label="Nodes" className={styles.list}>
        {rows.map((row, index) => (
          <li
            key={row.kind === 'category' ? `c:${row.name}` : row.entry.id}
            id={optionId(index)}
            role="option"
            aria-selected={index === state.active}
            data-kind={row.kind}
            data-label={row.kind === 'entry' ? row.entry.label : row.name}
            className={`${styles.row} ${index === state.active ? styles.active : ''}`}
            // Keep the focus in the field: a press on a row must not blur it.
            onPointerDown={(event) => event.preventDefault()}
            onPointerEnter={() => state.active !== index && send({ type: 'hover', index })}
            onClick={() => send({ type: 'activate', index })}
          >
            {row.kind === 'category' ? (
              <>
                <span className={styles.label}>{row.name}</span>
                <span className={styles.meta}>{row.count} ›</span>
              </>
            ) : (
              <>
                <span className={styles.label}>{row.entry.label}</span>
                <span className={styles.meta}>{row.entry.category}</span>
                {row.entry.description && <span className={styles.description}>{row.entry.description}</span>}
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
