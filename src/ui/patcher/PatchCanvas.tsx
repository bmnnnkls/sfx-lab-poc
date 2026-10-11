import {
  type ModuleLibrary,
  type NodeShape,
  type Patch,
  type PatchNode,
  type PortRef,
  MODULE_NODE_TYPE,
  classifyStages,
  describeNode,
  flattenPatch,
} from '@core'
import { type PointerEvent, useMemo, useRef, useState } from 'react'
import { NODE_WIDTH, type Point, nodeHeight } from './geometry'
import { NodeView } from './NodeView'
import styles from './Patcher.module.css'
import { WireLayer } from './WireLayer'

interface PatchCanvasProps {
  patch: Patch
  modules: ModuleLibrary
  selected: ReadonlySet<string>
  /** The track whose graph this is. */
  ownerTrackId: string
  /** Sound patches have voice / shared stages to show; note graphs do not. */
  showStages: boolean
  onSelectionChange(selected: ReadonlySet<string>): void
  onMoveNode(nodeId: string, x: number, y: number): void
  onRemoveNode(nodeId: string): void
  onParamChange(nodeId: string, paramId: string, value: number): void
  onSampleChange(nodeId: string, sampleId: string | null): void
  onTrackChange(nodeId: string, trackId: string | null): void
  onBypassChange(nodeId: string, bypassed: boolean): void
  onStereoChange(nodeId: string, stereo: boolean): void
  onConnect(from: PortRef, to: PortRef): void
  onDisconnect(connectionId: string): void
  onOpenModule(moduleId: string): void
  onUnlinkModule(nodeId: string): void
}

const PADDING = 120
/** Smaller drags on empty canvas are clicks (which clear the selection) rather than selection boxes. */
const MIN_BOX = 4

interface Box {
  readonly from: Point
  readonly to: Point
  readonly additive: boolean
}

const boxOf = ({ from, to }: Box) => ({
  left: Math.min(from.x, to.x),
  top: Math.min(from.y, to.y),
  right: Math.max(from.x, to.x),
  bottom: Math.max(from.y, to.y),
})

/** Scrollable node canvas: nodes as HTML, wires as SVG, wiring by dragging output -> input. */
export const PatchCanvas = ({
  patch,
  modules,
  selected,
  ownerTrackId,
  showStages,
  onSelectionChange,
  onMoveNode,
  onRemoveNode,
  onParamChange,
  onSampleChange,
  onTrackChange,
  onBypassChange,
  onStereoChange,
  onConnect,
  onDisconnect,
  onOpenModule,
  onUnlinkModule,
}: PatchCanvasProps) => {
  const surface = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState<{ from: PortRef; pointer: Point } | null>(null)
  const [box, setBox] = useState<Box | null>(null)

  // Which stage a node runs in is decided on the flattened patch; a module counts as shared when any of its insides is.
  const stages = useMemo(() => (showStages ? classifyStages(flattenPatch(patch, modules)) : new Map()), [patch, modules, showStages])
  const isShared = (node: PatchNode): boolean => {
    if (node.type !== MODULE_NODE_TYPE) return stages.get(node.id) === 'shared'
    return [...stages].some(([id, stage]) => stage === 'shared' && id.startsWith(`${node.id}/`))
  }

  const shapes = useMemo(() => {
    const map = new Map<string, NodeShape>()
    for (const node of patch.nodes) {
      const shape = describeNode(node, modules)
      if (shape) map.set(node.id, shape)
    }
    return map
  }, [patch, modules])
  const visible = patch.nodes.filter((node) => shapes.has(node.id))

  const width = Math.max(...visible.map((node) => node.x + NODE_WIDTH), 0) + PADDING
  const height =
    Math.max(
      ...visible.map((node) => node.y + nodeHeight(shapes.get(node.id)!, node.type === MODULE_NODE_TYPE)),
      0,
    ) + PADDING

  const pointerIn = (event: PointerEvent): Point => {
    const bounds = surface.current?.getBoundingClientRect()
    return { x: event.clientX - (bounds?.left ?? 0), y: event.clientY - (bounds?.top ?? 0) }
  }

  const select = (nodeId: string, additive: boolean) => {
    if (!additive) {
      if (!selected.has(nodeId)) onSelectionChange(new Set([nodeId]))
      return
    }
    const next = new Set(selected)
    if (!next.delete(nodeId)) next.add(nodeId)
    onSelectionChange(next)
  }

  const finishBox = (finished: Box) => {
    const area = boxOf(finished)
    if (area.right - area.left < MIN_BOX && area.bottom - area.top < MIN_BOX) {
      if (!finished.additive) onSelectionChange(new Set())
      return
    }
    const hit = visible.filter((node) => {
      const nodeBottom = node.y + nodeHeight(shapes.get(node.id)!, node.type === MODULE_NODE_TYPE)
      return node.x < area.right && node.x + NODE_WIDTH > area.left && node.y < area.bottom && nodeBottom > area.top
    })
    onSelectionChange(new Set([...(finished.additive ? selected : []), ...hit.map((node) => node.id)]))
  }

  return (
    <div className={styles.scroller}>
      <div
        ref={surface}
        className={styles.surface}
        style={{ width, height }}
        data-testid="patch-surface"
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget || event.button !== 0) return
          event.currentTarget.setPointerCapture(event.pointerId)
          const point = pointerIn(event)
          setBox({ from: point, to: point, additive: event.shiftKey || event.ctrlKey || event.metaKey })
        }}
        onPointerMove={(event) => {
          if (box) setBox({ ...box, to: pointerIn(event) })
          else if (pending) setPending({ ...pending, pointer: pointerIn(event) })
        }}
        onPointerUp={() => {
          if (box) finishBox(box)
          setBox(null)
          setPending(null)
        }}
        onPointerLeave={() => setPending(null)}
      >
        <WireLayer patch={patch} modules={modules} pending={pending} onDisconnect={onDisconnect} />
        {visible.map((node) => (
          <NodeView
            key={node.id}
            node={node}
            shape={shapes.get(node.id)!}
            shared={isShared(node)}
            selected={selected.has(node.id)}
            ownerTrackId={ownerTrackId}
            moduleActions={
              node.type === MODULE_NODE_TYPE && node.moduleId
                ? { onOpen: () => onOpenModule(node.moduleId!), onUnlink: () => onUnlinkModule(node.id) }
                : undefined
            }
            onSelect={(additive) => select(node.id, additive)}
            onMove={(x, y) => onMoveNode(node.id, x, y)}
            onRemove={() => onRemoveNode(node.id)}
            onParamChange={(paramId, value) => onParamChange(node.id, paramId, value)}
            onSampleChange={(sampleId) => onSampleChange(node.id, sampleId)}
            onTrackChange={(trackId) => onTrackChange(node.id, trackId)}
            onBypassChange={(bypassed) => onBypassChange(node.id, bypassed)}
            onStereoChange={(stereo) => onStereoChange(node.id, stereo)}
            onWireStart={(from) => setPending({ from, pointer: { x: node.x, y: node.y } })}
            onWireEnd={(to) => pending && onConnect(pending.from, to)}
          />
        ))}
        {box && (
          <div
            className={styles.marquee}
            style={{
              left: boxOf(box).left,
              top: boxOf(box).top,
              width: boxOf(box).right - boxOf(box).left,
              height: boxOf(box).bottom - boxOf(box).top,
            }}
          />
        )}
      </div>
    </div>
  )
}
