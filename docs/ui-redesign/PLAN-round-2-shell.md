# Round 2: the docking shell

Status: **done** 2026-10-24, decisions signed off as proposed. What changed on the way is under [Changes made while implementing](#changes-made-while-implementing); shipped behavior is in [ARCHITECTURE.md § Layout and navigation](../../ARCHITECTURE.md#layout-and-navigation). Part of the [UI redesign](README.md). Carries out
[roadmap § Round 2](DRAFT-roadmap.md#round-2-the-shell) and the round-2 parts of the
[audit remediation proposal](PROPOSAL-audit-remediation.md): §1 (keep-alive) and §3 (the shell).
The [decisions](#decisions-to-sign-off) were accepted as proposed on 2026-10-24.

## Goal

Replace `Workspace`'s fixed main region, `Splitter` and `EditorPanel` with a docking workbench that mounts the
round-1 view registry. After this round:

* views sit in tab groups that the user can split, drag and dock, and the layout survives a reload; *Reset layout*
  always works;
* a hidden view keeps its state and does no work: it stays mounted inside `<Activity mode="hidden">`;
* round-1 callers (`revealView`, the intents) keep working without changes;
* nothing in `ui/` reads the window size to lay itself out;
* `openView` returns the view's root locator, and specs look inside it.

**Out of scope:**

* `minSize` and container queries (round 3);
* new views, such as the wave editor;
* drag and drop between views (round 4);
* the command registry and keybinding table (round 5);
* restyling and icons (round 8);
* popout windows;
* a view open twice.

## The spike

Two throwaway branches, never merged, both on `feat/ui-redesign` at `4c56be6`:

* `spike/round-2-dockview` (`abeaecf`), with `dockview-react` 8.5.1. The newer 8.6.1 was five days old.
* `spike/round-2-flexlayout` (`e93bdcd`), with `flexlayout-react` 0.11.1, the fallback.

Each branch does the same things:

* replaces the main region, `Splitter` and `EditorPanel` with the library and mounts all ten views from the registry
  in today's arrangement;
* wraps each view in `<Activity>` and mounts it on first show;
* syncs the layout store both ways (the façade below, in rough form);
* has `openView` click a `role="tab"`, then wait for the view's root and return it (see the findings below).

Both packages are MIT licensed, peer on React 19 and have no other dependencies. The profiling script
(`round-2-spike-profile.cjs`, round 1b's script taught to click tabs) and its raw output are kept outside the repo
for now. Step 8 adds the script to the repo.

### Results against the roadmap's criteria

| Criterion | dockview 8.5.1 | flexlayout-react 0.11.1 |
|---|---|---|
| Pointer-capture gestures | **Pass.** Node drag, pan and zoom, region drag and the automation editor (smoke specs). A fader dragged and released outside its strip, a piano-roll note drag, and a sash drag (by hand). | **Pass**, the same set (fader, note and tab dock scripted). One smoke assertion misses its 0.5 px tolerance by 0.05 px on every run: `graph-navigation`'s zoom at the cursor. Tab groups sit at fractional pixel offsets because their sizes are weights. |
| Radix menus inside panels | **Pass.** A slot's context menu opens over the neighbouring group. | **Pass**, the same. |
| Theming with our CSS variables | **Pass.** A theme class maps about 45 `--dv-*` variables onto `theme.css`. | **Pass.** About 15 `--flexlayout-*` variables, set on `:root`. |
| Keyboard: tabs | **Pass.** `tablist`, `tab` and `aria-selected`; arrow keys rove the focus and Enter activates. | **Pass**, the same. |
| Keyboard: splitters | **Fail.** Sashes are plain `div`s: no role, not focusable, no key handling. Today's `Splitter` works from the keyboard, so this would be a regression. | **Pass.** `role="separator"` with `aria-valuenow`, `-min` and `-max`. Focusable; three ArrowDown presses moved it from 45 % to 48 %. |
| Keyboard: moving between groups | **Paid.** `keyboardNavigation` (F6, Ctrl+]) and keyboard docking are in the proprietary `dockview-enterprise` package. The free build logs an error and ignores the option. | **Free.** The `focusNextTabset` and `focusPreviousTabset` key map entries (off by default). |
| Screen readers | With `renderer: 'always'` (needed to keep scroll positions, see below) every `tabpanel` is empty. The content lives in overlays at the end of the dock, so `aria-controls` points at an empty element and DOM order differs from what is on screen. The dock always adds two live regions, one of them `role="alert"`. | Content is inside its `tabpanel`. No `role="alert"` region. |
| Render only visible | `onlyWhenVisible` (the default) detaches a hidden panel's DOM: scroll positions are lost and `ResizeObserver`s read 0. `always` keeps the DOM under `visibility: hidden`, so hidden views still take part in layout. With `always`, every panel also mounts at startup, so the spike's panel renders nothing until first shown. | `tabEnableRenderOnDemand` (the default): a tab renders when first shown and then stays mounted. |
| Bundle size (production build, against 227 kB / 76 kB gzip JS) | **+389 kB, +89.6 kB gzip** JS. **+136 kB, +10.5 kB gzip** CSS: one stylesheet holds all ten built-in themes. | **+194 kB, +48.6 kB gzip** JS. **+24 kB, +3.4 kB gzip** CSS. |
| Playwright selectors | Tabs by `getByRole('tab', { name })`. `dragTo` on a tab docks it. Smoke: 25 of 28 passed with only the tab click changed. With the `openView` fix below, one full run passed 26 of 28. `startup` failed because `getByRole('alert')` also finds dockview's empty live region (strict mode). A `library` spec failed once, then passed three times in a row on its own. | The same tab selectors. 27 of 28 (the `graph-navigation` tolerance above). `dragTo` does not start a flexlayout drag; a `mouse.down` with stepped `mouse.move`s does. |
| Sidebars (for the regions) | Edge groups are free; auto-hiding edge groups are paid. | Borders (left, right, bottom), free, with `show`, collapse (`selected: -1`), `minSize` and `maxSize`. |
| Saving the layout | `api.toJSON()` and `fromJSON()` (1.7 kB for the default layout). | `model.toJson()` and `Model.fromJson()`. |
| Licence | MIT, but since v8 (August 2026) these are in `dockview-enterprise`, a commercial licence per developer per year: keyboard navigation, keyboard docking, auto-hiding sidebars, layout undo, pinned tabs, multi-row tabs and smart guides. | MIT, all of it. |

### The proposal's questions (§1)

* **Does hiding a tab, or moving it to another group, remount its React tree?** No, in both libraries. A
  `useState` initializer in every view counted instances, and the count stayed at one through all of these:
  * hiding and showing again;
  * a move to another group (dockview's `moveTo`, flexlayout's `moveNode`);
  * a tab dragged by mouse;
  * dockview's floating group.

  The view's Effects run again each time it is shown, as `<Activity>` intends.
* **Do scroll positions survive a hidden `<Activity>`?** Yes. No code is needed to save and restore them.
  * Session scrolled to 25 px, then hidden and shown again: still 25 px. Then moved to another group: 25 px (dockview).
  * Arrangement scrolled 300 px sideways, hidden and shown, then moved: 300 px each time (flexlayout).
  * The one exception is dockview's `onlyWhenVisible` renderer, which detaches the DOM and comes back at 0.
* **Do portals behave?** Yes, with one wrinkle. The test: a Radix context menu open on a session slot, then the view
  hidden from code.
  * The portalled menu is hidden along with its view.
  * Radix's `body { pointer-events: none }` lock is released (its Effect is cleaned up), so the rest of the app
    stays usable.
  * When the view is shown again, the menu is still open and locks the page again.

  This is React's behavior, so the library makes no difference. In practice a view is hidden by a click elsewhere or
  by choosing a menu item, and both close the menu first. Only a hide from code while a menu is open (a keyboard
  shortcut) leaves it open. See the [Effects check](#the-effects-check).
* **Found on the way: hidden views stay in the DOM, and that trips up tests.** The tab click in `openView` returns
  before the switch is committed. The `tempo` spec's next locator
  (`getByRole('group', { name: 'View' }).getByRole('button', { name: 'Graph' })`) then resolved to the *Instrument*
  view's identical button, and `<Activity>` hid it a moment later. Playwright waits for the element it resolved to
  become visible and does not resolve again, so the spec timed out. The old shell unmounted that element, which
  forced Playwright to resolve again. The fix is the proposal's: `openView` waits until `[data-view="…"]` is visible
  and returns it. With the wait added, `tempo` and `presets` pass.
* **Confirmed: `PianoRoll` re-centres when shown.** Scrolled to 1334 px, hidden and shown again, it was at 1251 px. It
  needs the ref guard that §1 proposes.

### Performance

The setup is round 1b's: the starter project with three regions placed, Arrangement and Mixer visible, the
arrangement playing. The tabs are clicked by the extended script. Each figure is averaged over 10 s after 2 s of
warm-up, in headless Chromium. The baseline is `feat/ui-redesign` at `4c56be6`, run four times; the range shows
how much the production counters vary from run to run on the same build.

| Per second | Baseline (4 runs) | dockview | flexlayout |
|---|---|---|---|
| Component renders (dev) | 144–145 | 144 | 145 |
| React render time (dev) | 6.1–8.6 ms | 7.3 ms | 6.7 ms |
| Script (production) | 9.8–13.2 ms | 11.3 ms | 11.4 ms |
| Main-thread tasks (production) | 65.9–94.3 ms | 74.1 ms | 70.7 ms |
| Layout + style (production) | 17.6–25.3 ms | 20.5 ms | 19.1 ms |

With more views mounted or visible:

| Per second | Renders (dev) | Render time (dev) | Tasks (prod) | Layout + style (prod) |
|---|---|---|---|---|
| dockview, every panel view shown once, then hidden, with `<Activity>` | 145 | 7.0 ms | 66.1 ms | 17.6 ms |
| … the same without `<Activity>` | 145 | 8.0 ms | 86.4 ms | 24.1 ms |
| flexlayout, every panel view shown once, with `<Activity>` | 145 | 8.4 ms | 82.1 ms | 22.0 ms |
| … the same without `<Activity>` | 145 | 9.8 ms | 84.7 ms | 23.5 ms |
| dockview, four views visible: Session and Arrangement over Clip and Mixer | 144 | 8.4 ms | 93.6 ms | 26.3 ms |

What this shows:

* **The shell adds no React work.** Component renders are the same in every configuration. The production counters
  differ by less than the baseline differs from itself.
* **Since round 1b, hidden views have no per-frame work to pause in this setup.** A run before the `EffectiveValue`
  fix shows what `<Activity>` saves when they do: the spike branched before that fix, every panel view was mounted
  and hidden, and component renders fell from 549 to 462 a second with `<Activity>`. The hidden Instrument, Effects
  and Notes views had stopped re-rendering their `EffectiveValue`s.
* **The four-view setup is a weak test.** The clip shown in Clip wasn't playing, so its playhead (a leaf, `Playhead`)
  did not run.

### Recommendation

**flexlayout-react**, pinned to 0.11.1. This reverses the roadmap's proposal of dockview.

* It passes every criterion. dockview fails keyboard splitters out of the box, and keyboard movement between groups
  is behind its paid package.
* Screen readers get a real tab–panel relationship, and the specs keep `getByRole('alert')`.
* The bundle cost is half of dockview's: 52 kB against 100 kB gzip, CSS included.
* Everything we expect to want later is MIT: sidebars that collapse, popout windows, floating panels and the tabset
  focus keys. dockview has started moving features into a commercial tier, and round 5's keyboard work would want
  some of them.

The risks, and how this plan handles them:

* **Breaking minor versions.** flexlayout is 0.x and its minor versions break (0.8 in April 2025, 0.11 in
  September 2026). Pin the exact version, keep every import in `ui/layout/` (enforced by a test), and upgrade on
  purpose.
* **Fractional offsets.** These need a look in step 5 (the `graph-navigation` assertion).
* **Drag in specs.** A tab drag in a spec needs stepped mouse moves; that goes into a `dragView` helper.
* **Model and actions.** Its API is a model with actions (`model.doAction(Actions.selectTab(id))`) rather than
  methods on panels. That suits the façade.

dockview would also work. Its gaps can be closed with an adapter that patches its DOM: a role, `tabindex` and key
handling on `.dv-sash`, our own F6 handling, and scoping the `alert` spec. That adapter would be code written
against dockview's internals, on top of twice the bundle. If you prefer dockview's polish (drop overlays, floating
groups), the steps below stay the same and step 5 grows by that adapter.

Our own fixed regions (the third option) aren't needed: both libraries answer the remount and scroll questions well.

## Design

### Where the code lives

* `ui/Workspace.tsx` keeps the shell's hooks (persistence, undo and view shortcuts) and renders, top to bottom:
  * the transport bar;
  * a row with the activity bar beside the layout;
  * the status bar.
* `ui/layout/` holds the shell:

| File | What it does |
|---|---|
| `Workbench.tsx` | Renders the flexlayout `Layout` from the model and registers the layout driver with the store. |
| `ViewHost.tsx` | The panel factory: `<Activity>`, the `data-view` root and the `Suspense` fallback for Library. |
| `default-layout.ts` | Builds the default model JSON from the registry. Pure, with unit tests. |
| `layout-storage.ts` | Parses, validates, repairs and serializes the saved layout. Pure, with unit tests. |
| `ActivityBar.tsx` | The activity bar. |
| `StatusBar.tsx` | The status bar. |
| `flex-theme.css` | Maps flexlayout's variables onto `theme.css`. |

* `EditorPanel`, `ui/shared/Splitter.tsx` and their CSS are deleted.

### Layout store façade (`state/layout-store.ts`)

The library owns the layout tree. The store keeps the API round 1's callers use, forwards it to the shell, and
mirrors what is visible for code that needs to know.

```ts
/** Where a view can sit. `editor` is round 1's `main`. */
export type RegionId = 'editor' | 'panel' | 'primary' | 'secondary'

/** A tab group, as the store mirrors it. A region can hold several (the editor area splits). */
export interface GroupState { readonly id: string; readonly region: RegionId; readonly views: readonly ViewId[]; readonly active: ViewId }

/** Implemented by the shell. `state` cannot import `ui`, so the shell registers itself. */
export interface LayoutDriver {
  reveal(id: ViewId): void
  setRegionVisible(region: RegionId, visible: boolean): void
  reset(): void
}

interface LayoutState {
  readonly groups: readonly GroupState[]
  readonly visible: readonly ViewId[]
  readonly hiddenRegions: readonly RegionId[]
  revealView(id: ViewId): void        // unchanged for callers
  toggleMainView(): void              // the Tab key and the transport's Session | Arrangement buttons
  toggleRegion(region: RegionId): void
  resetLayout(): void
  resetPanel(): void                  // see the decisions: keep or drop
  /** Shell only. Returns the detach function. */
  attachDriver(driver: LayoutDriver): () => void
  /** Shell only: mirror the library's state after each model change. */
  sync(snapshot: Pick<LayoutState, 'groups' | 'visible' | 'hiddenRegions'>): void
}
```

* **Without a driver** (unit tests, or before the shell mounts), `revealView` updates the mirror itself as it does
  today. The existing unit tests keep their meaning and the intents can be tested in Node.
* **With a driver**, `revealView` calls `driver.reveal(id)`:
  * it selects the tab;
  * if the tab sits in a hidden region, it shows that region first;
  * if a view is missing from the layout, it adds it to its default region. That can't happen while tabs can't be
    closed, but it keeps a stale saved layout safe.
* **Mirroring.** The shell calls `sync` from flexlayout's `onModelChange`. The spike's two-way subscription goes
  away: the store never writes to the model except through the driver.
* **`toggleMainView`** reveals whichever of Session and Arrangement is not visible. When both are visible (side by
  side) it does nothing.
* **Who reads `regions` today:** three `ui` files (`EditorPanel`, which is deleted; `Workspace`; and the
  transport's Session | Arrangement buttons, which switch to `visible`) and `useLayoutPersistence`, which is
  rewritten. No intent or `revealView` call site changes.

### Layout persistence

* The layout is saved under `sfxlab:layout` as `{ version: 1, model: IJsonModel }`. It is written 250 ms after the
  last model change, and read once before the first render.
* **`parseStoredLayout(raw)`** is pure and returns either a model or "use the default". It rejects:
  * anything that isn't JSON;
  * the wrong `version`;
  * a tab whose id isn't a `ViewId`, or whose `component` isn't `'view'`;
  * duplicate ids;
  * unknown node types.

  It repairs one thing: views missing from the saved layout are added to their default region, so a view added in a
  later round needs no migration. If `Model.fromJson` still throws, the default is used. Every storage access is
  guarded as in `useStoredState`.
* **Migration.** When `sfxlab:layout` is absent, the default layout takes the editor's active view from
  `sfxlab:main-view` and the panel's height from `sfxlab:editor-height`. Once `sfxlab:layout` exists, neither old key
  is read or written again.
* **Settled here: the round-1 question whether to persist the panel's tab.** Yes: the active tab of every group is
  part of the saved layout.
* *Reset layout* (activity bar, and a status bar menu) replaces the model with the default and saves it.

### Regions

* **Editor area:** flexlayout's main row. By default it holds one tab group with Session and Arrangement. It can
  be split freely.
* **Panel:** flexlayout's bottom border, holding the eight tool views as today. A border is what today's panel
  is: one tab showing at a time, resizable from its edge. It also hides and shows natively. A view dragged out of it
  into the editor area can be split there. The spike didn't exercise borders, so step 5 confirms that they render
  hidden tabs on demand and fire the same `visibility` events. (The alternative, a tab group in the grid, can be
  split but has no native hide: maximizing the editor's group would also hide the editor's other groups. See the
  decisions.)
* **Primary and secondary sidebars:** flexlayout's left and right borders. They are empty and hidden by default
  until round 3 makes the tool views fit a sidebar. Library overflows below about 650 px today.
* **Activity bar** (`<nav aria-label="Views">`):
  * buttons that reveal Session and Arrangement;
  * toggles for the primary sidebar, the panel and the secondary sidebar;
  * *Reset layout*.

  Text and glyphs only; icons come in round 8.
* **Status bar** (`<footer>`):
  * `SaveIndicator` moves here from the transport bar;
  * so does the audio-failure banner (still `role="alert"`);
  * toasts stay where they are.
* **Landmarks.** The activity bar is a `nav`, each region a labelled `region`, the status bar a `contentinfo`.
* **Tabs can't be closed** (`tabEnableClose: false`). Every view is always somewhere, so `revealView` always finds it.
  Closing and reopening belongs with the activity bar's later roles.

### Keep-alive with `<Activity>`

`ViewHost` renders `<Activity mode={visible ? 'visible' : 'hidden'}>` around
`<div data-view={id} className={styles.view}>`. The visibility comes from the tab node's `visibility` event.
flexlayout's render-on-demand already mounts a view when it is first shown, which stands in for the proposal's
`shown` ref. Library stays lazy.

Just before it hides a view, `ViewHost` dispatches a `view-hide` event on the view's root. Popups that should close
with their view (`QuickAdd`, `GroovePanel`) listen for it on `closest('[data-view]')`. They can't simply close in an
Effect cleanup: StrictMode's simulated unmount in dev would close them as soon as they open.

### The Effects check

Hiding a view now cleans up its Effects and keeps its state, so each Effect runs again when the view is shown.
`feat/ui-redesign` has 23 `ui` files with Effects; 15 are inside views.

| File | Effect | On hide, then show | Action |
|---|---|---|---|
| `PianoRoll` | Re-centres the scroll on `clipId` | Re-centres every time: confirmed, 1334 px to 1251 px | Remember the last centred clip in a ref, and centre only when it changes |
| `LibraryPanel` | Reads the catalog; cleanup increments `operationId` and stops the preview | Drops the result of an operation still running, then re-reads the catalog | Acceptable (the work finishes in storage). Comment it in the code. |
| `QuickAdd` | Focuses its input, closes on a press outside | Takes focus again on show | Close on `ViewHost`'s `view-hide` event (below) |
| `GroovePanel` | Outside-press and Escape listeners while open | Reopens on show | The same |
| Radix menus (portals) | Their dismiss layer | Reopen on show (see the spike) | None now. Hides come from a click or a menu choice, which close the menu first. Re-check when round 5 adds shortcuts that hide views. |
| `AutomationEditor` | Applies a requested target, then clears it | No-op: the request is already cleared | None |
| `use-control-gesture`, `use-control-input` | End the gesture and cancel the throttle on cleanup | Hiding mid-drag ends the gesture, as unmounting does today | None |
| `PianoRoll`, `PatchCanvas` and `use-control-input` (wheel); `PatchCanvas` (Shift+A) | Element and window listeners | Removed while hidden, added back on show | None. This is wanted: a hidden patcher no longer takes Shift+A. |
| `SampleEditor`, `WaveformThumb`, `use-element-width` | Canvas redraw, `ResizeObserver` | Measure and redraw on show | None |
| `Playhead`, `LevelBar` | Status subscriptions | Paused while hidden | None. This is the point. |
| `use-piano-roll-interaction`, `use-stored-state` | Prune the selection, write the setting | Run once more, harmless | None |

One smoke spec checks that state survives a tab switch: a name typed into Sounds is still there after showing Mixer
and coming back.

### Scroll containers, and `Splitter` going away

* **Scrolling.** Every view's `data-view` root has `height: 100%` and `overflow: auto`. Each view scrolls itself, so
  Session and Arrangement keep separate offsets. Region containers use `overflow: hidden`. `Workspace`'s
  `main { overflow: auto }` goes.
* **`Splitter` and the clamp.** `Splitter` and `Workspace`'s clamp (`window.innerHeight`, `MIN_SESSION_HEIGHT`) go
  with the library's splitters. The panel's minimum height becomes the border's `minSize`. Afterwards
  `grep -rn "innerHeight\|innerWidth" src/ui` lists only popups positioned against the window (`QuickAdd`,
  tooltips, `MidiSettings`).
* **Keyboard.**
  * The splitters keep working from the keyboard; flexlayout's are built in.
  * F6 and Shift+F6 move the focus between tab groups (`focusNextTabset`, `focusPreviousTabset`).
  * The Tab-key conflict: see the decisions.

### Rules

* `tests/architecture.test.ts`: the `ui` allow-list gains `flexlayout-react`. A new case fails when any file
  outside `src/ui/layout/` imports it.
* `package.json` pins `flexlayout-react` to an exact version, with no caret.
* `vite.config.ts`: a `layout-vendor` chunk group, like `ui-vendor`, so app changes don't invalidate the library's
  cache.

### Browser tests

* **`openView(page, title)`**:
  * clicks the tab (`getByRole('tab', { name: title, exact: true })`) or the activity bar button;
  * waits until `[data-view="<id>"]` is visible;
  * returns that locator.

  `ViewTitle` gains the id mapping. The specs that look inside a view with CSS or test-id locators scope to the
  returned locator. That is the same helper, so the specs change once.
* **`dragView(page, title, target, side)`** drags a tab onto another view's edge with stepped mouse moves.
* **New smoke spec `layout.smoke.spec.ts`:**
  * toggling each region hides it and brings it back;
  * moving a view (Mixer next to Session), then reloading, keeps it there;
  * *Reset layout* restores the default;
  * a corrupt `sfxlab:layout` (bad JSON, an unknown view, a wrong version) falls back to the default without a
    console error;
  * view state survives a tab switch (the Sounds name).
* Fresh browser contexts give every spec the default layout, as now.

## Steps

Each step is one commit and leaves unit, architecture, typecheck and smoke green. Steps 1 to 3 don't need the
library, so they can land while the decisions are still open.

1. **`openView` returns the view root.**
   * `EditorPanel` and the main region wrap every view in `<div data-view={id}>`.
   * `openView` waits for that root and returns it.
   * The specs that use CSS or test-id locators inside a view scope to it.
2. **Per-view scroll containers.** The `data-view` root scrolls; the main region becomes `overflow: hidden`.
   Session and Arrangement keep separate offsets (a behavior change, listed below).
3. **Keep-alive and the Effects check, in today's shell.**
   * `EditorPanel` and the main region render their views in `<Activity>`, mounted on first show (the
     proposal's sketch), and dispatch `view-hide` on a view's root before hiding it.
   * Make the `PianoRoll`, `QuickAdd`, `GroovePanel` and `LibraryPanel` changes from the table.
   * Add the state-survives smoke assertion.
   * This lands keep-alive on its own, so step 5 only moves it.
4. **Layout store façade (state only).**
   * `GroupState`, `visible`, `hiddenRegions`, `LayoutDriver`, `attachDriver`, `sync`, `toggleRegion` and
     `resetLayout`; `main` becomes `editor`.
   * Unit tests: `revealView` with and without a driver, and `toggleMainView` with one, two or no main views visible.
   * Today's shell keeps working without a driver.
5. **The docking shell.**
   * Add `flexlayout-react` (exact pin, allow-list, the `ui/layout`-only rule, the vendor chunk).
   * Add `Workbench`, `ViewHost`, `default-layout.ts` and the theme. The default layout is today's: Session and
     Arrangement in the editor area, the tool views in the bottom border.
   * Confirm that border tabs render on demand and fire `visibility` like tab-group tabs. If they don't, fall back
     to a tab group for the panel and record why.
   * Delete `EditorPanel`, `Splitter` and the window clamp. `openView` clicks tabs.
   * Until step 6, `useLayoutPersistence` keeps restoring the main view from `sfxlab:main-view` through
     `revealView`. The panel's height isn't remembered between these two steps.
   * Look into `graph-navigation`'s fractional-offset miss: round the tab groups' offsets, or find the rounding in
     `PatchCanvas`'s zoom-at-cursor arithmetic. Don't loosen the assertion without a reason.
6. **Layout persistence.**
   * `layout-storage.ts` with unit tests (each rejection and the repair).
   * The debounced save, the migration from `sfxlab:main-view` and `sfxlab:editor-height`, and *Reset layout*.
   * The persistence, reset and corrupt-layout smoke specs.
7. **Regions.**
   * The activity bar, the sidebars as borders, panel toggling, and the status bar with `SaveIndicator` and the
     audio-failure alert.
   * The landmarks, the F6 keys and the Tab-key rule as decided.
   * The region-toggle smoke spec; `startup.smoke.spec.ts` finds the alert in the status bar.
8. **Profiling and docs.**
   * Add the profiling script as `scripts/profile-status.cjs`, with its usage in a header comment.
   * Re-run the profile with Session, Arrangement and Mixer visible and a clip playing in Clip, and record it here.
   * ARCHITECTURE.md § Layout and navigation describes the shell, the façade, persistence and keep-alive.
   * [README.md](README.md) marks round 2 done. The roadmap drops round 3's hidden-state and pause bullets and notes
     the library choice.

## Changes made while implementing

What turned out different from the design above, step by step.

* **Before step 3: the `library` spec is not flaky on the base.** "Isolated previews close their audio context…"
  passed 15 times in a row alone on `feat/ui-redesign` plus the plan, and in every full run since. The spike's one
  failure was on the dockview branch.
* **Step 3: `KeptViews`.** Today's shell mounted each region's views on first show with a small `KeptViews`
  component; step 5 deleted it, since flexlayout renders tabs on demand. `ViewHost` keeps the root element from a
  callback ref, because `<Activity>` detaches refs while hidden, and dispatches `view-hide` from a layout Effect,
  which runs before the hidden view's own Effects are cleaned up.
* **Step 3: `LibraryPanel`'s cleanup also clears `busy`.** An operation dropped by a hide never reached its
  `finally`, so the panel came back busy.
* **Step 4: `resetPanel` went with the façade**, as decided, so replacing the project stopped moving the panel
  in step 4 already.
* **Step 5: the driver is `ui/layout/layout-driver.ts`**, a class with unit tests that run flexlayout's `Model` in
  Node. It computes the mirror from the model rather than from `visibility` events, so `sync` is current right
  after each action. `sync` keeps the mirror's references when nothing changed, so splitter drags don't
  re-render subscribers.
* **Step 5: the panel is a border, as planned.** Border tabs render on demand and fire `visibility` like tab-group
  tabs. One border behavior shapes the façade: clicking a border's open tab collapses the border
  (`selected: -1`). The mirror counts a collapsed border as a hidden region, and showing it again opens the tab it
  showed last. `revealView` never selects a border's open tab, and `openView` doesn't click a tab that is
  already selected.
* **Step 5: `graph-navigation`'s 0.05 px miss came from Chromium, not from flexlayout.** Wheel and mouse events
  report whole pixels (the fraction of `clientX` is dropped); pointer events keep it. A canvas at a fractional
  offset therefore zoomed about a point up to 1 px off the cursor, and the spec, which moves the cursor to
  `node.x + 20`, caught it as soon as the node sat at a fraction. `PatchCanvas` now zooms at the last pointer
  position when it is the same spot as the wheel event's. Measured with Instrument docked beside Session (the
  canvas at x = 752.5): the anchor drifted 0.32 px before and 0 after. The assertion is unchanged. In the default
  layout the panel's height is a whole number, so the canvas sits on whole pixels anyway.
* **Step 5: page-wide text locators.** Hidden views stay in the DOM, and flexlayout puts the border's panels
  before the editor's. `page.getByText('Sweep').first()` then found the hidden Instrument view's copy, so the
  specs that click a track or the master by its text now look in the Session view (`viewRoot(page, 'Session')`).
* **Step 5: tooltips moved to `view-titles.ts`** (`viewTooltips`), so the default layout can give tabs their
  tooltips (`helpText`) without importing the views.
* **Step 6: dragging the panel's open tab away keeps the panel open.** flexlayout collapses a border whose open
  tab leaves it; today's panel always shows a view, so the driver turns that move into "move, then open the
  neighbouring tab" (`FlexLayoutDriver.intercept`, flexlayout's `onAction`). Found while writing the persistence
  spec.
* **Step 6: what the parser repairs and rejects, beyond the list above.** It also adds a border the saved layout
  lacks (empty and hidden), gives every tab the registry's current name and tooltip, and always applies today's
  global attributes, so a saved layout can't turn closing tabs back on. It rejects saved popouts and
  sub-layouts, which round 2 doesn't support.
* **Step 6: a migrated layout is saved at once**, so the old keys are read only the first time. A save waiting for
  its 250 ms is written on `pagehide`, so a reload right after a change keeps it.
* **Step 6: *Reset layout* arrived with a first activity bar** holding only that button; step 7 adds the rest.
  `useLayoutPersistence` now hands the saved model to `Workbench` instead of restoring the main view through
  `revealView`.
* **Step 7: F6 is ours, not flexlayout's.** `focusNextTabset` cycles tab sets only, so it never reaches a border:
  with the panel as a border it had nothing to cycle. `Workbench` handles F6 and Shift+F6 itself
  (`group-focus.ts`): editor groups in order, then the panel and the sidebars that are showing; each move
  focuses the group's open tab.
* **Step 7: landmarks sit on the view roots.** flexlayout renders a region's tabs and its content in separate
  places, so no element wraps a region. Each view's `data-view` root is a `region` named after the view, and
  takes the focus on a click (`tabIndex={-1}`, no outline) so F6 knows where the user is. The activity bar is the
  `nav`, the status bar the `contentinfo`.
* **Step 7: the status bar's menu** is *Layout ▾*: hide or show the panel and each sidebar, and *Reset layout*.
* **Step 7: a shown sidebar with no views is a thin strip**, the target to drop a view on, and a view dropped
  into a closed border opens there (`borderAutoSelectTabWhenClosed`). Toggling an empty sidebar shows or hides
  that strip.
* **Step 7: the Tab-key rule** checks `closest('[role="tab"], [role="separator"], [data-activity-bar]')`.
* **Step 8: the profile.** `scripts/profile-status.cjs` is the spike's script with three setups (`editor`, `all`,
  `four`; see its header). Base (`feat/ui-redesign` with this plan) and this branch ran interleaved in one session,
  10 s each after 2 s of warm-up, headless Chromium:

  | Per second | Base, 2 runs | Round 2, 2 runs | Round 2, every panel view shown once | Round 2, four views (`four`) |
  |---|---|---|---|---|
  | Component renders (dev) | 145, 144 | 145, 145 | 145 | 173 |
  | React render time (dev) | 8.0, 13.1 ms | 7.3, 9.3 ms | 10.3 ms | 10.3 ms |
  | Script (production) | 12.2, 13.1 ms | 14.9, 14.0 ms | 13.6 ms | 17.4 ms |
  | Main-thread tasks (production) | 79.3, 87.6 ms | 96.0, 88.9 ms | 89.7 ms | 121.6 ms |
  | Layout + style (production) | 22.2, 23.3 ms | 27.0, 25.0 ms | 24.3 ms | 24.7 ms |

  * With the same views showing (Arrangement and Mixer, the arrangement playing), component renders stay at the
    baseline's 144–145 a second, and the hidden views add nothing: showing every panel view once and hiding it
    again leaves 145. The production counters fall inside the spike's baseline range (tasks 65.9–94.3 ms, layout
    and style 17.6–25.3 ms) except the first run's tasks, 96.0 ms; the second pair differs by 1.3 ms.
  * `four` shows Session and Arrangement side by side over Clip, with Mixer in the panel and scene 1 playing, its
    clip open in Clip. The extra 28 renders a second are Clip's `Playhead` (29 a second), the only per-frame
    component that setup adds. Session's grid itself doesn't re-render.
  * A third pair was cut short when the servers stopped, so it isn't in the table.

## Behavior changes

Intended:

* The main area becomes tab groups that can be split, dragged and docked. The bottom panel becomes a border whose
  views can be dragged out into them. Both look like tabs rather than today's buttons.
* The layout is saved per browser, including which tab each group shows. Today only Session or Arrangement is
  remembered.
* Session and Arrangement can be visible side by side, and each keeps its own scroll offset.
* A view keeps its state when hidden: forms, zoom, selection, scroll and the open sub-patch. Today all of it is lost
  on a tab switch.
* The splitter's keyboard step and its accessible name become flexlayout's.
* `SaveIndicator` moves from the transport bar to the status bar, and the audio-failure banner moves with it.
* The activity bar and the status bar are new.

Anything else a reviewer notices is a bug in this round.

## Verification

* `npm test` (unit and architecture), `npm run typecheck` and `npm run test:smoke` all pass. Run `npm run test:audio`
  once before merging.
* The `library` smoke spec failed once on the dockview spike and passed three times in a row alone. Check whether it
  is flaky on `feat/ui-redesign` before step 3, so a flake isn't blamed on keep-alive.
* Manual pass on the dev build:
  * every view's tab, and the Tab key and the transport buttons;
  * each intent: ✎ on MIDI and audio clips, the fx and notes badges, the master, automation slots, *New sampler
    track*;
  * dragging a view into every region, then reload;
  * *Reset layout*;
  * the keyboard alone: tabs, splitters, F6, the activity bar;
  * a screen reader pass (VoiceOver) over the tabs and the splitters;
  * a context menu and `QuickAdd` open while their view is hidden (a keyboard shortcut).
* Profiling as in step 8. Component renders must stay at the baseline's 144 a second with nothing more visible.

## Decisions to sign off

Signed off 2026-10-24: every row as proposed. One row was overridden later, on review of the shipped shell (the panel; see its notes).

| Question | Decided | Notes |
|---|---|---|
| Docking library | **flexlayout-react 0.11.1**, pinned, imported only from `ui/layout/` | The roadmap proposed dockview "subject to the spike". The spike shows dockview fails keyboard splitters, charges for keyboard group navigation, and costs twice the bundle. See [Recommendation](#recommendation). |
| Keep hidden views mounted (`<Activity>`) or lift their state into stores | **`<Activity>`** | Still "proposed" in the proposal. The spike found no conflict with either library: no remounts, scroll kept, portals hidden. |
| Layout saved per browser or per project | **Per browser** | Roadmap row. As VS Code does with its workbench. |
| Persist the panel's tab | **Yes**, as part of the whole layout | Round-1 open question. |
| On project replace (File → New, Examples), reveal Instrument as today (`resetPanel`) | **Drop it** | The layout belongs to the browser, not the project, so replacing the project shouldn't move the user's tabs. Keeping it is a one-line choice. |
| Default layout | **Today's** (Session and Arrangement over the eight tool views in the panel); sidebars empty and hidden | A VS Code-style default with Samples, Sounds and Library in the primary sidebar waits for round 3's narrow layouts. |
| The panel: a bottom border, or a tab group in the grid | **A bottom border**: one tab at a time, as today, and it hides natively | A tab group can be split, but hiding it would mean maximizing the editor's group, which also hides any other editor groups. Borders weren't in the spike; step 5 confirms them. **Overridden 2026-10-24** by the user: the panel becomes a tab group, because flexlayout always spans its bottom border under the sidebars, so they can't run the full height. See [round 3](PLAN-round-3-shell-rework.md). |
| Can views be closed | **Not in round 2** | Every view is always somewhere, so `revealView` always succeeds. |
| The Tab key | Keep toggling Session and Arrangement, but **not when the focus is on a tab, a splitter or the activity bar** | Today it swallows Tab everywhere except form fields, which makes keyboard navigation through the new chrome impossible. Found in the spike; this predates it. |
| Keyboard shortcuts for toggling regions (VS Code's ⌘B, ⌘J) | **Wait for round 5's keybinding table** | Round 2 has buttons and F6 only. ⌘J and ⌘B collide with browser shortcuts in some browsers. |
| What goes into the status bar | **`SaveIndicator` and the audio-failure banner**; toasts stay floating | Roadmap: "where that reads better". |
| Minimum sizes | 280 × 200 for tool views, 480 × 240 for editors | Still "proposed" in the proposal, and needed in round 3. flexlayout takes them directly as `minWidth` and `minHeight` per tab, so sign-off can wait for round 3's plan. |
| Patch canvas view per graph: in memory or persisted | In memory | Still "proposed" in the proposal; round 3. Persisting it would mean extending `sfxlab:layout`. |
