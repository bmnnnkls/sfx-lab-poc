# Architecture

## Layers

```
                 ┌────────┐
                 │  app   │  composition root: builds services, wires stores ⇄ engine ⇄ storage, renders <Workspace/>
                 └───┬────┘
      ┌──────────────┼───────────────┐
      ▼              ▼               ▼
  ┌──────┐      ┌─────────┐    ┌──────────────────────┐
  │  ui  │─────▶│  state  │    │  audio      storage  │   browser integration:
  └──┬───┘      └────┬────┘    │  (worklet)  (saving) │   AudioContext/worklet, localStorage/files
     │               │         └──────────┬───────────┘
     └───────────────┴────────┬───────────┘
                              ▼
                         ┌────────┐
                         │  core  │   pure TypeScript: no DOM, no React, no Web Audio. Runs in Node tests too.
                         └────────┘
```

Dependencies only point down. This is **enforced by `tests/architecture.test.ts`**, which also checks that
other `core` modules are reached only through their `index.ts` and that `core`/`audio` import no third-party
packages (`storage` may use only `fflate`). The test knows our five aliases (`@core`, `@audio`, …) apart from scoped
third-party packages such as `@radix-ui/…`, so those are checked against the same allow-lists. If you need to break a rule, change the rule on purpose, not by accident.

| Layer | Owns | May import |
|---|---|---|
| `core` | the document model, DSP, audio engine, scheduling, file format | itself only |
| `audio` | `AudioContext`, worklet shell, thread protocol, audio-file decoding | `@core` |
| `storage` | `localStorage`/IndexedDB adapters, autosaver, project files & packages, hashing | `@core` (+ `fflate`) |
| `state` | zustand stores, `EngineControls` / `ProjectFiles` interfaces | `@core` |
| `ui` | React components | `@core`, `@state` (+ `react`, `@radix-ui/react-context-menu`) |
| `app` | wiring | everything |

## `core` modules (deep modules, small public surface)

Each folder exposes one `index.ts`; everything else in it is private.

| Module | Responsibility | Public surface |
|---|---|---|
| `shared` | tiny math/id helpers | `clamp`, `midiToFrequency`, `createId` |
| `dsp` | node library: definitions (ports, params, factory) + processors | `nodeDefinitions`, `requireNodeDefinition`, types |
| `patch` | immutable node-graph model + pure edit operations | `Patch`, `addNode`, `connect`, `canConnect`, … |
| `instrument` | compiles a `Patch` into a polyphonic synth: voice pool + shared effects | `Instrument`, `classifyStages` |
| `project` | the saveable document: tracks, clips, notes, tempo, name; pure note/clip edit operations | `Project`, edit functions, `moveNotes`, `resizeNotesEnd`, `setClipLength`, … |
| `transport` | sample-accurate beat clock | `Transport` |
| `session` | clip launching: a shared quantized `LaunchQueue`, the MIDI `ClipLauncher` (note events) and `AudioClipLauncher` (start/stop events) | `ClipLauncher`, `AudioClipLauncher` |
| `engine` | **the facade**: `apply(command)` + `render(left, right)` + `status()` | `Engine`, `EngineCommand`, `EngineStatus` |
| `sync` | diffs two `Project`s into `EngineCommand`s | `diffProject` |
| `sample` | sample metadata/data types, engine-side `SampleBank`, mono mixdown, peaks, WAV encoder, demo samples | `SampleInfo`, `SampleData`, `SampleBank`, `createDemoSamples`, … |
| `persistence` | project file format: envelope, versioned migrations, sanitizing | `serializeProject`, `parseProject` |
| `history` | generic undo/redo over immutable snapshots | `createHistory`, `commit`, `undo`, `redo` |

### Data flow

```
 UI event ──▶ state (zustand project store, pure edits from core)
                 │ subscribe                                   │ subscribe
                 ▼                                             ▼
          app/project-sync ──diffProject──▶ AudioHost     app/autosave ──(500 ms debounce)──▶ ProjectStorage
                                              │ postMessage                                    (localStorage)
                                              ▼
                             AudioWorklet: Engine.apply(command) / Engine.render(L, R)
                                              │ status @ ~30 Hz
 UI ◀── state (status store) ◀── AudioHost.onStatus ◀┘
```

* **The project is the single source of truth** and lives on the main thread. The engine is a mirror kept
  in sync by commands; it never reads UI state.
* **Position-only and param-only edits are cheap.** `diffProject` ignores canvas positions and turns param
  changes into `track/setParam` so dragging nodes or sliders never rebuilds a voice.
