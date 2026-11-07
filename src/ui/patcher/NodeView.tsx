import { type Subject, runAction } from '@state'
import { Icon } from '../shared/icon'
import type { MenuEntry } from '../shared/menu'
import { ActionMenu, ContextMenu, useActionContext } from '../shared/menu'
import { InPlaceRename } from '../shared/RenameField'
import { type NodeShape, type PatchNode, type PortRef, controlKindFor } from '@core'
import { nodeTooltip, portTooltip } from '../shared/tooltip/tooltip-text'
import { HEADER_HEIGHT, MODULE_FOOTER_HEIGHT, NODE_WIDTH, PORT_ROW_HEIGHT, PREVIEW_AREA_HEIGHT, liveWidgetHeight } from './geometry'
import styles from './Patcher.module.css'
import { type ParamChange, ControlWidget, isSettable } from '../panel/ControlWidget'
import { IndicatorFace } from '../shared/indicators/IndicatorFace'
import { NodePreview } from './previews/NodePreview'
import type { Preview } from './previews'
import { useNodeDrag } from './use-node-drag'

interface NodeViewProps {
  zoom: number
  node: PatchNode
  shape: NodeShape
  /** What the node is called here: its name, or its type numbered when alike. */
  title: string
  /** Parameters a wire is driving, with what drives each: their sockets show it. */
  driven: ReadonlyMap<string, string>
  /** A picture of what the node does with its settings, when it has one (`previews/`); `moving` when a moving signal drives a setting. */
  picture?: { preview: Preview; moving: boolean }
  /** Sets values on the node: a control's widget on the card writes its own value, as it does on the panel and in the property editor. */
  onSetParams(changes: readonly ParamChange[]): void
  /** Where an indicator card gets its live value: the track the engine reports it under (absent inside a module). */
  readoutTrack?: string
  /** Runs once on the mix of all voices (effects), rather than once per voice. */
  shared: boolean
  selected: boolean
  /** What its menu acts on: the selection when the card is selected, otherwise the card alone. */
  subject: Extract<Subject, { kind: 'nodes' }>
  /** A use of a module: its footer opens its inside or makes this use an independent copy. */
  moduleUse: boolean
  /**
   * Which parameter sockets the card draws, for a node that has any: the `wired` ones only, all of them because its
   * own toggle is on (`shown`), or all because the toolbar's Sockets is on (`all`, which the card's toggle can't undo).
   */
  sockets?: 'wired' | 'shown' | 'all'
  onToggleSockets(): void
  /** The right-click menu of an input: create a knob, disconnect. Empty for none (the port then has no menu). */
  inputMenu(portId: string): readonly MenuEntry[]
  /** `additive` is true when Shift/Ctrl/Cmd was held, to add to or remove from the selection. */
  onSelect(additive: boolean): void
  onMove(x: number, y: number): void
  onWireStart(from: PortRef): void
  onWireEnd(to: PortRef): void
}

/**
 * A card is a title, its sockets and, where it helps, a small picture of what the node does with its settings. What a node is
 * set to lives in the property editor (select the
 * card), so a patch reads as wiring. Cards show only state that matters at a glance (shared, stereo, bypassed, module).
 */
