export type { Patch, PatchConnection, PatchNode, PortRef } from './types'
export {
  MODULE_NODE_TYPE,
  type ModuleDefinition,
  type ModuleKnob,
  type ModuleLibrary,
  type ModulePort,
  exposedKnobId,
  exposedPortId,
} from './module-types'
export { type NodeDomain, type NodeShape, describeNode, findModule, kindsConnect, moduleDomain } from './node-shape'
export { createDefaultNoteGraph } from './default-note-graph'
export { createDefaultFxGraph } from './default-fx-graph'
export { type NoteGraphNodeSpec, noteGraphFrom } from './note-graph-builder'
export { containsModule, expandModuleUse, flattenPatch, modulesUsedBy, unlinkModuleUse } from './flatten'
export {
  type GroupResult,
  createModuleUse,
  groupIntoModule,
  pruneModuleInterface,
  pruneModuleUses,
} from './group-module'
export {
  exposeKnob,
  exposePort,
  hideKnob,
  hidePort,
  labelKnob,
  labelPort,
  renameModule,
  setModulePatch,
} from './module-edit'
export {
  addNode,
  canConnect,
  type ConnectOptions,
  connect,
  createNode,
  disconnect,
  moveNode,
  removeNode,
  setNodeParam,
  setNodeSample,
  setNodeTrack,
  setNodeBypassed,
  setNodeStereo,
  clearTrackReferences,
  clearSampleReferences,
} from './edit'
export { isDownstream, topologicalOrder } from './graph'
export { createDefaultPatch } from './default-patch'
export { createSamplerPatch } from './sampler-patch'
