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
| `instrument` | compiles a `Patch` into a polyphonic synth (voice pool + shared effects) or a track's insert graph (`FxGraph`) | `Instrument`, `FxGraph`, `classifyStages` |
| `project` | the saveable document: tracks (instrument, audio, return), the master bus, clips, notes, tempo, name; pure note/clip edit operations | `Project`, edit functions, `moveNotes`, `resizeNotesEnd`, `setClipLength`, … |
| `transport` | sample-accurate beat clock | `Transport` |
| `session` | clip launching: a shared quantized `LaunchQueue`, the MIDI `ClipLauncher` (note events) and `AudioClipLauncher` (start/stop events) | `ClipLauncher`, `AudioClipLauncher` |
| `engine` | **the facade**: `apply(command)` + `render(left, right)` + `status()` (also the channel strips: fader, pan, mute/solo, meters) | `Engine`, `EngineCommand`, `EngineStatus` |
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
* **A patch is split into stages** (`instrument/stages.ts`; a third, *global*, is described under "Control nodes" below). *Voice* nodes are instantiated once per voice;
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
  *Sync* `beat` reads *Rate* in cycles per beat of the project's tempo (1 is once a beat, 0.25 once a bar) instead of hertz, so the LFO keeps
  time when the tempo changes (see "Tempo in the DSP"); the card's picture, which only knows hertz, shows a rough number of cycles then.
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
  tick any inner port or parameter to show it on the module, and name it. The node picker lists the project's modules under *Modules*.
  Changes go through the same undo history; slider drags merge into one step.
* **Limits.** Selected nodes are not dragged together. There is no module library outside the project yet, so
  sharing between projects means copying the file (see `docs/TASKS.md`). Cycle detection on the outer patch treats a
  module as one node (any input may reach any output), which can refuse a wiring that would in fact be fine.

## The note graph (MIDI effects)

Each instrument track has a **note graph** between its clips and its instrument: nodes wired together, in which notes
can be transformed, split, merged, and mixed with the notes of other tracks. It is a graph, not a chain, because
splitting a stream, treating the branches differently and joining them again is exactly what people want to do.

```
clip notes ─┬─ transpose ─┐
            └─ arpeggiator ┴─ to instrument          (notes from another track can join anywhere)
```

It cannot be nodes of the sound patch: voices are allocated before a patch runs, and a patch only ever sees one
voice's frequency and gate, while an arpeggiator or chord needs all the notes together.

* **Same machinery as the sound patch** (`core/patch`). A note graph is a `Patch` (`InstrumentTrack.noteGraph`) whose
  nodes come from the note registry instead of the DSP registry. Ports have a **kind**, `signal` or `notes`; `canConnect`
  only joins ports of the same kind, so sound cannot be wired into notes. `describeNode` answers for both kinds of node.
  Selecting, wiring, grouping into modules, editing modules in place and persistence are shared; one `GraphEditor`
  component edits either (the Instrument tab shows the sound patch, the **Notes** tab the note graph).
* **Nodes** (`core/notefx`, one registry, `NoteNodeDefinition { role, inputs, outputs, params, create() }`):
  *Clip notes* (this track's clip player, the only source of its own notes), *Track notes* (another track: take its clip
  notes, or what leaves its own graph), *To instrument* (the sink), *Scale lock*, *Transpose*, *Chord*, *Velocity*,
  *Arpeggiator*, *Echo*, and *Range split* (notes inside / outside a pitch and velocity range go to two outputs; a
  note-off follows its note-on even if the range is edited while it sounds). A graph with no *To instrument* is silent.
* **Evaluation** (`NoteGraph`). Each beat range `[from, to)` runs the graph in dependency order. A node's processor
  turns the events of the range into output events, with state across ranges (an arpeggio's note-off, an echo's repeat),
  and may emit events for a later range. Everything is in beats, so it follows tempo and stays sample-accurate. The result
  is the same however time is cut into ranges (tested). An output may feed several inputs (a split, nothing special needed)
  and an input may have several sources (a merge).