export const NodeView = ({
  node,
  zoom,
  shape,
  title,
  driven,
  picture,
  readoutTrack,
  onSetParams,
  shared,
  selected,
  subject,
  moduleUse,
  sockets,
  onToggleSockets,
  inputMenu,
  onSelect,
  onMove,
  onWireStart,
  onWireEnd,
}: NodeViewProps) => {
  const drag = useNodeDrag(node.x, node.y, onMove, zoom)
  const rows = Math.max(shape.inputs.length, shape.outputs.length)
  // A socket shows its parameter's facts; a control's own range is the live one.
  const paramSpecOf = (paramId: string | undefined) => shape.params.find((candidate) => candidate.id === paramId)
  const context = useActionContext()
  // The card's own buttons act on it alone, whatever else is selected.
  const own: Subject = { ...subject, nodeIds: [node.id] }

  return (
    <ActionMenu subject={subject}>
    <div
      className={`${styles.node} ${selected ? styles.selected : ''} ${node.bypassed ? styles.nodeBypassed : ''}`}
      style={{ left: node.x, top: node.y, width: NODE_WIDTH }}
      data-testid={`node-${node.id}`}
      data-node={node.id}
      data-selected={selected}
      onPointerDown={(event) => {
        // A press on the body selects the card too, but never one on a port, button or the header (which also drags).
        if (event.target instanceof Element && !event.target.closest('[data-port], button, [data-header]')) onSelect(event.shiftKey || event.ctrlKey || event.metaKey)
      }}
    >
      <div
        className={styles.nodeHeader}
        style={{ height: HEADER_HEIGHT }}
        data-header
        {...drag}
        onPointerDown={(event) => {
          onSelect(event.shiftKey || event.ctrlKey || event.metaKey)
          drag.onPointerDown(event)
        }}
      >
        <span className={styles.nodeTitle} data-tooltip={nodeTooltip(shape) || undefined}>
          <InPlaceRename subject={own} name={node.name ?? title} label={`Name of ${title}`}>
            {title}
          </InPlaceRename>
          {moduleUse && <em className={styles.moduleTag}>module</em>}
          {node.stereo === true && shape.stereoCapable && (
            <em className={styles.stereoTag} data-tooltip="Runs in stereo: one copy of the node per channel.">
              L R
            </em>
          )}
          {shared && (
            <em className={styles.sharedTag} data-tooltip="Runs once on the mixed signal of all voices.">
              shared
            </em>
          )}
        </span>
        {sockets && (
          <button
            className={styles.cardSockets}
            aria-pressed={sockets !== 'wired'}
            disabled={sockets === 'all'}
            data-tooltip={
              sockets === 'all'
                ? 'Every socket shows: Sockets is on in the toolbar.'
                : sockets === 'shown'
                  ? 'Hide the sockets nothing is wired to.'
                  : "Show a socket for each of this node's parameters, so a wire can drive it."
            }
            aria-label={`${sockets === 'wired' ? 'Show' : 'Hide'} the parameter sockets of ${title}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={onToggleSockets}
          >
            <Icon name="modulation" size={14} />
          </button>
        )}
        <button
          className={styles.remove}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => runAction('nodes.delete', own, context)}
          aria-label={`Remove ${title}`}
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      <div className={styles.ports}>
        {Array.from({ length: rows }, (_, row) => {
          const input = shape.inputs[row]
          const output = shape.outputs[row]
          const menu = input ? inputMenu(input.id) : []
          const inputElement = input && (
            <span
              className={`${styles.port} ${styles.inPort} ${input.kind === 'control' ? styles.controlPort : ''}`}
              data-port
              data-testid={`in-${node.id}-${input.id}`}
              data-tooltip={portTooltip(input, paramSpecOf(input.param), input.param === undefined ? undefined : driven.get(input.param)) || undefined}
              onPointerUp={() => onWireEnd({ node: node.id, port: input.id })}
            >
              <i className={styles.dot} />
              {input.label}
            </span>
          )
          return (
            <div key={row} className={styles.portRow} style={{ height: PORT_ROW_HEIGHT }}>
              {inputElement ? menu.length > 0 ? <ContextMenu entries={menu}>{inputElement}</ContextMenu> : inputElement : <span />}
              {output && (
                <span
                  className={`${styles.port} ${styles.outPort} ${output.kind === 'control' ? styles.controlPort : ''}`}
                  data-port
                  data-testid={`out-${node.id}-${output.id}`}
                  data-tooltip={portTooltip(output) || undefined}
                  onPointerDown={(event) => {
                    event.stopPropagation()
                    onWireStart({ node: node.id, port: output.id })
                  }}
                >
                  {output.label}
                  <i className={styles.dot} />
                </span>
              )}
            </div>
          )
        })}
      </div>

      {picture && <NodePreview preview={picture.preview} moving={picture.moving} />}
      {(() => {
        const control = controlKindFor(node, shape.panelKind)
        if (!control || !isSettable(control.kind)) return null
        // The control itself, working, where a picture would be: turn it here or on the panel, it is the same value.
        return (
          <div className={styles.liveWidget} style={{ height: liveWidgetHeight(shape) }} data-hide-labels data-testid={`widget-${node.id}`}>
            <ControlWidget kind={control.kind} horizontal={control.kind === 'slider'} node={node} shape={shape} title={title} onSet={onSetParams} />
          </div>
        )
      })()}
      {shape.indicator === true && (shape.panelKind === 'led' || shape.panelKind === 'display' || shape.panelKind === 'bar') && (
        <div className={styles.indicatorFace} style={{ height: PREVIEW_AREA_HEIGHT }}>
          <IndicatorFace node={node} kind={shape.panelKind} label={title} track={readoutTrack} showLabel={false} />
        </div>
      )}

      {moduleUse && (
        <div className={styles.moduleFooter} style={{ height: MODULE_FOOTER_HEIGHT }}>
          <button onClick={() => runAction('nodes.open-module', own, context)} title="Edit the module; every use of it changes">
            Edit
          </button>
          <button onClick={() => runAction('nodes.unlink', own, context)} title="Replace this use by an independent copy of its contents">
            Unlink
          </button>
        </div>
      )}
    </div>
    </ActionMenu>
  )
}
