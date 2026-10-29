# Round 9: pinned panels

Status: **planned** 2026-10-29, decisions signed off as proposed. Part of the [UI redesign](README.md). Carries out
[roadmap § Round 9](DRAFT-roadmap.md#round-9-pinned-panels), from an inventory of the front panel, the graph editors, the
layout store and view registry, the secondary sidebar, the actions, and of what a pin must survive, taken on
`feat/ui-redesign` at `5b6bb5f` (round 8 merged).

## Goal

A front panel can be played from the secondary sidebar while the editors show something else. After this round:

* **a panel can be pinned** from a track's, a group's or the master's menu, and from the toolbar of the Instrument,
  Effects and Notes views. The original stays where it is;
* **one Pinned view holds the pins,** stacked top to bottom. It sits in the secondary sidebar beside Sounds by default,
  and can be docked anywhere, as every view can;
* **each pin is that graph's front panel,** with a header: the owner's name and graph, *Open* (the full editor) and
  *Unpin*. A pin can be collapsed to its header and moved up or down;
* **a pinned panel is the same panel:** turning a pinned knob moves the knob in the editor, is one undo step, can be
  learned by MIDI, and shows live indicators. Nothing is copied;
* **a group's bus and the master** can be pinned as well as a track (round 8 made a group a control owner);
* **pins are saved with the project,** and survive undo, a removed track, a removed bus, save and load. The file format
  stays version 10;
* **wide controls fit a narrow panel:** a knob, slider or pad wider than the columns there are takes the columns there
  are, so a 280 px sidebar never scrolls sideways.

**Out of scope:**

* pinned graph editors (canvases), and any view open twice (see the decisions);
* editing a panel's layout in a pin (*Edit panel*): the pin's *Open* goes to the full editor;
* dragging pins to reorder them, and dragging a panel out of an editor to pin it;
* a combined panel of several graphs, or of several tracks;
* presets and library items dropped on a pin;
* an activity-bar button for Pinned, and keys for pinning (round 10);
* pinning the inside of a module on its own (a module's controls show on the panel of the graph that uses it, as today);
* changing the example projects.

## Inventory

### The front panel

| Where | What it does today |
|---|---|
| `PanelView` (`ui/panel/PanelView.tsx`) | Props: `patch`, `controlOwner?`, `controlDomain?`, `modules`, `scope`, `readoutTrack?`, `edit`. Draws `panelItems(patch, modules)` as a CSS grid of `ControlCell`s, with a bar holding *Edit panel* (local `editing` state) and, in Edit, the add form and the hidden tray. A turn goes through `useControlGesture` as a control target `{ kind: 'graph', owner, domain, path, nodeId, … }`; a control without a target (inside a module definition) falls back to `edit` with a merge key. **Self-contained:** it takes no store but the project and needs nothing from `GraphEditor`. |
| `PanelView`'s subscription | `useProjectStore((state) => state.project)`: it reads the whole project to resolve each control's base value (`resolveControlTarget`). So **any** project edit re-renders every panel on screen. With one panel that was never noticed; with several pins it is a cost on every knob turn. |
| `.board` (`panel.module.css`) | `grid-template-columns: repeat(auto-fill, minmax(104px, 1fr))`, 12 px padding, 8 px gap, `flex: 1; overflow: auto`. At a 280 px view that is **two columns** (256 px of content). |
| `spanOf` (`panel-values.ts`) | A knob takes 1, 2 or 3 columns (S, M, L), a sideways slider 2 to 4, a pad 2 or 3. **Anything over two columns makes extra implicit columns at 280 px**, and the board scrolls sideways. Round 4's view-by-view table has no row for the front panel: there is no narrow front panel yet, which the roadmap assumed. |
| `ControlCell` | Wraps each control in an `ActionMenu` with a `control` subject, so right-click gives *MIDI learn* and *Show automation*. Indicators take `readoutTrack`, the id the engine reports live values under. |
| ARCHITECTURE.md § Front panel | The panel **is** the control nodes; a panel follows whatever owns the patch. Graph or Panel mode is per kind of graph in `localStorage` (`sfxlab.view.<patch\|fx\|notes>`), a way of looking. |

### The editors

* `GraphEditor` (`ui/patcher/GraphEditor.tsx`) takes `owner: Track | 'master' | BusGroup` and `graph: TrackGraph`. It
  works out `controlOwner`, `ownerTarget: PatchTarget`, `scope` (`<ownerId>:<graph>`), `readoutTrack` (the owner's id,
  `master` for the master) and an `edit` that picks the store method by owner and graph. A pin needs all of these
  without the canvas.
* The **Graph | Panel** switch is per kind of graph, in `localStorage`, read in `ui`. `state` can't set it, so an
  action can't open an editor in Panel mode.
* Inside a module (`definition`), the panel shows the module's own controls, with no control owner.
* `Patcher` (Instrument), `FxPanel` (Effects) and `NoteEffectsPanel` (Notes) pick the owner from the selection store:
  `trackId`, `master` or `groupId`. Instrument and Notes say a group or the master has none.
* `useProjectStore.editPatch(target: PatchTarget, change)` and `patchAt(project, target)` already take a track, the
  master and a group, so a pin can edit and read its graph without `GraphEditor`'s switch.

### Layout and the view registry

* `ViewId` (`state/layout-store.ts`) lists 12 views; `views` (`ui/layout/views.ts`), `viewTitles`, `viewMinSizes` are
  `Record<ViewId, …>`, so a new id that misses one is a type error. Tool views are 280 × 200.
* `DEFAULT_GROUPS` puts `sounds` alone in `border_right` (the secondary sidebar), collapsed to its strip by default. A
  border shows **one tab at a time**, and a view can't be open twice: so one view must hold every pin, as the roadmap
  said.
* `checkModel` (`ui/layout/layout-storage.ts`) appends any view a saved layout lacks to its **default region**, and
  `parseLayoutModel` does the same for named layouts. So a new view needs **no layout version bump**: layouts saved
  before this round get Pinned in their secondary sidebar.
* `ViewHost` keeps a hidden view mounted in `<Activity mode="hidden">`: its Effects (meters, subscriptions) stop.
* `tests/browser/fixtures.ts` keeps `ViewTitle` and the view ids in sync by hand, and `views-at-min-size.smoke.spec.ts`
  docks every view at its minimum.

### Actions and navigation

* Subjects (`state/actions/types.ts`) are small values; `actionsFor` has one list per kind. Buttons run actions
  (`runAction`), so a pin's header buttons and an editor's *Pin* toggle must be actions too.
* `trackActions` opens with *Open instrument*, *Open effects*, *Open notes* by track kind; `groupActions` has *Open
  effects* with a bus; `masterActions` has *Open effects* and *Show automation*. An action can have `choices`
  (a submenu) and a `tooltip`.
* `navigation.ts` has `openTrackView(trackId, view)`, `openMasterEffects()` and `openGroupEffects(groupId)`: what a
  pin's *Open* needs.
* The graph-view store already carries a one-shot request from an action to a view (`addRequest` for *Add node…*), the
  pattern for "scroll this pin into view".

### What a pin must survive

* **A removed track.** `removeTrack` is an undo step. `createId` ids are random, so a removed track's id never comes
  back on another track.
* **A group bus as owner** (round 8). `ControlOwner` has `{ kind: 'group', groupId }`, `controlOwnerId` gives its id,
  `patchAt` finds `bus.fx`. A bus goes with *Remove bus*, *Ungroup*, *Delete group and tracks*, and when a bus group
  loses its last track (`pruneGroups`), each an undo step; undo brings the bus back with its graph. Group ids are never
  track ids.
* **Undo.** Round 7 made collapse and hide **view edits**: saved with the project, not undo steps
  (`project-store`'s `editView`), and `withViewOf(restored, current)` keeps the current flags on undo and redo for the
  tracks and groups both projects have. *New*, *Import* and *Restore* (`replaceProject`) are undo steps too, so undoing
  them goes through `withViewOf`.
* **Save and load.** `sanitizeProject` rebuilds the project from known fields, so a build that doesn't know `pins`
  drops them silently. Optional fields have joined version 10 without a bump twice (round 7's `groups`, round 8's
  `bus`). `readControlOwner` (`sanitize-control-values.ts`) parses an owner of any kind. `LIMITS` caps lists.
* **History.** Loading a project at startup starts an empty history, so nothing undone survives a reload.

### Noticed, not this round's

* `graphKeyOf` (`state/actions/nodes.ts`) maps any target without a `trackId` to `master`, a group's included. So
  *Open module* from a node's menu in a bus graph sets the path of the master's effects, not the bus's. A follow-up
  outside this round.

### What the inventory changes in the roadmap's outline

* **There is no narrow front panel yet.** Round 4 gave the graph editors a narrow layout, not the board. Wide controls
  overflow two columns. This round caps a control's span at the columns the board has, for every panel.
* **Pins name an owner and a graph, not a track.** Since round 8 a group's bus is a control owner, and the master always
  was. A pin is `{ owner: ControlOwner, graph: TrackGraph }`, the same pair `PanelView` already takes. The notes graph
  has a panel too, so it can be pinned.
* **"A removed track drops its pins" becomes "a pin whose graph is gone is not shown".** Pins aren't undo steps (round 7's
  rule for view state), so a pin dropped by `removeTrack` couldn't come back on undo. Keeping it, unshown, lets undo
  show it again; the next load drops it.
* **No layout version bump:** saved layouts gain the new view by the existing repair.
* **`PanelView` needs a narrower subscription** before it can be shown several times at once.
* **Play only in a pin.** *Edit panel*'s add form and tools don't fit 280 px, and the pin's *Open* is one click away.

## Design

### Model

In `core/project/pins.ts`, exported through `core/project`:

```ts
/** A front panel shown in the Pinned view: an owner's graph. A view field, saved with the project, never undone. */
interface PanelPin {
  readonly owner: ControlOwner        // a track, a group (its bus), or the master
  readonly graph: TrackGraph          // 'patch' | 'fx' | 'notes'; always 'fx' for a group or the master
  readonly collapsed?: boolean        // absent = false: shown as its header only
}

interface Project {
  // …
  readonly pins?: readonly PanelPin[] // new: absent = none; top to bottom
}
```

* `pinKey(pin)`: `<owner id or master>:<graph>`, as `graphKey` writes it. Two pins with one key are one pin.
* `pinTarget(pin): PatchTarget` (`{ trackId, graph }`, `{ groupId }` or `{ master: true }`), and
  `pinnedGraph(project, pin)`: `patchAt` of it, or `undefined` when the graph is gone: the track or group is missing,
  the group has no bus, or the track's kind has no such graph (an audio or return track has only `fx`).
* `livePins(project)`: the pins whose graph exists, in order, each with its graph. Memoized on `pins`, `tracks` and
  `groups`, as `mixRouting` is.
* `MAX_PINS = 16`, in `LIMITS` too.
* **Edits,** each returning the same project when nothing changes:
  * `pinPanel(project, pin)`: appends it, unless its key is pinned already or the graph is missing, or there are
    `MAX_PINS`;
  * `unpinPanel(project, key)`, `movePin(project, key, direction)` (one place up or down among the **live** pins, so a
    hidden pin never stalls a move), `setPinCollapsed(project, key, collapsed)`.
* **Nothing else touches pins.** `removeTrack`, `removeGroup`, `ungroup`, `pruneGroups` and `setGroupBus` leave the
  list alone. A pin whose graph went is kept and not shown; undo brings the graph back, and the pin shows again where it
  was. A track's copy (`duplicateTrack`) isn't pinned.
* **Undo and redo.** `withViewOf(restored, current)` also gives the restored project the current pins, plus those of the
  restored project whose owner the current one doesn't have (in their order, after the current ones, keys not
  repeated). So undoing a removal keeps the pin that was there, and undoing *New project* brings the old project's pins
  back.
* **A known oddity:** a bus switched off and on again is a new bus, and a pin of the old one shows again on it. Accepted:
  it is the same group's effects, and unpinning is one click.

### The file format

* Version stays **10**. `sanitizePins(raw.pins, tracks, groups, warn)` in `core/persistence`:
  * each entry: `owner` through `readControlOwner`, `graph` one of the three, `collapsed` only a real `true`;
  * a malformed entry is dropped with a warning (`Pinned panel 2: …`); a duplicate key, and anything past `MAX_PINS`,
    likewise;
  * a pin whose graph is missing is **dropped silently**: a project saved with an unshown pin is normal;
  * an empty list is not stored.
* A build from rounds 7 or 8 reading a round-9 file drops `pins` silently, as it would any unknown field.
* A new fixture, `v10-pinned-panels.sfxlab.json`: a track's instrument and notes, a bus's effects (collapsed), the
  master's effects, and a pin of a removed track; it loads with four pins and no warnings.

### State

* **Store:** `pinPanel(pin)`, `unpinPanel(key)`, `movePin(key, direction)` and `setPinCollapsed(key, collapsed)` on the
  project store, through `editView` like collapse and hide: saved, not undo steps.
* **Navigation:** `revealPin(pin)` pins it when needed, reveals `pinned` and asks the Pinned view to scroll it into
  view, through a one-shot `pinRequest` in the graph-view store (as `addRequest`). `openPinnedEditor(pin)` selects the
  owner and reveals its view: `openTrackView(trackId, 'instrument' | 'effects' | 'notes')`, `openGroupEffects`,
  `openMasterEffects`. It doesn't change the editor's Graph or Panel mode.
* **A new subject,** `{ kind: 'pin'; owner: ControlOwner; graph: TrackGraph }`, with `pinActions`:

  | Id | Title | Group | Notes |
  |---|---|---|---|
  | `pin.open` | *Open* (tooltip: "Open the full editor") | open | `openPinnedEditor` |
  | `pin.collapse` | *Collapse* / *Expand* | open | |
  | `pin.move-up`, `pin.move-down` | *Move up*, *Move down* | edit | disabled at the ends |
  | `pin.unpin` | *Unpin* | delete | not `danger`: nothing is lost |

* **Track, group and master actions gain:**
  * `track.pin`, *Pin panel*, with choices *Instrument*, *Effects*, *Notes* (those the track's kind has; a pinned one is
    disabled). An audio or return track has one choice, drawn `inline` as *Pin effects panel*;
  * `track.unpin`, *Unpin panel*, with the pinned ones as choices (inline when one); applies when any is pinned;
  * `group.pin`, *Pin effects panel* / *Unpin effects panel*, with a bus;
  * `master.pin`, *Pin effects panel* / *Unpin effects panel*.

  They sit in the `open` group, after the *Open …* entries. Pinning runs `revealPin`; unpinning doesn't move the layout.
  *Pin* is disabled at `MAX_PINS`, titled "— 16 panels are pinned".

### The front panel

* **Fitted spans.** `fitSpan(span, columns, kind)` in `panel-values.ts`: a span wider than `columns` takes `columns`;
  a knob stays square (its rows shrink with it), a pad keeps at least two rows, a slider's length is its own. `PanelView`
  measures the board's column count with a `ResizeObserver` (from its width, the 104 px minimum and the gap) and passes
  it to each `ControlCell`. Every panel gets it; at the Instrument view's 480 px minimum the board has four columns, so
  only panels under about 360 px wide change.
* **A pinned variant.** `PanelView` gains `variant?: 'editor' | 'pinned'`. Pinned: no bar and no *Edit panel*, so no
  add form, hidden tray or cell tools; the board takes its content's height and doesn't scroll (the Pinned view scrolls);
  the empty state says "No controls yet" with *Open*, which runs `pin.open`.
* **A narrower subscription.** `PanelView` reads base values through a selector over its own graph, the modules and
  the control values, and takes the project from `getState` inside it. Turning a knob in one pin then re-renders that
  pin and the editor showing the same graph, not every panel.

### The Pinned view

* **Registry:** `ViewId` gains `pinned`; title *Pinned*, tooltip "Pinned: track panels to play while you work
  elsewhere", the tool-view minimum (280 × 200). `views` maps it to `PinnedView` (`ui/pinned/`).
* **Default place:** the secondary sidebar after Sounds (`['sounds', 'pinned']`, Sounds open), collapsed to its strip as
  now. *Reset layout* puts it there; saved and named layouts gain it there by `checkModel`. Layout version stays 2.
* **`PinnedView`** draws `livePins(project)` as a list (`role="list"`), each a `PinnedPanel`. It answers a `pinRequest`
  by scrolling that pin into view and moving the focus to its header.
* **`PinnedPanel`:** a `section` named by its title, with a header and the panel.
  * **Title:** the owner's name and graph, as the editors title them, except that the instrument says so (the
    Instrument view's title is the track's name alone): *Bass instrument*, *Bass effects*, *Bass notes*, *Drums
    effects*, *Master effects*. A group's title has its colour mark, as its band.
  * **Header:** a twisty (`pin.collapse`), the title (right-click: the pin's menu; double-click: `pin.open`), *Open* and
    an × for *Unpin*. Every button runs its action.
  * **Body:** `PanelView variant="pinned"` with the pin's `patch`, `controlOwner`, `controlDomain` (the graph),
    `scope` `<owner id>:<graph>` (the editor's, so undo keys merge alike), `readoutTrack` (the owner's id, `master` for
    the master) and an `edit` through `editPatch(pinTarget(pin), …)`.
  * Collapsed, only the header shows.
* **Empty state** (the round-4 rule: it offers actions): "Nothing is pinned. Pin a panel from a track's menu, or with
  *Pin* in Instrument, Effects or Notes." With a track selected, buttons pin its panels (*Pin Bass instrument*, …); with
  a bus or the master selected, *Pin … effects*.

### Pinning from the editors

* `GraphEditor`'s toolbar gains a **Pin** toggle (`aria-pressed`), in both Graph and Panel mode, hidden inside a module.
  Pressed when the graph is pinned. It runs `track.pin` with its graph as the choice, `group.pin`, `master.pin`, or
  `pin.unpin`.
* The track headers, mixer strips, tracks tree rows, group bands and the master strip need nothing new: their menus are
  `actionsFor` their subject.

### Browser tests

Specs import nothing from `src/`.

* **New `pinned-panels.smoke.spec.ts`,** on the starter project, after adding a knob (size L) and a switch to Lead's
  instrument panel with *Edit panel*, as `drag-and-drop.smoke.spec.ts` does:
  * Lead's track menu, *Pin panel ▸ Instrument*: the secondary sidebar opens on Pinned, with a *Lead instrument*
    section holding the knob and the switch, and no *Edit panel*;
  * the pinned knob, with arrow keys, moves the knob in the Instrument view's panel (`aria-valuetext`); one undo moves
    both back;
  * the L knob fits: the pinned board's `scrollWidth` is not more than its `clientWidth` at the default sidebar width;
  * Effects' *Pin* toggle on Lead pins *Lead effects* under the first and shows pressed; the pin's × unpins it and the
    toggle shows unpressed;
  * *Move up* on the second pin puts it first; *Collapse* leaves its header only; after a reload the order and the
    collapse are kept;
  * *Delete* on Lead: its pins go; undo brings Lead and both pins back;
  * a group summed to a bus, *Pin effects panel* from its menu: *Group 1 effects* shows; *Remove bus* hides it; undo shows
    it again;
  * *Pin effects panel* from the master strip's menu shows *Master effects*;
  * *Open* on *Lead instrument* selects Lead and shows the Instrument view;
  * right-click the pinned knob: the menu has *MIDI learn*;
  * Pinned's empty state, with Bass selected: its buttons pin Bass's panels.
* **`views-at-min-size.smoke.spec.ts`** gains Pinned at 280 × 200, empty and with a pin.
* **`context-menus.smoke.spec.ts`** checks *Pin panel* and *Unpin panel* on an instrument and an audio track, *Pin
  effects panel* on a bus, a folder (absent) and the master, and a pin header's menu.
* **`layout.smoke.spec.ts`:** a layout saved without `pinned` loads with Pinned in the secondary sidebar.

## Steps

Each step is one commit and leaves `npm test`, `npm run typecheck` and `npm run test:smoke` green. Steps 1 and 2 come
in order; step 3 needs neither; step 4 needs 2 and 3; step 5 needs 4.

1. **The model and the file in `core`.** `PanelPin`, `Project.pins`, `pinKey`, `pinTarget`, `pinnedGraph`,
   `livePins`, `MAX_PINS`, the four edits, `withViewOf` with pins, `sanitizePins`, the fixture. Unit tests: each edit
   and its no-op; a pin of every owner kind and graph, live and gone (removed track, removed bus, ungrouped, a return's
   `patch`); undo and redo through `withViewOf` (a removal, *New project*); load drops gone pins silently and malformed
   ones with a warning; save and load keep order and collapse; a round-8 file loads unchanged.
2. **Store, navigation and actions.** The store's pin methods through `editView`; `revealPin`, `openPinnedEditor` and
   `pinRequest`; the `pin` subject and `pinActions`; `track.pin`, `track.unpin`, `group.pin`, `master.pin`. Unit tests:
   `describeActions` for each subject kind (instrument, audio, return, bus, folder, master, a pin at each end); pinning
   isn't an undo step and undo keeps pins; *Pin* disabled at the limit.
3. **The front panel.** `fitSpan` and the measured columns; the `pinned` variant; the narrower subscription. Unit tests:
   `fitSpan` as a table (each kind and size, one to four columns). Smoke: the panel specs as they are.
4. **The Pinned view.** `ViewId`, registry, titles, minimum, default layout; `PinnedView` and `PinnedPanel`; the empty
   state; `fixtures.ts`'s `ViewTitle`. Unit tests: `checkModel` adds `pinned` to a saved layout's secondary sidebar and
   to a named one. Smoke: the min-size and layout cases.
5. **Pinning from the editors, and the specs.** `GraphEditor`'s *Pin* toggle. Smoke: `pinned-panels.smoke.spec.ts` and
   the context-menu additions.
6. **Docs and the profile.**
   * ARCHITECTURE.md: § Front panel gains fitted spans, the pinned variant and § Pinned panels (the model, liveness,
     undo, the file); § Layout and navigation the Pinned view and its default place; § Actions and context menus the
     `pin` subject and the new entries.
   * `scripts/profile-status.cjs` gains the `pinned` setup (below).
   * [README.md](README.md) marks round 9 done; the roadmap notes what moved; this plan gets its "Changes made while
     implementing" and the profile.

## Behavior changes

Intended:

* The secondary sidebar has a *Pinned* tab after Sounds, in the default layout and in layouts saved before.
* Tracks', groups' (with a bus) and the master's menus have *Pin panel* or *Pin effects panel*, and *Unpin* entries.
* Instrument, Effects and Notes have a *Pin* toggle in their toolbar.
* A front panel narrower than its widest control shrinks that control to fit, instead of scrolling sideways.
* A project file can hold `pins`.

A project without pins looks and sounds as it does today, and the Instrument view's panel at its usual widths is
unchanged. Anything else a reviewer notices is a bug in this round.

## Verification

* `npm test`, `npm run typecheck` and `npm run test:smoke` pass at every step. Smoke tests need local ports, which the
  sandbox refuses, so they run outside it. No audio spec changes: nothing here reaches the engine, and `npm run
  test:audio` runs once at step 5 as a check.
* Manual pass on the dev build:
  * three pins (an instrument with an XY pad, a bus's effects, the master's) played while the session plays, with
    Arrangement and Mixer showing;
  * a pinned control learned by MIDI with a real or virtual port; the editor's control follows the CC;
  * undo and redo through pin, unpin, removing and restoring a pinned track, *Remove bus*, *New project*;
  * the Pinned view docked into the panel and into the editor area, and the sidebar dragged to its 180 px minimum
    (the view scrolls below 280 px);
  * React DevTools' highlight: turning a knob in one pin re-renders that pin and the open editor only.
* **Profiling:** `scripts/profile-status.cjs`, as round 8 ran it (one run each, 10 s after 2 s of warm-up, headless
  Chromium, 1500 × 1000, the servers outside the sandbox, nothing else running). Pinned is collapsed in the default
  layout, so `editor`, `four` and `groups` must match round 8: **145**, **173** and **87** component renders a second. A
  new `pinned` setup: the `editor` setup, with a knob and a switch added to Lead's instrument panel, then Lead's
  instrument, Lead's effects and the master's effects pinned and the Pinned view showing. `WATCHED` gains `PinnedView`,
  `PinnedPanel`, `PanelView` and `ControlCell`. Record the numbers; with nothing touched, the pins should add no renders
  a second over `editor`, and none of the four should render on a status update.

  | Per second | Round 8 `editor` | Round 9 `editor` | Round 8 `four` | Round 9 `four` | Round 8 `groups` | Round 9 `groups` | Round 9 `pinned` |
  |---|---|---|---|---|---|---|---|
  | Component renders (dev) | 145 | | 173 | | 87 | | |

## Decisions to sign off

Signed off 2026-10-29: every row as proposed.

| Question | Proposed | Notes |
|---|---|---|
| One view or a tab per pin | **One *Pinned* view holding a stack** | As the roadmap says: a sidebar shows one tab at a time, and a view can't be open twice. |
| What can be pinned | **Any graph with a front panel:** a track's instrument, effects and notes, a bus's effects, the master's effects | The roadmap named a track's instrument and effects. Round 8 made a bus a control owner, and the master and the notes graph have panels too; the pin `{ owner, graph }` covers them all for nothing. |
| Graph editors in a pin | **No, front panels only** | As the roadmap says: a second live canvas at 280 px, with its own selection, isn't usable. Pinned per-entity editor tabs stay a later idea. |
| Where pins are saved | **With the project** (`Project.pins`), as round 7's collapse and hide | The roadmap's choice. Pins name tracks and groups, which are the project's. Per browser, they would point at other projects' ids. |
| Pins and undo | **View edits: not undo steps;** undo and redo keep the current pins, and bring back those of an owner the current project lacks | Round 7's rule for collapse and hide. Making pins undo steps would let an undo of a knob turn unpin a panel. |
| A pin whose graph is gone (removed track, removed bus, ungrouped) | **Kept, not shown;** undo shows it again; the next load drops it silently | The roadmap's "a removed track drops its pins". Dropping it in each edit would need every removing edit to know pins, and an undo couldn't bring it back, since pins aren't undone. |
| Editing a panel in a pin | **Play only:** no *Edit panel*; *Open* goes to the full editor | The add form, the hidden tray and the cell tools don't fit 280 px. |
| What *Open* does | **Selects the owner and shows its editor in the mode it was in** (Graph or Panel) | Opening in Panel mode would need the mode in `state`; it lives in `ui`'s `localStorage` today. A later change can move it. |
| Wide controls in a narrow panel | **Capped at the columns there are, in every panel** | The roadmap assumed round 4 had a narrow panel; it doesn't. A pin-only rule would make the Instrument panel docked in a sidebar still scroll sideways. At the Instrument view's minimum nothing changes. |
| Where pinning is offered | **Track menu *Pin panel ▸* and *Unpin panel ▸*; group (with a bus) and master *Pin effects panel* toggles; a *Pin* toggle in Instrument, Effects and Notes** | The roadmap's "from round 5's context menu and from the instrument and effects views". Every menu that has a track, group or master subject gets them for free. |
| What pinning does to the layout | **Reveals Pinned and scrolls to the pin;** unpinning leaves the layout alone | Pinning silently into a collapsed sidebar would look like nothing happened. |
| Order and reordering | **New pins at the bottom; *Move up* and *Move down* in the pin's menu;** no dragging | Dragging pins needs a drag payload and drop targets in the stack; menus are enough for a few pins. |
| Collapsing a pin | **Yes, saved with the pin** | A stack of tall panels in a sidebar needs it. Like a group's collapse, it is a view edit. |
| Default place | **The secondary sidebar, after Sounds,** collapsed to its strip as now; **no activity-bar button** | The roadmap's target workbench. The strip shows the *Pinned* tab, and pinning reveals it. |
| How many pins | **At most 16** | A cap like every other list in a file. Sixteen panels is far past what a sidebar shows. |
| Layout version | **Stays 2:** `checkModel` adds Pinned to older layouts' secondary sidebar | The repair a missing view already gets; checked by a unit test and the layout spec. |
| File format | **Stays version 10;** older builds drop `pins` silently | As round 7's `groups` and round 8's `bus`. A file is never worse for having pins. |
| `PanelView`'s subscription | **Narrowed to its graph, the modules and the control values** | With several panels on screen, a knob turn would otherwise re-render all of them. |

## Changes made while implementing

What turned out different from the design above, step by step.

* **Step 1: `livePins` is memoized on the master too,** not only on `pins`, `tracks` and `groups`: each entry carries
  its graph (`LivePin`: the pin, its key and its patch), and the master's graph lives in `master`. `pins.ts` also has
  `isPinned` and `canPin`, which the actions use.
* **Step 1: the master's pin through undo.** `withPinsOf` (in `pins.ts`, called by `withViewOf`) brings back a restored
  pin whose owner the current project lacks. Every project has a master, so by that rule undoing *New project* would
  have lost the old project's master pin. The master now counts as the current project's only when the two share a
  track; otherwise the restored project is another document (*New*, *Import*, *Restore*) and its master pin comes back.
  Redoing *New project* still keeps the current pins, so the old project's master pin shows on the new one, as the
  design's rule says.
* **Step 1: `sanitizePins(raw, project, warn)` takes the project read so far,** after `repairGroupOrder`, since
  `pinnedGraph` needs it. A group's or the master's pin of a graph other than `fx` is malformed (warned), not missing.
  A pin dropped as missing doesn't count toward the cap. The warnings: `Pinned panel 2: dropped a pin that names no
  graph`, `… dropped a second pin of the same panel`, and `Only the first 16 pinned panels were kept`.
* **Step 1: the fixture was written by a throwaway test from a built project:** the demo with Bass in a bus group
  (*Low end*), and pins of Lead's instrument and notes, Pad's instrument, the bus (collapsed) and the master; then Pad
  was removed.
