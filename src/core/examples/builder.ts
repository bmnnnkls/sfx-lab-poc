import {
  type ControlDisplay,
  type ControlSize,
  type ModuleDefinition,
  type ModuleLibrary,
  type NodePanel,
  type Patch,
  type PatchConnection,
  type PatchNode,
  canConnect,
  describeNode,
  exposedKnobId,
  exposedPortId,
  resolveSpec,
} from '../patch'

/**
 * A way of writing patches down so the example projects read like the patch they are. Nodes are listed by readable id, wires are
 * `"from.port>to.port"` strings, and the card layout is worked out (left to right by how far a node is from the sources). Every wire is
 * checked as it is built: a typo throws here instead of becoming a silent gap in the sound.
 */

export interface NodeSpec {
  readonly id: string
  readonly type: string
  /** What the card and the panel call it. Absent: the node's type label. */
  readonly name?: string
  /** Only what differs from the node's defaults. */
  readonly params?: Readonly<Record<string, number>>
  readonly stereo?: true
  readonly trackId?: string
  readonly moduleId?: string
  readonly unit?: string
  readonly unitY?: string
  readonly display?: ControlDisplay
  readonly panel?: NodePanel
  /**
   * Randomize and Mutate leave a locked node alone. Every node of an example is locked by default except the controls and the uses of a
   * module (their values are what Randomize is for); say `locked: false` on a node whose settings should re-roll too (a source of chance
   * with a seed). The result: a Randomize moves knobs and seeds, never the wiring or an envelope's shape, so it cannot break a patch.
   */
  readonly locked?: boolean
}

export interface PatchOptions {
  /** The modules the patch may use (needed to wire the ports of a module use). */
  readonly modules?: ModuleLibrary
  /** Put in front of every node id and wire id, so node ids stay unique across the graphs of one track (see `Track.fx`). */
  readonly prefix?: string
}

// ---- Layout (mirrors ui/patcher/geometry.ts: core cannot import the UI)

const NODE_WIDTH = 176
const COLUMN_GAP = 76
const HEADER_HEIGHT = 28
const PORT_ROW_HEIGHT = 22
const BODY_PADDING = 6
const PICTURE_HEIGHT = 44
const ROW_GAP = 16
const MODULE_FOOTER_HEIGHT = 34
const LIVE_WIDGET_HEIGHT = { value: 84, xy: 140, switch: 44, selector: 44 } as const
/** The nodes whose card carries a picture (`ui/patcher/previews`). */
const WITH_PICTURE = new Set(['oscillator', 'filter', 'envelope', 'lfo', 'gain', 'pan', 'width', 'delay', 'pingPong', 'reverb', 'stereoReverb'])

const cardHeight = (node: PatchNode, modules: ModuleLibrary): number => {
  const shape = describeNode(node, modules)
  if (!shape) return 80
  const live = shape.panelKind === 'value' || shape.panelKind === 'xy' || shape.panelKind === 'switch' || shape.panelKind === 'selector' ? LIVE_WIDGET_HEIGHT[shape.panelKind] : 0
  return (
    HEADER_HEIGHT +
    BODY_PADDING * 2 +
    Math.max(shape.inputs.length, shape.outputs.length) * PORT_ROW_HEIGHT +
    (WITH_PICTURE.has(node.type) || shape.indicator === true ? PICTURE_HEIGHT : 0) +
    live +
    (node.type === 'module' ? MODULE_FOOTER_HEIGHT : 0)
  )
}

/** Which column each node sits in: its longest distance from a source. A source that only feeds others sits just before its first reader. */
const columnsOf = (nodes: readonly PatchNode[], connections: readonly PatchConnection[]): Map<string, number> => {
  const depth = new Map(nodes.map((node) => [node.id, 0]))
  // Longest path from the sources: relax until nothing moves (the graph is acyclic, so this ends within `nodes.length` passes).
  for (let pass = 0; pass < nodes.length; pass++) {
    let moved = false
    for (const { from, to } of connections) {
      const wanted = (depth.get(from.node) ?? 0) + 1
      if (wanted > (depth.get(to.node) ?? 0)) {
        depth.set(to.node, wanted)
        moved = true
      }
    }
    if (!moved) break
  }
  const hasInput = new Set(connections.map(({ to }) => to.node))
  for (const node of nodes) {
    if (hasInput.has(node.id)) continue
    const readers = connections.filter(({ from }) => from.node === node.id).map(({ to }) => depth.get(to.node) ?? 0)
    if (readers.length > 0) depth.set(node.id, Math.max(0, Math.min(...readers) - 1))
  }
  return depth
}

