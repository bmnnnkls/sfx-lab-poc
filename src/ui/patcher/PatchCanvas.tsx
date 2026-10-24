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
  resolveParams,
} from '@core'
import { useProjectStore } from '@state'
import { type PointerEvent, forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { NODE_WIDTH, type Point, nodeHeight } from './geometry'
import type { MenuEntry } from '../shared/menu'
import type { ParamChange } from '../panel/ControlWidget'
import { NodeView } from './NodeView'
import { nodeTitles } from '@core'
import { hasPreview, nodePreview } from './previews'
import { drivenParams, visibleShape } from './visible-shape'
import styles from './Patcher.module.css'
import { WireLayer } from './WireLayer'
import { canvasPoint, MAX_ZOOM, MIN_ZOOM, zoomAt, type Viewport } from './viewport'

interface PatchCanvasProps {
  patch: Patch
  modules: ModuleLibrary
  selected: ReadonlySet<string>
  /** Sound patches have voice / shared stages to show; note graphs do not. */
  showStages: boolean
  /** Draw every parameter socket, not only the wired ones. */
  showSockets: boolean
  /** Where indicator cards get their live value (see `PanelView`). */
  readoutTrack?: string
  onSelectionChange(selected: ReadonlySet<string>): void
  onMoveNode(nodeId: string, x: number, y: number): void
  /** A control's widget on its card changed its value. */
  onSetNodeParams(nodeId: string, changes: readonly ParamChange[]): void
  onRemoveNode(nodeId: string): void
  /** The right-click menu of an input port of a node (empty: none). */
  inputMenu(nodeId: string, portId: string): readonly MenuEntry[]
  onConnect(from: PortRef, to: PortRef): void
  onDisconnect(connectionId: string): void
  onOpenModule(moduleId: string): void
  onUnlinkModule(nodeId: string): void
  /**
   * The user asked for the node picker: double-click on empty canvas, or Shift+A over it, or a wire dropped there (`from` is
   * then the output it was dragged from). `at` is in canvas coordinates, `anchor` in window pixels.
   */
  onRequestAdd(request: { anchor: Point; at: Point; from?: PortRef }): void
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

/** Pannable, zoomable node canvas: nodes as HTML, wires as SVG, wiring by dragging output -> input. */
export const PatchCanvas = forwardRef<PatchCanvasHandle, PatchCanvasProps>(function PatchCanvas({
  patch,
  modules,
  selected,
  showStages,
  showSockets,
  readoutTrack,
  onSetNodeParams,
  onSelectionChange,
  onMoveNode,
  onRemoveNode,
  inputMenu,
  onConnect,
  onDisconnect,
  onOpenModule,
  onUnlinkModule,
  onRequestAdd,
}, handle) {
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, zoom: 1 })
  const viewRef = useRef(view)
  const [handTool, setHandTool] = useState(false)
  const [panning, setPanning] = useState(false)
  const pan = useRef<{ pointer: Point; view: Viewport } | null>(null)
  const updateView = (next: Viewport) => {
    viewRef.current = next
    setView(next)
    const bounds = scroller.current?.getBoundingClientRect()
    if (bounds) pointer.current.canvas = canvasPoint({
      x: pointer.current.client.x - bounds.left, y: pointer.current.client.y - bounds.top,
    }, next)
  }
  const tempo = useProjectStore(s => s.project.tempo)
  const scroller = useRef<HTMLDivElement>(null)
  /** The last empty-canvas press and the selection it was about to clear, to tell a double-click and to keep the selection through it. */
  const lastPress = useRef<{ time: number; at: Point; selection: ReadonlySet<string> } | null>(null)
  const pointer = useRef<{ client: Point; canvas: Point; over: boolean }>({ client: { x: 0, y: 0 }, canvas: { x: 0, y: 0 }, over: false })
  const [pending, setPending] = useState<{ from: PortRef; pointer: Point } | null>(null)
  const [box, setBox] = useState<Box | null>(null)

  useImperativeHandle(handle, () => ({
    visibleCenter: () => {
      const view = scroller.current
      return view ? canvasPoint({ x: view.clientWidth / 2, y: view.clientHeight / 2 }, viewRef.current) : { x: 300, y: 200 }
    },
  }))

  // A non-passive listener prevents browser/page zoom during trackpad pinch and Ctrl+wheel.
  useEffect(() => {
    const element = scroller.current
    if (!element) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const current = viewRef.current
      const bounds = element.getBoundingClientRect()
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1
      if (event.ctrlKey || event.metaKey) {
        updateView(zoomAt(current, current.zoom * Math.exp(-event.deltaY * unit * 0.01), {
          x: event.clientX - bounds.left, y: event.clientY - bounds.top,
        }))
      } else {
        updateView({ ...current, x: current.x - (event.shiftKey ? event.deltaY : event.deltaX) * unit,
          y: current.y - (event.shiftKey ? 0 : event.deltaY) * unit })
      }
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  const zoom = (factor: number) => {
    const element = scroller.current
    if (element) updateView(zoomAt(viewRef.current, viewRef.current.zoom * factor, {
      x: element.clientWidth / 2, y: element.clientHeight / 2,
    }))
  }

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
  // The picture of each node that has one, from the numbers it is working with: a wire into a socket counts for its value.
  const pictures = useMemo(() => {
    const map = new Map<string, { preview: NonNullable<ReturnType<typeof nodePreview>>; moving: boolean }>()
    for (const node of patch.nodes) {
      if (!hasPreview(node.type)) continue
      const { values, moving } = resolveParams(patch, node.id)
      const preview = nodePreview(node.type, { ...values, previewTempo: tempo })
      if (preview) map.set(node.id, { preview, moving: moving.size > 0 })
    }
    return map
  }, [patch, tempo])
  const titles = useMemo(() => nodeTitles(patch, modules), [patch, modules])
  const visible = patch.nodes.filter((node) => shapes.has(node.id))

  const width = Math.max(...visible.map((node) => node.x + NODE_WIDTH), 0) + PADDING
  const height =
    Math.max(
      ...visible.map((node) => node.y + nodeHeight(shapes.get(node.id)!, node.type === MODULE_NODE_TYPE, pictures.has(node.id))),
      0,
    ) + PADDING

  const pointerIn = (event: PointerEvent): Point => {
    const bounds = scroller.current?.getBoundingClientRect()
    return canvasPoint({ x: event.clientX - (bounds?.left ?? 0), y: event.clientY - (bounds?.top ?? 0) }, viewRef.current)
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
      const nodeBottom = node.y + nodeHeight(shapes.get(node.id)!, node.type === MODULE_NODE_TYPE, pictures.has(node.id))
      return node.x < area.right && node.x + NODE_WIDTH > area.left && node.y < area.bottom && nodeBottom > area.top
    })
    onSelectionChange(new Set([...(finished.additive ? selected : []), ...hit.map((node) => node.id)]))
  }

  const isBackground = (target: EventTarget | null) => target instanceof HTMLElement &&
    (target === scroller.current || target.dataset.testid === 'patch-surface')

  return (
    <div className={styles.canvasHost}>
      <div
        ref={scroller}
        className={styles.scroller}
        style={{ backgroundPosition: `${view.x}px ${view.y}px`, backgroundSize: `${20 * view.zoom}px ${20 * view.zoom}px` }}
        data-testid="graph-viewport"
        data-panning={panning}
        data-hand-tool={handTool}
        onPointerEnter={() => (pointer.current.over = true)}
        onPointerLeave={() => (pointer.current.over = false)}
        onPointerDownCapture={(event) => {
          if (event.button !== 1 && !(handTool && event.button === 0)) return
          event.preventDefault()
          event.stopPropagation()
          event.currentTarget.setPointerCapture(event.pointerId)
          pan.current = { pointer: { x: event.clientX, y: event.clientY }, view: viewRef.current }
          lastPress.current = null
          setPanning(true)
        }}
        onPointerDown={(event) => {
          if (!isBackground(event.target) || event.button !== 0 || pan.current) return
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
          if (pan.current) {
            const start = pan.current
            updateView({ ...start.view, x: start.view.x + event.clientX - start.pointer.x,
              y: start.view.y + event.clientY - start.pointer.y })
            pointer.current.canvas = pointerIn(event)
            return
          }
          if (box) setBox({ ...box, to: pointerIn(event) })
          else if (pending) setPending({ ...pending, pointer: pointerIn(event) })
        }}
        onPointerUp={(event) => {
          if (pan.current) {
            pan.current = null
            setPanning(false)
            if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
            return
          }
          if (box) finishBox(box)
          // A wire let go of on empty canvas asks where it should go: the picker, offering what can take it.
          if (pending && isBackground(event.target)) {
            onRequestAdd({ anchor: { x: event.clientX, y: event.clientY }, at: pointerIn(event), from: pending.from })
          }
          setBox(null)
          setPending(null)
        }}
        onPointerCancel={() => { pan.current = null; setPanning(false); setBox(null); setPending(null) }}
        onLostPointerCapture={() => { pan.current = null; setPanning(false); setBox(null) }}
      >
        <div
          className={styles.surface}
          style={{ width, height, minWidth: `${100 / view.zoom}%`, minHeight: `${100 / view.zoom}%`,
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
          data-testid="patch-surface"
        >
          <WireLayer patch={patch} shapes={shapes} pending={pending} onDisconnect={onDisconnect} />
          {visible.map((node) => (
            <NodeView
              key={node.id}
              node={node}
              zoom={view.zoom}
              shape={shapes.get(node.id)!}
              title={titles.get(node.id) ?? node.type}
              picture={pictures.get(node.id)}
              readoutTrack={readoutTrack}
              onSetParams={(changes) => onSetNodeParams(node.id, changes)}
              driven={drivenParams(node.id, shapes.get(node.id)!, patch, (id) => titles.get(id) ?? '')}
              inputMenu={(portId) => inputMenu(node.id, portId)}
              shared={isShared(node)}
              selected={selected.has(node.id)}
              moduleActions={
                node.type === MODULE_NODE_TYPE && node.moduleId
                  ? { onOpen: () => onOpenModule(node.moduleId!), onUnlink: () => onUnlinkModule(node.id) }
                  : undefined
              }
              onSelect={(additive) => select(node.id, additive)}
              onMove={(x, y) => onMoveNode(node.id, x, y)}
              onRemove={() => onRemoveNode(node.id)}
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
      <div className={styles.navigation} role="group" aria-label="Graph navigation">
        <button aria-label="Pan graph" aria-pressed={handTool} onClick={() => setHandTool(!handTool)} title="Drag to pan. Middle-drag also pans with the selection tool.">Hand</button>
        <button aria-label="Zoom out" disabled={view.zoom <= MIN_ZOOM} onClick={() => zoom(1 / 1.2)}>−</button>
        <button aria-label="Reset graph view" onClick={() => updateView({ x: 0, y: 0, zoom: 1 })} title="Reset zoom and position">{Math.round(view.zoom * 100)}%</button>
        <button aria-label="Zoom in" disabled={view.zoom >= MAX_ZOOM} onClick={() => zoom(1.2)}>+</button>
      </div>
      <div className={styles.navigationHint}>Scroll to pan · Ctrl/⌘ + scroll to zoom</div>
    </div>
  )
})
