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
import { type PointerEvent, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { NODE_WIDTH, type Point, nodeHeight } from './geometry'
import { NodeView } from './NodeView'
import { nodeTitles } from '../panel/panel-values'
import { drivenParams, visibleShape } from './visible-shape'
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
  /** Draw every parameter socket, not only the wired ones. */
  showSockets: boolean
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
  /** The user asked for the node picker: double-click on empty canvas, or Shift+A over it. `at` is in canvas coordinates, `anchor` in window pixels. */
  onRequestAdd(request: { anchor: Point; at: Point }): void
}

export interface PatchCanvasHandle {
  /** The middle of what is on screen, in canvas coordinates: where the Add button puts a node. */
  visibleCenter(): Point
}

/** Two presses on empty canvas this close in time and place are a double-click. */
const DOUBLE_MS = 450
const DOUBLE_PX = 8

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
export const PatchCanvas = forwardRef<PatchCanvasHandle, PatchCanvasProps>(function PatchCanvas({
  patch,
  modules,
  selected,
  ownerTrackId,
  showStages,
  showSockets,
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
  onRequestAdd,
}, handle) {
  const surface = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  /** The last empty-canvas press and the selection it was about to clear, to tell a double-click and to keep the selection through it. */
  const lastPress = useRef<{ time: number; at: Point; selection: ReadonlySet<string> } | null>(null)
  const pointer = useRef<{ client: Point; canvas: Point; over: boolean }>({ client: { x: 0, y: 0 }, canvas: { x: 0, y: 0 }, over: false })
  const [pending, setPending] = useState<{ from: PortRef; pointer: Point } | null>(null)
  const [box, setBox] = useState<Box | null>(null)

  useImperativeHandle(handle, () => ({
    visibleCenter: () => {
      const view = scroller.current
      return view ? { x: view.scrollLeft + view.clientWidth / 2, y: view.scrollTop + view.clientHeight / 2 } : { x: 300, y: 200 }
    },
  }))

  // Shift+A over the canvas opens the picker at the pointer (not while typing in a field).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'a' || !event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      if (!pointer.current.over) return
      event.preventDefault()
      onRequestAdd({ anchor: pointer.current.client, at: pointer.current.canvas })
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

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
      if (shape) map.set(node.id, visibleShape(shape, node.id, patch, showSockets))
    }
    return map
  }, [patch, modules, showSockets])
  const titles = useMemo(() => nodeTitles(patch, modules), [patch, modules])
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
    <div
      ref={scroller}
      className={styles.scroller}
      onPointerEnter={() => (pointer.current.over = true)}
      onPointerLeave={() => (pointer.current.over = false)}
    >
      <div
        ref={surface}
        className={styles.surface}
        style={{ width, height }}
        data-testid="patch-surface"
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget || event.button !== 0) return
          const point = pointerIn(event)
          const last = lastPress.current
          if (last && event.timeStamp - last.time < DOUBLE_MS && Math.hypot(point.x - last.at.x, point.y - last.at.y) < DOUBLE_PX) {
            // A double-click: the first press already cleared the selection, so put it back, draw no box, and ask for the picker.
            lastPress.current = null
            onSelectionChange(last.selection)
            onRequestAdd({ anchor: { x: event.clientX, y: event.clientY }, at: point })
            return
          }
          lastPress.current = { time: event.timeStamp, at: point, selection: selected }
          event.currentTarget.setPointerCapture(event.pointerId)
          setBox({ from: point, to: point, additive: event.shiftKey || event.ctrlKey || event.metaKey })
        }}
        onPointerMove={(event) => {
          pointer.current.client = { x: event.clientX, y: event.clientY }
          pointer.current.canvas = pointerIn(event)
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
        <WireLayer patch={patch} shapes={shapes} pending={pending} onDisconnect={onDisconnect} />
        {visible.map((node) => (
          <NodeView
            key={node.id}
            node={node}
            shape={shapes.get(node.id)!}
            driven={drivenParams(node.id, shapes.get(node.id)!, patch, (id) => titles.get(id) ?? '')}
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
})
