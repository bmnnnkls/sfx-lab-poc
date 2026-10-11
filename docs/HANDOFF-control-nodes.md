# Handoff: control nodes, a property editor and a panel built from them

> **Status: in progress; the design is agreed** (replace semantics confirmed, math nodes and a searchable quick-add added).
> **Steps 1 to 6 are built** (see "Build order" and `ARCHITECTURE.md`, "Control nodes, parameter sockets and the global stage"); steps 7 onward are not.
> Written after the front panel (`HANDOFF-front-panel.md`, built and merged) was tried and the
> user said what they actually want. Decisions marked **(confirm)** are the planner's proposals the user has not answered yet (the build
> can go ahead on them; the user will say if one is wrong); the rest were agreed in conversation or follow from how the code works. Work on the branch **`claude/determined-turing-ypq9ix`**
> (restarted from `main` at `0929605`, after PR #2). Do not open a pull request unless asked. `main` deploys to GitHub Pages
> on every merge.

Read `ARCHITECTURE.md` (Modules, Front panel, Conventions, Common changes) and `docs/HANDOFF-mixer-view.md` ("Working
conditions": commands, layering test, browser checks) first. They apply unchanged.

## Start here (for a fresh session)

**State.** Branch `claude/determined-turing-ypq9ix` was restarted from `main` (`0929605`, PR #2 merged). **Step 1 of the build order is
done** (the engine, the model, parameter sockets, the global stage, the control and math nodes, `PatchNode.name`) and **step 2** (words,
categories, tooltips) and **step 3** (the node picker) **step 4** (compact cards, the property editor, the socket menu) **step 5** (the panel from control nodes) and **step 6** (node pictures); the rest of the design is not. On `main` already: the controls widgets (`ui/controls`), the board (`ui/panel`), the Graph | Panel switch and
`Patch.panel`, which step 5 replaces. 694 unit tests passed at `0929605`; 939 pass after step 4.

**Setup and checks** (from the repo root; running vitest inside `src/` breaks the `@core` alias):

```
npm ci
npx tsc --noEmit && npx vitest run     # vitest runs in `node`: no DOM, so UI is covered by the browser checks
npm run build && npx vite preview --port 4173 &
node docs/browser-checks/panel.mjs /some/dir    # one script per feature; see docs/browser-checks/README.md
```

Known: `docs/browser-checks/mixer.mjs` fails "panned hard right" on `main` too (it compares levels across two windows of a looping
sample; the sound is right). Ignore that one line; a fix was suggested as a separate task.

**Git and house rules.** Push only to `claude/determined-turing-ypq9ix`. If its PR is already merged when you start, restart it from
`origin/main` under the same name before adding work. Do not open a pull request unless asked. Commit with the attribution lines your
session instructions give. Small files, immutable data, pure edits that return the **same object** when nothing changes, optional
fields with safe defaults (no format-version bump unless a migration needs one), tests beside the code, comments say why.

**Where step 1 lives** (now built; the files to know):

| Concern | Files |
| --- | --- |
| Ports and params of any node, connection kinds | `src/core/patch/node-shape.ts` (`describeNode`, `kindsConnect`), `src/core/dsp/types.ts` (`PortKind`, `PortSpec`, `ParamSpec`, `NodeDefinition`) |
| Node registry, `Params` | `src/core/dsp/registry.ts`, `src/core/dsp/params.ts`, `src/core/dsp/nodes/*.node.ts` |
| Compile and run a stage | `src/core/instrument/compile.ts` (`compileStage`, `processStage`, `seeded`), `stages.ts` (`planStages`), `instrument.ts`, `voice.ts`, `fx-graph.ts` |
| Params to the engine | `src/core/sync/diff-project.ts`, `src/core/patch/flatten.ts` (module knobs are baked in here), `engine/commands.ts` |
| Patch edits | `src/core/patch/edit.ts`, `src/core/project/module-edit.ts` (`reconcileModules`) |
| Persistence | `src/core/persistence/sanitize-patch.ts` |

**Decided with the user:** control nodes, a property editor, right-click "create control" on inputs, tooltips, minimal cards with a
small picture per node, math nodes (including MIDI note <-> frequency), block-rate param sockets, a module may have both exposed
inputs and internal controls shown on the parent's panel (show / hide by a flag), grouped and searchable node adding opened by
double-clicking the canvas, and **a wire into a parameter socket replaces the parameter's value** ("the cutoff becomes 500 Hz; unwired,
the node uses its own value"; to add on top, use an *Add* math node). The build order's priority was left to the planner.
**Proposed, not yet answered** (go ahead; they are cheap to change): the `control` kind's connection rules; the **Sockets** toggle;
controls carry real values, not 0..1; the legacy-panel migration. The user prefers talking through big changes first and likes minimalism.

**Starting prompt for a fresh session** (paste as the first message):

> Read `docs/HANDOFF-control-nodes.md` on branch `claude/determined-turing-ypq9ix`, starting with "Start here", then `ARCHITECTURE.md` and
> `docs/HANDOFF-mixer-view.md` ("Working conditions"). The design is agreed: a wire into a parameter socket replaces the parameter's value,
> and the quick-add popup (double-click the canvas) is part of the plan. Run the setup and checks first, then build in the order given in
> "Build order", step by step: tests with each step, browser check updates where the doc says, docs updated as you go, commit and push after
> each step (only to that branch, no pull request). Stop and check in with me before step 4 (compact cards and the property editor), which
> removes the sliders from the node cards and rewrites the browser checks that use them. If something in the doc is contradicted by the
> code, trust the code, say so, and fix the doc.

## Why

The first front panel bound controls to node parameters from a separate list on the patch. The user wants something more
like Max or Reaktor: **the graph is where you build, the nodes carry nothing but sockets, values live in a property editor,
and a control is itself a node you wire** (and that then shows up on the panel). Concretely:

1. In the graph, add and wire **control nodes** (knob, slider, XY, switch); the panel shows them, arranged.
2. A **property editor** for the selected node: rename it (default "Oscillator 1", "Oscillator 2"), set the fixed value of every
   input that is not wired (cutoff, frequency, ...), and for a control its range, curve, steps and so on.
3. **Right-click an input** -> "Create knob" / "Create slider": a control node appears already wired and set up for that input.
4. **Tooltips** on parameters and sockets: what it does, the range and unit expected.
5. **Remove the sliders from the node cards**: a card is a title, sockets and (minimalism) a small **picture** of what the
   node does that follows its inputs: an oscillator draws its wave at its frequency and amplitude, a filter its response.
6. **Math nodes** for control signals, including **MIDI note <-> frequency**.
7. **Grouped, searchable node adding**: double-click the canvas, type, pick (replaces the row of one button per node).

## What already exists (do not rebuild; most of it carries over)

* Every signal is an **audio-rate buffer** (`ProcessContext`, `DspNode.process`); there is no control rate and no units.
* A node has static numeric `params` (`ParamSpec`: min, max, default, step, unit, options) and ports. Some ports *shadow* a param
  with different meanings: oscillator `freq` **replaces** `frequency`; filter `cutoff` **modulates** it in octaves times
  `cvAmount`; gain `cv` **multiplies** `gain`. Those stay exactly as they are (old projects must sound the same).
* `describeNode` is the one place that answers "which ports and params does this node have"; connection rules, wire geometry
  and node views all go through it. `kindsConnect` is the one place that answers "may these connect".
* `compileStage` instantiates nodes and wires them with preallocated buffers; `planStages` splits **voice** and **shared**
  stages; `diffProject` flattens modules and sends `track/setParam` for a changed parameter.
* The widgets (`ui/controls`: `Knob`, `Fader`, `XYPad`, `Selector`), `ui/panel/panel-values.ts` (value <-> position, spans),
  `PanelView`/`ControlCell` (the board, Edit tools) and the **Graph | Panel** switch in `GraphEditor`.
* Context menu (`ui/shared/menu`), module ports and knobs (`ModuleInterface`, `exposeKnob`), `ParamSpec.options`.

## The design

### Parameter sockets (the semantic decision)

Every numeric, non-enum parameter `p` of an audio node also appears as an **input socket** `param:p` (generated in
`describeNode`, not written per node). Unwired, the node uses its stored value (what the property editor edits). **Wired, the
wire's value replaces it** (the user chose this; "add on top" is what the existing modulation ports and an *Add* math node are for).
The stored value is kept in the file and comes back when the wire is removed; the editor shows it greyed as "driven by <name>".

* **Control rate.** A param socket reads **one value per block** (the first sample of the 128-frame block), applied with the
  existing `dsp.setParam` before the node runs, so **no DSP node changes**: `CompiledNode` gets `paramFeeds` (`{ dsps, paramId,
  source }`) and `processStage` applies them first. A fast LFO into a param socket therefore steps every 128 samples; audio-rate
  modulation keeps using the existing audio-rate ports (filter `cutoff`, oscillator `pitch`/`freq`, gain `cv`). Same as a slider
  drag today, so no regression; smoothing can come later.
* **A new port kind `control`.** It colours the wire and sockets differently. Rules (`kindsConnect`): `control` -> `control`;
  `control` -> `signal` (it is a constant buffer, like mono into stereo); `signal` -> `control` (sampled once per block, so an LFO
  can drive a param socket). Not to or from `notes` or `stereo`. **(confirm)**
* **Audio domain only at first.** The note graph's nodes have their own registry and evaluation; they get the property editor,
  names and tooltips but no sockets until a later step.
* **Visibility.** A card shows only the sockets that are wired plus the node's own ports; a toolbar toggle **Sockets** shows all
  of them so a wire can be dragged to any parameter by hand. **(confirm)**

### A third stage: `global`

`planStages` has `voice` and `shared`. A control's value is the same for every voice, and a voice -> shared boundary **sums** the
voices, so a control read across it would arrive as N times its value. Add `global`: a node whose definition says `global` and
whose inputs all come from global nodes. The global stage runs **once per block per instrument** (and once per insert graph),
and its buffers are **read-only seeds** for the voice and shared stages (the `seeded` argument of `compileStage` already exists).
A math node fed by a voice-stage signal (note velocity, an envelope) is voice-stage; fed by controls only, it is global.

### Control nodes

One node type per behaviour, with the display as a property:

| Node | Outputs | Properties (all in the property editor) |
| --- | --- | --- |
| **Control** | `out` | value, min, max, curve (lin / log / exp), step, unit, default, display (knob / slider, vertical / horizontal) |
| **XY pad** | `x`, `y` | per axis: value, min, max, curve, step, unit |
| **Switch** | `out` (0 / 1) | on/off or momentary; label |

(Selector for enum-like values, a button and a "named values" list follow later.) The value is the node's own parameter and goes to the
engine like any other (`track/setParam`); the engine node clamps and snaps to the node's own min / max / step, so `ParamSpec`
min and max for these are wide and the **panel reads the live range from the node's params** (`panel-values.ts` takes a spec
built from them). A control **created from an input** copies that input's range, curve, unit, default, label and current value.
Controls carry **real values** in their range (the user asked for min / max / curve), not 0..1: a control wired to a socket with
another range is the user's to fix; the editor shows the receiving socket's range and warns when they differ. **(confirm)**

### Names

`PatchNode.name?: string` (optional, no format bump). The default is the type's label, numbered when alike ("Oscillator 2", in
patch order; `nodeTitles` in `ui/panel/panel-values.ts` already does it). Every list that shows a node uses it (cards, panel
captions, the property editor, the module interface).

### The property editor

A docked aside in `GraphEditor` (where `ModuleInterface` sits) for the **selected node**: name; one row per parameter (label, number
field, slider, unit, reset, tooltip, and "driven by ..." when wired, with a button that creates a control for it); the stereo /
bypass switches, the sample and track pickers (moved off the card); for a control node its properties above and its **panel**
settings (show on panel, size). Edits use the same `edit` and merge keys as the graph's sliders did
(`param:<scope>:<node>:<param>`), so a drag is one undo step. No selection: a hint. Several selected: the count.

### Right-click on an input

A context menu on every socket (`ui/shared/menu`): **Create knob**, **Create slider**, (later **Create XY with ...**), **Disconnect**.
Create adds a control node to the left of the node in a free slot, set up from the socket, and wires it. For a socket that is not
a parameter (an audio input) the menu only offers Disconnect.

### Tooltips

`ParamSpec` and `PortSpec` get `description` (and ports of kind `control` get `range` / `default` / `unit` so a knob can be
created from them); `NodeDefinition` gets a one-line `description` (for the palette and the card). A tooltip shows the
description, then **range - unit - default - curve**, then, if wired, what drives it. About 150 strings for the 21 sound nodes and
the note nodes, written once; a test fails if any registered node, param or port has no description.

### Node pictures (minimalism)

A card is a header, sockets and, where it helps, a small SVG of what the node does, **derived from its resolved parameters**
(a wired socket resolves through its wire to a control or constant), so it moves when a knob moves, with no engine data:

| Node | Picture |
| --- | --- |
| Oscillator | its waveform, cycles drawn follow frequency, height follows amplitude |
| Filter | the frequency response (mode, cutoff, resonance) |
| Envelope | the ADSR shape |
| LFO | its shape at its rate and depth |
| Gain / Pan / Width | a level bar / a position / a width |
| Delay / Reverb | the taps and feedback decay / a decay tail |

Pure geometry functions (`nodePreview(node, resolved) -> shapes`) in `ui/patcher/previews/`, unit-tested; a tiny SVG component
draws them. A node without a picture shows none. What is **not** shown: audio-rate modulation (an LFO into `cutoff`) does not
animate the picture; that would need telemetry from the engine.

### The panel is the control nodes

`PatchNode.panel?: { show?: boolean; size: 'S' | 'M' | 'L'; order: number }` on control nodes (absent = on the panel, default size, in
graph order). The board shows the patch's control nodes in `order`, with the existing widgets; Edit mode keeps its tools (rename =
the node's name, resize, reorder by drag or buttons, hide = `show: false`, remove = delete the node). A knob writes the node's
`value` with `setNodeParam`: the panel needs no bindings, no pruning and no sanitizer of its own.
**This replaces `Patch.panel`** (`core/patch/panel*.ts`, `persistence/sanitize-panel.ts`, `v1-panel` fixture, the `prunePanel`
call in `reconcileModules`, the patch literals that had to carry it); `ui/controls`, `panel-values.ts`, `PanelView`, `ControlCell`
and the switch are kept and re-pointed.

**Migration.** The old `panel` field has shipped (main deploys). On load, convert each legacy control to a control node wired to the
parameter's socket (same value, range from the spec, layout carried over; an XY becomes an XY node), then drop the field; where it
cannot be converted, drop it with a warning. Best effort, last step, with a fixture. **(confirm)**

### Modules

Today a module shows chosen inner parameters as **knobs** on every use; each use keeps its own values (`use.params`), baked in
by `flattenPatch`. Keep that and add the two ways the user described, **both**:

* **Exposed inputs.** Any inner socket (including `param:` ones) can be exposed as a module input, as ports are now; the parent
  wires a control (or anything) into it.
* **Internal controls shown on the parent's panel.** A control node inside a module with `panel.show` is listed on the panel of
  the graph that uses the module, under the module's name, with **its value stored per use** (as knobs are) and the definition's
  value as the default. In effect `ModuleKnob`s become derivable from the flagged inner controls; legacy knobs keep working.
  Module knobs of old files stay readable; no migration needed beyond that.

### Math nodes

All **elementwise over buffers** (so they work on constants, control signals and audio alike, and run once when global). Each has
`params` (the second operand and so on), so each also has param sockets and a property-editor row. First batch:

| Node | What it does |
| --- | --- |
| Add, Multiply, Invert | `a + b`, `a * b`, `-a` |
| Min, Max, Clamp | the smaller / larger of two, `a` limited to a range |
| Map range | `in-min..in-max` -> `out-min..out-max`, with a curve (lin / log / exp) |
| Quantize | snap to steps (a step size and an offset) |
| Smooth | slew limiting / one-pole smoothing, stateful (time or rate) |
| Mix | crossfade `a` and `b` by a third input |
| Compare | `a > b` -> 0 / 1 (a threshold) |
| **MIDI -> Hz** | `ref * 2^((note - 69) / 12)`; param *Tuning* (A4, default 440 Hz) |
| **Hz -> MIDI** | `69 + 12 * log2(f / ref)`; `f <= 0` gives the lowest note (no NaN or -Infinity); same *Tuning* param |

The MIDI nodes carry fractional notes (a note of 60.5 is a quarter-tone up), so a *Control* in note numbers (range 0..127, step 1,
shown as note names through the existing `format: 'midiNote'`) wired through *MIDI -> Hz* into an oscillator's `freq` is the way to
play a pitch from the panel. Second batch, later: Subtract, Divide, Abs, semitones <-> ratio, dB <-> gain, Hz <-> period (ms),
sample & hold, Constant. Tests for every node: known values, no NaN or Infinity for edge inputs, buffers of any length up to the block.

### Adding nodes: grouped and searchable (quick-add)

The toolbar's row of one button per node (`NodePalette`) does not survive 30+ nodes. Replace it with a **quick-add popup**:

* **Open** with a double-click on empty canvas (the new node is placed where you clicked), with the toolbar's **Add** button (placed
  in the visible middle), and with **Shift+A** over the canvas (and the same popup opens for a node with nothing selected). Esc closes it.
