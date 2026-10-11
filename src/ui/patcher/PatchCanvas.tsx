import { type Patch, type PortRef, requireNodeDefinition } from '@core'
import { type PointerEvent, useRef, useState } from 'react'
import { NODE_WIDTH, type Point, nodeHeight } from './geometry'
import { NodeView } from './NodeView'
import styles from './Patcher.module.css'
import { WireLayer } from './WireLayer'

interface PatchCanvasProps {
  patch: Patch
  onMoveNode(nodeId: string, x: number, y: number): void
  onRemoveNode(nodeId: string): void
  onParamChange(nodeId: string, paramId: string, value: number): void
  onConnect(from: PortRef, to: PortRef): void
  onDisconnect(connectionId: string): void
}

const PADDING = 120

/** Scrollable node canvas: nodes as HTML, wires as SVG, wiring by dragging output -> input. */
export const PatchCanvas = ({
  patch,
  onMoveNode,
  onRemoveNode,
  onParamChange,
  onConnect,
  onDisconnect,
}: PatchCanvasProps) => {
  const surface = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState<{ from: PortRef; pointer: Point } | null>(null)

  const width = Math.max(...patch.nodes.map((node) => node.x + NODE_WIDTH), 0) + PADDING
  const height =
    Math.max(...patch.nodes.map((node) => node.y + nodeHeight(requireNodeDefinition(node.type))), 0) + PADDING

  const trackPointer = (event: PointerEvent) => {
    if (!pending || !surface.current) return
    const bounds = surface.current.getBoundingClientRect()
    setPending({ ...pending, pointer: { x: event.clientX - bounds.left, y: event.clientY - bounds.top } })
  }

  return (
    <div className={styles.scroller}>
      <div
        ref={surface}
        className={styles.surface}
        style={{ width, height }}
        onPointerMove={trackPointer}
        onPointerUp={() => setPending(null)}
        onPointerLeave={() => setPending(null)}
      >
        <WireLayer patch={patch} pending={pending} onDisconnect={onDisconnect} />
        {patch.nodes.map((node) => (
          <NodeView
            key={node.id}
            node={node}
            onMove={(x, y) => onMoveNode(node.id, x, y)}
            onRemove={() => onRemoveNode(node.id)}
            onParamChange={(paramId, value) => onParamChange(node.id, paramId, value)}
            onWireStart={(from) => setPending({ from, pointer: { x: node.x, y: node.y } })}
            onWireEnd={(to) => pending && onConnect(pending.from, to)}
          />
        ))}
      </div>
    </div>
  )
}
