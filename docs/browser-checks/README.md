# Browser checks

Reference scripts that drive the real app in Chromium with Playwright, including real audio through the AudioWorklet.
They are **not** part of `npm test` (see "Browser (end-to-end) tests in the repo" in `docs/TASKS.md`; these are the seed
for that). Every feature so far shipped with one, and each prints `PASS` / `FAIL` per check.

## Running one

```
npm run build
npx vite preview --port 4173 &                 # the scripts expect http://localhost:4173/
node docs/browser-checks/notegraph.mjs /some/dir   # the directory receives screenshots
```

The scripts load Playwright through `createRequire('/node-tools/node_modules/')` and launch
`/opt/pw-browsers/chromium` with `--no-sandbox --autoplay-policy=no-user-gesture-required`; those two paths are the cloud
sandbox's. Change them (or install `playwright`) elsewhere.

## What each covers

| Script | Covers |
| --- | --- |
| `audio.mjs` | audio tracks and clips: add from the library, tempo-locked playback, gain, warp, loop |
| `trim.mjs` | audio clip trim handles, fades, fit to tempo, undo, persistence |
| `samples.mjs` | sample library, import, sampler tracks, `.sfxlab` packages |
| `roll.mjs`, `polish.mjs` | piano roll: draw, move, resize, select, clipboard, velocity lane, grooves |
| `menu.mjs` | the context menu and double-click delete |
| `mod.mjs` | importing a project with LFO + reverb nodes, the node palette |
| `modules.mjs` | sound modules: group, edit in place, knobs, reuse on another track, unlink, undo, persistence |
| `fx.mjs` | the insert graph (Effects tab) on an audio track: default pass-through, a gain, a reverb tail that rings after the clip stops and survives a knob turn, persistence |
| `stereo.mjs` | stereo: per-channel level of the real output, pan, mono-into-stereo rules and the M / L R switch, stereo reverb, persistence |
| `returns.mjs` | return tracks and the Send node: the + menu, a return's effects, a send to it heard through a turned-down track, the tail after the clip stops, removing the return and undo, loop refusal, persistence |
| `sends.mjs` | send knobs (in the Mixer tab): shown only when returns exist, per return with its real name, none left in the headers, post-fader, one undo step per drag, removed with the return, persistence |
| `mixer.mjs` | the Mixer tab: a strip per track, return and master in order; fader, pan per output channel, mute (also stops the sends), solo (a soloed track keeps its return), master volume 0 / 1, per-track meters, undo, persistence |
| `master.mjs` | the Master strip: its graph on the final mix, a master gain silencing every track, a master reverb tail, undo, persistence |
| `trackaudio.mjs` | the Track audio node: another track's sound heard through a track turned all the way down, before/after Take, loop refusal (picker and send knob), removal and undo, persistence |
| `panel.mjs` | the front panel (the control nodes): the Graph / Panel switch, an empty panel, Edit mode adding knobs / an XY pad / a switch (each a control node wired into the parameter), a knob drag / keys / wheel / double-click, the same value in the property editor, one undo step per drag, real audio (the Gain knob silences and restores the bass), a pad that moves two values and undoes together, a switch, rename / resize / reorder / hide (tray, *Show on panel*) / remove, deleting a control node in the graph removes it from the board, separate panels for Instrument and Effects, persistence |
| `controls.mjs` | control nodes and parameter sockets: the new nodes in the palette, a Control card with its live-range slider, the Sockets toggle, a Control wired into Gain's socket silencing and restoring the real bass (the wire replaces the parameter's value), the driven slider disabled, unwiring, undo, persistence |
| `properties.mjs` | the property editor and compact cards: cards carry no slider, field or picker; selecting shows the rows of a node, several selected show a count; naming (hint, trim, undo); the number field (typed value, clamp, half-typed, Escape, one undo step), slider, reset, enum, Stereo switch; right-click a socket for Create knob / slider / Disconnect (the knob holds the same value, so the sound is the same; one undo step), the row buttons, Unwire; a control's unit, display and range; persistence |
| `modulecontrols.mjs` | controls inside modules: a control made inside a module is on the panel of the graph that uses it ("Module: control"), each use keeps its own value and the real sound follows, edit mode sends the tools to the module, the use's property editor, a second use at the module's value, a parameter socket exposed as a module input and wired from the parent, hiding the control inside removes it from every panel, persistence |
| `notecontrols.mjs` | note graphs with controls: a wire dropped on empty canvas opens a picker limited to what can take it and wires the new node in, Escape adds nothing, a note node's parameter socket gets a knob (a Control in the note graph), the control drives the heard notes (an octave copy at +12, merged again at 0, no hanging notes), the note graph's panel, math is offered, persistence |
| `previews.mjs` | the pictures on cards: which nodes have one, each moves with its settings (filter cutoff and mode, oscillator wave and pitch, envelope, gain, delay), a wire into a socket makes the picture follow the control, an LFO into a setting marks it moving (~), layout, persistence |
| `quickadd.mjs` | the node picker: Add, double-click and Shift+A open it, categories with counts, drilling in and back, ranked search (prefix, letters in order, keywords), keys and mouse, the node lands where asked and is selected, a row of adds fans out, the double-click keeps the selection and draws no box, a single click and a drag still work, what each graph offers, undo, persistence |
| `tooltips.mjs` | tooltips: palette buttons, parameter rows (range, unit, default, curve), enums, ports, node titles, sockets free and driven, a control's live range, Escape / press / pointer-leave hide, keyboard focus, `aria-describedby`, inside the window |
| `notegraph.mjs` | the note graph: split, merge, bypass, notes from another track (real audio), loop refusal, note modules, persistence |