* **A text field**, focused, at the pointer. With an empty field it lists the **categories** (each with its count); Enter or a click
  drills into one (Backspace on an empty field goes back up). Typing at any level **filters across everything**, ranked: label prefix,
  word prefix, then substring and subsequence, then category, keywords and description. Up / Down move, Enter adds, mouse hover and
  click work too. A row shows the label, its category and the one-line description (the same text as the tooltip).
* **What is offered** is what the graph allows: today's `paletteFor` rules (insert graph vs patch vs notes, no *Send* in the master,
  no sampler in an insert graph ...) and the modules that may be placed here (`placeable` in `GraphEditor`), under **Modules**.
* **Catalog.** `NodeDefinition`, `NoteNodeDefinition` and module uses get a `category` (and optional `keywords`); suggested sound
  categories: *Sources* (Note, Oscillator, Sampler), *Controls* (Control, XY pad, Switch), *Modulation* (LFO, Envelope), *Math*,
  *Filters*, *Effects* (Delay, Reverb, Pan, Width, ...), *Routing* (Track in / out, Send, Return in, Master in, Track audio, Mono sum,
  Output), *Modules*; the note graph's own: *Sources*, *Effects*, *Routing*. The categories and the matching live in a pure module
  (`ui/patcher/node-catalog.ts`: `buildCatalog`, `searchCatalog`) with unit tests (ranking, empty query, no match, categories, modules,
  the per-graph filtering); `QuickAdd.tsx` is the thin component (a `combobox` with `listbox` options, `aria-activedescendant`;
  vitest has no DOM, so the browser check drives it).
