import { childIdentity, type NoteScope, type NoteEvent } from '../session'
import { compareEvents } from './events'
import { Merger } from './merge'
import { CLIP_NOTES_TYPE, TAP_AFTER_GRAPH, TRACK_NOTES_TYPE } from './nodes'
import { findNoteNode } from './registry'
import type { NoteNodeDefinition, NoteProcessor } from './types'

/** The part of a patch the note graph needs; a `Patch` of note nodes satisfies it. */
export interface NoteGraphSpec {
  readonly nodes: readonly {
    readonly id: string
    readonly type: string
    readonly params: Readonly<Record<string, number>>
    readonly trackId?: string
    readonly bypassed?: boolean
  }[]
  readonly connections: readonly {
    readonly from: { readonly node: string; readonly port: string }
    readonly to: { readonly node: string; readonly port: string }
  }[]
}

/** What each track's graph produced in the current block, for other tracks to read. Cleared by the engine every block. */
export type TapBoard = Map<string, { clip: NoteEvent[]; out: NoteEvent[] }>

interface RunningNode {
  readonly id: string
  readonly definition: NoteNodeDefinition
  readonly processor: NoteProcessor
  /** One merger per input port that has several sources. */
  readonly mergers: Map<string, Merger>
  readonly params: Map<string, number>
  inputKeys: string[]
  outputKeys: string[]
  trackId: string | undefined
  tap: number
  bypassed: boolean
}

const EMPTY: NoteEvent[] = []

const key = (node: string, port: string): string => `${node}:${port}`

/** Identity of the wiring, ignoring parameters and canvas positions. */
const structureOf = (spec: NoteGraphSpec): string =>
  JSON.stringify([
    spec.nodes.map((node) => [node.id, node.type, node.trackId, node.bypassed === true, node.type === TRACK_NOTES_TYPE ? node.params.tap : undefined]),
    spec.connections.map(({ from, to }) => [from.node, from.port, to.node, to.port]),
  ])

/** Ids of the tracks a graph reads notes from. */
export const noteTapSources = (spec: NoteGraphSpec): string[] => [
  ...new Set(spec.nodes.flatMap((node) => (node.type === TRACK_NOTES_TYPE && node.trackId ? [node.trackId] : []))),
]

const dependencyOrder = (spec: NoteGraphSpec, known: ReadonlySet<string>): string[] => {
  const incoming = new Map(spec.nodes.filter((node) => known.has(node.id)).map((node) => [node.id, 0]))
  const usable = spec.connections.filter((c) => incoming.has(c.from.node) && incoming.has(c.to.node))
  for (const { to } of usable) incoming.set(to.node, (incoming.get(to.node) ?? 0) + 1)
  const ready = [...incoming].filter(([, count]) => count === 0).map(([id]) => id)
  const order: string[] = []
  while (ready.length > 0) {
    const id = ready.shift() as string
    order.push(id)
    for (const { from, to } of usable) {
      if (from.node !== id) continue
      const remaining = (incoming.get(to.node) ?? 0) - 1
      incoming.set(to.node, remaining)
      if (remaining === 0) ready.push(to.node)
    }
  }
  return order // nodes on a cycle never become ready and simply do not run
}

/**
 * A track's note graph, running between the clip player and the instrument. Sources feed it notes (this track's
 * clips, or another track's), nodes transform them, and what reaches the sinks plays. An output may feed several
 * inputs (a split) and an input may have several sources (a merge, which keeps same-pitch notes from cutting each
 * other short).
 *
 * Editing the graph keeps the running state of every node that is still there, so turning a knob never restarts an
 * arpeggio. Adding, removing or rewiring nodes restarts the graph and silences the instrument first, since notes
 * that were mid-flight could otherwise be left hanging.
 */
export class NoteGraph {
  private nodes = new Map<string, RunningNode>()
  private readonly outputs = new Map<string, NoteEvent[]>()
  private readonly sinks: NoteEvent[][] = []
  private order: string[] = []
  private signature: string | null = null
  private restarted = false
  private cancellations: (NoteScope | undefined)[] = []
  private readonly final = new Merger()

  setParam(nodeId: string, paramId: string, value: number): void {
    const node = this.nodes.get(nodeId)
    if (!node || node.params.get(paramId) === value) return
    node.params.set(paramId, value)
    node.processor.setParam(paramId, value)
  }