* **Timing is sample-accurate.** The engine splits each 128-frame block at note-event boundaries; events
  come from beat ranges `[from, to)` that are contiguous across blocks, so each fires exactly once.
* **The `Engine` has no browser dependency**, so the same code is unit-tested in Node, and could render
  offline (bounce/export) without changes.

## Polyphony

* **Each track has a voice pool** (`Track.voices`, 1–16, default 8; set in the Instrument tab). A chord or
  overlapping notes play on separate voices; when all are busy the new note **steals** a voice: first one that is
  already releasing, otherwise the oldest.
* **A patch is split into two stages** (`instrument/stages.ts`). *Voice* nodes are instantiated once per voice;
  *shared* nodes (effects) are instantiated once and fed the **sum of all voices**. A node is shared if its
  `NodeDefinition.shared` is true (today: delay, reverb) **or anything upstream of it is shared**, which makes the split a
  clean cut: signals flow from voices into the shared stage, never back. The patcher tags shared nodes.
  Without this split, a delay would be copied into every voice and its echoes would be chopped off whenever a
  voice is reused.
* **Freeing voices:** `Voice` is done once it has been released and its output stayed below −80 dB for 50 ms
  (this works for any envelope shape), or after a 10 s safety cap (a patch with no envelope never goes quiet).
  Idle voices cost nothing: only active voices are rendered.
* **Files:** `compile.ts` builds one stage; `stages.ts` plans the split; `voice.ts` is one note's state and
  lifetime; `voice-pool.ts` allocates and steals; `instrument.ts` ties them together and sums the output.
* `voices` is saved in the project; older files without it load with the default and no warning (a new
  optional field with a safe default needs no format-version bump).
* Measured on the engine alone (Node, this container): 3 tracks / ~3 voices ≈ 2 % of the real-time budget, 8 tracks ×
  16 voices ≈ 25 %.

## Modulation and effects nodes

Every signal in a patch is an audio-rate buffer, so modulation needs no separate machinery: an LFO is a node whose
output you wire into another node's input.

* **LFO** (`dsp/nodes/lfo.node.ts`, per voice): shapes sine / triangle / saw / square / random (sample-and-hold, from
  a seeded generator so voices agree and tests are reproducible); *Rate* 0.05–30 Hz, *Depth*. Two outputs: `out` swings
  ±depth (vibrato, panning-style effects) and `uni` stays within 0..depth (tremolo, cutoff sweeps). The optional
  `gate` input restarts the cycle on a rising edge, so each note gets the same modulation; unconnected it free-runs.
  There is no tempo sync: nodes are not given the tempo (see limits).
* **Filter `cutoff` input** moves the cutoff exponentially: CV +1 raises it by *CV amt* octaves (param, default 2).
  While modulated, coefficients are redesigned every 16 samples. Unconnected, the filter is exactly as before.
* **Oscillator `pitch` input** bends pitch by *Pitch CV* semitones per unit (default 2), exponentially.
* **Gain** already took a `cv` input (that is how the envelope drives the VCA); an LFO into it is tremolo.
* **Reverb** (`dsp/nodes/reverb.node.ts`, **shared**): Freeverb: eight damped feedback combs in parallel, four allpasses
  in series, delay lengths scaled from 44.1 kHz to the engine's rate. Params *Size* (comb feedback 0.70–0.98, always
  stable), *Damp* (lowpass in the loop), *Predelay* (0–100 ms), *Mix* (0 is an exact pass-through). Mono. Being
  shared, the tail rings on after notes end and one reverb serves all voices. Tests cover tail growth with size,
  damping darkening the tail, boundedness with loud noise at maximum settings and no NaN.
* Added ports are appended and saved by id, so old files and patches load unchanged.

## Modules (reusable sub-patches)

A **module** is a saved sub-patch with chosen inputs, outputs and knobs. It is defined once in the project and
*used* any number of times; editing the definition changes every use. A use can be turned into an independent
copy (**Unlink**). Modules nest.

* **Model** (`core/patch`). `Project.modules: ModuleDefinition[]`, each `{ id, name, patch, inputs, outputs, knobs }`.
  A `ModulePort` maps an outside port to an inner node's port, a `ModuleKnob` an outside knob to an inner node's
  parameter (ids are `<inner node>:<port or param>`, so they stay stable when labels change). A use is a `PatchNode`
  with `type: 'module'` and `moduleId`; its `params` hold the knob settings. Old files have no `modules` and load with
  an empty library.
