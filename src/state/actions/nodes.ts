import { type PatchNode, type PatchTarget, type TrackGraph, addNode, containsModule, controlKindFor, copyNodes, createNode, describeNode, MAX_PATCH_NODES, MODULE_NODE_TYPE, patchAt, pasteNodes, removeNode, setNodeBypassed, setNodeSample } from '@core'
import { graphKey, useGraphViewStore } from '../graph-view-store'
import { useProjectStore } from '../project-store'
import { nodeClipboard } from './clipboards'
import { project } from './lookup'
import { renameAction } from './rename'
import type { Action, SubjectOf } from './types'

type NodesSubject = SubjectOf<'nodes'>
type CanvasSubject = SubjectOf<'canvas'>
type GraphSubject = NodesSubject | CanvasSubject

/** Pasted copies of nodes land this far from the originals. */
const DUPLICATE_OFFSET = 32

/** The patch a subject's nodes are in: the graph's own, or the inside of the module open in it (`path`). */
export const editTargetOf = ({ target, path }: GraphSubject): PatchTarget => {
  const moduleId = path.at(-1)
  return moduleId ? { moduleId } : target
}

/** Which kind of graph a subject is in: a track's instrument, effects or notes, or the master's effects. */
const graphOf = ({ target }: GraphSubject): TrackGraph => ('trackId' in target ? (target.graph ?? 'patch') : 'fx')

/** The key the graph-view store knows the subject's graph by. */
export const graphKeyOf = (subject: GraphSubject): string => graphKey('trackId' in subject.target ? subject.target.trackId : 'master', graphOf(subject))

const patchOf = (subject: GraphSubject) => patchAt(project(), editTargetOf(subject))
const nodesOf = (subject: NodesSubject): readonly PatchNode[] => patchOf(subject)?.nodes.filter((node) => subject.nodeIds.includes(node.id)) ?? []
const single = (subject: NodesSubject) => (subject.nodeIds.length === 1 ? nodesOf(subject)[0] : undefined)
const shapeOf = (node: PatchNode) => describeNode(node, project().modules)
const edit = (subject: GraphSubject, change: Parameters<ReturnType<typeof useProjectStore.getState>['editPatch']>[1]) =>
  useProjectStore.getState().editPatch(editTargetOf(subject), change)

const copy = (subject: NodesSubject) => {
  const patch = patchOf(subject)
  const copied = patch && copyNodes(patch, subject.nodeIds)
  if (copied && copied.nodes.length > 0) nodeClipboard.set({ graph: graphOf(subject), copied })
}
const copyable = (subject: NodesSubject) => {
  const patch = patchOf(subject)
  return !!patch && copyNodes(patch, subject.nodeIds).nodes.length > 0
}

/** Whether copied nodes can be pasted into a subject's graph (see the plan: same kind of graph, room, no module loop). */
const canPaste = (subject: GraphSubject, graph: TrackGraph, nodes: readonly PatchNode[]) => {
  const patch = patchOf(subject)
  if (!patch || graph !== graphOf(subject) || patch.nodes.length + nodes.length > MAX_PATCH_NODES) return false
  const modules = project().modules
  const host = subject.path.at(-1)
  return nodes.every((node) => node.type !== MODULE_NODE_TYPE || (!!node.moduleId && modules.some((module) => module.id === node.moduleId) && !(host && containsModule(modules, node.moduleId, host))))
}

const paste = (subject: GraphSubject, at: { x: number; y: number }) => {
  const copied = nodeClipboard.get()
  if (copied) edit(subject, (patch) => pasteNodes(patch, copied.copied, at).patch)
}

