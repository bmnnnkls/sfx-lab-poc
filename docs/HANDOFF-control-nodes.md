# Handoff: control nodes, a property editor and a panel built from them

> **Status: planned, not started.** Written after the front panel (`HANDOFF-front-panel.md`, built and merged) was tried and the
> user said what they actually want. Decisions marked **(confirm)** were proposed by the planner and not yet agreed; the rest
> were agreed in conversation or follow from how the code works. Work on the branch **`claude/determined-turing-ypq9ix`**
> (restarted from `main` at `0929605`, after PR #2). Do not open a pull request unless asked. `main` deploys to GitHub Pages
> on every merge.

Read `ARCHITECTURE.md` (Modules, Front panel, Conventions, Common changes) and `docs/HANDOFF-mixer-view.md` ("Working
conditions": commands, layering test, browser checks) first. They apply unchanged.

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
6. **Math nodes** for control signals.

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

All **elementwise over buffers** (so they work on constants, control signals and audio alike, and run once when global):
Add, Multiply, Invert, Min, Max, Clamp, Map range (in-min..max -> out-min..max with a curve), Quantize (steps), Smooth (slew,
stateful), Mix (crossfade), Compare (>, -> 0 / 1). A second batch later: Subtract, Divide, Abs, semitones <-> ratio, sample &
hold, a Constant. Each has `params` (the second operand, etc.), so each also has param sockets and a property-editor row.

## Build order (each step ships and passes the tests)

1. **Engine and model, no UI change beyond sockets.** `control` port kind and rules; param sockets in `describeNode`;
   `paramFeeds` in `compileStage` / `processStage` (and the fx-graph / master paths); the `global` stage; the control nodes
   (Control, XY, Switch) and the first math nodes in the DSP registry; `PatchNode.name?`. Tests: socket generation, replace
   semantics, block-rate feed, **a control into N voices is not N times the value**, global/voice classification, flatten and diff
   (a knob turn is one `track/setParam`), save/load, old files identical. Palette lists the new nodes; the old sliders stay on cards
   for now, so everything is usable.
2. **Descriptions and tooltips**: `description` on every node, param and port, the completeness test, the tooltip component,
   used in the palette and on cards (the property editor reuses it in step 3).
3. **Property editor, compact cards, context menu.** The aside; sliders, pickers and switches leave the cards; "Create knob /
   slider" on sockets; the Sockets toggle; node names editable. Update the browser checks (below).
4. **The panel from control nodes**: `PatchNode.panel`, re-point `PanelView`, delete `Patch.panel` and its machinery, the legacy
   migration with a fixture, a new `panel.mjs`.
5. **Node pictures**: the pure geometry for oscillator, filter, envelope, LFO first, then the rest; tests for the geometry.
6. **Modules**: exposed param sockets and internal panel controls with per-use values.
7. **More math nodes**, and the note graph's sockets.

## Things that will bite

* **Browser checks drive the node sliders** (`input[type=range]` on a node): `fx`, `master`, `modules`, `notegraph`, `returns`,
  `sends`, `stereo`, and the new `panel.mjs`. They move to the property editor in step 3; keep selectors in one helper per script.
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