* **One question answered in one place.** What ports and parameters does this node have? is `describeNode(node,
  modules)`: built-in types come from the DSP registry, module uses from their definition. The connection rules
  (`canConnect`), wire geometry and node views all go through it, so a module node behaves like any other node.
* **The engine never sees modules.** `flattenPatch(patch, modules)` replaces each use by its contents, recursively,
  with inner node ids `<use id>/<inner id>`, and bakes in the use's knob values. `diffProject` flattens before
  diffing, so a knob turned on a module arrives as an ordinary `track/setParam` on an inner node, and editing a
  definition updates every track that uses it (only tracks whose flattened patch really changed get commands). The
  voice/shared stage split works unchanged: a module with a reverb inside makes what follows it shared. A test
  renders a patch and its grouped version and requires identical samples.
* **Grouping** (`groupIntoModule`). The connections that crossed the selection's edge become the module's ports, so
  the surrounding patch keeps working exactly as before; nothing is exposed as a knob until you choose to.
  `unlinkModuleUse` expands one use into plain nodes with fresh ids.
* **Consistency** (`project/module-edit.ts`, `reconcileModules`). Deleting an inner node or un-exposing a port prunes
  the ports, knobs, wires and knob values that referred to it, in every track and in other modules. A module that is
  in use cannot be deleted. A module cannot be placed inside itself or inside something it contains
  (`containsModule`); a malformed library that does so anyway is cut off after a bounded number of expansions.
* **Persistence** (`persistence/sanitize-modules.ts`). Modules are read before the tracks. Since a module may use
  another, each is built once the ones it uses are, whatever order the file lists them in; a module that contains
  itself is dropped with a warning. Ports and knobs pointing at nothing are dropped, uses of unknown modules are
  skipped. This is an optional field with a safe default, so the format version did not change.
* **UI** (`ui/patcher`). Shift-click a node header or drag a box on empty canvas to select; **Group into module**
  replaces the selection. A module node shows *Edit* and *Unlink*. *Edit* opens the module's inside in the same
  patcher (breadcrumb to go back out, nesting works), with a name field, where it is used, and **Ports & knobs**:
  tick any inner port or parameter to show it on the module, and name it. The palette lists the project's modules.
  Changes go through the same undo history; slider drags merge into one step.
* **Limits.** Selected nodes are not dragged together. There is no module library outside the project yet, so
  sharing between projects means copying the file (see `docs/TASKS.md`). Cycle detection on the outer patch treats a
  module as one node (any input may reach any output), which can refuse a wiring that would in fact be fine.

## MIDI effects (the note chain)

Each instrument track has an ordered chain of **MIDI effects** that rewrite its notes between the clip player
and the instrument. They cannot be nodes in the patcher: voices are allocated before a patch runs, and a patch only
ever sees one voice's frequency and gate, while an arpeggiator or chord needs all the notes together.

```
clip player → [effect] → [effect] → … → voices → patch → out
```

* **Model** (`core/notefx`). `InstrumentTrack.noteEffects: NoteEffect[]`, each `{ id, type, params, bypassed }`. A
  registry of `NoteEffectDefinition`s (label, parameter specs, `create()`) is the single list of what exists, like the
  DSP node registry. Old files load with empty chains.
* **Processors** work on beat ranges. `NoteProcessor.process(events, from, to)` turns the note events of the range
  `[from, to)` into output events, with the same contiguity rule as the clip launcher, so effects may keep state and
  may emit events that fall in a later range (an arpeggio's note-off, an echo's repeat). Everything is in beats, so it
  follows tempo and stays sample-accurate. Results are the same however time is cut into ranges (tested).
* **Effects**: *Scale lock* (7 scales, nearest note, ties go down), *Transpose*, *Chord* (8 types), *Velocity*
  (scale and offset), *Arpeggiator* (rate 1/4–1/32, up / down / up-down / as played / random, octaves, gate; the grid
  is anchored to the transport, a new chord restarts the pattern, a chord that starts on a step is heard on that
  step), *Echo* (repeats on the grid with decay). The one-note-in, notes-out ones share `MappingProcessor`, which
  remembers what each note became so the matching note-off ends exactly those notes even if a knob moved meanwhile.
* **No hanging notes.** Knob changes keep running state (turning Gate never restarts an arpeggio). Adding, removing,
  reordering or re-typing an effect restarts the chain and emits an all-notes-off first. An all-notes-off from the
  clip player cancels pending arpeggio and echo notes. Stopping the transport resets the chain.