/** The selected nodes of a graph, or the one right-clicked when it isn't selected. */
export const nodeActions: readonly Action<NodesSubject>[] = [
  {
    id: 'nodes.open-module',
    title: 'Open module',
    group: 'open',
    applies: (subject) => !!single(subject)?.moduleId,
    run: (subject) => useGraphViewStore.getState().setPath(graphKeyOf(subject), [...subject.path, single(subject)!.moduleId!]),
  },
  // A control's name is what its panel shows.
  renameAction('nodes', (subject) => {
    const node = single(subject)
    const shape = node && shapeOf(node)
    return !!node && !!shape && !!controlKindFor(node, shape.panelKind)
  }),
  {
    id: 'nodes.bypass',
    title: (subject) => (nodesOf(subject).every((node) => node.bypassed) ? 'Unbypass' : 'Bypass'),
    group: 'edit',
    applies: (subject) => nodesOf(subject).length > 0 && nodesOf(subject).every((node) => shapeOf(node)?.bypassable),
    run: (subject) => {
      const bypassed = !nodesOf(subject).every((node) => node.bypassed)
      edit(subject, (patch) => subject.nodeIds.reduce((next, id) => setNodeBypassed(next, id, bypassed), patch))
    },
  },
  {
    id: 'nodes.group',
    title: 'Group into module',
    group: 'edit',
    applies: (subject) => nodesOf(subject).length > 0,
    run: (subject) => useProjectStore.getState().groupNodes(editTargetOf(subject), subject.nodeIds),
  },
  {
    id: 'nodes.unlink',
    title: 'Unlink',
    group: 'edit',
    applies: (subject) => !!single(subject)?.moduleId,
    run: (subject) => useProjectStore.getState().unlinkModule(editTargetOf(subject), subject.nodeIds[0]!),
  },
  { id: 'nodes.copy', verb: 'copy', title: 'Copy', group: 'clipboard', applies: copyable, run: copy },
  {
    id: 'nodes.cut',
    verb: 'cut',
    title: 'Cut',
    group: 'clipboard',
    applies: copyable,
    run: (subject) => {
      copy(subject)
      const cut = new Set(nodeClipboard.get()?.copied.nodes.map((node) => node.id))
      edit(subject, (patch) => [...cut].reduce(removeNode, patch))
    },
  },
  {
    id: 'nodes.duplicate',
    verb: 'duplicate',
    title: 'Duplicate',
    group: 'clipboard',
    applies: copyable,
    enabled: (subject) => canPaste(subject, graphOf(subject), copyNodes(patchOf(subject)!, subject.nodeIds).nodes),
    // Leaves the clipboard as it was.
    run: (subject) => {
      const copied = copyNodes(patchOf(subject)!, subject.nodeIds)
      const at = { x: Math.min(...copied.nodes.map((node) => node.x)) + DUPLICATE_OFFSET, y: Math.min(...copied.nodes.map((node) => node.y)) + DUPLICATE_OFFSET }
      edit(subject, (patch) => pasteNodes(patch, copied, at).patch)
    },
  },
  {
    id: 'nodes.delete',
    verb: 'delete',
    title: 'Delete',
    group: 'delete',
    danger: true,
    applies: (subject) => nodesOf(subject).length > 0,
    run: (subject) => edit(subject, (patch) => subject.nodeIds.reduce(removeNode, patch)),
  },
]

/** Empty canvas of a graph, at the point that was clicked. */
export const canvasActions: readonly Action<CanvasSubject>[] = [
  {
    id: 'canvas.add-node',
    title: 'Add node…',
    group: 'open',
    takesFocus: true,
    run: (subject) => useGraphViewStore.getState().requestAdd({ graph: graphKeyOf(subject), at: subject.at }),
  },
  {
    id: 'canvas.add-sampler',
    title: 'Add sampler',
    group: 'edit',
    // In an instrument, at the top level or inside a module opened from it.
    applies: (subject) => graphOf(subject) === 'patch' && project().samples.length > 0,
    enabled: (subject) => (patchOf(subject)?.nodes.length ?? MAX_PATCH_NODES) < MAX_PATCH_NODES,
    choices: () => project().samples.map((sample) => ({ id: sample.id, title: sample.name })),
    run: (subject, _context, sampleId) => {
      if (!sampleId || !project().samples.some((sample) => sample.id === sampleId)) return
      const node = createNode('sampler', subject.at.x, subject.at.y)
      edit(subject, (patch) => setNodeSample(addNode(patch, node), node.id, sampleId))
    },
  },
  {
    id: 'canvas.paste',
    verb: 'paste',
    title: 'Paste',
    group: 'clipboard',
    enabled: (subject) => {
      const copied = nodeClipboard.get()
      return !!copied && canPaste(subject, copied.graph, copied.copied.nodes)
    },
    run: (subject) => paste(subject, subject.at),
  },
]
