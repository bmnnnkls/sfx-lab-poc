import { type PatchNode, type PortRef, requireNodeDefinition } from '@core'
import { HEADER_HEIGHT, NODE_WIDTH, PORT_ROW_HEIGHT } from './geometry'
import { ParamControl } from './ParamControl'
import { SamplePicker } from './SamplePicker'
import styles from './Patcher.module.css'
import { useNodeDrag } from './use-node-drag'

interface NodeViewProps {
  node: PatchNode
  /** Runs once on the mix of all voices (effects), rather than once per voice. */
  shared: boolean
  onMove(x: number, y: number): void
  onRemove(): void
  onParamChange(paramId: string, value: number): void
  onSampleChange(sampleId: string | null): void
  onWireStart(from: PortRef): void
  onWireEnd(to: PortRef): void
}

export const NodeView = ({
  node,
  shared,
  onMove,
  onRemove,
  onParamChange,
  onSampleChange,
  onWireStart,
  onWireEnd,
}: NodeViewProps) => {
  const definition = requireNodeDefinition(node.type)
  const drag = useNodeDrag(node.x, node.y, onMove)
  const rows = Math.max(definition.inputs.length, definition.outputs.length)

  return (
    <div className={styles.node} style={{ left: node.x, top: node.y, width: NODE_WIDTH }}>
      <div className={styles.nodeHeader} style={{ height: HEADER_HEIGHT }} {...drag}>
        <span>
          {definition.label}
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
          aria-label={`Remove ${definition.label}`}
        >
          ×
        </button>
      </div>

      <div className={styles.ports}>
        {Array.from({ length: rows }, (_, row) => {
          const input = definition.inputs[row]
          const output = definition.outputs[row]
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

      {definition.usesSample && <SamplePicker sampleId={node.sampleId} onChange={onSampleChange} />}

      {definition.params.map((spec) => (
        <ParamControl
          key={spec.id}
          spec={spec}
          value={node.params[spec.id] ?? spec.default}
          onChange={(value) => onParamChange(spec.id, value)}
        />
      ))}
    </div>
  )
}
