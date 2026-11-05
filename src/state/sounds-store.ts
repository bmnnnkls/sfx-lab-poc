import { type ControlOwner, type Project, type Snapshot, type SnapshotScope, captureSnapshot, controlTargetKey } from '@core'
import { create } from 'zustand'
import { type ViewId, useLayoutStore } from './layout-store'
import { useProjectStore } from './project-store'

/** The graph Sounds lists the presets and snapshots of: a domain of `SnapshotScope`. */
export type SoundsTab = SnapshotScope['domain']

/** The editors whose graph Sounds follows, and the tab each one shows. */
const EDITOR_TABS: Partial<Record<ViewId, SoundsTab>> = { instrument: 'patch', effects: 'fx', notes: 'notes' }

/** What Sounds marks with ● as recalled: the sound, where it went, and the state of that graph just after. */
export interface RecalledMark {
  readonly soundId: string
  readonly scope: SnapshotScope
  /** `scopeState` of the scope right after the recall; an edit of the graph changes it, and the mark goes. */
  readonly state: string
}

interface SoundsState {
  /** The tab chosen by hand or by the editor shown last. A bus or the master shows `fx` for the instrument's tabs. */
  readonly tab: SoundsTab
  /** The morph's ends: snapshot IDs, or null. Cleared once their snapshot is gone. */
  readonly a: string | null
  readonly b: string | null
  /** *Show all in project*: a view preference, kept per browser by the view. */
  readonly showAll: boolean
  readonly recalled: RecalledMark | null
  setTab(tab: SoundsTab): void
  setA(id: string | null): void
  setB(id: string | null): void
  setShowAll(showAll: boolean): void
  markRecalled(mark: RecalledMark | null): void
}

/** The state of the controls a recall into `scope` sets: an instrument's preset sets its notes too. */
export const scopeState = (project: Project, scope: SnapshotScope, withNotes = false): string => {
  const scopes = withNotes && scope.domain === 'patch' ? [scope, { ...scope, domain: 'notes' as const }] : [scope]
  return JSON.stringify(scopes.flatMap((each) => captureSnapshot(project, each, '').values.map((entry) => [controlTargetKey(entry.target), entry.value])))
}

/** Whether the recalled mark still holds: nothing in its graph changed since. */
export const isStillRecalled = (project: Project, mark: RecalledMark, withNotes: boolean): boolean => scopeState(project, mark.scope, withNotes) === mark.state

/** The tab Sounds shows for `owner`: a bus or the master has *Effects* and *Track* only. */
export const tabFor = (tab: SoundsTab, owner: ControlOwner): SoundsTab => (owner.kind !== 'track' && (tab === 'patch' || tab === 'notes') ? 'fx' : tab)

/** The tab of the editor that has just become visible, if one has (the last one listed when several have). */
export const editorTabOf = (visible: readonly ViewId[], before: readonly ViewId[]): SoundsTab | undefined =>
  visible.filter((view) => !before.includes(view)).map((view) => EDITOR_TABS[view]).filter((tab) => tab !== undefined).at(-1)

/** A and B, when both are set and `morphSnapshots` can take them: the same scope and the same targets. */
export const morphPair = (project: Project, a: string | null, b: string | null): readonly [Snapshot, Snapshot] | undefined => {
  const left = project.snapshots?.find((snapshot) => snapshot.id === a), right = project.snapshots?.find((snapshot) => snapshot.id === b)
  if (!left || !right || left.id === right.id || JSON.stringify(left.scope) !== JSON.stringify(right.scope) || left.values.length !== right.values.length) return undefined
  const keys = new Set(right.values.map((entry) => controlTargetKey(entry.target)))
  return left.values.every((entry) => keys.has(controlTargetKey(entry.target))) ? [left, right] : undefined
}

/** The Sounds view's state: its tab, the morph's ends, *Show all* and the ● mark. Not project state. */
export const useSoundsStore = create<SoundsState>((set) => ({
  tab: 'patch',
  a: null,
  b: null,
  showAll: false,
  recalled: null,
  setTab: (tab) => set({ tab }),
  setA: (a) => set({ a }),
  setB: (b) => set({ b }),
  setShowAll: (showAll) => set({ showAll }),
  markRecalled: (recalled) => set({ recalled }),
}))

// The tab follows the editors: Instrument, Effects or Notes shown moves it to its graph, until the next one is.
useLayoutStore.subscribe((state, previous) => {
  if (state.visible === previous.visible) return
  const tab = editorTabOf(state.visible, previous.visible)
  if (tab && tab !== useSoundsStore.getState().tab) useSoundsStore.setState({ tab })
})

// A and B, and the mark, last only while their snapshot does (an undo or another project can take it away).
useProjectStore.subscribe((state, previous) => {
  if (state.project.snapshots === previous.project.snapshots && state.project.presets === previous.project.presets) return
  const { a, b, recalled } = useSoundsStore.getState()
  const has = (id: string | null) => id !== null && !!state.project.snapshots?.some((snapshot) => snapshot.id === id)
  const kept = (id: string) => has(id) || !!state.project.presets?.some((preset) => preset.id === id)
  const next = { a: has(a) ? a : null, b: has(b) ? b : null, recalled: recalled && kept(recalled.soundId) ? recalled : null }
  if (next.a !== a || next.b !== b || next.recalled !== recalled) useSoundsStore.setState(next)
})