const laidOut = (nodes: readonly PatchNode[], connections: readonly PatchConnection[], modules: ModuleLibrary): PatchNode[] => {
  const columns = columnsOf(nodes, connections)
  const bottoms = new Map<number, number>()
  return nodes.map((node) => {
    const column = columns.get(node.id) ?? 0
    const y = bottoms.get(column) ?? 24
    bottoms.set(column, y + cardHeight(node, modules) + ROW_GAP)
    return { ...node, x: 24 + column * (NODE_WIDTH + COLUMN_GAP), y }
  })
}

// ---- Building

const portIds = (patch: Patch, nodeId: string, direction: 'inputs' | 'outputs', modules: ModuleLibrary): string => {
  const node = patch.nodes.find((candidate) => candidate.id === nodeId)
  const shape = node && describeNode(node, modules)
  return shape ? shape[direction].map((port) => port.id).join(', ') : '(unknown node)'
}

const why = (patch: Patch, wire: string, from: { node: string; port: string }, to: { node: string; port: string }, modules: ModuleLibrary): string => {
  const source = patch.nodes.find((node) => node.id === from.node)
  const target = patch.nodes.find((node) => node.id === to.node)
  if (!source || !target) return `there is no node "${source ? to.node : from.node}"`
  const out = describeNode(source, modules)?.outputs.find((port) => port.id === from.port)
  const into = describeNode(target, modules)?.inputs.find((port) => port.id === to.port)
  if (!out) return `"${from.node}" has no output "${from.port}" (it has: ${portIds(patch, from.node, 'outputs', modules)})`
  if (!into) return `"${to.node}" has no input "${to.port}" (it has: ${portIds(patch, to.node, 'inputs', modules)})`
  if (patch.connections.some((c) => c.from.node === from.node && c.from.port === from.port && c.to.node === to.node && c.to.port === to.port)) return 'it is wired twice'
  return `${out.kind ?? 'signal'} cannot go into ${into.kind ?? 'signal'}, or it would make a loop (${wire})`
}

const parseWire = (wire: string): [{ node: string; port: string }, { node: string; port: string }] => {
  const match = /^([\w-]+)\.([\w:-]+)>([\w-]+)\.([\w:-]+)$/.exec(wire)
  if (!match) throw new Error(`Bad wire "${wire}": write it as "from.port>to.port"`)
  return [
    { node: match[1] as string, port: match[2] as string },
    { node: match[3] as string, port: match[4] as string },
  ]
}

/** Locked by default, except a control or indicator (shown on the panel) and a use of a module. */
const isLocked = (spec: NodeSpec, isControl: boolean): boolean => spec.locked ?? !(isControl || spec.type === 'module')

/** A patch from node specs and wires. Throws, naming the wire, when one does not fit. */
export const patchOf = (specs: readonly NodeSpec[], wires: readonly string[], options: PatchOptions = {}): Patch => {
  const modules = options.modules ?? []
  const prefix = options.prefix ?? ''
  const seen = new Set<string>()
  const nodes = specs.map((spec): PatchNode => {
    if (seen.has(spec.id)) throw new Error(`Node id "${spec.id}" is used twice`)
    seen.add(spec.id)
    const base: PatchNode = { id: prefix + spec.id, type: spec.type, x: 0, y: 0, params: {}, ...(spec.moduleId === undefined ? {} : { moduleId: spec.moduleId }) }
    const shape = describeNode(base, modules)
    if (!shape) throw new Error(`Unknown node type "${spec.type}"${spec.moduleId ? ` (module ${spec.moduleId})` : ''} for "${spec.id}"`)
    for (const [id, value] of Object.entries(spec.params ?? {})) {
      const param = shape.params.find((candidate) => candidate.id === id)
      if (!param) throw new Error(`"${spec.id}" (${spec.type}) has no parameter "${id}" (it has: ${shape.params.map((candidate) => candidate.id).join(', ')})`)
      // A value outside the parameter's range would play now and be clamped the first time the project is saved and loaded.
      const live = resolveSpec({ params: { ...spec.params }, unit: spec.unit, unitY: spec.unitY }, param)
      if (!Number.isFinite(value) || value < live.min || value > live.max) throw new Error(`"${spec.id}" (${spec.type}) ${id} = ${value} is outside ${live.min}..${live.max}`)
    }
    return {
      ...base,
      params: { ...Object.fromEntries(shape.params.map((param) => [param.id, param.default])), ...spec.params },
      ...(spec.name === undefined ? {} : { name: spec.name }),
      ...(spec.stereo ? { stereo: true as const } : {}),
      ...(spec.trackId === undefined ? {} : { trackId: spec.trackId }),
      ...(spec.unit === undefined ? {} : { unit: spec.unit }),
      ...(spec.unitY === undefined ? {} : { unitY: spec.unitY }),
      ...(spec.display === undefined || spec.display === 'knob' ? {} : { display: spec.display }),
      ...(spec.panel === undefined ? {} : { panel: spec.panel }),
      ...(isLocked(spec, shape.panelKind !== undefined) ? { locked: true as const } : {}),
    }
  })

  let connections: PatchConnection[] = []
  let patch: Patch = { nodes, connections }
  wires.forEach((wire, index) => {
    const [from, to] = parseWire(wire)
    const source = { node: prefix + from.node, port: from.port }
    const target = { node: prefix + to.node, port: to.port }
    if (!canConnect(patch, source, target, modules)) throw new Error(`Cannot wire ${wire}: ${why(patch, wire, source, target, modules)}`)
    connections = [...connections, { id: `${prefix}w${index}`, from: source, to: target }]
    patch = { nodes, connections }
  })
  return { nodes: laidOut(nodes, connections, modules), connections }
}