**Listening checks (`stereo.mjs`, `mixer.mjs`) use `audio-tap.mjs`**, a tap that sees every sample of both output channels. Two rules keep them free of timing luck: compare the two channels inside one window (`diffPeak`, the largest |left - right|), and compare two windows only when each is `LOOP_WINDOW_MS` long and with a margin (a shorter window can fall on a quiet stretch; whole-loop passes still differ by a few percent and the master soft-clips, so test "about half", not "exactly half"). Do not read two `AnalyserNode`s one after the other (they show different slices of the sound) and do not compare a meter reading across two short windows. `listen` throws when nothing went through the tap, so a dead tap cannot pass a silence check.

## Conventions inside the scripts

* `check(label, ok, extra)` prints one line per assertion; scripts end with a "no page errors" check.
* State is reset with `localStorage.clear()` and `indexedDB.deleteDatabase('sfxlab')` before the first reload.
* `level(ms)` returns the peak of the output meter (`[data-peak]`) over a window: use it to assert sound and silence.
  After stopping a track wait about 9 s (release tails) before asserting silence.
* Nodes are added through the picker: every script that adds one has the same few lines, `addNode(label)` (Add, type the label, click the row `[role=option][data-label="<label>"]`) and `offers(label)` (does it list that node? closes it again), so only those change if the picker does.
* A node's **settings are in the property editor**: `selectNode(title)` (click its header) and then `slider(label)` / `valueField(label)` / the pickers and switches inside `properties()` (`role=complementary`, "Properties"). The selection is forgotten when the tab or the track changes, so select again after switching. A node's title is its name, or its type numbered when alike (`LFO 1`, `LFO 2`), so match titles with `^Label`.
* Nodes are found by their title; wires are made by mouse from `[data-testid="out-<node>-<port>"]` to
  `[data-testid="in-<node>-<port>"]` (see `wire()` in `notegraph.mjs`).
* Role-based locators with prefix-sharing names need `exact: true`.
* A new node lands in the first free slot **below** the patch, which in the default window is under the fold of the editor panel, and
  a wire drag needs both ends on screen: make the editor taller first (focus the `Resize editor` separator and press ArrowUp 40 times,
  as `controls.mjs` does).
