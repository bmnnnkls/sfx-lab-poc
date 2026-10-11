import { type ControlSize, type ModuleLibrary, type PanelControl, type ParamBinding, type Patch, resolveBinding } from '@core'
import { type DragEvent, useState } from 'react'
import { Fader, Knob, Selector, XYPad } from '../controls'
import styles from './panel.module.css'
import { defaultPosition, keyStep, knobWidth, positionOf, readValue, spanOf, valueAt, valueOf } from './panel-values'

/** One value to put into a node parameter. */
export interface ParamChange {
  readonly binding: ParamBinding
  readonly value: number
}

/** What the edit mode can do to a control. */
export interface CellActions {
  rename(label: string): void
  resize(size: ControlSize): void
  setOrientation(orientation: 'vertical' | 'horizontal'): void
  remove(): void
  /** Move by one place (-1 earlier, 1 later). */
  move(delta: -1 | 1): void
  /** The control with this id was dropped on this one. */
  dropped(draggedId: string): void
}

interface ControlCellProps {
  control: PanelControl
  patch: Patch
  modules: ModuleLibrary
  /** The node names, as the panel shows them (numbered when alike). */
  titles: ReadonlyMap<string, string>
  editing: boolean
  first: boolean
  last: boolean
  onSet(changes: readonly ParamChange[], mergeKey: string): void
  actions: CellActions
}

const NEXT_SIZE: Record<ControlSize, ControlSize> = { S: 'M', M: 'L', L: 'S' }

/** The name field of edit mode: edits are kept until Enter or leaving the field, so an emptied field is not refused halfway. */
const RenameField = ({ label, onCommit }: { label: string; onCommit(label: string): void }) => {
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const commit = () => {
    if (draft !== undefined && draft.trim() !== '') onCommit(draft)
    setDraft(undefined)
  }
  return (
    <input
      className={styles.rename}
      value={draft ?? label}
      aria-label={`Name of ${label}`}
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

/** A control on the board: the widget for its kind, wired to its parameters, with the edit tools around it in edit mode. */
export const ControlCell = ({ control, patch, modules, titles, editing, first, last, onSet, actions }: ControlCellProps) => {
  const [over, setOver] = useState(false)
  const x = resolveBinding(patch, modules, control.bind)
  const y = control.bindY ? resolveBinding(patch, modules, control.bindY) : undefined
  const span = spanOf(control, x?.options?.length)
  const caption =
    control.bindY && control.bindY.node !== control.bind.node
      ? `${titles.get(control.bind.node) ?? ''} / ${titles.get(control.bindY.node) ?? ''}`
      : (titles.get(control.bind.node) ?? '')
  const key = `panel:${control.id}`

  const widget = (() => {
    if (!x || (control.kind === 'xy' && !y)) {
      return <p className={styles.missing}>{control.label} is not available</p>
    }
    const value = valueOf(patch, control.bind, x)
    switch (control.kind) {
      case 'knob':
        return (
          <Knob
            label={control.label}
            position={positionOf(x, value)}
            valueText={readValue(x, value)}
            defaultPosition={defaultPosition(x)}
            step={keyStep(x)}
            onChange={(position) => onSet([{ binding: control.bind, value: valueAt(x, position) }], key)}
          />
        )
      case 'slider':
        return (
          <Fader
            label={control.label}
            position={positionOf(x, value)}
            valueText={readValue(x, value)}
            defaultPosition={defaultPosition(x)}
            step={keyStep(x)}
            vertical={control.orientation !== 'horizontal'}
            onChange={(position) => onSet([{ binding: control.bind, value: valueAt(x, position) }], key)}
          />
        )
      case 'selector':
        return (
          <Selector
            label={control.label}
            options={x.options ?? []}
            index={Math.round(value)}
            onChange={(index) => onSet([{ binding: control.bind, value: index }], key)}
          />
        )
      case 'xy': {
        if (!y || !control.bindY) return null
        const yValue = valueOf(patch, control.bindY, y)
        const bindY = control.bindY
        return (
          <XYPad
            label={control.label}
            x={positionOf(x, value)}
            y={positionOf(y, yValue)}
            valueText={`X ${readValue(x, value)}, Y ${readValue(y, yValue)}`}
            defaultX={defaultPosition(x)}
            defaultY={defaultPosition(y)}
            step={Math.min(keyStep(x), keyStep(y))}
            onChange={(position) =>
              onSet(
                [
                  { binding: control.bind, value: valueAt(x, position.x) },
                  { binding: bindY, value: valueAt(y, position.y) },
                ],
                key,
              )
            }
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
      style={{ gridColumn: `span ${span.cols}`, gridRow: `span ${span.rows}`, ['--knob-max' as string]: `${knobWidth(control.size)}px` }}
      data-kind={control.kind}
      data-editing={editing || undefined}
      data-drop={over || undefined}
      data-testid={`control-${control.id}`}
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
      <span className={styles.caption} title={caption}>
        {caption}
      </span>
      <div className={styles.widget}>{widget}</div>
      {editing && (
        <div className={styles.tools}>
          <span
            className={styles.handle}
            draggable
            title="Drag to reorder"
            aria-label={`Drag ${control.label} to reorder`}
            onDragStart={(event) => {
              event.dataTransfer.setData('text/plain', control.id)
              event.dataTransfer.effectAllowed = 'move'
            }}
          >
            ⠿
          </span>
          <button aria-label={`Move ${control.label} earlier`} disabled={first} onClick={() => actions.move(-1)}>
            ◀
          </button>
          <button aria-label={`Move ${control.label} later`} disabled={last} onClick={() => actions.move(1)}>
            ▶
          </button>
          {control.kind !== 'selector' && (
            <button aria-label={`Resize ${control.label}`} title={`Size ${control.size}: click for the next`} onClick={() => actions.resize(NEXT_SIZE[control.size])}>
              {control.size}
            </button>
          )}
          {control.kind === 'slider' && (
            <button
              aria-label={`Turn ${control.label} ${control.orientation === 'horizontal' ? 'upright' : 'sideways'}`}
              onClick={() => actions.setOrientation(control.orientation === 'horizontal' ? 'vertical' : 'horizontal')}
            >
              {control.orientation === 'horizontal' ? '↕' : '↔'}
            </button>
          )}
          <button aria-label={`Remove ${control.label}`} title="Remove from the panel" onClick={actions.remove}>
            ×
          </button>
          <RenameField label={control.label} onCommit={actions.rename} />
        </div>
      )}
    </div>
  )
}
