# Graphs and nodes

Voices, the keyboard's wheel, pressure and CCs, the modulation and effects nodes, modules (reusable sub-patches), the
note graph and tempo-synced delay timing.

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

## The keyboard's wheel, pressure and CCs

An instrument track's patch hears what the keyboard does besides notes ([midi](midi.md#pitch-bend-pressure-and-cc)).

* **The pitch wheel bends every voice** by the track's bend range (±2 semitones by default): `Voice` sets
  `NoteState.frequency` from the pitch and the wheel every block, so whatever follows the note's frequency bends with
  it (oscillators, the sampler, key tracking, the comb), with no change to the patch.
* **The Note node** has *Pressure* (0 to 1) and *Bend* (−1 to 1) after *Freq*, *Gate* and *Vel*; ports are saved by id,
  so old patches are unchanged. To use the wheel for something else than pitch, set the track's bend range to 0 and
  wire *Bend*. Outside a voice (shared, global and insert stages) they are 0, like the note.
* **MIDI CC** (`dsp/nodes/midi-cc.node.ts`, *Sources*, global): *CC* (0 to 119, default 1, shown with its common
  name, `format: 'midiCC'`, no socket) and one output, *Value*, the track's value of that CC from 0 to 1, from
  `ProcessContext.expression`; 0 outside an instrument's patch. Being global it reads the same in every voice. An
  output fed only by it still sounds only while a note does, since the Output node runs per voice.
* These values change once per block; a patch that steps audibly (a filter swept by a 7-bit CC) puts a *Smooth* node
  after them.

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
* **Filter key tracking** (*Key track*, 0 to 1, default 0): the cutoff follows the voice's note, `cutoff × (note / middle C) ^ keyTrack`, so at 1 an
  octave up is an octave brighter and *Cutoff* is where it sits at middle C. It reads `ProcessContext.note.frequency`, so it works in a voice; in
  a shared, global or insert stage there is no note (frequency 0) and nothing moves. Coefficients are redesigned only when the ratio changes.
* **Comb** (`dsp/nodes/comb.node.ts`, Filters, per voice): a feedback comb whose delay is one period of a pitch, so it rings at that pitch and its
  harmonics: a short noise burst through it is a plucked string (Karplus-Strong), a drum a metallic ring. *Tune to* `note` rings at the voice's
  note shifted by *Pitch* semitones; `fixed`, or where there is no note, at *Freq* (20 Hz–8 kHz). *Feedback* −0.995..0.995 (negative rings an
  octave lower with odd harmonics only), *Damp* is a one-pole lowpass inside the loop, *Mix*. Fractional delay by linear interpolation; the
  line is long enough for 20 Hz. Unnormalised: high feedback can get loud.
* **Delays in beats** (`dsp/nodes/time-sync.ts`): *Delay* and *Ping-pong* have *Sync* (`off` / `beat`). On `beat`, *Time* is in beats of the
  tempo the block is played at (0.75 is a dotted eighth), turned into seconds every block and capped at the 2 s line, so the echoes follow a
  change of tempo; the card's picture draws it at 120 BPM. *Time* shows no fixed unit for that reason (like the LFO's *Rate*). Both examples'
  echo returns use it (0.75 beats, and a *Time* knob from an eighth of a beat to two beats in steps of an eighth of a beat).
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
  Changes go through the same undo history; slider drags merge into one step. Nodes, the empty canvas and the module
  bar have menus (see "Actions and context menus"): nodes copy, cut, duplicate and paste with their wires, within one
  kind of graph. The open sub-patch is kept per graph in the graph-view store, so *Open module* works from a menu.
* **Limits.** Selected nodes are not dragged together. The personal library now copies full instrument/effect module
  closures between local projects (slice 5 below); standalone module-only catalog items are not exposed. Cycle detection on the outer patch treats a
  module as one node (any input may reach any output), which can refuse a wiring that would in fact be fine.

## The note graph (MIDI effects)

Each instrument track has a **note graph** between its clips and its instrument: nodes wired together, in which notes
can be transformed, split, merged, and mixed with the notes of other tracks. It is a graph, not a chain, because
splitting a stream, treating the branches differently and joining them again is exactly what people want to do.