* **Merging** (`Merger`). The instrument matches note-offs by pitch, so two overlapping notes of one pitch would cut each
  other short. A merge counts overlapping notes per pitch: a note-on for a pitch already sounding re-triggers it unless it
  starts at the very same beat (then it is the same note arriving twice, e.g. a branch that changes nothing), and a
  note-off is passed on only when the last overlapping note of that pitch ends.
* **No hanging notes.** Knob changes keep running state (turning Gate never restarts an arpeggio). Adding, removing or
  rewiring nodes restarts the graph and emits an all-notes-off first. An all-notes-off from the clip player cancels pending
  arpeggio and echo notes. Stopping the transport resets the graph. A node on a cycle never runs.
* **Between tracks.** Each block, every track writes what its clip player produced and what left its graph on a shared
  `TapBoard`; *Track notes* nodes read it. The engine runs a track after the tracks it reads from (`runOrder`, rebuilt
  when tracks or graphs change; a loop between tracks degrades to reading nothing). The editor only offers tracks that
  would not make a loop (`tappableTracks`), persistence drops references to missing tracks, to itself, and to loops, and
  removing a track clears the inputs that read from it, also inside modules. The source track keeps sounding as normal.
* **Modules of notes.** The same modules as for sound: grouping nodes gives a module whose ports inherit their kind
  (`notes`), and `moduleDomain` says which kind of patch it belongs to, so the Notes tab only offers note modules and the
  Instrument tab only sound ones. A module cannot mix the two (persistence enforces it).
* **Engine** (`TrackRuntime`). `schedule(from, to, board)` runs the launcher's events through the `NoteGraph`; with just
  clip notes wired to the instrument the graph hands back the same array. `track/setNoteGraph` carries the flattened graph;
  `diffProject` sends it only when behaviour changed (moving nodes or renaming a module sends nothing).
* **Preview** (`engine/heard-notes.ts`). `heardNotes(clip, graph, modules)` runs the real clip player and graph over two
  loops and returns the second, so the Notes tab's piano roll cannot disagree with what plays. It shows this track's own
  clip through its graph; notes taken from other tracks are not part of it (the tab says so).
* **UI.** Nodes have a bypass switch and *Track notes* a track picker (both in the property editor), note wires are drawn in the accent colour, and a
  track with processing nodes gets an **fx N** badge that opens the Notes tab. New nodes go where the picker was
  opened (see "Adding nodes" under Control nodes).
* **Limits.** Auditioning a note in the piano roll skips the graph. Nodes cannot yet be moved together. An event that falls
  exactly on a 128-sample block edge can land one sample early or late depending on where blocks start (float rounding in
  the transport clock); in the worklet blocks are always aligned, so only odd render sizes in tests show it. Files from the
  short-lived linear chain version (`noteEffects`) are not migrated; they load with the default graph.

## Effects on tracks (the insert graph)

Every track, instrument or audio, has an **insert graph** (`Track.fx`, a `Patch`) between its own sound and its fader:
`Track in -> effects -> Track out`. A fresh track has just the two ends wired together, which passes the sound through
bit for bit. It is the same machinery as everything else: effect nodes (filter, delay, reverb, LFO, gain) and modules
work in it unchanged (a module whose ports are `signal` goes anywhere sound goes), and one `GraphEditor` edits it in the
**Effects** tab (`PatchTarget { trackId, graph: 'fx' }`; the other graphs are `'patch'` and `'notes'`).

