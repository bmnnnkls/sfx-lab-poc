# Control nodes and panels

Control nodes, parameter sockets and the global stage, and the front panel built from them, pinned panels included.

## Front panel (the control nodes, arranged)

Every graph editor (Instrument, Effects, Notes, the Master's effects, the inside of a module) has a **Graph | Panel** switch.
*Panel* replaces the canvas with a board of the graph's **control nodes** as knobs, sliders, XY pads, switches and selectors, and its **indicators** (LEDs, number displays, bar meters). The switch is
remembered per kind of graph in `localStorage` (`sfxlab.view.<patch|fx|notes>`): a way of looking, not part of the project.

* **The panel is the control nodes** (`core/patch/panel.ts`). There is no list of controls and no bindings: a knob on the board IS a
  *Control* node (an XY pad an *XY pad*, a switch a *Switch*; `NodeDefinition.panelKind`), so nothing can fall out of step with the
  graph. A node adds only where it sits, `PatchNode.panel?: { show?: false, size?: 'S'|'M'|'L', order?: number }` (only what differs from
  the defaults is stored; the default size is S, M for a pad). `panelItems(patch, modules)` is the one derivation: the control nodes
  in board order (those with an `order` first, then the rest in patch order, so a control added later lands last), each with its kind
  (`knob`, `slider`, `xy`, `switch`; a *Control*'s `display` picks knob / slider / sideways slider), size and whether it is shown. The
  pure edits (`setPanelShow`, `resizePanelControl`, `movePanelControl`, which numbers the whole board, `numberPanel`) return the same
  patch when nothing changes. A panel therefore follows whatever owns the patch (a track's instrument, insert graph or note graph,
  the master's graph, a module's definition) and uses the same edit and undo path as everything else.
* **Making controls** (`core/patch/control-for.ts`). From the panel's *Edit* mode (`AddControl`): pick a kind and, optionally, the
  parameter(s) it should drive. With a parameter it is `createControlFor` / `createXyFor` (the same function as right-click *Create knob*,
  with the parameter's range, curve, unit, default and current value, wired in one undo step; a pad takes two parameters and wires
  both axes); without one it is a blank control (`createBlankControl`) to wire in the graph. Only parameters with a socket and no wire
  yet are offered. New nodes go in a row under the others (`spotBelow`).
* **Writing a value (shared-definition editor).** A knob or slider writes the node's `value` with `setNodeParam` through the editor's own `edit`, with the **same merge
  key as the property editor's slider** (`param:<scope>:<node>:value`), so one drag is one undo step and a drag in either place merges
  alike; a pad sets `x` and `y` in **one** edit (`xy:<scope>:<node>`); a switch writes `on` (a *momentary* switch is 1 only while held).
  What the control does is then whatever is wired from the node: a control's value is **real** (in its own range), and the sound follows
  through the parameter sockets (`ARCHITECTURE`, "Control nodes"). Track/master instance panels now use the shared control transactions described above. A panel layout edit alone makes **no engine command** (tested through
  `diffProject`); a value change is the ordinary `track/setParam` on the control node.
* **Persistence.** `PatchNode.panel` is read by the sanitizer for control nodes only (`show` can only be `false`, a size is one of S / M / L,
  an `order` a small non-negative integer; malformed parts are dropped and an empty field is not stored). The old `Patch.panel` list
  (bindings to parameters) is gone and an older file's `panel` is simply ignored on load (the demo project was the only user; no
  migration was written).
* **Widgets** (`ui/controls/`). `Knob`, `Fader`, `XYPad`, `Selector` and `Toggle` work on a 0..1 position (or on/off) and know nothing about
  patches, so the Mixer could adopt them. All arithmetic (drag, wheel, keys, pad and knob geometry, a per-animation-frame throttle) is pure
  and tested in `control-math.ts` / `frame-throttle.ts`; the components are thin (vitest runs in `node`, with no DOM, so they are covered
  by `docs/browser-checks/panel.mjs`). Knob: drag up or down (180 px is the full range, Shift for a tenth), wheel, arrow / Page / Home / End
  keys, double-click for the default (the control's own `default`). Fader: press or drag anywhere on the track. Pad: press or drag, arrows
  move both axes. All have `role="slider"` (the pad a labelled group, the switch `role="switch"`) with `aria-valuetext`, and
  `data-position` / `data-x` / `data-y` for the browser checks. `Selector` (a named-values choice) has no control node yet.
* **The board** (`ui/panel/`). `panel-values.ts` maps a parameter to a position and back with the same `param-scale.ts` as the property
  editor's slider, and `axisSpec` gives an axis its live range, curve and unit (`resolveSpec`) with the node's own `default` as the reset
  value, so a log-scaled cutoff feels the same everywhere; `spanOf` gives a control its grid cells (a knob grows square, a slider along
  its length, a pad wide). `ControlCell` draws one control, captioned by its node's name (`nodeTitles`), and, in **Edit** mode, its tools
  (drag handle, move, size, sideways for a slider, hide, delete, rename = the node's name); hidden controls are listed in a tray with a
  *Show* button each, and the property editor has *Show on panel* and *Size* for a control node. `PanelView` is the grid, the Play / Edit
  toggle and the add form.
* **Fitted spans.** A control wider than the board takes the columns there are (`fitSpan` in `panel-values.ts`): a knob
  stays square, so its rows shrink with it; a pad's rows shrink in proportion, never under two; anything else keeps its
  rows. `PanelView` counts the board's columns with a `ResizeObserver` (`boardColumns`: its width inside the padding,
  the 104 px minimum and the gap) and passes them to each `ControlCell`. Every panel does it: at the Instrument view's
  480 px minimum the board has four columns, so only panels under about 360 px wide change, and a 280 px one never
  scrolls sideways.
* **Variants.** `PanelView variant="pinned"` is play only: no bar, so no *Edit panel*, add form, hidden tray or cell
  tools; the board is as tall as its controls and doesn't scroll (the Pinned view does); an empty one says "No
  controls yet." with *Open* (`onOpen`). `editor`, the default, is the panel above.
* **What it reads.** `PanelView` reads its controls' base values through `useProjectSelect` (`state/project-select.ts`),
  a selector with an equality that re-renders only when its value changes; `EffectiveValue` reads its target's
  resolution and MIDI mapping the same way. So a knob turned in one panel re-renders that panel and any other showing
  the same graph, not every panel on screen.
* **Limits.** Layout is an ordered flow with sizes, not free positioning; a panel belongs to one graph (no combined instrument +
  effects panel, and the controls inside a module are not yet shown on the panel of the graph that uses it: step 7); no selector for
  enum parameters yet; no automation, meters or per-control ranges beyond a control's own (see [BACKLOG](../BACKLOG.md)).

### Pinned panels

A front panel can be played from the Pinned view while the editors show something else (round 9).

* **The model** (`core/project/pins.ts`). A pin is `PanelPin { owner: ControlOwner, graph: TrackGraph, collapsed? }`: a
  track's instrument, effects or notes, a group bus's effects, or the master's effects (a group or the master has only
  `fx`). `Project.pins` lists them top to bottom, absent when there are none, at most `MAX_PINS` (16). `pinKey` is
  `<owner id or master>:<graph>`, as `graphKey` writes it; two pins with one key are one pin. `pinTarget` names the
  graph as the store's patch edits do, and `pinnedGraph` finds it (`patchAt`), or nothing when it is gone.
* **Liveness.** Nothing that removes a track or a bus touches pins. A pin whose graph is gone (a removed track, *Remove
  bus*, *Ungroup*, a deleted group) is kept and not shown: `livePins(project)` is the pins whose graph exists, each with
  its key and graph, the same list while `pins`, `tracks`, `groups` and the master are. Undo brings the graph back, and
  the pin shows again where it was. A track's copy isn't pinned.
* **Edits and undo.** `pinPanel`, `unpinPanel`, `movePin` (one place among the shown pins, so a hidden one never stalls
  a move) and `setPinCollapsed` return the same project when nothing changes. They are **view edits**, as a group's
  collapse: the store applies them through `editView`, saved but not undo steps. `withViewOf` gives a project undo or
  redo brings back the current pins, plus its own pins of owners the current project lacks (`withPinsOf`); the master
  counts as the current project's only when the two share a track, so undoing *New project* brings the old project's
  pins back, the master's included. A bus switched off and on again is a new bus on the same group, and its old pin shows
  again on it.
* **The file.** Version 10 still: `sanitizePins` reads `pins` after the tracks and groups. A malformed pin, a repeated
  key and anything past 16 go with a warning; a pin whose graph is missing goes silently, since a project saved with an
  unshown pin is normal. Older builds drop `pins` as an unknown field.
* **The view** (`ui/pinned/`). `PinnedView` draws the live pins' keys as a list; each `PinnedPanel` reads its own pin,
  title (`pinTitle`: *Bass instrument*, *Drums effects*, *Master effects*) and group colour, so a knob in one pin
  doesn't re-render the others. A pin is a `section` named by its title: a header (twisty, title, *Open*, ×; its menu is
  the pin's actions, a double-click on the title opens the editor) over `PanelView variant="pinned"` with the editor's
  scope (`<owner id>:<graph>`, so undo keys merge alike), `readoutTrack` and an `edit` through `editPatch(pinTarget(pin))`.
  Turning a pinned knob is the same control gesture as in the editor: one undo step, MIDI learn, live indicators.
* **Pinning** is offered by the track, group (with a bus) and master menus, and by the *Pin* toggle in the toolbar of
  Instrument, Effects and Notes (not inside a module). Pinning runs `revealPin`: it pins, reveals the Pinned view and
  posts a one-shot `pinRequest` in the graph-view store, which the view answers by scrolling the pin into view and
  focusing its header. Unpinning leaves the layout alone. *Open* runs `openPinnedEditor`: it selects the owner and
  reveals its editor in the Graph or Panel mode that editor was in.

## Control nodes, parameter sockets and the global stage

A knob is a node you wire, and any numeric parameter can be driven by a wire. (Built so far: the engine, the model and the
plain cards; the property editor, the panel built from control nodes and the node pictures follow, see
[the control-nodes handoff](../archive/handoffs/HANDOFF-control-nodes.md).)

* **Parameter sockets** (`dsp/param-sockets.ts`, `describeNode`). Every numeric, non-enum parameter `p` of a **sound** node also
  appears as an input socket `param:p` of kind `control` (`PortSpec.param` names the parameter). They are generated, not written
  per node, appended after the node's own inputs; a node can opt out with `NodeDefinition.paramSockets: false` (the control
  nodes: their range and step are settings, not signals). Note nodes have none yet. Because a socket is an ordinary port to
  `canConnect`, `flattenPatch`, `diffProject`, modules and the sanitizer, none of them changed.
