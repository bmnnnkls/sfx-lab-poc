import { type ControlSize, type ModuleLibrary, type PanelItem, describeNode } from '@core'
import { type DragEvent, useState } from 'react'
import { Fader, Knob, Selector, Toggle, XYPad } from '../controls'
import styles from './panel.module.css'
import { axisSpec, defaultPosition, keyStep, knobWidth, positionOf, readValue, spanOf, valueAt } from './panel-values'

/** One value to put into a parameter of the control's node. */
export interface ParamChange {
  readonly param: string
  readonly value: number
}

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
export const ControlCell = ({ item, modules, title, editing, first, last, onSet, actions }: ControlCellProps) => {
  const [over, setOver] = useState(false)
  const { node } = item
  const shape = describeNode(node, modules)
  const span = spanOf(item)

  const widget = (() => {
    if (!shape) return <p className={styles.missing}>{title} is not available</p>
    switch (item.kind) {
      case 'knob':
      case 'slider': {
        const spec = axisSpec(node, shape, 'value')
        if (!spec) return null
        const value = node.params.value ?? spec.default
        const common = {
          label: title,
          position: positionOf(spec, value),
          valueText: readValue(spec, value),
          defaultPosition: defaultPosition(spec),
          step: keyStep(spec),
          onChange: (position: number) => onSet([{ param: 'value', value: valueAt(spec, position) }]),
        }
        return item.kind === 'knob' ? <Knob {...common} /> : <Fader {...common} vertical={!item.horizontal} />
      }
      case 'xy': {
        const x = axisSpec(node, shape, 'x')
        const y = axisSpec(node, shape, 'y')
        if (!x || !y) return null
        const xValue = node.params.x ?? x.default
        const yValue = node.params.y ?? y.default
        return (
          <XYPad
            label={title}
            x={positionOf(x, xValue)}
            y={positionOf(y, yValue)}
            valueText={`X ${readValue(x, xValue)}, Y ${readValue(y, yValue)}`}
            defaultX={defaultPosition(x)}
            defaultY={defaultPosition(y)}
            step={Math.min(keyStep(x), keyStep(y))}
            onChange={(position) =>
              onSet([
                { param: 'x', value: valueAt(x, position.x) },
                { param: 'y', value: valueAt(y, position.y) },
              ])
            }
          />
        )
      }
      case 'switch':
        return (
          <Toggle
            label={title}
            on={(node.params.on ?? 0) >= 0.5}
            momentary={Math.round(node.params.mode ?? 0) >= 1}
            onChange={(on) => onSet([{ param: 'on', value: on ? 1 : 0 }])}
          />
        )
      case 'selector': {
        const count = Math.max(2, Math.round(node.params.count ?? 4))
        return (
          <Selector
            label={title}
            options={Array.from({ length: count }, (_, position) => String(position + 1))}
            index={Math.min(count - 1, Math.max(0, Math.round(node.params.index ?? 0)))}
            onChange={(position) => onSet([{ param: 'index', value: position }])}
          />
        )
      }
    }
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