* **Later, cheap once it exists:** dropping a wire on empty canvas opens the same popup filtered to nodes that have a compatible
  socket and wires the new node on creation.

## Build order (each step ships and passes the tests)

> **Step 1: done.** Differences between this plan and what the code needed, all recorded in `ARCHITECTURE.md`: the Sockets toggle
> and the dashed wire colour are in step 1 (without them a wire cannot be made to a socket); `PortSpec.control` already existed as a
> flag (a mono modulation input), so the new `control` *kind* shares the word, not the meaning; a control's `unit`, `display` and
> `label` are strings and `PatchNode.params` holds only numbers, so they are **not built yet** and need a home (decide in step 4 with
> the property editor: probably optional string fields on the node); `ParamSpec.range` / `liveSpec` (a control's value takes its
> range from the node's own `min` / `max` / `step`) is new and is what the panel in step 5 reads; `buildPanel` skips control nodes.
> Math operands are an input port **and** a parameter of the same id (unwired, the parameter is the operand), so *Add* has `a` and
> `b` ports and `a` / `b` parameters with sockets of their own.

1. **Engine and model, no UI change beyond sockets (done).** `control` port kind and rules; param sockets in `describeNode`;
   `paramFeeds` in `compileStage` / `processStage` (and the fx-graph / master paths); the `global` stage; the control nodes
   (Control, XY, Switch) and the first-batch math nodes (including MIDI <-> Hz) in the DSP registry; `PatchNode.name?`. Tests: socket
   generation, replace semantics, block-rate feed, **a control into N voices is not N times the value**, global / voice classification,
   flatten and diff (a knob turn is one `track/setParam`), save / load, old files identical. The old palette strip lists the new nodes
   and the old sliders stay on cards for now, so everything is usable. Browser check: `docs/browser-checks/controls.mjs`.
2. **Descriptions, categories and tooltips (done)**: `description` on every node, param and port, a `category` on every node, the
   completeness test (nothing registered without them), the tooltip component, used in the palette and on cards. Differences from
   the plan: the words live in one table per registry (`dsp/node-docs.ts`, `notefx/node-docs.ts`), attached by the registries, rather
   than inside each node file (about 190 strings; the test checks both directions); the tooltip is a `data-tooltip` attribute and
   one `TooltipLayer`, not a wrapper component per use; the note nodes got the words too, but still no sockets; `curve` in the
   tooltip is "logarithmic" when the slider is log (`param-scale`), there is no separate curve field on a `ParamSpec`. Browser
   check: `docs/browser-checks/tooltips.mjs`.
3. **Quick-add (done)**: `node-catalog.ts` with tests, `QuickAdd.tsx`, double-click / Add / Shift+A, the old strip removed. Update the
   browser checks that click a palette button (`fx`, `master`, `modules`, `notegraph`, `returns`, `sends`, `stereo`, `trackaudio`, `mod`,
   `panel`) through one `addNode(type)` helper per script, and add `quickadd.mjs`. Differences from the plan: the popup's behaviour is
   a pure model (`quick-add-model.ts`) besides the catalog; a new node goes where it was asked for and `freeSpot` fans out a row
   of adds, so the old grid slots (`spawnPoint`) are gone; "the same popup opens for a node with nothing selected" was not built (it
   was unclear what it meant; Shift+A needs the pointer over the canvas); the double-click is timed by hand because `PointerEvent.detail`
   is 0, and the canvas surface now fills the scroller; the checks that make a wire to a socket (`controls`, `tooltips`) still
   enlarge the editor first (the demo's cards are taller than the default editor), the others needed nothing; the tooltips check
   moved from palette buttons to the Add button. "Wire-drop quick-add" is still step 8.
4. **Property editor, compact cards, context menu (done).** The aside; sliders, pickers and switches leave the cards; "Create knob /
   slider" on sockets; the Sockets toggle; node names editable. Update the browser checks that drive node sliders. Decided with the
   user at this step: a control's **unit**, **display** (and an XY pad's second unit) are **optional string fields on `PatchNode`**
   (`unit`, `unitY`, `display`); its label is its name. Differences from the plan: a `NodeDefinition.panelKind` (`value` / `xy` /
   `switch`) says which nodes are controls (step 5 needs it); `ParamSpec.range` also carries a `curve` and a `reset` parameter id,
   and `ParamSpec.curve` makes the sliders honour a control's linear / log / exp; `resolveSpec` is the one place a node's spec is
   resolved; `nodeTitles` moved to core (names, numbering) and the cards show it; a click on a card's body selects it; "Create knob" is
   offered only for an unwired socket; the editor's driven row has an **Unwire** button (the doc's "button that creates a control" is
   on the unwired rows instead, as **Knob** / **Slider**); the Notes preview aside shrank to 30% so the canvas keeps room. Not done:
   note names for a MIDI-note control (a control has no `format`), "Create XY with ...", "Create selector" for an enum. Browser
   checks: every script that moved a node slider, a switch or a picker now goes through the editor (`selectNode` + `slider` /
   `valueField` / `properties()` helpers), `properties.mjs` is new.