* **A wire replaces the value.** Unwired, the node uses its stored parameter; wired, the wire's value is the parameter (several
  wires add up). The stored value stays in the file and is used again when the wire goes. To add on top of a stored value use
  an *Add* node. Existing modulation ports (oscillator `freq`, filter `cutoff`, gain `cv`) keep their own meanings.
* **Block rate.** `compileStage` turns every wired socket into a `ParamFeed` on its `CompiledNode`; `processStage` reads the
  first sample of each source once per 128-frame block (sources summed) and applies it with `setParam` *only when it changed*
  (so a node that redesigns itself on `setParam` is not poked every block). **No DSP node changed.** A non-finite value is
  ignored. Audio-rate modulation keeps using the audio-rate ports. A parameter with a feed is in `CompiledStage.driven`, and
  `setStageParam` leaves it alone, so a slider on the stored value cannot fight the wire (the engine side of "a driven
  parameter's `track/setParam` is ignored"; `diffProject` still sends it).
* **Port kind `control`** (`kindsConnect`): `control` to `control`, `control` to `signal` (a constant buffer), `signal` to
  `control` (read once per block, so an LFO can drive a socket); never to or from `stereo` or `notes`. Not to be confused with
  `PortSpec.control`, the older flag on a modulation *input* that keeps it mono in a stereo node (sockets are mono either way).
  Wires from a control output are drawn dashed green.
* **The `global` stage** (`planStages`: `voice`, `shared`, `global`). A definition may say `global: true`; the node then runs
  globally when everything wired into it is global, and a node with nothing wired in (a control, a constant) always does. Shared
  wins (anything downstream of a shared node stays shared). The global stage is compiled once per `Instrument`, runs once per
  block **before the voices** (also when none is sounding, so a smoothing node keeps its state), and its output buffers are
  passed as `seeded` buffers to every voice's stage and to the shared stage. They are read, never summed, which is the point:
  a voice -> shared boundary adds the voices up, so a value read across it would arrive as N times itself (tested: a control
  driving a gain or a delay mix under a three-note chord sounds exactly like the value typed in). Insert graphs and the master
  graph (`FxGraph`) have one copy of every node, so they need no stages; they get feeds from the same `processStage`.
* **Nodes.** *Control* (`value`, `min`, `max`, `curve`, `step`, `default`; output `out`), *XY pad* (the same per axis, `x` / `xMin`
  / ..., outputs `x`, `y`) and *Switch* (`on`, `mode` toggle / momentary / trigger, `offValue` and `onValue` (0 and 1 until set; both have sockets, `on` and the mode do not: `ParamSpec.socket: false`), `pulse`) and *Selector* (`index`, `count`; outputs the chosen position from 0, `panelKind: 'selector'`). A switch in `trigger` mode is a push button: the panel holds it like a momentary switch, and the node outputs the on value for `pulse` seconds from the rising edge of `on` (seen in `setParam`, so a press shorter than a block still pulses). They output the **real value** in their
  own range, clamped and snapped to the step by the node itself, so the specs' own bounds are wide (+-100000) and
  `ParamSpec.range` says "my range is the node's `min` / `max` / `step`" (`liveSpec` resolves it; the cards use it for the
  slider). `curve` (linear / log / exp) is for the knobs' mapping; the engine ignores it. Math nodes (`dsp/nodes/math/`,
  one factory `mathNode`): *Add, Multiply, Invert, Min, Max, Clamp, Map range, Quantize, Smooth, Mix, Compare, MIDI to Hz,
  Hz to MIDI*, then *Subtract, Divide* (by 0 gives 0), *Abs, Constant, Semitones to ratio, Ratio to semitones, dB to gain, Gain to dB,
  Hz to ms, ms to Hz* (zero gives 0) and *Sample and hold* (catches `in` on a rise of `trigger` through 0.5). Each is elementwise over buffers, so it works on constants, controls and audio alike; an operand is the buffer
  wired into its port, or, unwired, the parameter of the same id (which has its own socket); the result is never NaN or
  infinite (rounded to float32 first, so a product that overflows the buffer is 0, not Infinity). *Hz to MIDI* gives 0, the
  lowest note, for 0 or less; fractional notes work. Math nodes are global-capable.
  **Parameters are read once per block**, not per sample: a rule with settings returns a `MathRule` (`block` reads the parameters, and
  anything worked out from them such as a smoothing coefficient or a clock's step, into its closure; `sample` does no lookups), so a
  change lands at the next block, which is when `setParam` and the sockets deliver it anyway. A rule marked `pure` (no state: arithmetic,
  conversions, Map range, Quantize, Mix, MIDI to Hz) with nothing wired into it runs once per block and fills the buffer. Together about
  2.4 times cheaper per audio-rate math node (2.7 % to 1.1 % of real time each in the test container), with output identical to the bit.
* **Sources of sound and chance** (`dsp/random.ts`, `dsp/nodes/{noise,perlin,geiger,random}.node.ts`). Everything random is **seeded**
  (`createRng`, mulberry32; `hashSigned` for lattice points), never `Math.random` or the clock, so a render comes out the same every
  time (exports, tests, a sound you want back); each has a `seed` parameter (no socket: `socket: false`). **A seed per voice:** a voice
  has its own copy of every voice-stage node, and copies started from one seed make one noise that adds up coherently (louder and phasey).
  So `NodeDefinition.create(sampleRate, voiceSalt)` is told which voice it is for: the voice's slot in the pool (`compileStage`'s
  `voiceSalt`, set by `Instrument` per voice; 0 for the global and shared stages, insert graphs and the master). The four sources mix it
  into their seed (`voiceSeed`: `seed + salt * 10007` with `voices` *differ*, the typed seed with *same*), through an enum parameter
  `voices` (`voicesParam`; `differ` is the default for Noise, Geiger and Random, `same` for Perlin, whose Retrig exists so that every note
  wanders alike). Slot 0 and any node outside a voice are the typed seed either way, so a single note sounds as it did. A slot depends only
  on the order of the notes (the pool hands out the lowest free one), so a render is still the same every time. The LFO's random shape is
  not salted: its voices agree on purpose. *Noise*: white, pink
  (Kellet's three-pole filter, gain 0.11 so its peak stays under 1) or brown (leaky random walk, clamped), with a level. *Perlin
  noise*: fractal 1D gradient noise (`gradientNoise`, `fractalNoise`: octaves, persistence, quintic fade), outputs `out` and `uni`
  like the LFO, optional `Retrig` input restarts the wander. *Geiger*: a Poisson process (each sample has the chance
  `rate / sampleRate`), outputs `Click` (a noise burst that decays over `decay`, strength varied by `spread`) and `Trigger` (high for
  `gate` seconds), so one node is both a crackle and a random trigger. *Random*: a control that holds a roll between `min` and `max`
  (optionally snapped to `step`) and draws a new one on each rise of `Roll` through 0.5; it keeps the roll as a position in the range,
  so turning Min or Max moves the value without a new roll.
* **Logic** (`dsp/nodes/math/logic.ts`, category *Logic*, all built with `mathNode` and global-capable; `MathSpec.inNotes: false` keeps them out of
  note graphs, since a clock or counter has no meaning as a baked constant). *Schmitt trigger* (on at `high`, off only at `low`, either way round),
  *Edge detect* (a pulse of `pulse` seconds on a rising, falling or either edge; the first sample is never an edge), *Flip-flop*
  (toggles on a rise of `trigger`, `reset` clears), *Counter* (counts rises, wraps at `limit`), *Clock* (a square at `rate` per second
  (Hz), per minute (BPM) or per beat of the project's tempo (`beat`: 1 is once a beat, 4 is sixteenths), duty `width`, `reset` restarts it),
  *Clock divider* (passes the first and
  then every Nth cycle) and *Control delay* (up to 2 s, a ring buffer made when the node is created; starts as its first input). A
  rise or high is always 0.5, as everywhere else.
* **Tempo in the DSP** (`ProcessContext.tempo`, `DEFAULT_TEMPO`, `tempoOf`). The context carries the project's tempo in BPM; absent, or not a
  positive number, it is 120 (`tempoOf`), so the many tests that build a context by hand keep working and a node never divides by zero.
  The engine hands it down: `Engine.apply` on `transport/setTempo` calls `setTempo` on **every track** (`PlayableTrack.setTempo`: instrument,
  audio and return runtimes, which pass it to their `Instrument` and `FxGraph`) and on the master graph, and a track added later is told the
  transport's current tempo as it is created; each runtime also keeps it, so a rebuilt instrument or insert graph (`setPatch`, `setVoices`,
  `setFx`, `master/setFx`) starts with it, not with 120. `Instrument` puts it in the context of its global, voice and shared stages and `FxGraph`
  in its own, from the next block on. Math nodes see it as `BlockInfo.tempo`, the third argument of `MathSpec.make`, refreshed before each
  block, which is how *Clock* counts beats: the rate is re-read every block, so a change of tempo bends the next cycle (the one running
  finishes its phase at the new speed) with no command to the node. Only *Clock* and the *LFO* use it so far; delays, stutter and the
  rest are still in seconds.
* **Analysis** (`dsp/nodes/analysis/`, category *Analysis*; audio in, control out). They read a sound, so they are voice or shared
  nodes (never global), and their `control` outputs can feed a parameter socket (read once per block) or any signal input. *Envelope
  follower* (`Follower`: a one-pole with its own attack and release, peak or RMS; RMS of a sine reads 0.707 of its peak). *Level (dB)*
  (the same follower, symmetric, then `20 log10`, floor -120 dB, 0 dB is full scale). *Pitch detector* (`yin.ts`: the YIN method on the
  input averaged down to about 12 kHz, a 1024-sample window looked at every 256, parabolic interpolation; outputs `frequency`, which holds the
  last pitch it was sure about and is 0 until the first, and `confidence`; about 50 ms of lag; a pitch above its range comes out as a
  subharmonic inside it).
* **Indicators and the readout path** (`dsp/nodes/indicator.nodes.ts`, category *Indicators*). *LED* (on/off at a threshold, or dark-to-bright between two
  values; four colours), *Number display* (decimals, or a MIDI note name; the unit is the node's own `unit`, kept by the sanitizer for
  displays and bars) and *Bar meter* (fills between two values) are **sinks with no outputs** that remember the last sample they saw
  (`DspNode.readout()`, `NodeDefinition.indicator`). The engine reports them in `EngineStatus.readouts[trackId][nodeId]` (the master bus
  is `master`): `Instrument.readouts()` and `FxGraph.readouts()` collect them from the compiled stages (`stageReadouts`), `PlayableTrack.readouts()`
  merges a track's patch and insert graph, and tracks with none are left out. Global and shared indicators report every block; one in a
  voice reports only while a voice sounds (the latest sounding voice wins), so it is **absent, not stale**, when nothing plays: the face shows
  a dash, a dark LED, an empty bar. Reading changes nothing (unlike `peaks`). The UI shows the same `IndicatorFace` (`ui/shared/indicators/`) on the
  card (in the picture area; `nodeHeight` reserves it) and on the front panel (`PanelKind` led / display / bar, so they are arranged, sized
  and hidden like controls); inside a module's own editor there is no track to read from, so the faces stay idle (a module used in a track reports as
  `<use>/<inner>`, which is also the id of its stand-in on that track's panel). Values reach the UI at the status rate (about 30 a second).
* **Example modules** (`patch/example-modules.ts`; the picker's last category, *Examples*). Modules that ship with the app: *Overtone oscillator*
  (eight sine partials at 1x to 8x the pitch, level 1/k, one level knob each) and *Drawbar organ* (nine drawbars at the footages 16', 5 1/3', 8',
  4', 2 2/3', 2', 1 3/5', 1 1/3', 1', registered 16' / 5 1/3' / 8'), both built by one `additive` builder from a list of partials: a pitch
  input that fans out to a `multiply` (the ratio), a sine oscillator and a level `gain` per partial, summed in an output gain. Ids are plain
  (`base`, `ratio0`, `sine0`, `level0`, ..., `sum`; wires `<module>-w<n>`) so the definition is the same every time. Choosing one calls
  `addExampleModuleUse`, which **copies the definition into the project's library the first time** (project data stays self-contained) and
  adds a use, as one undo step; later uses share the library's copy, even after it was edited. Examples are offered in sound graphs only, and
  not for a dropped wire. Their spectra are tested by rendering them (a Goertzel filter at each partial).
* **Randomize and mutate** (`patch/randomize.ts`, `ui/patcher/RandomizeBar.tsx`). `randomizeParams(patch, modules, { seed, amount })` is pure and
  seeded (`createRng`): `amount` 1 (the default) picks each setting anywhere in its range, a smaller one moves it by up to that part of its range,
  both **in the way a knob feels it** (`toSlider` / `fromSlider`, moved down to core as `dsp/param-scale.ts`, so a frequency is spread over octaves,
  not hertz) and on its step, rounded to six significant digits. A choice changes with the chance `amount`. Left alone: a node with `locked`
  (`PatchNode.locked?: true`, `setNodeLocked`, a checkbox in the property editor), a setting a wire drives, a range wider than 50000 (a math
  operand is a free number, not a knob), and on control nodes everything but the value (and a selector's value stays among its positions);
  switches and indicators are not rolled. It returns the same patch when nothing changes (amount 0). The toolbar has *Randomize*, *Mutate*
  (a touch / some / a lot) and a seed (0 to 9999): the seed shown is the one the next press uses, then it moves on and the one just used
  stays beside it as "last N", so a result can be got back by typing its number. One press is one undo step; it works on the graph on show
  (the sound patch, the insert graph, the notes, the inside of a module).
* **The control inside its card.** A control, XY pad, switch or selector card holds its **working widget** (`ui/panel/ControlWidget.tsx`, the very
  component the front panel uses; `controlKindFor(node, panelKind)` says which: a knob, or a slider as the node's `display` says) where other cards
  show a picture, with its value under it and its own label left out (the title says it; `data-hide-labels`). It writes the node's value with the
  same undo keys as the panel and the property editor (`param:<scope>:<node>:<param>`, `xy:<scope>:<node>:` for a pad), so a drag is one step
  wherever it was made and the three always show the same number. The card is only dragged by its header, so turning a widget never moves it; pressing one
  still selects the card. `nodeHeight` reserves `LIVE_WIDGET_HEIGHT` (knob 84, pad 140, switch and selector 44), which is what keeps the sockets where
  the wires are drawn.
* **Names.** `PatchNode.name?` (trimmed, at most 60 characters, absent when blank; `setNodeName`, same patch when unchanged;
  read by the sanitizer). Nothing shows it yet. It is not sound: renaming sends no engine command.
* **Words** (`dsp/node-docs.ts`, `notefx/node-docs.ts`, `dsp/document.ts`). Every node has a one-sentence `description`, a `category`
  (*Sources, Controls, Modulation, Math, Logic, Analysis, Filters, Effects, Routing*, and Indicators after Controls; the note graph uses only Sources, Effects and Routing;
  modules are `Modules`) and optional `keywords` for search, and every port and
  parameter a `description`. They are written once in one table per registry and attached by the registry (`documented`), not
  scattered over the node files; **a test fails when a registered node, port or parameter has no entry, or an entry names
  something that is gone** (so adding a node means adding its words). A parameter socket takes its parameter's description and
  carries `PortSpec.range` (min, max, default, unit) so a knob can be made from it. `NodeShape` carries description, category and
  keywords for modules and note nodes too.
* **Tooltips** (`ui/shared/tooltip/`). Anything with a `data-tooltip` attribute gets the app's one tooltip (`TooltipLayer`, mounted
  in `Workspace`): the text is one string, a row per line (`tooltip-text.ts`: what it is, then `Range 20 Hz to 20000 Hz · default
  2000 Hz · logarithmic` or the options of an enum, then, if a wire is involved, `Driven by Control: the wire replaces this value.`
  or how to wire a socket). It shows after the pointer rests 350 ms, at once on keyboard focus, hides on leaving, pressing,
  scrolling and Escape, links its target with `aria-describedby` while shown, ignores touch, and is placed by a pure function
  (`tooltip-position.ts`: under the target, above if there is no room, kept inside the window). A control's range shown is its
  live one (`liveSpec`). Used on cards (node title, ports, sockets, parameter rows) and on the Add button.
  Browser check: `docs/browser-checks/tooltips.mjs`.
* **Adding nodes** (`ui/patcher/node-catalog.ts`, `quick-add-model.ts`, `QuickAdd.tsx`, `placement.ts`). The toolbar's row of one button per
  node is gone. **Double-click** empty canvas, **Shift+A** with the pointer over it (not while typing in a field), or the toolbar's **Add**
  button opens one popup: a text field, focused, and a list. Empty, the list is the **categories** with their counts (Enter or a click
  drills in, Backspace on the empty field goes back up); typing, at any level, ranks **every** node: label equal, label prefix,
  the start of a word of the label, label contains, the letters in order ("mdhz" finds MIDI to Hz), then category, keywords
  and description; several words must all be found; ties go to the shorter label, then to the catalog order. Up / Down / Enter /
  Escape, hover and click all work; a row shows the label, its category and the description. A press outside closes it. What it
  offers is what the graph allows (`paletteFor` in `GraphEditor`: no note nodes in an insert graph, the ends of an insert graph
  by kind of track, no *Send* in the master ...) plus the modules that may be placed here (`placeable`), under *Modules*; the
  note graph has its own three categories. The new node is selected, and adding is one undo step. **Where it goes:** a
  double-click or Shift+A puts it centred on the pointer, the Add button in the middle of what is on screen; `freeSpot` nudges
  it down and right until it does not sit on another card, so a row of adds fans out. The logic is a pure model (`catalog` +
  `step(state, action)`), tested without a DOM; the component forwards events (a `combobox` that owns a `listbox`, with
  `aria-activedescendant`, rows carry `data-label`). A double-click is detected from two presses on empty canvas (450 ms, 8 px:
  `PointerEvent.detail` is 0), and the second press puts back the selection the first one cleared and draws no box; the canvas
  surface now fills the whole scroller, so empty parts far from the nodes count as canvas. Browser check:
  `docs/browser-checks/quickadd.mjs`. The Notes tab's preview aside is 30% (at most 440 px) so the canvas keeps room next to the property editor.
* **Cards** (`ui/patcher/NodeView.tsx`). A card is a **title, its sockets and, where it helps, a picture** (below), or, for a control, its working widget (above): no sliders, fields, pickers or switches otherwise (the
  height is the header plus the port rows, plus the picture's area, `nodeHeight`). It shows the node's title (`nodeTitles`: its name, else its label numbered when
  alike) and only state that matters at a glance: `shared`, `L R`, `module`, bypassed (dimmed), and the module's *Edit* / *Unlink*. A
  parameter socket is drawn only when it is wired, or for all of them while the **Sockets** toggle (a checkbox in the toolbar,
  remembered like the Graph | Panel switch) is on (`ui/patcher/visible-shape.ts`; `portPosition` indexes the visible shape). A press
  anywhere on a card but a port or button selects it. The patcher's grid is one column that may be narrower than its content, so the
  canvas scrolls and the property editor keeps its width.
* **Controls inside modules** (`core/patch/module-controls.ts`, `ModuleControl`). Two ways in, both from the plan. **Exposed inputs:** any inner
  socket, `param:` ones included, can be ticked in the module's interface (its row says *socket*); it becomes an input of kind `control` on
  the use, the parent wires a control or a signal into it, and flattening turns that into a wire into the inner node's socket (nothing
  new in the engine). **Internal controls on the parent's panel:** every control node directly inside a module that is not hidden
  (`panel.show` is not false) is offered on the panel of the graph that uses the module, under the module's name ("Voice core: Cutoff"), with
  **its value stored per use**: the use's `params` hold `<inner node>:<param>` (`controlParamKey`, the same key scheme as a module knob;
  `value` for a control, `x` and `y` for a pad, `on` for a switch), and until a use is turned the module's own value is the default (and
  follows the definition when it is edited). `describeNode` lists those values as the use's parameters (the control's live range, curve
  and unit, named after the control; one already exposed as a knob keeps the knob), so the property editor, persistence and module knobs
  needed no new path: `flattenPatch` (`withKnobs`) lays the use's values over the inner control, so a turn reaches the engine as the
  ordinary `setParam` on `<use>/<inner>`. `panelItems` returns, after the graph's own controls, a stand-in per module control (id
  `<use>/<inner>`, `via: { use, inner }`, `title: "Module: control"`) in the module's own board order; the board writes to the use, and
  the control is moved, sized, hidden and renamed **inside the module** (the parent's edit mode says so). A use stores only the values
  somebody turned (the sanitizer reads a use's parameters that are present, not a full set), and `pruneModuleUses` drops a stored
  value whose control was hidden or deleted. Not offered: controls of a module nested inside the used one (open that module). Browser
  check: `docs/browser-checks/modulecontrols.mjs`.
* **Controls in a note graph** (`NodeDefinition.inNotes`, `core/patch/bake.ts`). Control and math nodes may sit in a note graph, and note nodes
  have parameter sockets for their numeric parameters (descriptions and ranges from the note node docs), so a knob, a switch or *Add* can
  drive *Transpose*'s semitones or an arpeggio's octaves. They work in either kind of graph, so they do not decide which kind a module is
  (`moduleDomain`; the sanitizer lets them into both). The note engine knows nothing of them: `engineNoteGraph(patch, modules)` is what
  every consumer of a note graph (`diffProject`, `heardNotes`, the `track/add` command) gets: modules expanded, then each note node's
  parameters replaced by what its sockets carry (`resolveParams`: nothing in a note graph moves, so it is always a constant), and the
  control nodes and their wires left out. So turning a knob is only a changed parameter in a `track/setNoteGraph` (the running graph
  keeps its state: no restart, no all-notes-off, tested), and wiring a control in or moving it does not change the note wiring at all. The
  Sockets toggle, *Create knob*, the property editor and the panel work in the Notes tab like anywhere else; its picker offers the
  Controls and Math categories besides the note nodes. Browser check: `docs/browser-checks/notecontrols.mjs`.
* **Dropping a wire on empty canvas** opens the same picker, limited to what can take it (`wire-drop.ts` `targetInput`: the first input that
  accepts what the wire carries, preferring a node's own inputs to parameter sockets; stereo, notes and sound only meet their own kind), headed
  "Can take <node> <port>"; picking one adds the node at the drop (to the right of the pointer, `freeSpot` finding the room), wires it in
  and selects it, in one undo step. A module use is offered when one of its ports takes the wire.
* **Node pictures** (`ui/patcher/previews/`, `core/patch/resolve.ts`). A card shows a small SVG of what the node does with its settings, drawn from
  the numbers it is *working with*: `resolveParams(patch, nodeId)` takes the stored parameters and replaces each one that a wire drives by
  what the wire carries, worked out through controls, switches, XY pads and math nodes on them by running the **real DSP nodes for one
  frame** (so the picture cannot disagree with the engine, including a control's own clamp and step and the parameter's own range). Anything
  that moves (an LFO, a note, an oscillator into a socket) cannot be a constant: the stored value is kept and the parameter is listed as
  `moving`, which the card marks with a **~**. The pictures are pure geometry in a fixed 152 x 36 box (`nodePreview(type, values) ->
  shapes`: polylines, areas, rects, dots, tested for the numbers they must show and for staying inside the box with absurd values):
  *Oscillator* its wave, with cycles following pitch and detune (one at 20 Hz up to eight); *Filter* the response (the same RBJ biquad as
  the node, 20 Hz to 20 kHz on a log axis, -36 to +18 dB, a dim 0 dB line); *Envelope* the ADSR (times on a square-root scale so 10 ms and
  2 s are both visible); *LFO* its shape at its rate and as tall as its depth; *Gain* a bar with a tick at unity, *Pan* a dot, *Width* two
  dots; *Delay* / *Ping-pong* the echoes (a time apart, each the feedback quieter, the first at the mix); *Reverb* / *Stereo reverb* the
  decay tail. `hasPreview(type)` says who has one; the card is `PREVIEW_AREA_HEIGHT` taller for it and `nodeHeight` takes that into
  account (wire ends, the marquee and `freeSpot` all use it). The audio-rate effect of a modulation input (an LFO into `cutoff`) is not
  drawn: that would need telemetry from the engine. Browser check: `docs/browser-checks/previews.mjs`.
* **Property editor** (`ui/patcher/PropertyEditor.tsx`, `ParamRow.tsx`, `NumberField.tsx`, `TextField.tsx`, `property-rows.ts`). A docked
  aside (`role=complementary`, "Properties") beside the canvas in the graph view of every graph, for the **selected** node: nothing
  selected, a hint; several, the count. For one: its kind and **Name** (an empty field hints the default title; applied on Enter or
  leaving the field, since a name is trimmed and a keystroke edit would eat a trailing space; Escape reverts), the **Stereo** and
  **Bypass** switches where the node has them, the sample or track picker, for a control **Unit** and **Display** (an XY pad: **X
  unit** and **Y unit**), then **one row per parameter**: label, a number field, a slider, the unit, reset, and a choice for an enum.
  A row says what it is in its tooltip; the **number field** keeps half-typed text as typed, applies every complete number as it is
  typed and holds it inside the parameter's range (`clampToSpec`; leaving the field shows the stored value); the slider only where
  one is usable (`showsSlider`: not the wide bounds of a control's own range); **reset** goes to the spec's default, or for a control
  to its own `default`. A parameter with a wire into its socket is greyed with **Driven by <name>** and an **Unwire** button; an
  unwired one with a socket has **Knob** and **Slider** buttons (`Create knob for <label>`). Edits use the same `edit` and merge key as
  the cards' sliders did (`param:<scope>:<node>:<param>`), so a drag, or typing a number, is one undo step; switches and pickers are
  single steps. Parameter specs are the node's own (`resolveSpec`): a control's range, step, **curve** and **unit** are its settings
  (`liveSpec` for the first three, `PatchNode.unit` / `unitY` for the unit), and `param-scale` honours `ParamSpec.curve` (a control's
  linear / log / exp; `exp` is the same bend as *Map range*), falling back to "log for wide positive ranges" without one.
* **Create knob / slider** (`createControlFor` in `core/patch/control-for.ts`, pure and tested). Right-click a parameter socket that has no
  wire (`ui/shared/menu` `ContextMenu` around the port): **Create knob**, **Create slider**; the editor's row buttons do the same. It
  adds a *Control* to the left of the node (`freeSpot` finds the room) named after the parameter (`name`), with the parameter's
  **range, step, unit and default**, a **log curve** for a wide positive range (else linear), `display: 'slider'` for a slider, holding
  the parameter's **current value**, and wires it into the socket, in one edit (one undo step), then selects it. The sound does not
  change (the control holds what the parameter had). It refuses an enum, a parameter without a socket, and one that already has a wire
  (a second would add to the first; the menu leaves it out). A wired socket's menu has **Disconnect** (every wire into it); an
  ordinary input has a menu only when wired; note-graph nodes have no sockets, so nothing to create from there.
* **Control fields** (`PatchNode.unit`, `unitY`, `display`; `NodeDefinition.panelKind` is `value` / `xy` / `switch` / `selector`). `unit` is text (at
  most 16 characters, blank = none; `setNodeUnit`), `display` is `knob` (stored as nothing), `slider` or `slider-horizontal`
  (`setNodeDisplay`); the sanitizer keeps a unit only on a control with a value to show (not a switch), `unitY` only on a pad, and
  `display` only on a *Control*. A control has no separate label: its **name** is its caption on the panel. Optional fields, no
  format-version bump. A MIDI-note control shows numbers, not note names, for now (`format: 'midiNote'` is a spec property that a
  control does not have).
* **Files.** All optional with safe defaults, no format-version bump: old files have no control nodes, no names and no socket
  wires and load identically (a test pins it); a wire to a socket that does not exist, to an enum, or that would make a loop is
  dropped with the usual "invalid connection" warning.
* **Browser checks:** `docs/browser-checks/properties.mjs` (the editor, the menu, create knob) and `docs/browser-checks/controls.mjs` (a Control wired into Gain's socket silences and restores the real bass,
  the Sockets toggle, undo, reload).
