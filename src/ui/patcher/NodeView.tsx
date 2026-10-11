import type { NodeShape, PatchNode, PortRef } from '@core'
import { HEADER_HEIGHT, MODULE_FOOTER_HEIGHT, NODE_WIDTH, PORT_ROW_HEIGHT } from './geometry'
import { ParamControl } from './ParamControl'
import { SamplePicker } from './SamplePicker'
import styles from './Patcher.module.css'
import { useNodeDrag } from './use-node-drag'

interface NodeViewProps {
  node: PatchNode
  shape: NodeShape
  /** Runs once on the mix of all voices (effects), rather than once per voice. */
  shared: boolean
  selected: boolean
  /** Present for uses of a module: open its inside / make this use an independent copy. */
  moduleActions?: { onOpen(): void; onUnlink(): void }
  /** `additive` is true when Shift/Ctrl/Cmd was held, to add to or remove from the selection. */
  onSelect(additive: boolean): void
  onMove(x: number, y: number): void
  onRemove(): void
  onParamChange(paramId: string, value: number): void
  onSampleChange(sampleId: string | null): void
  onWireStart(from: PortRef): void
  onWireEnd(to: PortRef): void
}

export const NodeView = ({
  node,
  shape,
  shared,
  selected,
  moduleActions,
  onSelect,
  onMove,
  onRemove,
  onParamChange,
  onSampleChange,
  onWireStart,
  onWireEnd,
}: NodeViewProps) => {
  const drag = useNodeDrag(node.x, node.y, onMove)
  const rows = Math.max(shape.inputs.length, shape.outputs.length)

  return (
    <div
      className={`${styles.node} ${selected ? styles.selected : ''}`}
      style={{ left: node.x, top: node.y, width: NODE_WIDTH }}
      data-testid={`node-${node.id}`}
      data-selected={selected}
    >
      <div
        className={styles.nodeHeader}
        style={{ height: HEADER_HEIGHT }}
        {...drag}
        onPointerDown={(event) => {
          onSelect(event.shiftKey || event.ctrlKey || event.metaKey)
          drag.onPointerDown(event)
        }}
      >
        <span className={styles.nodeTitle}>
          {shape.label}
          {moduleActions && <em className={styles.moduleTag}>module</em>}
          {shared && (
            <em className={styles.sharedTag} title="Runs once on the mixed signal of all voices">
              shared
            </em>
          )}
        </span>
        <button
          className={styles.remove}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onRemove}
          aria-label={`Remove ${shape.label}`}
        >
          ×
        </button>
      </div>

      <div className={styles.ports}>
        {Array.from({ length: rows }, (_, row) => {
          const input = shape.inputs[row]
          const output = shape.outputs[row]
          return (
            <div key={row} className={styles.portRow} style={{ height: PORT_ROW_HEIGHT }}>
              {input ? (
                <span
                  className={`${styles.port} ${styles.inPort}`}
                  data-testid={`in-${node.id}-${input.id}`}
                  onPointerUp={() => onWireEnd({ node: node.id, port: input.id })}
                >
                  <i className={styles.dot} />
                  {input.label}
                </span>
              ) : (
                <span />
              )}
              {output && (
                <span
                  className={`${styles.port} ${styles.outPort}`}
                  data-testid={`out-${node.id}-${output.id}`}
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

      {shape.usesSample && <SamplePicker sampleId={node.sampleId} onChange={onSampleChange} />}

      {shape.params.map((spec) => (
        <ParamControl
          key={spec.id}
          spec={spec}
          value={node.params[spec.id] ?? spec.default}
          onChange={(value) => onParamChange(spec.id, value)}
        />
      ))}

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
