import type { NodeShape, Patch, PortRef } from '@core'
import { type Point, portPosition, wirePath } from './geometry'
import styles from './Patcher.module.css'

interface WireLayerProps {
  patch: Patch
  /** What each card draws (`visibleShape`): wire ends are placed by their row in it. */
  shapes: ReadonlyMap<string, NodeShape>
  /** A wire currently being dragged from an output port to the pointer. */
  pending: { from: PortRef; pointer: Point } | null
  onDisconnect(connectionId: string): void
}

const portPoint = (
  patch: Patch,
  shapes: ReadonlyMap<string, NodeShape>,
  ref: PortRef,
  direction: 'inputs' | 'outputs',
): Point | null => {
  const node = patch.nodes.find((candidate) => candidate.id === ref.node)
  const shape = shapes.get(ref.node)
  return node && shape ? portPosition(node, shape, direction, ref.port) : null
}

/** What a wire carries, from the output it starts at: notes, stereo and control wires are drawn differently from sound. */
const wireKind = (shapes: ReadonlyMap<string, NodeShape>, ref: PortRef): string | undefined =>
  shapes.get(ref.node)?.outputs.find((port) => port.id === ref.port)?.kind

const wireClass = (kind: string | undefined): string =>
  kind === 'notes'
    ? styles.noteWire ?? ''
    : kind === 'stereo'
      ? styles.stereoWire ?? ''
      : kind === 'control'
        ? styles.controlWire ?? ''
        : ''

export const WireLayer = ({ patch, shapes, pending, onDisconnect }: WireLayerProps) => {
  const pendingStart = pending ? portPoint(patch, shapes, pending.from, 'outputs') : null

  return (
    <svg className={styles.wires}>
      {patch.connections.map((connection) => {
        const from = portPoint(patch, shapes, connection.from, 'outputs')
        const to = portPoint(patch, shapes, connection.to, 'inputs')
        if (!from || !to) return null
        const path = wirePath(from, to)
        return (
          <g key={connection.id}>
            <path d={path} className={`${styles.wire} ${wireClass(wireKind(shapes, connection.from))}`} />
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