5. **The panel from control nodes (done)**: `PatchNode.panel`, re-point `PanelView`, delete `Patch.panel` and its machinery, a new
   `panel.mjs`. Decided with the user at this step: **no migration** (the demo project was the only user of the old panel), so a stored
   `panel` list is just ignored on load and there is no fixture; `controlsPerPatch`, `sanitize-panel.ts`, `panel-types.ts`, the
   `v1-panel` fixture, `prunePanel` / `dropControlsOfNodes` and `buildPanel` are gone. Differences from the plan: the panel keeps a
   *Switch* widget (`Toggle`; a momentary switch is held) but still no selector for enums; Edit mode has an *Add* form (a kind and, optionally,
   the parameter(s) to drive: it uses `createControlFor` / the new `createXyFor`, or makes a blank control) instead of *Build from
   graph*; a hidden control is listed in a tray in Edit mode and has *Show on panel* / *Size* in the property editor; `order` is
   numbered for the whole board on the first reorder; the caption under a widget is the node's name only (no node + parameter pair).
   Browser check: `panel.mjs` rewritten.
6. **Node pictures (done)**: the pure geometry for oscillator, filter, envelope, LFO first, then the rest; tests for the geometry. All of them
   were built in one go (oscillator, filter, envelope, LFO, gain, pan, width, delay and ping-pong, reverb and stereo reverb). Added:
   `resolveParams` in core, which works a wire's value out by running the real DSP nodes for one frame (the doc's "resolve through its
   wire to a control or constant"), and a **~** mark when a moving signal drives a setting. The oscillator has no amplitude parameter, so its
   picture is always full height. Browser check: `previews.mjs`.
