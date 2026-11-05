import { ActionMenu } from '../shared/menu'
import { RenameField } from '../shared/RenameField'
import type { ControlTarget } from '@core'
import type { ReactNode } from 'react'
import { type ControlSize, type ModuleLibrary, type PanelItem, describeNode } from '@core'
import { type DragEvent, useState } from 'react'
import { IndicatorFace } from '../shared/indicators/IndicatorFace'
import { ControlWidget, type ParamChange, isSettable } from './ControlWidget'
import styles from './panel.module.css'
import { fitSpan, knobWidth, spanOf } from './panel-values'

export type { ParamChange }

/** What the edit mode can do to a control. */
export interface CellActions {
  rename(name: string): void
  resize(size: ControlSize): void
  /** Turn a slider upright or sideways. */
  setHorizontal(horizontal: boolean): void
  /** Takes it off the board; the node stays in the graph (deleting it is the graph's job). */
  hide(): void
  /** Move by one place (-1 earlier, 1 later). */
  move(delta: -1 | 1): void
  /** The control with this id was dropped on this one. */
  dropped(draggedId: string): void
}

interface ControlCellProps {
  midiTargets?: readonly ControlTarget[]
  feedback?: ReactNode
  item: PanelItem
  modules: ModuleLibrary
  /** What the control is called: its node's name, or its type numbered when alike. */
  title: string
  editing: boolean
  /** Where an indicator gets its live value (see `PanelView`). */
  readoutTrack?: string
  /** The board's columns: a wider control takes these (see `fitSpan`). */
  columns: number
  first: boolean
  last: boolean
  onSet(changes: readonly ParamChange[]): void
  actions: CellActions
}

/** The data type of a control dragged to another place on the panel; the cells accept nothing else. */
const CONTROL_TYPE = 'application/x-sfxlab-control'

const NEXT_SIZE: Record<ControlSize, ControlSize> = { S: 'M', M: 'L', L: 'S' }

export const ControlCell = ({ item, modules, title, editing, readoutTrack, columns, first, last, onSet, actions, feedback, midiTargets = [] }: ControlCellProps) => {
  const [over, setOver] = useState(false)
  const { node } = item
  const shape = describeNode(node, modules)
  const span = fitSpan(spanOf(item), columns, item.kind)

  const widget = (() => {
    if (!shape) return <p className={styles.missing}>{title} is not available</p>
    if (isSettable(item.kind)) return <ControlWidget kind={item.kind} horizontal={item.horizontal} node={node} shape={shape} title={title} onSet={onSet} />
    return <IndicatorFace node={node} kind={item.kind} label={title} track={readoutTrack} />
  })()

  const onDragOver = (event: DragEvent) => {
    if (!editing || !event.dataTransfer.types.includes(CONTROL_TYPE)) return
    event.preventDefault()
    setOver(true)
  }

  return (
    <ActionMenu subject={midiTargets.length ? { kind: 'control', targets: midiTargets } : null}><div
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
        const dragged = event.dataTransfer.getData(CONTROL_TYPE)
        if (editing && dragged) {
          event.preventDefault()
          actions.dropped(dragged)
        }
      }}
    >
      <div className={styles.widget}>{widget}{feedback}</div>
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
              event.dataTransfer.setData(CONTROL_TYPE, node.id)
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
          <RenameField className={styles.rename} name={node.name ?? ''} placeholder={title} label={`Name of ${title}`} allowEmpty onCommit={actions.rename} />
        </div>
      )}
    </div></ActionMenu>
  )
}