```
clip + live notes ─┬─ transpose ─┐
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
  *Clip notes* (this track's merged clip/live input, retaining its saved node type and label), *Track notes* (another track: take its clip
  notes, or what leaves its own graph), *To instrument* (the sink), *Scale lock*, *Transpose*, *Chord*, *Velocity*,
  *Arpeggiator*, *Echo*, and *Range split* (notes inside / outside a pitch and velocity range go to two outputs; a
  note-off follows its note-on even if the range is edited while it sounds). A graph with no *To instrument* is silent.
* **Evaluation** (`NoteGraph`). Each beat range `[from, to)` runs the graph in dependency order. A node's processor
  turns the events of the range into output events, with state across ranges (an arpeggio's note-off, an echo's repeat),
  and may emit events for a later range. Everything is in beats, so it follows tempo and stays sample-accurate. The result
  is the same however time is cut into ranges (tested). An output may feed several inputs (a split, nothing special needed)
  and an input may have several sources (a merge).
* **Merging** (`Merger`). Engine notes carry runtime identities independent of pitch: a namespaced source, channel,
  root per-press/clip-occurrence ID and flat descendant-path tokens. Merges count duplicate routes of one identity;
  different owners, including equal-pitch/equal-beat notes, remain separate voices. Effect outputs qualify the route,
  mappings remember each identity's original output pitches, and arpeggio/echo children get deterministic identities.
  The voice pool replaces a slot's ownership when stealing, so a delayed old release cannot release its replacement.
  Pure legacy callers without identities retain pitch-counting behavior; engine and heard-note preview always use IDs.
* **No hanging notes.** Knob changes keep running state. Topology, bypass and tap changes restart the graph; the engine
  clears held/sustained/generated notes on that track and every transitive note reader. Instrument/voice rebuilds and
  track removal/replacement use the same cleanup. Unrelated tracks keep their notes. Clip all-off is scoped to its clip
  source, preserving live owners. Source release/disconnect cancels only that source/channel everywhere, including
  scheduled children. Stop resets graphs and keys while release/effect tails keep rendering. A node on a cycle never runs.
* **Between tracks.** Each block, every track writes what its clip player produced and what left its graph on a shared
  `TapBoard`; *Track notes* nodes read it. The engine runs a track after the tracks it reads from (`runOrder`, rebuilt
  when tracks or graphs change; a loop between tracks degrades to reading nothing). The editor only offers tracks that
  would not make a loop (`tappableTracks`), persistence drops references to missing tracks, to itself, and to loops, and
  removing a track clears the inputs that read from it, also inside modules. The source track keeps sounding as normal.
* **Modules of notes.** The same modules as for sound: grouping nodes gives a module whose ports inherit their kind
  (`notes`), and `moduleDomain` says which kind of patch it belongs to, so the Notes tab only offers note modules and the
  Instrument tab only sound ones. A module cannot mix the two (persistence enforces it).
* **Engine** (`TrackRuntime`). `schedule` merges live input with launcher events before the `NoteGraph`; with just
  clip notes wired to the instrument the graph passes events through. `track/setNoteGraph` carries the flattened graph;
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

## Delay timing and tempo transitions

`dsp/nodes/delay-timing` owns a shared pure resolver and fixed division table. Existing `time` (0.001–2) and `sync`
(off/beat, 0/1) retain their bounds/defaults and normalized automation meanings. Optional `division=0` means legacy
numeric beats; 1–24 enumerate 1/32 through four bars, each straight/dotted/triplet (quarter note = one beat, 4/4).
Dotted multiplies by 3/2, triplet by 2/3. Sync off ignores division and preserves stored seconds. Example echoes select
index 8 (dotted eighth), keeping their original `time=0.75` bases and original-tempo sound.

Delay/Ping-pong allocate eight seconds/channel once (at 48 kHz, 1,536,008 bytes mono, 3,072,016 bytes stereo/Ping-pong;
at 44.1 kHz, 1,411,208 and 2,822,416). Live audio follows the browser/device native context rate;
per-channel bytes are `4 * (ceil(8 * sampleRate) + 2)`, so at 192 kHz stereo costs 12,288,016 bytes.
No BPM-driven line allocations or resizes occur.
Project tempo is 40–240 BPM: four dotted bars request 36–6 seconds. The resolver explicitly returns requested/applied
seconds and a cap flag. Requests above eight seconds use eight; node properties visibly report the limit. Four-bar
straight/dotted/triplet times fit at ≥120/180/80 BPM respectively. No global delay-count/memory cap is introduced.

`DelayTap` crossfades two stationary, linearly interpolated read heads over 20 ms, applying initial timing immediately.
The same blended signal enters feedback; Ping-pong advances its shared crossfade once per stereo sample. Tempo comes
from `ProcessContext`, so the normal tempo command never replaces graphs or lines. Changes during a fade coalesce
until its end, then take the newest target (≤40 ms settling). Old samples remain in the rings. Transitions can overlap,
attenuate or repeat historical echoes while the taps mix, without a pitch glide or abrupt tap jump. Off/seconds mode
is tempo-independent. Transport Stop preserves effect tails through the existing engine lifecycle.

Properties resolve wired/per-use/Read/override values and display current BPM and applied timing; moving wires retain
a labelled static approximation. Delay pictures share the resolver and follow project BPM, omitting echoes beyond the
existing two-second picture instead of drawing a false earlier tap. Offline `Bounce` detects delay nodes in graphs and
modules and renders its explicit maxTail budget before trimming: 250 ms silence cannot establish an empty long delay,
particularly a serial chain. Existing default/max tail budgets remain 10/30 seconds; delay projects may cost more offline
CPU than the earlier silence shortcut. Other documents retain that shortcut.

Project **v8** adds optional numeric node `division`. The explicit v7→v8 migration strips formerly unknown divisions
and corresponding guarded target records across tracks/modules/saved revisions/automation/presets before sanitizing.
Committed v7/v8 delay fixtures supplement v1–v7 compatibility fixtures. `sanitizeParams` retains an absent division
instead of inserting zero into older graphs: strict `.sfxlib` v1 records still validate field-for-field, while newly
created nodes carry the default. At slice 7, bundle manifest and catalog remained independently v1, with regression coverage
for legacy and new division assets through staging/insertion/project reload. Existing control ranges and lane values
need no remapping. Browser tests cover timing/limit/undo/reload and full stereo worklet output versus offline at the
actual stamped tempo-edit boundaries; existing finite capture checks and 0.00002 amplitude tolerance remain.
