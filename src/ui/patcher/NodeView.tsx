import type { MenuEntry } from '../shared/menu'
import { ContextMenu } from '../shared/menu'
import type { NodeShape, PatchNode, PortRef } from '@core'
import { nodeTooltip, portTooltip } from '../shared/tooltip/tooltip-text'
import { HEADER_HEIGHT, MODULE_FOOTER_HEIGHT, NODE_WIDTH, PORT_ROW_HEIGHT } from './geometry'
import styles from './Patcher.module.css'
import { useNodeDrag } from './use-node-drag'

interface NodeViewProps {
  node: PatchNode
  shape: NodeShape
  /** What the node is called here: its name, or its type numbered when alike. */
  title: string
  /** Parameters a wire is driving, with what drives each: their sockets show it. */
  driven: ReadonlyMap<string, string>
  /** Runs once on the mix of all voices (effects), rather than once per voice. */
  shared: boolean
  selected: boolean
  /** Present for uses of a module: open its inside / make this use an independent copy. */
  moduleActions?: { onOpen(): void; onUnlink(): void }
  /** The right-click menu of an input: create a knob, disconnect. Empty for none (the port then has no menu). */
  inputMenu(portId: string): readonly MenuEntry[]
  /** `additive` is true when Shift/Ctrl/Cmd was held, to add to or remove from the selection. */
  onSelect(additive: boolean): void
  onMove(x: number, y: number): void
  onRemove(): void
  onWireStart(from: PortRef): void
  onWireEnd(to: PortRef): void
}

/**
 * A card is a title, its sockets and nothing else: what a node is set to lives in the property editor (select the
 * card), so a patch reads as wiring. Cards show only state that matters at a glance (shared, stereo, bypassed, module).
 */
export const NodeView = ({
  node,
  shape,
  title,
  driven,
  shared,
  selected,
  moduleActions,
  inputMenu,
  onSelect,
  onMove,
  onRemove,
  onWireStart,
  onWireEnd,
}: NodeViewProps) => {
  const drag = useNodeDrag(node.x, node.y, onMove)
  const rows = Math.max(shape.inputs.length, shape.outputs.length)
  // A socket shows its parameter's facts; a control's own range is the live one.
  const paramSpecOf = (paramId: string | undefined) => shape.params.find((candidate) => candidate.id === paramId)

  return (
    <div
      className={`${styles.node} ${selected ? styles.selected : ''} ${node.bypassed ? styles.nodeBypassed : ''}`}
      style={{ left: node.x, top: node.y, width: NODE_WIDTH }}
      data-testid={`node-${node.id}`}
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
          {title}
          {moduleActions && <em className={styles.moduleTag}>module</em>}
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
        <button
          className={styles.remove}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onRemove}
          aria-label={`Remove ${title}`}
        >
          ×
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

      {moduleActions && (
        <div className={styles.moduleFooter} style={{ height: MODULE_FOOTER_HEIGHT }}>
          <button onClick={moduleActions.onOpen} title="Edit the module; every use of it changes">
            Edit
          </button>
          <button onClick={moduleActions.onUnlink} title="Replace this use by an independent copy of its contents">
            Unlink
          </button>
        </div>
      )}
    </div>
  )
}