7. **Modules**: exposed param sockets and internal panel controls with per-use values.
8. **More math nodes** (second batch), the note graph's sockets, wire-drop quick-add.

## Things that will bite

* **Browser checks:** the node sliders, switches and pickers moved to the property editor (step 4) and the palette buttons to the picker
  (step 3); both have one set of helpers per script (`addNode` / `offers`, `selectNode` / `slider` / `valueField` / `properties`). Selection
  is forgotten when the tab or track changes, and a node's title is numbered when alike.
* The canvas surface's `onPointerDown` starts the selection box and captures the pointer; a double-click on empty canvas must open
  the popup without leaving a marquee or clearing a selection the user meant to keep (test it in the browser check).
* The compile step reads `node.params` once at creation and then gets `setParam`; a **wired** socket must win over both
  (apply the feed every block and skip a `track/setParam` for a driven param on the engine side, or it fights the wire).
* `diffProject` and `flattenPatch` must treat sockets as ordinary ports (`<use>/<inner>` ids stay stable).
* A control wired to **several** sockets feeds each its own value unchanged; wiring one control to sockets with different ranges is
  allowed (see the warning above).
* `Params.set` clamps to the spec's range: control nodes need wide specs and clamp themselves.
* Layering (`tests/architecture.test.ts`), same-object no-op edits, optional fields with safe defaults (no format-version bump
  unless a migration needs one), tests beside the code, comments explain why.

## Out of scope (do not add)

Automation and recording, MIDI mapping, free pixel positioning of panel controls, audio-rate param sockets, engine telemetry for
animated pictures, named-value controls beyond the first Selector, the Mixer adopting the widgets.
