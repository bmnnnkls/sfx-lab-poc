# Remediating the container audit

Status: **proposal**, 2026-10-24. Round 1b (§2, §4 and the arrangement zoom) **done** 2026-10-24. Part of the [UI redesign](README.md). Answers the
[container audit](PLAN-round-1-untangling.md#container-audit-round-1-result) from round 1.

## Summary

The audit found four kinds of problem. Each has one remedy that covers most cases, plus a few fixes for specific views:

| Finding | Remedy | When |
|---|---|---|
| Views lose state when hidden | Hidden views stay mounted inside React `<Activity mode="hidden">`. Only state that must outlive the view *instance* moves to stores. | Decided in round 2's spike, built in round 2 |
| Whole views re-render on every status update | Narrow subscriptions in small leaf components (the piano roll's `Playhead` pattern), plus a test that forbids whole-status selectors | **Now, before round 2** |
| Fixed widths and window-sized layout | Each view is its own CSS size container. Views declare a `minSize` in the registry; a smoke spec checks every view at that size. | Round 3 (window reads: round 2) |
| Texts that name a tab, empty states that assume the session grid | Empty states and menus offer a button that reveals the view (an intent), and never name a tab | **Now, before round 2** |

The two "now" rows don't depend on the docking library. They make round 2's spike measure the real cost of
showing several views at once, rather than the cost of avoidable re-renders.

## 1. State lost when a view is hidden

### Recommendation: keep hidden views mounted with `<Activity>`

React 19.2+ (we are on 19.3) has `<Activity mode="visible" | "hidden">`. A hidden boundary keeps its children's
state and DOM, sets `display: none`, and **cleans up their Effects**. Our store subscriptions (zustand's
`useSyncExternalStore`) are Effects, so a hidden view also stops reacting to status updates. When it is shown again,
it re-subscribes and reads the latest state.

That one change fixes most of the audit's "lost on unmount" column and the roadmap's "per-frame work pauses while
a view is hidden":

* **Library:** folder, selection, search, filters, messages.
* **Sounds:** the whole form.
* **Arrangement:** zoom, the selected region, the placement beat.
* **Patcher, Effects, Notes:** canvas pan and zoom, the selected nodes, the open sub-patch.
* **Clip:** note selection, all of the automation editor's state, the piano roll's scroll.
* **Samples:** the sample editor's zoom and selection.

Sketch (in `EditorPanel` and the main region; round 2 does the same inside whatever renders a tab group):

```tsx
// Mount a view the first time it is shown, then keep it: hidden views keep their state but do no work.
// A ref, not state, so a newly revealed view renders in the same pass instead of one frame late.
const shown = useRef(new Set<ViewId>())
shown.current.add(region.active)
…
{region.views.filter((id) => shown.current.has(id)).map((id) => {
  const View = views[id].component
  return <Activity key={id} mode={id === region.active ? 'visible' : 'hidden'}><div data-view={id} className={styles.view}><View /></div></Activity>
})}
```

Views are mounted only on first reveal, so startup cost stays as it is today, and the Library chunk still loads lazily.

### What has to change for this to be safe

Hiding a view now cleans up its Effects but keeps its state and DOM. An Effect that does more than subscribe
therefore runs again each time the view is shown. 22 `ui` files have Effects; each one gets a quick check. The
ones known so far:

* **`LibraryPanel`:** the mount Effect's cleanup increments `operationId`, so hiding the Library mid-operation
  (a bundle import, say) throws away that operation's result. The work itself finishes in storage, and showing
  the view again re-reads the catalog, so this is acceptable. The cleanup still stops the preview, which is
  what we want. Document it in the code.
* **`PianoRoll`:** it re-centres the scroll on the clip's notes in an Effect keyed on `clipId`, so it would
  re-centre every time it is shown. Guard it with a ref that remembers the last centred clip.
* **Scroll positions:** do they survive `display: none`? Verify in the spike. If not, save `scrollTop` and
  `scrollLeft` in a layout-effect cleanup and restore them on show.
* **Open popups** (Radix menus, `QuickAdd`) in a view that gets hidden should close. Check in the spike that
  portalled content closes or hides with its view.
* **Browser tests:** hidden views stay in the DOM. `getByRole` skips hidden elements, but CSS and test-id
  locators (`[data-peak]`, `[data-lane]`, `getByTestId`) do not. `openView` should **return the view's root
  locator** (`[data-view="…"]`) so specs scope their queries to it. That is the same helper, so specs change once.

### What moves to stores anyway

`<Activity>` keeps a view's state for as long as *that instance* lives. It does not help when the view shows a
different entity, when the page reloads, or when the docking library remounts a view that is dragged to another
group (to check in the spike). Move only state that matters in those cases:

| State | Why a store | Where |
|---|---|---|
| Arrangement zoom (`pxPerBeat`) | Should survive a reload, as the piano roll's zoom already does | `useStoredState('sfxlab:arrangement-zoom')`, or the layout store if round 2 persists per-view settings |
| Arrangement selected region | Round 4's linked selection (selecting a region opens it in Clip) needs it outside the view | `selection-store`: `regionId` |
| Patch canvas pan and zoom, and the open sub-patch path | Patcher shows whichever track is selected: switching tracks should restore *that* graph's view, not reuse the last one | A small `graph-view-store`, keyed by `PatchTarget` (`trackId:graph`), kept in memory |

Everything else in the audit (form drafts, hover, drag drafts) stays as component state.

### Alternative considered

**Lifting all of it into stores, with no `<Activity>`.** This works with any docking library's
"render only when visible" mode. It is far more code, though: almost 60 `useState` calls across the view folders,
Library's catalog cache among them. It also still leaves per-frame work in hidden views to the docking library.
Only worth it if the spike shows that `<Activity>` conflicts with how the chosen library mounts panels.

**Add to round 2's spike criteria:**

* Does hiding a tab, or moving it to another group, remount its React tree?
* Do scroll positions and portals behave in a hidden `<Activity>`?

## 2. Per-frame work

The status store updates about 30 times a second. Three views re-render far more than they need to:

| Where | Today | Change |
|---|---|---|
| `ArrangementView` | Subscribes to `status.beat` at the top: the whole timeline (every lane and region) re-renders on every update while playing | Move the playhead into an `ArrangementPlayhead` component with its own selector, as the piano roll's `Playhead` does. `start()` reads `playing` with `getState()` when clicked instead of subscribing. |
| `AutomationEditor` | `useStatusStore((s) => s.status)`: the whole editor re-renders on every update, **even when its clip isn't playing**. It runs `resolveControlTarget` for every option in the target list each time. | Compute only `phase` in a narrow selector, in a leaf `AutomationPhase` component that draws the phase line |
| `LevelBar` (every mixer strip) | Subscribes to the whole status and re-renders on each update. The meter really does change every update (it falls slowly), so a narrower selector doesn't help. | Update the bar directly in the DOM: `useStatusStore.subscribe` in an Effect writes `style.height`, `data-peak` and `aria-valuenow` to a ref'd element. No React render. Specs that read `data-peak` keep working. |

**Guard:** a unit test, next to `tests/architecture.test.ts`, fails when a `ui` file uses the whole-status
selector `useStatusStore((…) => ….status)`. The handful of components that legitimately need the whole status
get an allow-list entry with a reason.

**Check:** a profiling pass (React Profiler or a `performance.measure` around status delivery), before and after,
with Session, Arrangement and Mixer visible. The roadmap already asks for this in rounds 2 and 3. Doing it now gives
round 2 a clean baseline.

### Measured (round 1b, 2026-10-24)

Setup: the starter project (`/?starter`) with three regions placed on the arrangement, Arrangement in the main
region and Mixer in the panel, the arrangement playing. Each figure is averaged over 10 s in headless Chromium on
the developer's Mac, after 2 s of warm-up. Two runs:

* **Dev build, React's own timings.** A stub `__REACT_DEVTOOLS_GLOBAL_HOOK__` puts React into profiling mode
  and counts commits, the root's `actualDuration`, and the components that rendered in each commit.
* **Production build, Chrome's counters** (`Performance.getMetrics` over CDP), with no React instrumentation.

"Before" is `feat/ui-redesign` at the start of round 1b; "after" includes the three per-frame fixes.

| Per second | Before | After |
|---|---|---|
| React commits (dev) | 28.9 | 28.9 |
| React render time (dev) | 126.9 ms | 51.2 ms |
| Component renders (dev) | 3,555 | 462 |
| … `ArrangementView` / `ArrangementRegion` | 29 / 87 | 0 / 0 |
| … `LevelBar` (4 strips) | 116 | 0 |
| … `ArrangementPlayhead` (one per lane) | n/a | 87 |
| Script time (production) | 40.2 ms | 20.7 ms |
| Main-thread task time (production) | 126.4 ms | 99.6 ms |
| Layout + style (production) | 27.7 ms | 24.9 ms |

Most of the "before" renders were Radix context-menu wrappers in the arrangement lanes, re-rendered with the view.
This setup doesn't show the automation editor, so its fix isn't in these numbers.

**What still renders at 30 Hz:**

* **`EffectiveValue`**: 202 renders a second. It selects the whole status only to ask `touchDestination` whether
  Touch can record, so a boolean selector would do. It's on the guard test's allow-list as pending.
* **`TransportBar`**: it subscribes to `beat` for the position display, so `HistoryButtons`, `FileMenu`,
  `SaveIndicator` and `MidiSettings` re-render with it, 29 times a second each. The position should move into a
  leaf component.

Both are small, separate fixes, and are not part of round 1b.

## 3. Size assumptions

### The shell (round 2)

`Splitter` (`window.innerHeight - clientY`) and `Workspace`'s clamp (`window.innerHeight`, `MIN_SESSION_HEIGHT`)
go away when the docking library's own sashes replace them. If round 2 keeps our own regions instead, `Splitter`
measures from its container's bottom edge (`parentElement.getBoundingClientRect().bottom`) and the clamp uses
the container's height. Either way, nothing in `ui/` reads the window size except popups positioned against the
window, which the audit found to be fine.

The main region's shared scroll container goes too: each view's root scrolls itself (`overflow: auto` on the view;
the region uses `overflow: hidden`), so Session and Arrangement each keep their own offset.

### Views (round 3)

* **A minimum size for every view.** `ViewDescriptor` gains `minSize: { width, height }`. Every view must be usable
  at that size; the docking shell enforces it on sashes and never squeezes a view below it.
  * Proposed: tool views (Samples, Sounds, Library, Mixer, Notes) **280 × 200**, so they fit a sidebar.
  * Editors (Instrument, Effects, Clip, Arrangement, Session) **480 × 240**.
* **Container queries, not media queries.** The view wrapper from §1 sets `container-type: size`. Each view's CSS
  switches layout on `@container` rules:

| View | Below its breakpoint |
|---|---|
| Patcher / Effects / Notes | The 260 px property editor becomes an overlay drawer on the canvas (toggle button); the notes preview aside stacks under the canvas |
| Clip | The 270 px settings column moves into a collapsible strip above the editor; the automation editor's 240 px lane list collapses to a `<select>` |
| Library | Three columns → two (tree and items, details below) → one (the folder tree becomes a breadcrumb `<select>`) |
| Mixer | Below ~200 px height, strips drop pan and sends and keep the name, M / S and fader; horizontal scroll stays |
| Samples | The sample editor's fixed 150 px waveform becomes `min(150px, 40cqh)` |
| Sounds | The 160 px row labels wrap above their controls |
| Arrangement, Session | The 120 px name column narrows to 72 px with ellipsis; lanes and cells keep their height and scroll |

* **Test:** one smoke spec renders each view alone at its `minSize` (a test-only layout, or a panel sized with the
  splitter's keyboard steps). It asserts that the view root doesn't overflow sideways
  (`scrollWidth <= clientWidth`, apart from deliberate scrollers that carry `data-scroll`) and that the view's
  main control is visible.

## 4. Assumptions about other views

| Where | Today | Change |
|---|---|---|
| `AudioClipSlot` empty-cell menu | "No samples yet: import some in the Samples tab" (disabled) | An enabled entry **"Import samples…"** that calls `revealView('samples')` |
| `Patcher` for master and returns | Text pointing to "the Effects tab" | A button **"Open effects"** (`openMasterEffects()` / `openTrackView(id, 'effects')`) |
| `ClipEditor`, nothing selected | "Select a clip with ✎ to edit it." | Name the selected track's clips as buttons (`openClip`), offer **Create clip** on an instrument track, and **Show session** (`revealView('session')`) |
| `ClipEditor`, empty automation slot | "Create a slot in the session grid." | A **Create slot** button (`editAutomationSlot`, as `AutomationSlotCell` does) |
| Arrangement placement | Only through the session grid's *Place on arrangement* | Unchanged until round 4's drag and drop. Not a remount problem. |

**Rule (in ARCHITECTURE.md):** a view never names another view in its text. It offers an action that calls
`revealView` or an intent. Where a label must name a view, take it from the registry. To avoid an import cycle
(views → `views.ts` → views), split the titles into `ui/layout/view-titles.ts`, which imports no components, and
have `views.ts` compose the two.

Found while doing round 1b and left as it was: the Arrangement's empty state ("Add a track in the session view
first") and its toolbar hint ("right-click a session slot") still name the session view. Neither was in the audit.
The empty state could offer **Show session**, like the Clip view does.

## Proposed order

1. **Round 1b (now, small PRs, no visible change except the empty states):**
   * the three per-frame fixes, with the guard test and a profiling baseline;
   * the empty-state and menu actions, with `view-titles.ts`;
   * arrangement zoom in `useStoredState`.
2. **Round 2:**
   * the spike answers the questions in §1 (remounts, scroll, portals);
   * `<Activity>` keep-alive goes into the shell;
   * the effects check from §1;
   * `openView` returns the view's locator;
   * window-size reads leave with `Splitter`;
   * each view gets its own scroll container.
3. **Round 3:**
   * `minSize` and the container-query layouts, view by view, with the min-size smoke spec;
   * the graph-view store and `regionId` (the latter can wait for round 4 if nothing needs it sooner).

If this is accepted, the roadmap's round 3 bullets on hidden state and per-frame pausing shrink to the store moves
above, and round 2 gains the spike questions.

## Decisions

| Question | Proposed |
|---|---|
| Keep hidden views mounted (`<Activity>`) or lift their state into stores | `<Activity>`, unless the spike shows a conflict with the docking library |
| Do the per-frame and empty-state fixes before round 2 | Yes, as round 1b |
| Minimum sizes | 280 × 200 for tool views, 480 × 240 for editors |
| Patch canvas view per graph: in memory or persisted | In memory for now; persist with round 2's layout if users ask |
