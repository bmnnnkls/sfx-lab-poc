export interface PortRef {
  readonly node: string
  readonly port: string
}

export interface PatchNode {
  readonly id: string
  /** Key into the DSP node registry. */
  readonly type: string
  /** Canvas position, owned by the patcher UI but stored with the document. */
  readonly x: number
  readonly y: number
  readonly params: Readonly<Record<string, number>>
  /** For sample-playing nodes: id of the project sample to play. */
  readonly sampleId?: string
}

export interface PatchConnection {
  readonly id: string
  readonly from: PortRef
  readonly to: PortRef
}

/** A node graph describing one instrument. Immutable; edit via `patch/edit`. */
export interface Patch {
  readonly nodes: readonly PatchNode[]
  readonly connections: readonly PatchConnection[]
}