// ---- Modules

export interface ModuleSpec {
  readonly id: string
  readonly name: string
  readonly nodes: readonly NodeSpec[]
  readonly wires: readonly string[]
  /** The inner ports to show on every use, as `node.port`. */
  readonly inputs: readonly { readonly label: string; readonly at: string }[]
  readonly outputs: readonly { readonly label: string; readonly at: string }[]
  /** The inner parameters to show as knobs on every use, as `node.param`. */
  readonly knobs?: readonly { readonly label: string; readonly at: string }[]
}

const split = (at: string): [string, string] => {
  const dot = at.indexOf('.')
  if (dot < 1) throw new Error(`Write "${at}" as "node.port"`)
  return [at.slice(0, dot), at.slice(dot + 1)]
}

/** A module definition; its inner ids stay as written (a use of it names them `<use>/<inner>`). */
export const moduleOf = (spec: ModuleSpec, modules: ModuleLibrary = []): ModuleDefinition => {
  const patch = patchOf(spec.nodes, spec.wires, { modules })
  const inner = (at: string) => {
    const [node, port] = split(at)
    if (!patch.nodes.some((candidate) => candidate.id === node)) throw new Error(`Module ${spec.id}: there is no node "${node}"`)
    return { node, port }
  }
  return {
    id: spec.id,
    name: spec.name,
    patch,
    inputs: spec.inputs.map(({ label, at }) => ({ id: exposedPortId(inner(at)), label, inner: inner(at) })),
    outputs: spec.outputs.map(({ label, at }) => ({ id: exposedPortId(inner(at)), label, inner: inner(at) })),
    knobs: (spec.knobs ?? []).map(({ label, at }) => {
      const { node, port } = inner(at)
      return { id: exposedKnobId(node, port), label, node, param: port }
    }),
  }
}

/** A use of a module as a node spec. `values` set its knobs (and the controls inside it), keyed `<inner node>:<param>`. */
export const useModule = (id: string, moduleId: string, values: Readonly<Record<string, number>> = {}, name?: string): NodeSpec => ({
  id,
  type: 'module',
  moduleId,
  params: values,
  ...(name === undefined ? {} : { name }),
})

// ---- Controls: the nodes that make a panel

type Curve = 'linear' | 'log' | 'exp'
const CURVES: Record<Curve, number> = { linear: 0, log: 1, exp: 2 }

export interface AxisOptions {
  readonly value: number
  readonly min: number
  readonly max: number
  readonly unit?: string
  /** `log` for frequencies and times: equal ratios per turn. */
  readonly curve?: Curve
  readonly step?: number
  /** What a double-click returns to. Default: the starting value. */
  readonly home?: number
}

export interface KnobOptions extends AxisOptions {
  readonly size?: ControlSize
  readonly display?: 'knob' | 'slider' | 'slider-horizontal'
  /** Keep it where it is when the graph is randomized or mutated (a track's level, say). */
  readonly locked?: boolean
}

const panelOf = (size: ControlSize | undefined): { panel?: NodePanel } => (size === undefined || size === 'S' ? {} : { panel: { size } })

