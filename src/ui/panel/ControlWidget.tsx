import { type NodeShape, type PanelItem, type PatchNode } from '@core'
import { Fader, Knob, Selector, Toggle, XYPad } from '../controls'
import { axisSpec, defaultPosition, keyStep, positionOf, readValue, valueAt } from './panel-values'

/** One value to put into a parameter of the control's node. */
export interface ParamChange {
  readonly param: string
  readonly value: number
}

/** The kinds of control that are widgets you set (the others are indicators). */
export type SettableKind = 'knob' | 'slider' | 'xy' | 'switch' | 'selector'

export const isSettable = (kind: PanelItem['kind']): kind is SettableKind => kind === 'knob' || kind === 'slider' || kind === 'xy' || kind === 'switch' || kind === 'selector'

interface ControlWidgetProps {
  kind: SettableKind
  /** A slider lying down. */
  horizontal: boolean
  node: PatchNode
  shape: NodeShape
  title: string
  onSet(changes: readonly ParamChange[]): void
}

/**
 * The working widget of a control node: a knob, a slider, an XY pad, a switch or a selector, writing the node's own value. The same
 * widget sits on the front panel and on the node's card, so a control looks and behaves alike wherever it is.
 */
export const ControlWidget = ({ kind, horizontal, node, shape, title, onSet }: ControlWidgetProps) => {
    switch (kind) {
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
        return kind === 'knob' ? <Knob {...common} /> : <Fader {...common} vertical={!horizontal} />
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
}