  sync(spec: NoteGraphSpec): boolean {
    const signature = structureOf(spec)
    const changed = this.signature !== null && signature !== this.signature
    if (signature !== this.signature) {
      if (this.signature !== null) this.restarted = true
      this.signature = signature
      this.nodes = new Map()
      for (const node of spec.nodes) {
        const definition = findNoteNode(node.type)
        if (!definition) continue
        this.nodes.set(node.id, {
          id: node.id,
          definition,
          processor: definition.create(),
          mergers: new Map(),
          params: new Map(),
          inputKeys: spec.connections.filter(c => c.to.node === node.id && c.to.port === definition.inputs[0]?.id).map(c => key(c.from.node, c.from.port)),
          outputKeys: definition.outputs.map(p => key(node.id, p.id)),
          trackId: undefined,
          tap: 0,
          bypassed: false,
        })
      }
      this.outputs.clear()
      this.order = dependencyOrder(spec, new Set(this.nodes.keys()))
      this.final.reset()
    }
    for (const node of spec.nodes) {
      const running = this.nodes.get(node.id)
      if (!running) continue
      for (const [id, value] of Object.entries(node.params)) this.setParam(node.id, id, value)
      running.trackId = node.trackId
      running.tap = node.params.tap ?? 0
      running.bypassed = node.bypassed === true
    }
    return changed
  }

  cancel(scope?: NoteScope): void { this.cancellations.push(scope) }

  /** Ids of the tracks this graph reads from, so the engine can run them first. */
  tapSources(): string[] {
    return [...this.nodes.values()].flatMap((node) => (node.definition.role === 'source' && node.trackId ? [node.trackId] : []))
  }

  /** The events leaving the graph for the beat range [from, to). */
  process(clipEvents: NoteEvent[], from: number, to: number, board: TapBoard, beatOrigin = 0): NoteEvent[] {
    const outputs = this.outputs
    outputs.clear()
    const sinks = this.sinks
    sinks.length = 0

    for (const id of this.order) {
      const node = this.nodes.get(id) as RunningNode
      const { definition, processor } = node

      let feed: NoteEvent[]
      if (definition.type === CLIP_NOTES_TYPE) feed = clipEvents
      else if (definition.role === 'source') {
        const tapped = node.trackId ? board.get(node.trackId) : undefined
        feed = (node.tap === TAP_AFTER_GRAPH ? tapped?.out : tapped?.clip) ?? EMPTY
      } else feed = this.gather(node, outputs)

      if (this.cancellations.length) feed = [...this.cancellations.map((scope): NoteEvent => ({ beat: from, kind: 'allOff', ...(scope ? { scope } : {}) })), ...feed]

      let results: NoteEvent[][]
      if (node.bypassed && definition.role === 'effect' && definition.inputs.length === 1 && definition.outputs.length === 1) {
        processor.reset()
        results = [feed]
      } else {
        results = processor.processAll ? processor.processAll(feed, from, to, beatOrigin) : [processor.process(feed, from, to, beatOrigin)]
      }
      // Qualify effect output identities by graph route; identical passthrough routes still merge.
      if (definition.role === 'effect' && !node.bypassed && results.some(list => list.length)) results = results.map((list, index) => list.map((event) =>
        event.kind === 'allOff' || !event.identity ? event : { ...event, ...childIdentity(event.identity, JSON.stringify([id, index])) }))
      definition.outputs.forEach((_port, index) => outputs.set(node.outputKeys[index]!, results[index] ?? EMPTY))
      if (definition.role === 'sink') sinks.push(results[0] ?? feed)
    }

    let events: NoteEvent[] = sinks.length === 1 ? (sinks[0] as NoteEvent[]) : sinks.some(list => list.length) ? this.final.process(sinks.flat().sort(compareEvents)) : EMPTY
    if (this.restarted) {
      this.restarted = false
      events = [{ beat: from, kind: 'allOff' }, ...events]
    }
    this.cancellations.length = 0
    return events
  }

  /** What arrives at a node's input: its one source as is, or several merged. */
  private gather(node: RunningNode, outputs: Map<string, NoteEvent[]>): NoteEvent[] {
    const port = node.definition.inputs[0]
    if (!port || node.inputKeys.length === 0) return EMPTY
    if (node.inputKeys.length === 1) return outputs.get(node.inputKeys[0]!) ?? EMPTY
    const sources = node.inputKeys.map(k => outputs.get(k) ?? EMPTY)
    if (!sources.some(list => list.length)) return EMPTY
    let merger = node.mergers.get(port.id)
    if (!merger) node.mergers.set(port.id, (merger = new Merger()))
    return merger.process(sources.flat())
  }

  /** Back to the start (transport stopped). */
  reset(): void {
    this.cancellations = []
    for (const node of this.nodes.values()) {
      node.processor.reset()
      for (const merger of node.mergers.values()) merger.reset()
    }
    this.final.reset()
    this.restarted = false
  }
}
