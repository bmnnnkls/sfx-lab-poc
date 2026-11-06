import { create } from 'zustand'

/** Where a graph's canvas is panned and zoomed to. */
export interface GraphViewport {
  readonly x: number
  readonly y: number
  readonly zoom: number
}

/** A graph's key: the track's id (or `master`) and which of its graphs: instrument, effects or notes. */
export const graphKey = (owner: string, graph: 'patch' | 'fx' | 'notes'): string => `${owner}:${graph}`

/** A canvas's key: the graph's, then the sub-patch open inside it, so each level keeps its own view. */
export const canvasKey = (graph: string, path: readonly string[]): string => [graph, ...path].join('/')

/** A kept path, cut at the first module that no longer exists (deleted, undone): the rest of it can't be entered. */
export const livePath = (path: readonly string[], exists: (moduleId: string) => boolean): readonly string[] => {
  const missing = path.findIndex((id) => !exists(id))
  return missing === -1 ? path : path.slice(0, missing)
}

/** Where the node picker was asked for, in a graph's canvas coordinates. */
export interface AddRequest {
  readonly graph: string
  readonly at: { readonly x: number; readonly y: number }
}

interface GraphViewState {
  /** The pan and zoom of each canvas shown so far, by `canvasKey`. */
  readonly viewports: Readonly<Record<string, GraphViewport>>
  /** The sub-patch open in each graph, by `graphKey`: module ids from the top level down. */
  readonly paths: Readonly<Record<string, readonly string[]>>
  /** Whether a module's ports-and-knobs interface shows beside its inside. */
  readonly moduleInterface: boolean
  /** The node picker asked for from a menu, for the graph editor showing that graph to open. */
  readonly addRequest: AddRequest | null
  /** A pin (by `pinKey`) for the Pinned view to scroll into view and focus. */
  readonly pinRequest: string | null
  /**
   * The nodes of each canvas (by `canvasKey`) whose card shows every parameter socket, as the toolbar's *Sockets* does for
   * all of them. A way of looking, for the session only.
   */
  readonly sockets: Readonly<Record<string, readonly string[]>>
  setViewport(canvas: string, viewport: GraphViewport): void
  setPath(graph: string, path: readonly string[]): void
  toggleModuleInterface(): void
  requestAdd(request: AddRequest | null): void
  requestPin(key: string | null): void
  toggleSockets(canvas: string, nodeId: string): void
}

/**
 * How each graph was last looked at, so switching tracks brings back that graph's pan, zoom and open sub-patch. Kept
 * in memory for the session only: it is a way of looking, keyed by track ids that belong to the project. A path whose
 * modules are gone is cut where it breaks (`livePath`) by the editor that reads it.
 */
export const useGraphViewStore = create<GraphViewState>((set) => ({
  viewports: {},
  paths: {},
  setViewport: (canvas, viewport) => set((state) => ({ viewports: { ...state.viewports, [canvas]: viewport } })),
  setPath: (graph, path) => set((state) => ({ paths: { ...state.paths, [graph]: path } })),
  moduleInterface: true,
  addRequest: null,
  pinRequest: null,
  sockets: {},
  toggleSockets: (canvas, nodeId) =>
    set((state) => {
      const shown = state.sockets[canvas] ?? []
      return { sockets: { ...state.sockets, [canvas]: shown.includes(nodeId) ? shown.filter((id) => id !== nodeId) : [...shown, nodeId] } }
    }),
  toggleModuleInterface: () => set((state) => ({ moduleInterface: !state.moduleInterface })),
  requestAdd: (addRequest) => set({ addRequest }),
  requestPin: (pinRequest) => set({ pinRequest }),
}))
