import { type ControlSize, type ModuleLibrary, type PanelItem, describeNode } from '@core'
import { type DragEvent, useState } from 'react'
import { IndicatorFace } from '../shared/indicators/IndicatorFace'
import { ControlWidget, type ParamChange, isSettable } from './ControlWidget'
import styles from './panel.module.css'
import { knobWidth, spanOf } from './panel-values'

export type { ParamChange }

/** What the edit mode can do to a control. */
export interface CellActions {
  rename(name: string): void
  resize(size: ControlSize): void
  /** Turn a slider upright or sideways. */
  setHorizontal(horizontal: boolean): void
  hide(): void
  /** Deletes the node: it goes from the graph too. */
  remove(): void
  /** Move by one place (-1 earlier, 1 later). */
  move(delta: -1 | 1): void
  /** The control with this id was dropped on this one. */
  dropped(draggedId: string): void
}

interface ControlCellProps {
  item: PanelItem
  modules: ModuleLibrary
  /** What the control is called: its node's name, or its type numbered when alike. */
  title: string
  editing: boolean
  /** Where an indicator gets its live value (see `PanelView`). */
  readoutTrack?: string
  first: boolean
  last: boolean
  onSet(changes: readonly ParamChange[]): void
  actions: CellActions
}

const NEXT_SIZE: Record<ControlSize, ControlSize> = { S: 'M', M: 'L', L: 'S' }

/** The name field of edit mode: kept until Enter or leaving the field, since a name is trimmed as it is applied. */
const RenameField = ({ name, placeholder, onCommit }: { name: string; placeholder: string; onCommit(name: string): void }) => {
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const commit = () => {
    if (draft !== undefined && draft !== name) onCommit(draft)
    setDraft(undefined)
  }
  return (
    <input
      className={styles.rename}
      value={draft ?? name}
      placeholder={placeholder}
      aria-label={`Name of ${placeholder}`}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(undefined)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

/** A control node on the board: the widget for its kind, writing the node's own value, with the edit tools around it in edit mode. */
export const ControlCell = ({ item, modules, title, editing, readoutTrack, first, last, onSet, actions }: ControlCellProps) => {
  const [over, setOver] = useState(false)
  const { node } = item
  const shape = describeNode(node, modules)
  const span = spanOf(item)

  const widget = (() => {
    if (!shape) return <p className={styles.missing}>{title} is not available</p>
    if (isSettable(item.kind)) return <ControlWidget kind={item.kind} horizontal={item.horizontal} node={node} shape={shape} title={title} onSet={onSet} />
    return <IndicatorFace node={node} kind={item.kind} label={title} track={readoutTrack} />
  })()

  const onDragOver = (event: DragEvent) => {
    if (!editing) return
    event.preventDefault()
    setOver(true)
  }

  return (
    <div
      className={styles.cell}
      style={{ gridColumn: `span ${span.cols}`, gridRow: `span ${span.rows}`, ['--knob-max' as string]: `${knobWidth(item.size)}px` }}
      data-kind={item.kind}
      data-editing={editing || undefined}
      data-drop={over || undefined}
      data-testid={`control-${node.id}`}
      onDragOver={onDragOver}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        setOver(false)
        const dragged = event.dataTransfer.getData('text/plain')
        if (editing && dragged) {
          event.preventDefault()
          actions.dropped(dragged)
        }
      }}
    >
      <div className={styles.widget}>{widget}</div>
      {editing && item.via && (
        <div className={styles.tools}>
          <span className={styles.hint} data-tooltip="This control is inside a module: move, size, hide and rename it in the module (Edit on its card). Its value here is this use's own.">
            in a module
          </span>
        </div>
      )}
      {editing && !item.via && (
        <div className={styles.tools}>
          <span
            className={styles.handle}
            draggable
            title="Drag to reorder"
            aria-label={`Drag ${title} to reorder`}
            onDragStart={(event) => {
              event.dataTransfer.setData('text/plain', node.id)
              event.dataTransfer.effectAllowed = 'move'
            }}
          >
            ⠿
          </span>
          <button aria-label={`Move ${title} earlier`} disabled={first} onClick={() => actions.move(-1)}>
            ◀
          </button>
          <button aria-label={`Move ${title} later`} disabled={last} onClick={() => actions.move(1)}>
            ▶
          </button>
          <button aria-label={`Resize ${title}`} title={`Size ${item.size}: click for the next`} onClick={() => actions.resize(NEXT_SIZE[item.size])}>
            {item.size}
          </button>
          {item.kind === 'slider' && (
            <button aria-label={`Turn ${title} ${item.horizontal ? 'upright' : 'sideways'}`} onClick={() => actions.setHorizontal(!item.horizontal)}>
              {item.horizontal ? '↕' : '↔'}
            </button>
          )}
          <button aria-label={`Hide ${title}`} title="Hide from the panel (it stays in the graph)" onClick={actions.hide}>
            ◌
          </button>
          <button aria-label={`Remove ${title}`} title="Delete the control node, in the graph too" onClick={actions.remove}>
            ×
          </button>
          <RenameField name={node.name ?? ''} placeholder={title} onCommit={actions.rename} />
        </div>
      )}
    </div>
  )
}