* **Engine** (`TrackRuntime`). `schedule(from, to)` runs the launcher's events through the `NoteChain`; with nothing
  active the chain hands back the same array. Command `track/setNoteEffects` carries the whole chain (it is small);
  `track/add` includes it. `diffProject` emits it whenever the list changes.
* **Preview** (`engine/heard-notes.ts`). `heardNotes(clip, effects)` runs the real clip player and the real chain over
  two loops and returns the second, so what the **Notes** tab draws cannot disagree with what plays.
* **UI.** The **Notes** tab shows the selected instrument track's chain left to right (clip → effects → instrument),
  each effect a card with its parameters, bypass, move and remove, and an *Add effect* menu. Below it a piano roll
  shows the clip as written and as the instrument hears it. A track with effects gets an **fx N** badge on its header;
  clicking it opens the Notes tab. Persistence sanitizes unknown types, clamps parameters and repairs ids.
* **Limits.** Auditioning a note in the piano roll skips the chain. Effects are built in; they are not yet modules or
  patchable (`docs/TASKS.md`). An event that falls exactly on a 128-sample block edge can land one sample early or
  late depending on where blocks start (float rounding in the transport clock); in the worklet blocks are always
  aligned, so this only shows up when comparing odd render sizes in tests.

## Editing clips (piano roll)

* **Gestures are pure functions of the pointer.** `ui/clip-editor/note-gestures.ts` describes draw / move /
  resize-start / resize-end as `applyGesture(gesture, pointer, grid) -> notes`, computed from the notes *as they
  were when the drag began*, so results never drift and are unit-tested without a DOM. The note arithmetic itself
  (`moveNotes`, `resizeNotesEnd`, `trimNotesToLength`, …) lives in `core/project/note-edit.ts`.
* **One surface, one hook.** `PianoRoll` is a single pointer-driven element (grid lines are CSS gradients, not
  thousands of cells). `use-piano-roll-interaction.ts` owns the mouse and keyboard behaviour: click-drag on empty
  space draws a note as long as the drag; drag a note to move; drag its end handles to resize; Shift-click
  multi-selects and groups move/resize together (a group is stopped at the clip edges, never squashed);
  double-click or right-click deletes; Delete, arrows (Shift = octave), Ctrl+A, Ctrl+D, Esc work on the selection.
* **A gesture is one undo step.** While dragging, edits live in a local `draft` that is shown on screen and
  committed once on release. That keeps undo per-gesture and avoids sending a clip update to the engine on every
  mouse move. A double-click only deletes when the second click doesn't turn into a drag.
* **Notes have stable ids** (`Note.id`) so selection survives edits and undo, and so the clip launcher can tell
  which notes are sounding. Files from before this get fresh ids on load.
* **Clip length** is in beats (1–256), shown with bars. Lengthening keeps notes; shortening trims notes that no
  longer fit (undo restores them); **Double** doubles the length and repeats the notes into the new half. The length
  field applies on Enter/blur, never per keystroke, because typing "16" would otherwise pass through "1" and trim.
  Long clips get horizontal zoom (slider or Ctrl+wheel), a bar ruler and a sticky keyboard.
* **Editing a playing clip never leaves a note stuck.** The launcher remembers which notes it has started. When
  `syncClips` swaps in edited clip data it releases any sounding note that was deleted, moved, re-pitched or cut
  short, and lets one that merely got longer ring to its new end. Without this, deleting a held note would
  leave its voice sounding forever (its note-off is never generated).
* No-op edits return the same project object (`updateTrack`/`updateClip`), so they don't create empty undo steps.
* **Velocity lane** (`VelocityLane.tsx`, pure picking logic in `velocity-lane-logic.ts`): one bar per note under the
  roll. Press a bar and drag; if the note is selected the whole selection follows. Chords put several bars at one x,
  so the bar whose top is nearest the pointer wins. Same draft-then-commit pattern as the roll (one undo step).
* **Marquee select:** Ctrl/Cmd-drag on empty space draws a box (Shift adds to the selection); plain drag still draws a
  note. `notesInRegion` / `marqueeRegion` are pure.
* **Copy / cut / paste** (Ctrl+C/X/V, Ctrl+D duplicates): the clipboard (`note-clipboard.ts`) is in memory so notes can
  move between clips. Paste lands under the **mouse pointer** (not the last click, since clicking empty space draws a
  note), and repeated pastes with the mouse left alone follow on after each other. Pasted notes get fresh ids and
  anything past the clip end is dropped (`pasteNotes`).
