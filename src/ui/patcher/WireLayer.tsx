import { type Patch, type PortRef, requireNodeDefinition } from '@core'
import { type Point, portPosition, wirePath } from './geometry'
import styles from './Patcher.module.css'

interface WireLayerProps {
  patch: Patch
  /** A wire currently being dragged from an output port to the pointer. */
  pending: { from: PortRef; pointer: Point } | null
  onDisconnect(connectionId: string): void
}

const outputPoint = (patch: Patch, ref: PortRef): Point | null => {
  const node = patch.nodes.find((candidate) => candidate.id === ref.node)
  return node ? portPosition(node, requireNodeDefinition(node.type), 'outputs', ref.port) : null
}

const inputPoint = (patch: Patch, ref: PortRef): Point | null => {
  const node = patch.nodes.find((candidate) => candidate.id === ref.node)
  return node ? portPosition(node, requireNodeDefinition(node.type), 'inputs', ref.port) : null
}

export const WireLayer = ({ patch, pending, onDisconnect }: WireLayerProps) => {
  const pendingStart = pending ? outputPoint(patch, pending.from) : null

  return (
    <svg className={styles.wires}>
      {patch.connections.map((connection) => {
        const from = outputPoint(patch, connection.from)
        const to = inputPoint(patch, connection.to)
        if (!from || !to) return null
        const path = wirePath(from, to)
        return (
          <g key={connection.id}>
            <path d={path} className={styles.wire} />
            <path
              d={path}
              className={styles.wireHit}
              onClick={() => onDisconnect(connection.id)}
              data-testid={`wire-${connection.id}`}
            >
              <title>Click to disconnect</title>
            </path>
          </g>
        )
      })}
      {pending && pendingStart && (
        <path d={wirePath(pendingStart, pending.pointer)} className={`${styles.wire} ${styles.pending}`} />
      )}
    </svg>
  )
}
