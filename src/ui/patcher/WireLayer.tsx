import { type ModuleLibrary, type Patch, type PortRef, describeNode } from '@core'
import { type Point, portPosition, wirePath } from './geometry'
import styles from './Patcher.module.css'

interface WireLayerProps {
  patch: Patch
  modules: ModuleLibrary
  /** A wire currently being dragged from an output port to the pointer. */
  pending: { from: PortRef; pointer: Point } | null
  onDisconnect(connectionId: string): void
}

const portPoint = (
  patch: Patch,
  modules: ModuleLibrary,
  ref: PortRef,
  direction: 'inputs' | 'outputs',
): Point | null => {
  const node = patch.nodes.find((candidate) => candidate.id === ref.node)
  const shape = node && describeNode(node, modules)
  return node && shape ? portPosition(node, shape, direction, ref.port) : null
}

export const WireLayer = ({ patch, modules, pending, onDisconnect }: WireLayerProps) => {
  const pendingStart = pending ? portPoint(patch, modules, pending.from, 'outputs') : null

  return (
    <svg className={styles.wires}>
      {patch.connections.map((connection) => {
        const from = portPoint(patch, modules, connection.from, 'outputs')
        const to = portPoint(patch, modules, connection.to, 'inputs')
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