* **Audition:** placing a note, grabbing one, dragging it to a new pitch, or nudging with the arrows plays it through
  the track's own instrument (`track/audition` -> `TrackRuntime.auditionNote`: a 0.3 s note on the track's voice pool,
  so you hear the real patch, even while stopped). Resize handles stay silent. Toggle in the toolbar.
* **Follow playhead** scrolls a long clip along with playback. `Playhead` owns its status subscription so the roll
  itself does not re-render 30x a second; the static parts (keys, ruler, pitch rows, notes) are memoised.
* **Remembered UI preferences:** grid, zoom, audition, follow, lane visibility and the editor panel height are kept in
  `localStorage` via `useStoredState` (guarded, validated, falls back to defaults). The editor panel is resizable with a
  draggable, keyboard-operable splitter (`ui/shared/Splitter.tsx`); its saved height is clamped to the window on use.

## Context menu (reusable)

* `ui/shared/context-menu` is a small, app-specific right-click menu. Callers pass `entries` (actions with a label,
  optional shortcut text, `disabled`, `danger`, and separators) and the single element to wrap; they never touch the
  library. It is a thin wrapper over **Radix UI's headless context menu** (the primitive shadcn/ui is built on), which
  supplies keyboard navigation, typeahead, focus return and keeping the menu inside the window. (Spartan, which was
  suggested, is Angular-only, so it can't be used in this React app.) Swapping the library means changing this one
  folder.
* **Entries reflect what was clicked.** The wrapped element's own `onContextMenu` runs *before* the menu opens, so it
  can first select the right-clicked note or record where the click landed (used as the paste position); entries are
  computed from state on every render.
* **Anything an entry depends on must be reactive.** The note clipboard used to be a plain module variable, so
  "Paste" stayed greyed out after copying until something else re-rendered. It is now a subscribable store read with
  `useSyncExternalStore` (`useNoteClipboard`). The same actions back both the keyboard shortcuts and the menu items
  (`commands` from `usePianoRollInteraction`), so they can't drift apart.
* Used by the piano roll (copy / cut / paste / duplicate / delete / select all / quantize / humanize) and by session
  clip slots (launch / edit / delete, and "create clip" on empty slots). Double-click still deletes a note; right-click
  opens the menu instead of deleting.

## Groove: quantize, swing, humanize

Pure functions in `core/project/groove.ts`, applied by the **Groove** dropdown (and `Q`, and the context menu) to the
selected notes, or the whole clip when nothing is selected, using the toolbar grid. Each Apply is one undo step, and
applying something that changes nothing adds no undo step (`setClipNotes` keeps project identity when notes are equal).

* **Quantize** moves starts (optionally ends) toward the grid by *strength* 0–100 %, so partial strength keeps some of
  the original feel. At 100 % it is idempotent. Notes are kept inside the clip.
* **Swing** snaps notes to the grid then delays every other slot: *amount* is where the second step of each pair lands
  (50 % straight, ~67 % triplet, 75 % hard shuffle). It is idempotent at every amount: a note is matched to the slot it
  is closest to *as currently placed, delayed or not*. (Re-rounding the raw position broke this at 75 %, where the
  off-beat sits exactly halfway between two slots.)
* **Humanize** adds random timing wobble (up to half a grid step at 100 %) and velocity wobble (up to a quarter of the
  range). The random source is injectable (`random`), so tests reproduce results; in the app each press is a new roll.
* Amounts are remembered (`sfxlab:groove`, validated on load). The panel stays open across Undo/Redo clicks so
  "try, undo, try again" works; it closes on Escape or a click elsewhere in the editor.

## Undo / redo

* `core/history` is a generic, pure `History<T>` (`past` / `present` / `future`). The project store holds a
  `History<Project>`; `project` is always `history.present`. Snapshots are immutable, so unchanged tracks, clips
  and patches are shared between entries and keeping 200 steps is cheap.
* **Every document edit is undoable**, including replacing the whole project (import / new / demo / restore).
  The startup load is not (`resetProject`), so a fresh session starts with an empty history. Selection, transport
  and the playhead are not part of history.
* **Drags are one step.** Continuous edits pass a merge key (`param:<track>:<node>:<param>`, `move:<track>:<node>`,
  `volume:<track>`, `tempo`, `name`); consecutive edits with the same key within 800 ms collapse into a single
  entry. Discrete actions (add node, connect, toggle note, add track…) pass no key, so each is its own step.
  An undo or redo always ends the merge, so the next edit starts a new step.
* **Nothing else needs to know.** Undo/redo just changes `project`, so `diffProject` updates the engine (param
  changes become `setParam`, structural ones rebuild the voice) and autosave stores the undone state. History
  itself is not saved: it is empty after a reload.
* UI: ↶ ↷ buttons in the transport bar and `Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z`, `Ctrl/⌘+Y` (ignored inside text fields,
  which keep the browser's own undo).
* **To make a new continuous control undoable as one step**, pass a stable merge key to its store action.

## Saving, loading, import/export

* **One format, one gate.** Autosave, export and import all use `core/persistence`. Files are
  `{ "format": "sfx-lab-project", "version": N, "project": … }`. `parseProject(text)` is the *only* way
  untrusted text becomes a `Project`: it checks the envelope, refuses newer versions with a clear message,
  runs `migrations.ts` (`MIGRATIONS[n]` upgrades v*n* → v*n+1*), then **sanitizes** by rebuilding patches through
  the normal edit functions (`addNode`/`connect`). So unknown nodes, bad ports, cycles, out-of-range params and
  oversize inputs are dropped or clamped and reported as warnings, instead of crashing the audio worklet.
  It never throws.
* **To change the saved shape:** bump `CURRENT_VERSION`, add a migration, and commit a new fixture beside
  `persistence/fixtures/v1-minimal.sfxlab.json` — the old fixture must keep loading.
* **Autosave:** `app/autosave.ts` subscribes to the project store; `storage/autosaver.ts` debounces (500 ms)
  and flushes on tab hide / `pagehide`. The header shows Saved / Saving… / Not saved.
* **Startup:** `app/services.ts` loads the saved project *before* the first render. Unreadable data is copied
  to `sfxlab:corrupt` (never silently overwritten) and the demo project is used, with a toast explaining why.
* **Replacing the project** (import / new / demo / restore) goes through one function in `app/project-files.ts`:
  it saves the outgoing project to a **one-slot backup**, stops the transport, resets selection, then swaps.
  *File → Restore previous* swaps back (and the slot then holds what you just left).
* If browser storage is unavailable (private mode), the app keeps working in memory and says so.
* Ids are random (`createId`), so ids from saved projects never collide with new ones.

## Samples

A **sampler node** plays a library sample, re-pitched from the note being played, so samples are playable
instruments that reuse everything else: MIDI clips, polyphony, envelopes, filters, effects.

* **Sampler node** (`dsp/nodes/sampler.node.ts`): inputs `freq` and `gate`; params *Mode* (`one-shot` plays through
  regardless of the gate, `hold` stops when the gate falls, `loop` repeats until it falls), *Root note* (plays at
  original speed), *Start*, *Tune*. It compensates for the sample's own sample rate, interpolates linearly, and
  fades out in 10 ms on release to avoid clicks. Its sample is a node-level reference (`PatchNode.sampleId`, chosen
  with a picker in the node), not a numeric param.
* **Three homes for one sample**, all keyed by the **SHA-256 of the original file** (so importing the same file
  twice is a no-op, and ids can't collide):
  1. **Project** — `Project.samples: SampleInfo[]` (name, duration, …) is the library. Saved, undoable, tiny.
  2. **Storage** — the original bytes in IndexedDB (`storage/sample-storage.ts`), written once at import.
     Autosave only ever writes the small project JSON.
  3. **Engine** — decoded **mono** float data in `SampleBank` (`core/sample`), delivered by a
     `sample/add` command whose buffer is *transferred* to the worklet, not copied.
* **Flow** (`app/sample-library.ts`): import/drop → hash → decode (`audio/decode-audio.ts`, via
  `OfflineAudioContext`, so no user gesture is needed) → store bytes → add to project → send to engine. On startup and
  whenever `project.samples` changes it loads any sample the engine lacks from storage. Removing a sample from
  the project clears the nodes that used it (undo restores both) but keeps the bytes, so undo and re-import work.
* **Missing audio is not fatal.** A sample listed in the project but absent from storage (cleared browser data,
  plain-JSON import on another machine) shows *audio missing*, plays silence, and is restored by importing the
  original file again (same hash).
* **Engine side:** a sampler node looks samples up at process time (`ProcessContext.samples`), so samples that
  arrive after the instrument was built, or are swapped (`track/setSample`), take effect without a rebuild.
  `sample/preview` auditions a sample straight to the master; `EngineStatus.peak` drives the output meter.
* **Project files with samples** (`storage/project-transfer.ts`): a project with no samples exports as plain
  `name.sfxlab.json`. With samples it exports as a zip, `name.sfxlab`: `project.json` (the same envelope as
  always) + `samples/<sha256>.<ext>` holding the **original bytes** (no re-encoding; WAV is deflated, compressed
  formats are stored). Import sniffs the first bytes (`PK` = zip), verifies **each sample against its hash** before
  trusting it, ignores unexpected entries, caps inflated entry size, then runs the usual `parseProject`.
  Missing/corrupt samples become warnings, not failures.
* **Persistence of the new fields:** `samples` and `sampleId` are optional with safe defaults (a reference to a
  sample not in the library is dropped with a warning), so no format-version bump was needed.
* **Add a sample-playing node:** set `usesSample: true` on its definition; the patcher shows the picker and the
  engine calls `setSample` on it.

## Audio clips

An **audio track** holds clips that play a library sample in the session grid: launched on the next bar, in time with
the transport, optionally looping. A track is now one of two kinds (as in Ableton): an **instrument track** (MIDI clips
through a patch, as before) or an **audio track**.

* **Model.** `Track` is a discriminated union (`kind: 'instrument' | 'audio'`; `isInstrumentTrack` / `isAudioTrack`).
  An `AudioClip` is `{ sampleId, lengthBeats, loop, warp, gain, start, end, fadeIn, fadeOut }`. Instrument-only edits (`setClipNotes`,
  `setTrackVoices`, …) leave audio tracks untouched. Removing a library sample removes the audio clips that used it
  (and clears sampler nodes); undo restores both. Files from before this have no `kind` and load as instrument tracks.
* **Tempo without time-stretching.** `warp: 'repitch'` (default) says the clip spans `lengthBeats` and speeds the
  sample up or down to fit at the current tempo, like Ableton's Re-Pitch mode, so it stays in time at the cost of
  pitch following speed (the editor says so: "×0.92 speed (−1.5 semitones) at 110 BPM"). `warp: 'off'` plays at
  original speed regardless of tempo. A sample's length in beats is guessed from a tempo in its file name
  ("… 98 BPM") or else the project tempo; **Fit to tempo** redoes that guess. Real time-stretch is not implemented.
* **Phase-locked, never accumulated.** In re-pitch mode the read position is *derived from the transport beat*
  (`repitchPosition`: `(beats since start mod length) / length × sample length`), not advanced sample by sample. So a
  loop cannot drift, and tempo changes mid-clip are seamless. This is covered by a test that changes tempo five times
  while playing and checks every block against the beat clock.
* **Trim and fades.** `start`/`end` are fractions (0..1) of the sample that the clip plays (minimum region 0.2 %);
  `lengthBeats` spans the *region*, so trimming a 4-beat loop to its back half and fitting gives 2 beats. Re-pitch
  position is `start + phase × (end − start)`, still derived from the beat clock; looping wraps within the region
  (interpolating back to the region start, so there is no read past the end). `fadeIn`/`fadeOut` are seconds of
  sample time at the region edges (default 2 ms, max 2 s, each capped at half the region). To avoid clicks when a clip
  is stopped, replaced or edited out, the engine does not cut it: the old voice becomes a 5 ms **tail** that fades
  out while the new one starts. Old files load with the whole sample and no fades. In the editor, handles drag with
  pointer capture (one undo step per drag via a merge key), excluded parts are dimmed, and the beat grid and playhead
  are laid over the region only.
* **One launch state machine for both kinds.** `LaunchQueue` (queued launch/stop applied at the next bar boundary,
  clip edits swapped in by id) is shared by `ClipLauncher` (adds note events and held-note tracking) and
  `AudioClipLauncher` (just `start` / `stop` at a beat). The 12 original MIDI-launcher tests passed unchanged through
  the extraction.
* **Engine.** Both runtimes implement `PlayableTrack` (launch, status, `schedule(from, to)`, `mixInto`). `schedule`
  returns actions pinned to a beat; the engine runs each at its exact sample, so an audio clip starts on the bar
  line to the sample (tested). `mixInto` receives a `MixTiming` (beat at the segment start, beats per sample), which
  is how audio stays on the grid. What *sounds* is reported by the player, not the queue, so a finished one-shot stops
  showing as playing. Commands: `track/add` has a `kind`; audio clips travel as `track/setAudioClips`.
* **UI.** The session `+` is a menu (instrument or audio track); an empty audio slot's `+` lists the library samples;
  audio slots show a mini waveform and share the context menu. `AudioClipEditor` shows the waveform across the clip's
  length with the beat grid over it (kicks on beats 1 and 3 line up visibly), a playhead, and controls for sample,
  warp, loop, length, fit and gain. The Samples tab has *New audio track*. Instrument-tab content for an audio track
  explains it has no instrument. A 120 BPM demo drum loop ships in **Add demo samples**.
* **Menus.** `ui/shared/menu` now holds `ContextMenu` (right-click) and `PopupMenu` (click on a trigger), both over
  Radix with one shared entry renderer and stylesheet, so they look and behave identically.

## Conventions

* Files are `kebab-case.ts`; React components are `PascalCase.tsx` with a `PascalCase.module.css` beside them.
* Processors are `<name>.node.ts` and export one `NodeDefinition`.
* One concept per file; prefer many small files over a large one. Tests sit next to the code (`*.test.ts`).
* Core data is immutable; edits are pure functions returning new values (`patch/edit.ts`, `project/edit.ts`).
* Cross-layer imports use bare aliases (`@core`, `@state`, …), never deep paths (`@core/patch/edit`).
* Commands and status are plain serialisable data so they can cross the worklet boundary.

## Common changes

**Add a DSP node** — create `core/dsp/nodes/<name>.node.ts` exporting a `NodeDefinition`, add it to
`core/dsp/registry.ts`. Set `shared: true` if it is an effect whose state must outlive individual notes (reverb,
chorus, …). The patcher palette, parameter UI, engine and file loader pick it up automatically.

**Add an engine capability** — add a variant to `EngineCommand`, handle it in `Engine.apply`, and (if it comes
from the document) produce it in `core/sync/diff-project.ts`. If it is a one-off UI action, expose it on
`EngineControls` (`state/engine-controls.tsx`) and implement it in `app/engine-controls.ts`.

**Add another kind of track** — extend the `Track` union, add its runtime implementing `PlayableTrack`, a `track/add`
variant and diff in `core/sync`, a sanitizer in `persistence`, and a slot variant in the session grid; `Engine` and the
launcher queue need no changes.

**Add a UI feature** — new folder under `ui/`, read state via `@state` hooks, mount it from `Workspace` or
`EditorPanel`.

**Add a field to the project** — add it to `project/types.ts`, give it a safe default in
`persistence/sanitize-*.ts`, and add a migration only if old files would otherwise load wrongly.

## Known POC limits (deliberate)

* One clip plays per track. Polyphony has simple voice stealing and no unison, glide or legato modes.
* Audio clips have no time-stretch (only re-pitch or original speed), no loop crossfade (a loop whose ends don't
  match will click unless you add fades) and no recording. Trim is non-destructive but there are no separate loop
  points inside the region. Audio is mono.
* The piano roll assumes 4/4 for the ruler and its clipboard is not shared with the OS clipboard. Groove tools are
  destructive edits (undoable), not a reusable groove pool; swing and quantize use the toolbar grid, which has no
  triplet options yet.
* Samples are mono (stereo is mixed down), at most 120 s / 32 MB per file, (trimming is per clip, not per sample).
  Bytes stay in IndexedDB after a sample is removed from a project (so undo works); there is no cleanup yet.
  `decodeAudioData` resamples to 48 kHz, and the sample's reported rate is that decoded rate.
* Sample hashing needs a secure context (https or localhost).
* A node's stage is decided by its type (`shared`) and wiring; there is no per-node override.
* Oscillators are naive (alias at high pitches); no band-limiting or oversampling. The LFO cannot sync to the tempo
  (`ProcessContext` carries none) and the reverb is mono. Filter cutoff has a linear slider over 20 Hz–20 kHz.
* Launch quantisation is fixed at one bar; no recording or plugin hosting.
* History is per session (not saved) and does not cover selection or transport.
* One autosaved project per browser. Two tabs on the same site overwrite each other (last write wins).
  `localStorage` holds ~5 MB, plenty for projects, not for samples (see above).
* Targets desktop Chromium/Firefox. Safari/iOS quirks are untested.

## Natural next steps

1. Unused-sample cleanup, loop points inside a clip, 2. offline bounce using `Engine` directly,
3. MIDI input via Web MIDI (now worth having: playing chords), 4. more nodes (band-limited oscillators, tempo-synced LFO, stereo reverb),
5. WASM DSP nodes (Faust/RNBO).