* **Nodes.** `trackIn` (a source that copies the track's own signal, read from `ProcessContext.input`) and `trackOut`
  (a sink). `NodeDefinition.sink` marks every node whose input is audible (`output`, `trackOut`), and
  `NodeDefinition.insertOnly` keeps the two ends out of the Instrument tab's picker. The Effects picker leaves out
  `note`, `output` and `sampler`, which need a note. A stray one in the wrong graph is harmless: it is silent.
* **Runtime** (`FxGraph`, `core/instrument`). Compiles the whole patch with `compileStage` (one copy of every node, no
  voices) and `process(input, frames)` returns what reaches the sinks. It runs every block, also when the track is idle,
  so reverb and delay tails ring on after the sound stops. `TrackRuntime` runs it on `instrument.render()`;
  `AudioTrackRuntime` renders its clip into a scratch buffer first (the 5 ms declick tail is unchanged) and runs it on
  that. The fader comes after the graph.
* **Commands and diff.** `track/add` carries `fx`; a change of wiring sends `track/setFx` (the graph restarts, and so
  do its tails); a knob or sample change sends the ordinary `track/setParam` / `track/setSample`, which the track applies
  to its patch and its insert graph alike (node ids are unique across a track's graphs), so turning a knob never cuts a
  tail. `diffPatch` in `sync/diff-project.ts` is one function for both slots.
* **Files.** A missing `fx` loads as the default graph (silently), a stored one goes through `sanitizePatch` in the sound
  domain, so a note node or an unknown node in it is dropped with a warning. No format-version bump was needed.
* **UI.** The **Effects** tab sits beside Instrument and Notes and works for every track. A track header shows **fx N**
  (sound effects, opens the Effects tab) and **notes N** (note-graph processing, opens the Notes tab).

## Stereo

Instruments and samples are mono; stereo starts in the insert graph, so a pan, a wide reverb or a ping-pong delay can
sit on any track. It reuses the typed-port machinery the note graph introduced.

* **Port kind `stereo`**, beside `signal` and `notes`. A `signal` output may feed a `stereo` input (it is heard in both
  channels); a `stereo` output never feeds a `signal` input, the way back is the explicit *Mono sum* node. Modules inherit
  the kind of their ports like for notes, so a module that ends in a stereo node has a stereo port, and if an inner node is
  switched to or from stereo the wires that stop fitting are pruned (`pruneModuleUses`).
* **Buffers** (`dsp/stereo.ts`). A stereo port is one `Float32Array(256)` laid out planar, left then right (`buffer[i]`,
  `buffer[RIGHT + i]`), so allocation, seeding and summing work unchanged. `compileStage` allocates stereo buffers for
  stereo ports and, for a stereo input with several sources or a mono source, sums into a buffer of its own (a mono
  source is added to both channels). Nodes that make or read stereo index with `RIGHT`; `leftOf`/`rightOf` are views for
  compile time and tests (they allocate, so per-block code does not call them).
* **Every effect without rewriting it.** `PatchNode.stereo` (like `bypassed`): on a node that opts in with
  `NodeDefinition.stereoCapable` (filter, gain, delay) the compiler creates two processors with the same parameters, each
  on one channel of the node's stereo ports, so `describeNode` reports those ports as `stereo`. A port marked `control`
  (`cv`, filter `cutoff`) stays one mono signal that both channels follow, so one LFO moves both. The property editor has a
  **Stereo** switch (the card shows an **L R** tag); `setNodeStereo` flips it and removes the wires that no longer fit.
* **New nodes** (all `insertOnly`, so the instrument picker leaves them out): *Pan* (mono to stereo, constant-power law,
  -3 dB in each channel at the centre), *Width* (mid/side; 0 mono, 1 unchanged, 2 wider), *Stereo reverb* (Freeverb with the
  right tank's delays 23 samples longer, sharing `ReverbTank` with the mono reverb, so a mono source comes out with
  different channels yet a sum that is a clean reverb), *Ping-pong delay* and *Mono sum*.
* **Engine.** `Track out` is a stereo sink and `FxGraph.process` returns a stereo buffer (a mono signal reaching it is
  duplicated, bit for bit, so untouched tracks sound as before); `mixInto` adds the two channels separately. The master
  soft clip and the peak meter were already per channel.
* **Files.** `stereo` is kept only on nodes that can run in stereo, and the wires are rebuilt through `connect`, so a stereo
  output wired into a mono input in a hand-edited file is dropped with a warning. `diffProject` counts the switch as wiring
  (the graph is rebuilt), a knob is still a `setParam`.
* **Decision for later.** A return track starts from a stereo source (its sends are stereo), so it will have its own
  `Return in` node rather than reuse the mono `Track in`; then mono effects on a return need the L R switch, as expected.

## Return tracks and sends

A **return track** (`ReturnTrack`, `kind: 'return'`) has no clips: it is a volume and an insert graph that starts at
**Return in**, the sum of what other tracks have sent to it, and ends at Track out. One reverb or delay can serve many
tracks; a return track *is* the bus, so there are no bus names.

* **One primitive.** "Add this much of this signal to return track X" is `SendSink.add` (`dsp/types.ts`), implemented by the
  engine's `AudioBoard` (`engine/audio-board.ts`): one stereo buffer per return track, cleared before every stretch the
  engine mixes (`mixSegment`, so it follows the segments a block is split into), added to by senders, read by the return as its
  input. The **Send** node uses it from anywhere in an insert graph (its `trackId` is the return, `amount` the level, its
  input is stereo so a mono signal is accepted; where it sits is where the signal is taken, before or after other effects).
  The per-track send knobs use the same call, post-fader.
* **Return in is stereo**, so mono effects on a return need the **L R** switch (or use *Stereo reverb*, *Ping-pong delay*,
  *Width*); `Track in` stays mono for instrument and audio tracks. The editor offers `Track in` on every track but returns
  and `Return in` only on returns.
* **Order** (`Engine.runOrder`). A track runs after the tracks it takes notes from, and a return after every track that sends
  to it (`PlayableTrack.sendTargets()`, read from the flattened insert graph). Mixing now follows that order too. A loop
  between returns degrades to the plain order (the later one reads a buffer that is not complete); the editor and files
  prevent it. Sending to a missing return does nothing.
* **Rules** are the same as for notes taken from other tracks. `sendableReturns` offers each Send the other returns that do
  not send back to its track (any track may send to any return; a return may send to a later one); `repairTrackReferences`
  (`persistence/sanitize-track-references.ts`, shared with notes) drops a Send to a missing track, to its own track, to a track
  that is not a return, or that would close a loop; `removeTrack` clears the `trackId` of Sends everywhere (also inside
  modules), and undo restores track and sends together.
* **Commands.** `track/add` has a `return` variant (`fx`, `volume`); a return's effects and volume use the same
  `track/setFx` / `setParam` / `setVolume` as other tracks. Re-pointing a Send changes the graph's structure (its `trackId`
  counts, so it is `track/setFx`); turning its Amount is a `setParam`.
* **UI.** The `+` menu adds a **Return track**; returns are drawn after the clip tracks with a dashed header, hatched empty
  slots and no stop button. The Instrument and Notes tabs say a return has neither; the Effects tab edits its graph. The
  Send node has a picker of return tracks in the property editor (`NodeShape.usesTrack` says which kind of track a node picks: `notes` or `return`).

### Send knobs

`InstrumentTrack.sends` and `AudioTrack.sends` (`SendLevels`: return track id -> 0..1, an absent id means nothing) are the
header knobs, one per existing return track. They are the same primitive as the Send node (`AudioBoard.add`), taken
**post-fader**: the engine adds the track's output times `level * volume` to the return, so turning the track down turns
its sends down, while a Send node (anywhere in the insert graph, so usually pre-fader) is not affected by the fader. The two
add together on the same return. A track's send targets for ordering are its Send nodes and its knobs.

* `setTrackSend` clamps, removes the entry at 0, ignores return tracks as senders and targets that are not returns, and
  returns the same project when nothing changes. `removeTrack` drops the entries for the removed return (undo restores
  them with the track). Dragging a knob merges into one undo step (`send:<track>:<return>`).
* `track/setSends` carries the whole record; `track/add` carries it too. Persistence reads numbers clamped to 0..1
  (`readSends`), and `repairSendLevels` drops entries for tracks that are not return tracks of the file, with a warning.
* The knobs live in the **Mixer** tab (they used to be in the session-view headers, which were too cramped): one per
  return track, labelled with the return's real name, only when return tracks exist and never on a return track; each says
  "post-fader" in its tooltip and is disabled when `mixesAfter` says it would make a loop. The model, the command and
  `setTrackSend` are unchanged.

## The master bus

`Project.master` (`MasterBus { fx: Patch }`) is an insert graph on the final mix: `Master in -> effects -> Track out`, in
stereo, with the same graph editor, modules and persistence as every other graph (`PatchTarget { master: true }`). Nothing
sends to it; it just processes what the tracks and returns have summed.

* **Engine.** `Engine.render` runs the master `FxGraph` on each block of the mix after the tracks are mixed (`processMaster`)
  and before the sample preview (an audition is not part of the mix) and the output soft clip, so a limiter or glue reverb
  sits where it should. It runs every block, so tails ring on after the tracks stop. The engine starts with a pass-through
  graph; `master/setFx` replaces it (restarting its tails), `master/setParam` and `master/setSample` are the knob and picker
  changes. `diffProject` sends `master/setFx` when a project is loaded, then only what changed, by the same function that
  diffs track graphs (`diffPatch('master', ...)`).
* **Nodes.** `Master in` is the same stereo source as `Return in` (one implementation, two names). The master's picker
  has `Master in`, not `Track in`, `Return in` or `Send` (the returns are mixed before the master, so there is nothing to
  send to).
* **Project.** The default graph comes with every new project, files without one load with it silently, and a stored one
  goes through `sanitizePatch`. Modules, `moduleUsage` ("Master" is listed as a user), `removeSample` and `removeTrack`
  treat it like any track's graph.
* **UI.** A **Master** strip ends the session grid (select it to open its graph in the Effects tab; the tab then edits
  `GraphEditor owner="master"`); `useSelectionStore.master` says it is selected. The Mixer tab ends with a master strip too.
* **Master volume.** `MasterBus.volume` (0..1, absent = 1) is a gain applied in `processMaster` right after the master
  graph and before the soft clip, so it scales the final mix exactly. The sample preview skips it, like it skips the graph
  (an audition is not part of the mix). `master/setVolume`; `diffProject` sends it on load and on change. There is still no
  limiter: the soft clip is the only one.

## Mixer

The **Mixer** tab (`ui/mixer/`, `EditorTab 'mixer'`) is a row of vertical channel strips: every track in `sessionOrder`
(clip tracks, then returns), then the master. A strip has the track's name (select), an fx badge (opens the Effects tab),
pan, one send knob per return, **M**ute, **S**olo, the fader and a level meter. The session grid keeps its header volume
slider (the same `track.volume`) and gains no other control; its header only strikes through the name of a muted track.

* **Model.** `TrackBase` gets optional `pan` (-1..1), `muted` and `soloed`, and `MasterBus` an optional `volume`. They are
  saved only when they differ from the default (centre, false, false, 1): `setTrackPan` & co. delete the key when the value
  returns to the default, and the sanitizer writes none for a default, so old files load identically and the format version
  did not change. Edits clamp and return the same project when nothing changes (no empty undo step). Pan drags merge into one
  undo step (`pan:<track>`), so do master-fader drags (`master-volume`); mute and solo are single steps.
* **Channel strip** (`engine/channel-strip.ts`). Every `PlayableTrack` has a `strip` holding fader, pan, mute, solo, the
  engine-decided `audible` flag, the send gate and the peak. A runtime runs its insert graph and writes its taps as before,
  then hands the stereo signal to `strip.mixInto`, which scales each channel by `volume` and the pan gains and adds them to the
  buses. **Pan law**: the same cos/sin curve as the *Pan* node, times sqrt(2), so the **centre passes at unity** (the *Pan*
  node itself puts a mono source at -3 dB in each channel; a track's default pan must leave old projects sounding the same,
  so the strip is normalised and pan 0 is exactly 1/1). Hard left or right is +3 dB in one channel, and the power of a mono
  source stays constant along the way. Pan is after the insert graph, next to the fader; **sends stay post-fader and are not
  panned** (they carry the stereo signal to the return as before).
* **Mute** silences the track everywhere it is heard: its output *and* its sends (both the knobs and the Send nodes in its
  graph, through a per-track `SendGate`). Its insert graph keeps running, so tails ring on, and its taps are still written,
  so Track audio nodes that read it keep working. Only what it adds to the output is silenced.
* **Solo** is "solo in place". When any track is soloed, a track is heard only if it is soloed, or it is a **return fed by a
  heard track** (so a soloed track keeps its reverb, however many returns deep: `Engine.updateMixState` grows the set until
  nothing changes). A muted return stays muted. Rules, in full:
  * no solo anywhere: heard = not muted;
  * a **soloed return** is heard, and tracks that send to it keep sending to it even though they are not heard themselves
    (solo a reverb to hear only the wet signal);
  * a track that is both muted and soloed is heard (solo wins);
  * a send from track T to return R is open when T is soloed, or T is not muted and (T is heard or R is soloed).
  The flags are worked out when a mute, solo, track, send or graph changes (`mixStateStale`), never per sample; the result is
  each strip's `audible` and its set of blocked send targets.
* **Commands.** `track/setPan`, `track/setMute`, `track/setSolo`, `master/setVolume`, small and separate like
  `track/setVolume`; `track/add` carries the three track fields too (so a project loaded with a muted track starts muted).
  `diffTrack` compares the fields with their defaults, so a field that appears or disappears is a command only if the value
  changed.
* **Meters.** `EngineStatus.peaks` is a record track id -> the loudest sample the track *added to the output* since the
  previous status, after fader, pan, mute and solo (zero for a track that is not heard), read-and-reset like `peak`. The
  master strip shows `peak`. The bars are drawn by `LevelBar` from the status store (~30 Hz): the engine reports raw peaks and
  the bar falls with a fixed factor per update, on a dB scale (the raw value is in `data-peak`).
* **Fader law.** The stored volume is linear 0..1, as before; the control is linear too (no dB taper yet).
* **Files.** `sanitizeTrack` reads `pan` (finite, clamped), `muted` and `soloed` (only a real `true` counts) and the
  master's `volume` (clamped, anything else is 1).

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
* **Writing a value.** A knob or slider writes the node's `value` with `setNodeParam` through the editor's own `edit`, with the **same merge
  key as the property editor's slider** (`param:<scope>:<node>:value`), so one drag is one undo step and a drag in either place merges
  alike; a pad sets `x` and `y` in **one** edit (`xy:<scope>:<node>`); a switch writes `on` (a *momentary* switch is 1 only while held).
  What the control does is then whatever is wired from the node: a control's value is **real** (in its own range), and the sound follows
  through the parameter sockets (`ARCHITECTURE`, "Control nodes"). A panel edit alone makes **no engine command** (tested through
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
* **Limits.** Layout is an ordered flow with sizes, not free positioning; a panel belongs to one graph (no combined instrument +
  effects panel, and the controls inside a module are not yet shown on the panel of the graph that uses it: step 7); no selector for
  enum parameters yet; no automation, MIDI mapping, meters or per-control ranges beyond a control's own (see `docs/TASKS.md`).

## Control nodes, parameter sockets and the global stage

A knob is a node you wire, and any numeric parameter can be driven by a wire. (Built so far: the engine, the model and the
plain cards; the property editor, the panel built from control nodes and the node pictures follow, see
`docs/HANDOFF-control-nodes.md`.)

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

## Track audio (taking another track's sound)

The **Track audio** node is the audio mirror of *Track notes*: a stereo source in an insert graph that plays another track's
sound, `Take` before or after that track's own effects (both before its fader, so a track turned all the way down can still
be used). It makes parallel chains possible (process a copy of a drum loop differently on another track) and modulation
(through *Mono sum* into a Gain's CV the other track scales this one). An envelope follower for sidechain-style ducking is
not built yet; it would be one more node reading the same source.

* **Engine** (`engine/audio-taps.ts`). Each track writes its sound before and after its insert graph to `AudioTaps`, one stereo
  buffer each, only for tracks someone reads; Track audio nodes read it through `ProcessContext.taps`. Like the sends board
  it is cleared before every stretch the engine mixes (`mixSegment`), which is why the master graph, which runs on the whole
  block, has no Track audio node. A return track can be taken too (its `before` is its input, its `after` its output).
* **Two orders.** Notes are passed on before any sound is mixed, so the engine keeps two orders: the schedule order (a track after
  the tracks it takes notes from) and the mix order (a return after the tracks that send to it, a track after the tracks it
  takes audio from). A notes loop and a sound dependency in opposite directions are therefore not a loop.
* **Rules** (`project/mix-order.ts`). `mixDependencies(track)` = the tracks it takes audio from, plus for a return the tracks that
  send to it (Send nodes and send knobs). `audioSourceTracks` offers each node every other track that is not mixed after its
  own, `sendableReturns` every return that is not mixed before the sender, and `setTrackSend` refuses a knob that would
  loop (the header disables it). `repairTrackReferences` applies the same test to files (a pointer to a missing track, to its
  own track or that closes a loop is dropped, one at a time, with a warning), and `repairSendLevels` to the knobs.
  `removeTrack` clears the inputs that took from the removed track, also inside modules.
* **UI.** The node has a track picker (`NodeShape.usesTrack: 'audio'`) and a Take choice.

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
  with a picker in the property editor), not a numeric param.
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
* **Add a sample-playing node:** set `usesSample: true` on its definition; the property editor shows the picker and the
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
`core/dsp/registry.ts` (add its words to `node-docs.ts` or the completeness test fails; every numeric parameter then has a socket automatically; `paramSockets: false` opts out, `global: true` lets it run in the global stage; an elementwise math node is a few lines with `mathNode`). Set `shared: true` if it is an effect whose state must outlive individual notes (reverb,
chorus, …). The picker, parameter UI, engine and file loader pick it up automatically.

**Add an engine capability** — add a variant to `EngineCommand`, handle it in `Engine.apply`, and (if it comes
from the document) produce it in `core/sync/diff-project.ts`. If it is a one-off UI action, expose it on
`EngineControls` (`state/engine-controls.tsx`) and implement it in `app/engine-controls.ts`.

**Add another kind of track** — extend the `Track` union, add its runtime implementing `PlayableTrack`, a `track/add`
variant and diff in `core/sync`, a sanitizer in `persistence`, and a slot variant in the session grid; `Engine` and the
launcher queue need no changes (the return track was added this way; TypeScript finds every `switch` on `kind`).

**Add a UI feature** — new folder under `ui/`, read state via `@state` hooks, mount it from `Workspace` or
`EditorPanel`.

**Add a field to the project** — add it to `project/types.ts`, give it a safe default in
`persistence/sanitize-*.ts`, and add a migration only if old files would otherwise load wrongly.

## Known POC limits (deliberate)

* One clip plays per track. Polyphony has simple voice stealing and no unison, glide or legato modes.
* Audio clips have no time-stretch (only re-pitch or original speed), no loop crossfade (a loop whose ends don't
  match will click unless you add fades) and no recording. Trim is non-destructive but there are no separate loop
  points inside the region. Audio clips are mono (they are duplicated to both channels, or panned in the insert graph).
* The piano roll assumes 4/4 for the ruler and its clipboard is not shared with the OS clipboard. Groove tools are
  destructive edits (undoable), not a reusable groove pool; swing and quantize use the toolbar grid, which has no
  triplet options yet.
* Samples are mono (stereo is mixed down), at most 120 s / 32 MB per file, (trimming is per clip, not per sample).
  Bytes stay in IndexedDB after a sample is removed from a project (so undo works); there is no cleanup yet.
  `decodeAudioData` resamples to 48 kHz, and the sample's reported rate is that decoded rate.
* Sample hashing needs a secure context (https or localhost).
* A node's stage is decided by its type (`shared`) and wiring; there is no per-node override.
* Oscillators are naive (alias at high pitches); no band-limiting or oversampling. The plain Reverb is mono (use *Stereo reverb* in an insert graph). Filter cutoff has a linear slider over 20 Hz–20 kHz.
* Launch quantisation is fixed at one bar; no recording or plugin hosting.
* History is per session (not saved) and does not cover selection or transport.
* One autosaved project per browser. Two tabs on the same site overwrite each other (last write wins).
  `localStorage` holds ~5 MB, plenty for projects, not for samples (see above).
* Targets desktop Chromium/Firefox. Safari/iOS quirks are untested.

## Natural next steps

1. Unused-sample cleanup, loop points inside a clip, 2. offline bounce using `Engine` directly,
3. MIDI input via Web MIDI (now worth having: playing chords), 4. more nodes (band-limited oscillators, chorus / stereo modulation effects, tempo sync for delays),
5. WASM DSP nodes (Faust/RNBO).