const inRange = (id: string, o: AxisOptions): void => {
  if (!(o.min < o.max) || o.value < o.min || o.value > o.max || (o.home !== undefined && (o.home < o.min || o.home > o.max))) {
    throw new Error(`Control "${id}": value ${o.value} must lie inside ${o.min}..${o.max}`)
  }
}

/** A knob (or slider) with its own range, curve and unit: wire its `out` into any parameter socket. */
export const knob = (id: string, name: string, options: KnobOptions): NodeSpec => (inRange(id, options), {
  id,
  type: 'control',
  name,
  params: {
    value: options.value,
    min: options.min,
    max: options.max,
    curve: CURVES[options.curve ?? 'linear'],
    step: options.step ?? 0,
    default: options.home ?? options.value,
  },
  ...(options.unit === undefined ? {} : { unit: options.unit }),
  ...(options.display === undefined ? {} : { display: options.display }),
  ...(options.locked ? { locked: true as const } : {}),
  ...panelOf(options.size),
})

/** An XY pad: two controls on one surface. Its outputs are `x` and `y`. */
export const xyPad = (id: string, name: string, x: AxisOptions, y: AxisOptions, size: ControlSize = 'M'): NodeSpec => {
  inRange(`${id}.x`, x)
  inRange(`${id}.y`, y)
  const axis = (prefix: 'x' | 'y', o: AxisOptions) => ({
    [prefix]: o.value,
    [`${prefix}Min`]: o.min,
    [`${prefix}Max`]: o.max,
    [`${prefix}Curve`]: CURVES[o.curve ?? 'linear'],
    [`${prefix}Step`]: o.step ?? 0,
    [`${prefix}Default`]: o.home ?? o.value,
  })
  return {
    id,
    type: 'xyPad',
    name,
    params: { ...axis('x', x), ...axis('y', y) },
    ...(x.unit === undefined ? {} : { unit: x.unit }),
    ...(y.unit === undefined ? {} : { unitY: y.unit }),
    ...(size === 'M' ? {} : { panel: { size } }),
  }
}

export interface SwitchOptions {
  readonly on?: boolean
  readonly mode?: 'toggle' | 'momentary' | 'trigger'
  readonly offValue?: number
  readonly onValue?: number
  /** For a trigger: how long the pulse lasts, in seconds. */
  readonly pulse?: number
}

/** An on/off switch, or a push button (`mode: 'trigger'`). */
export const toggle = (id: string, name: string, options: SwitchOptions = {}): NodeSpec => ({
  id,
  type: 'switch',
  name,
  params: {
    on: options.on ? 1 : 0,
    mode: { toggle: 0, momentary: 1, trigger: 2 }[options.mode ?? 'toggle'],
    offValue: options.offValue ?? 0,
    onValue: options.onValue ?? 1,
    ...(options.pulse === undefined ? {} : { pulse: options.pulse }),
  },
})

/** A row of buttons: outputs the chosen position from 0. */
export const choice = (id: string, name: string, count: number, index = 0): NodeSpec => ({ id, type: 'selector', name, params: { count, index } })

/** A light that shows a value: on/off past `threshold`, or dim to bright between `low` and `high`. */
export const led = (id: string, name: string, options: { readonly threshold?: number; readonly low?: number; readonly high?: number; readonly colour?: 'green' | 'red' | 'amber' | 'blue' } = {}): NodeSpec => ({
  id,
  type: 'led',
  name,
  params: {
    mode: options.threshold === undefined && options.low !== undefined ? 1 : 0,
    ...(options.threshold === undefined ? {} : { threshold: options.threshold }),
    ...(options.low === undefined ? {} : { low: options.low }),
    ...(options.high === undefined ? {} : { high: options.high }),
    colour: { green: 0, red: 1, amber: 2, blue: 3 }[options.colour ?? 'green'],
  },
})

/** A bar that fills between `min` and `max`. */
export const meter = (id: string, name: string, min = 0, max = 1): NodeSpec => ({ id, type: 'bar', name, params: { min, max } })

/** A number display; `note` shows a MIDI note by name. */
export const readout = (id: string, name: string, options: { readonly decimals?: number; readonly note?: boolean; readonly unit?: string } = {}): NodeSpec => ({
  id,
  type: 'display',
  name,
  params: { decimals: options.decimals ?? 1, style: options.note ? 1 : 0 },
  ...(options.unit === undefined ? {} : { unit: options.unit }),
})
