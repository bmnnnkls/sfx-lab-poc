# Handoff: the Front panel (sliders, knobs and XY pads as an alternative to the graph)

> **Status: built, then superseded by `HANDOFF-control-nodes.md` (step 5): the panel is now the patch's control nodes, `Patch.panel` and its
> bindings are gone; the widgets and the board stayed.** What follows is the original brief, kept as the record.
>
> Earlier status: **built** (see `ARCHITECTURE.md`, "Front panel", for how it works; `docs/TASKS.md`, "Front panel follow-ups", for what is left).
> The text below is the original brief, kept as the record of what was decided. The user accepted all the proposals marked
> **(confirm)**. Differences in the build: reordering is both drag-and-drop (a handle) and move buttons; the pad answers the
> arrow keys itself (no hidden inputs); a pad's size S / M / L is 2x2 / 3x2 / 3x3 cells; `param-scale.ts` moved to `ui/shared/`. Work on the branch
> **`claude/determined-turing-ypq9ix`** (cut from `main` at `8fd9397`, the merged Mixer). Do not open a pull request unless
> asked; `main` deploys to GitHub Pages on every push.

Read `ARCHITECTURE.md` (Modules, Mixer, Conventions, Common changes) and `docs/HANDOFF-mixer-view.md` ("Working
conditions": commands, layering test, browser checks) first. They apply unchanged.

## Why

Today the only way to play with a sound is to open the node graph and turn the small slider inside each node. That is
right for building, wrong for performing: parameters are scattered over a canvas, tiny, and one at a time. The user wants
a **front panel** (a hardware-style face for the patch) with big **sliders, knobs and XY areas**, shown instead of the
graph, to tweak the sound live.

## The goal

On every graph editor (Instrument, Effects, Notes, the Master's effects, and the inside of a module) a **Graph | Panel**
switch in the editor header. *Panel* replaces the canvas with a board of controls bound to node parameters:

| Control | Binds | Notes |
| --- | --- | --- |
| **Knob** | one parameter | drag up/down, Shift = fine, wheel, arrow keys, double-click = default |
| **Slider** | one parameter | vertical or horizontal |
| **XY pad** | **two** parameters (X and Y) | one drag moves both; the classic cutoff x resonance |
| **Selector** | an enum parameter (`ParamSpec.options`) | segmented buttons or a select; shown automatically for enums |

The board has two modes: **Play** (just the controls, big) and **Edit** (add, remove, rename, resize, reorder, rebind).
An empty panel offers **Build from graph**, which creates one control per parameter, grouped under its node's name, so
the feature is useful with zero setup; the user then deletes what they do not want.

## Decisions

Made from the code (do not reopen without a reason):

* **No engine change.** A control calls the existing `setNodeParam` through `updatePatch` / `updateFx` / `updateMasterFx` /
  `updateNoteGraph` / `updateModulePatch` (the same `edit` helper `GraphEditor` already has), so undo, `diffProject` and
  `track/setParam` work as they do for the graph's sliders. A panel is data about the *view*; `flattenPatch` ignores it, so
  editing only the panel produces no engine commands (test this).
* **Value mapping is shared.** Reuse `ui/patcher/param-scale.ts` (`toSlider`, `fromSlider`, `snapToStep`, `formatParam`) so a
  log-scaled cutoff feels the same in a knob, a slider, a pad axis and the graph. Move it to `ui/shared/` if the new folder
  would otherwise import from `patcher` (siblings under `ui` may import each other, but keep the dependency one-way).
* **Undo merging.** A drag merges into one step with the key the graph already uses for that parameter
  (`param:<scope>:<node>:<param>`), so dragging in the panel and in the graph coalesce alike. An XY drag changes two
  parameters in **one** edit with key `xy:<scope>:<control>`.
* **Modulation is untouched.** A control sets the parameter's base value, exactly like the graph slider. A module use's
  exposed knobs are parameters of the `module` node, so they appear in the panel with no extra work.
* **Tests without a DOM.** Vitest runs in `environment: 'node'` (no jsdom). Put every calculation (value <-> position, drag
  deltas, fine mode, keyboard steps, XY clamping, build-from-graph) in pure functions with unit tests; the components stay
  thin and are covered by a Playwright check.

Proposed **(confirm)**:

* **A switch inside the graph editor, not a new top-level tab.** The user said "alternative to graph view", and one switch
  gives the panel to Instrument, Effects, Notes, Master and modules at once. Remember the choice per scope in
  `useStoredState` (a view preference, not project data).
* **One panel per graph.** The Instrument tab and the Effects tab each have their own. A combined per-track panel
  (instrument + effects on one board) is a good follow-up; the data model below does not block it.
* **Layout is an ordered flow, not free positioning.** Controls wrap in a CSS grid; each has a size (S/M/L: a knob is 1x1, a
  slider 1x2, a pad 2x2 by default). Reorder by drag in Edit mode. Free pixel positioning is a follow-up.
* **Stored on the patch:** `Patch.panel?: readonly PanelControl[]` (optional, absent = no panel yet). See "Model".

## Model

```ts
// core/patch/panel-types.ts
interface ParamBinding { readonly node: string; readonly param: string }
interface PanelControl {
  readonly id: string
  readonly kind: 'knob' | 'slider' | 'xy' | 'selector'
  readonly label: string
  readonly bind: ParamBinding        // knob/slider/selector; the X axis of an xy
  readonly bindY?: ParamBinding      // xy only
  readonly size: 'S' | 'M' | 'L'
  readonly orientation?: 'vertical' | 'horizontal'   // slider only
}
```

* Pure edits in `core/patch/panel.ts`: `addControl`, `removeControl`, `moveControl`, `renameControl`, `resizeControl`,
  `rebindControl`, `buildPanel(patch, modules)`. A no-op returns the **same object**. Export through `core/patch/index.ts`.
* **Why on `Patch`** (and not a `Project.panels` map): panels then travel with whatever owns the patch (track instrument,
  insert graph, master graph, note graph, module definition) and use the undo path and `editPatchAt` that already exist.
  **The catch, and the first thing to test:** several functions build a `Patch` from a literal `{ nodes, connections }` and
  would silently drop `panel`: `removeNode` (`patch/edit.ts:26`), `group-module.ts` (~lines 92 and 166),
  `sanitize-patch.ts:47`. Fix each to spread the old patch, and add a test that every `patch/edit` function keeps `panel`.
  `flatten.ts` should keep dropping it on purpose.
* **Staying consistent.** `removeNode` removes controls bound to that node (an XY with one dead axis is removed whole).
  `groupIntoModule` removes controls bound to nodes that moved into the module (rebinding them to the new module's
  knobs is a follow-up). Module-interface edits that delete a knob (`hideKnob`, `reconcileModules`) must prune controls
  bound to the module use's param. `ParamSpec` ranges are read from the registry at draw time, never copied into the
  control, so a changed node range cannot leave a stale min/max.
* **Persistence.** `sanitize-patch.ts` reads `panel`: unknown `kind` -> dropped; a binding whose node does not exist, or whose
  param is not one of `describeNode(...).params` -> control dropped with a warning; `bindY` missing on an `xy` -> dropped;
  duplicate ids -> renumbered; at most a limit (add to `project/limits.ts`, e.g. 128 controls per patch). No `panel` means no
  key written. Optional field, safe default, so **no format-version bump**; old files load identically. Add a fixture with a
  panel and a garbage-in test for each field.

## UI

New folders: `ui/controls/` (generic widgets, know nothing about patches) and `ui/panel/` (the board).

* `ui/controls/`: `Knob` (SVG arc; `role="slider"`, `aria-valuenow/min/max/valuetext`, pointer capture, vertical drag, Shift =
  fine, wheel, Home/End/arrows, double-click to default), `Fader`, `XYPad` (pointer capture, crosshair, readout of both
  values, arrow keys move X/Y, Shift = fine, `aria-valuetext` "X 1.2 kHz, Y 0.40"), `Selector`. Plus `control-math.ts` (pure,
  tested). They take `value`, `onChange`, a `ParamSpec`-like description and a label, and nothing else. Throttle `onChange`
  to one per animation frame during a drag (the store re-flattens the patch per change).
* `ui/panel/`: `PanelView` (the grid, Play/Edit toggle, Build from graph), `ControlCell` (resolves the binding through
  `describeNode`, shows a muted "missing" cell if it cannot, so the UI never crashes on a stale binding),
  `AddControlMenu` (pick node -> parameter -> kind; an XY asks for two), `panel.module.css`. Label every control for the
  browser checks: `"<control label>"` on the slider/knob, `"<label> X"` / `"<label> Y"` on pads.
* `GraphEditor.tsx` gets the **Graph | Panel** switch next to the toolbar, and renders `PanelView` instead of `PatchCanvas`
  (the `aside`, e.g. the notes preview, stays). Toolbar items that only make sense on the canvas (palette, Group into
  module) hide in Panel view. `ui` may import `@core` and `@state` only.
* Visual: reuse `theme.css` tokens; knobs and pads need to read well at a glance on a dark background, in a 200-300 px high
  bottom panel (the panel scrolls; the bar above the editor already resizes it).

## Suggested build order

1. **Controls library** (`ui/controls/`): `control-math.ts` + tests first; then the four widgets. A throwaway demo is not
   needed: step 4 mounts them.
2. **Model**: `panel-types.ts`, `panel.ts` + tests (edits, same-object no-ops, `buildPanel` order and grouping, pruning on
   `removeNode` / `groupIntoModule` / `hideKnob`, "no panel edit produces engine commands" via `diffProject`).
3. **Persistence**: sanitizer, limits, fixture, round trip, garbage in. Fix the three `Patch` literals and test that
   `panel` survives every patch edit.
4. **The Panel view** and the switch in `GraphEditor`; Play and Edit modes; Build from graph; stored view preference.
5. **Browser check** `docs/browser-checks/panel.mjs` (Playwright against `vite preview`, as `mixer.mjs`): switch to Panel on
   a demo instrument; Build from graph; turn a knob and see the parameter change in the graph and the sound's level or
   spectrum change; XY drag moves two parameters and undoes in one step; delete a node in the graph and its control goes;
   reload keeps the panel; the Effects and Master panels work; no page errors. Re-run the older checks that open the graph
   (`fx`, `modules`, `mod`, `notegraph`, `master`, `polish`).
6. **Docs**: `ARCHITECTURE.md` (a "Front panel" section; "Common changes" gets nothing), `README.md` (one sentence),
   `docs/browser-checks/README.md`, `docs/TASKS.md` (follow-ups below).

## Open questions for the user

1. **Switch in the editor, or a separate Panel tab?** (Proposed: the switch.)
2. **Per graph, or one combined panel per track?** (Proposed: per graph first.)
3. **Do you want the panel auto-built, curated by hand, or both?** (Proposed: both; empty panel offers Build from graph.)
4. Should the same controls replace the Mixer's fader/pan/send sliders later? (Not in this work; the widgets are written so
   the Mixer could adopt them.)

## Out of scope (do not add)

Automation lanes and recording, MIDI mapping / MIDI learn, free pixel positioning, a panel in the session view, modulation
depth on a control, per-control min/max overrides or custom curves, meters and scopes on the panel, module-panel rebinding on
grouping. Listed in `docs/TASKS.md` for later.

## Reference: what already exists (do not rebuild)

`ParamSpec` (`core/dsp/types.ts`: min, max, default, step, unit, options, format) and `describeNode` for any node including
module uses; `param-scale.ts`; `ParamControl` (the graph's slider, keep as is); `setNodeParam` and the `edit` helper in
`GraphEditor`; merge keys for undo; `useStoredState`; `ModuleKnob`/`exposeKnob` for choosing which inner parameters a module
shows (the panel is the board-level equivalent); Playwright setup in `docs/browser-checks/README.md`.
