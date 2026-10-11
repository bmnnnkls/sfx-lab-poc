import type { NodeCategory, ParamSpec, PortSpec } from './types'

/**
 * The words that go with a node: what it is for, where the picker files it, what each port and parameter does. Kept in
 * one table per registry (`node-docs.ts`) rather than scattered over the node files, and a test fails when a node,
 * port or parameter has no entry (or an entry names one that no longer exists).
 */
export interface NodeDocs {
  readonly category: NodeCategory
  readonly description: string
  readonly keywords?: readonly string[]
  /** Port id -> sentence. */
  readonly inputs?: Readonly<Record<string, string>>
  readonly outputs?: Readonly<Record<string, string>>
  /** Parameter id -> sentence. */
  readonly params?: Readonly<Record<string, string>>
}

const described = <T extends { id: string }>(items: readonly T[], words: Readonly<Record<string, string>> | undefined): T[] =>
  items.map((item) => (words?.[item.id] === undefined ? item : { ...item, description: words[item.id] }))

/** The definition with its words attached (a copy); the definition itself when there are none for it. */
export const documented = <
  T extends { inputs: readonly PortSpec[]; outputs: readonly PortSpec[]; params: readonly ParamSpec[] },
>(
  definition: T,
  docs: NodeDocs | undefined,
): T & { category?: NodeCategory; description?: string; keywords?: readonly string[] } =>
  docs === undefined
    ? definition
    : {
        ...definition,
        category: docs.category,
        description: docs.description,
        ...(docs.keywords === undefined ? {} : { keywords: docs.keywords }),
        inputs: described(definition.inputs, docs.inputs),
        outputs: described(definition.outputs, docs.outputs),
        params: described(definition.params, docs.params),
      }
