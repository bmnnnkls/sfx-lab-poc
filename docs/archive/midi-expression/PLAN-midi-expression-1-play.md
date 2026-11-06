---
status: done
date: 2026-11-06
shipped_in: architecture/midi.md
note: "Part 1 of the pitch bend, aftertouch and CC spec, done: the wheel, pressure and unmapped CCs played live, the bend range, the Note node's Pressure and Bend, the MIDI CC node. Not checked with a real keyboard (backlog V5)."
---
# Pitch bend, aftertouch and CC, part 1: playing them live

Status: **done** 2026-11-06 on `imp/spec-midi-expression`, not merged. Signed off 2026-11-06, every decision as
proposed. Shipped in [midi](../../architecture/midi.md#pitch-bend-pressure-and-cc) and
[graphs and nodes](../../architecture/graphs-and-nodes.md#the-keyboards-wheel-pressure-and-ccs); not checked with a
real keyboard ([BACKLOG](../../BACKLOG.md) V5). Written 2026-11-06 on `feat/midi-recording` at `9d6df92`. Carries out part 1 of
the signed-off [pitch bend, aftertouch and CC spec](SPEC-midi-expression.md) (§ Parts). The spec's decisions are
settled and not repeated here; this plan adds only the ones it raises (§ Decisions to sign off). Where it differs from
the spec, it says so.

## Goal

After this part a keyboard's wheel, pressure and knobs reach the instruments live:

* **pitch bend** bends every voice of the instrument tracks a keyboard plays, by the track's **bend range** (±2
  semitones by default, set in MIDI settings);
* **channel pressure**, and **polyphonic pressure** folded into it, reaches the patch as the *Note* node's new
  **Pressure** output; the bend is also there as **Bend**;
* an **unmapped CC** reaches the patch through a new **MIDI CC** node; a mapped CC moves its parameter, as now;
* the track's expression goes back to rest on Panic, ■, a disconnect, *Reset all controllers* (CC121) and when routing
  takes the track away from the keyboard.

**Out of scope** (parts 2 and 3): expression lanes, drawing them, format v15, recording, *Recorded CCs*.

## Inventory

What part 1 touches, beyond the [spec's inventory](SPEC-midi-expression.md#inventory).

### Parsing and the adapter

* `parseMidiMessage` (`core/midi/message.ts`) returns `undefined` for anything shorter than 3 bytes and for `0xA0`,
  `0xD0`, `0xE0`; `message.test.ts` asserts pitch bend is ignored. `describeMidiMessage` is exported but **not used by
  any view** (only its tests); the spec's "status line" for the new kinds has nowhere to show today (§ Differences
  from the spec).
* `app/midi-input.ts` `receive`: a CC 64 drives `controls.sustain` and `recordPedal`; CC ≥ 120 calls
  `release(port, channel)`; any other CC goes to `cc.receive` (`app/midi-controls.ts`), which acts on mapped CCs and on
  MIDI learn, and ignores the rest. Notes are routed by `liveNoteTracks(project, portId, channel, follow())`; held
  presses are kept per `[port, channel, pitch]` in `keys`, and `reroute()` releases those whose track no longer takes
  them when `liveNoteRouting` changes.
* `EngineControls` (`state/engine-controls.tsx`, made in `app/engine-controls.ts`) has `noteOn`, `noteOff`, `sustain`,
  `releaseSource`, `panic`, each one engine command.

### The engine and the instrument

* `Engine.apply` (`core/engine/engine.ts`) sends `track/noteOn`/`noteOff` to the track's `TrackRuntime`, which queues
  them in `LiveNotes` for the next render. `notes/releaseSource` and `notes/panic` go through `cancelNotes(scope)` to
  every `TrackRuntime`. `transport/stop` runs `stopTransport()`.
* `TrackRuntime` (`core/engine/track-runtime.ts`) **rebuilds its `Instrument`** on `setPatch` and `setVoices`, keeping
  what the new one must start with (the tempo) on itself. `track/add` (instrument) carries `voices`; `diffProject`
  (`core/sync/diff-project.ts`) sends `track/setVoices` when it changes.
* `Instrument` (`core/instrument/instrument.ts`) runs three stages: **global** (controls and their math, once per
  block, `NO_NOTE`), **voice** (per sounding note) and **shared** (on the voices' sum, `NO_NOTE`). A node with no inputs
  and `global: true` is always global (`planStages`, `core/instrument/stages.ts`).
* `Voice.start` sets `NoteState.frequency = midiToFrequency(pitch)` once. `VoicePool` hands notes to voices.
* `ProcessContext` (`core/dsp/types.ts`) carries `frames`, `sampleRate`, `note`, `samples`, `input`, `sends`, `taps`,
  `tempo`; nothing about the track's MIDI state.
* Nodes are registered in `core/dsp/registry.ts` and documented in `core/dsp/node-docs.ts` (category, description,
  every port and parameter; `node-docs.test.ts` checks they are all there). Quick-add lists them by category.

### Project and view

* `InstrumentTrack` has `voices`, `patch`, `noteGraph`, `clips`, `midiInput?` (`core/project/types.ts`). `midiInput` is
  the model for an optional field without a format bump: `sanitizeMidiTrackInput` in `sanitize-project.ts`,
  `setTrackMidiInput` in `core/project/midi-routes.ts`, `useProjectStore.setTrackMidiInput`, one undo step.
* MIDI settings (`ui/midi/MidiSettings.tsx`) has *MIDI input*, *Recording* (the latency offset), *Track inputs* (a
  `TrackInputRow` per instrument track: input and channel) and *Mappings*.

## Design

### Parsing (`core/midi/message.ts`)

* `MidiMessage` gains `pitchBend { channel, value }` (−1 to 1: `(v − 8192) / 8192` below the centre, `/ 8191` above, so
  0, 8192 and 16383 give −1, 0 and 1), `pressure { channel, value }` (0 to 1) and `polyPressure { channel, note, value }`
  (0 to 1). The length check moves inside the switch: `0xD0` needs 2 bytes, the rest 3. Running status needn't be
  handled: Web MIDI delivers whole messages.
* `describeMidiMessage` covers them (*Bend +0.42 on ch 1*, *Pressure 80 on ch 1*, *Pressure C4 80 on ch 1*).

### Expression (`core/midi/expression.ts`, pure)

* `ExpressionControl = 'pitchBend' | 'pressure' | { cc: number }`, `expressionKey(control)`, `REST` values (bend 0,
  pressure 0, a CC 0), `isExpressionCC(cc)` (0 to 119, not 64).
* `bentFrequency(pitch, bend, range) = midiToFrequency(pitch) × 2^(bend × range / 12)`.
* `PressureFold`: per input and channel, the channel pressure and each held key's poly pressure; `set`, `poly`,
  `keyUp`, `value()` (the highest). Used by the adapter (decision E2).
* `BEND_RANGE = { min: 0, max: 24, default: 2 }`.

### The instrument

* `NoteState` gains `pressure` and `bend` (both 0 in `NO_NOTE`).
* **`TrackExpression`**, one per `TrackRuntime`, kept on it across instrument rebuilds: `bend`, `pressure`, the CCs (a
  `Float32Array(120)`), the bend range, and for each control the source that last set it (decision E5). The instrument
  is given a read-only view of it at construction.
* **Each block**, before rendering voices, `Instrument.render` copies `bend` and `pressure` into each active voice's
  `NoteState` and sets its `frequency` to `bentFrequency(pitch, bend, range)`. The values move once per block (at most
  128 frames, 2.7 ms at 48 kHz), with no smoothing (decision E3). A note started while bent starts bent, since `start`
  uses the same function.
* `ProcessContext.expression?: Readonly<TrackExpression>` is passed to all three stages of an instrument (absent in
  insert, return, group and master graphs).
* **The Note node** gains outputs `pressure` (*Pressure*) and `bend` (*Bend*), after the existing three; wires are by
  port id, so saved patches are unchanged.
* **The MIDI CC node** (`core/dsp/nodes/midi-cc.node.ts`, type `midiCC`, *Sources*, `global: true`): parameter `cc` (0 to
  119, default 1, stepped, shown with the common name, *1 Mod wheel*), output `value` (0 to 1), the track's value of
  that CC, or 0 without `expression`. Documented in `node-docs.ts`, with keywords *mod wheel*, *controller*, *knob*.

### The engine

* **`track/expression { trackId, sourceId, channel, control, value }`**: sets the control on the track's
  `TrackExpression` at the next block, remembering the source and channel. A value out of range is clamped, an
  unknown control or a non-instrument track ignored.
* **Back to rest:** `notes/releaseSource { sourceId, channel? }` puts back at rest the controls whose last writer was
  that source (and channel); `notes/panic` and `transport/stop` put every track's live expression at rest. A document
  epoch change already sends panic.
* **Bend range:** `track/add` (instrument) carries `bendRange`; `track/setBendRange { trackId, bendRange }` changes it;
  `diffProject` sends it when it differs, as `voices`. The bounce gets it from `diffProject`, so a later part's lanes
  bend an export the same way.

### Project (`core/project`, `core/persistence`)

* `InstrumentTrack.bendRange?: number`, absent meaning 2. **Optional, no format bump**, like `midiInput` (decision E1):
  an older build drops it and the track bends ±2 again.
* `setTrackBendRange(project, trackId, range)` rounds to an integer and clamps to 0 to 24; 2 removes the field. One
  undo step through `useProjectStore.setTrackBendRange`.
* The sanitizer keeps an integer 0 to 24 and drops anything else with a warning (*invalid bend range dropped; the track
  bends ±2*).
* `duplicateTrack` and a track saved to the library carry it; patch presets don't (decision E6).

### The adapter (`app/midi-input.ts`)

* `receive` handles the new kinds after the existing checks:
  * **pitch bend** and **pressure**: to the tracks `liveNoteTracks(project, port.id, channel, follow())` gives, via
    `controls.expression(trackId, source, channel, control, value)`. Pressure goes through the port and channel's
    `PressureFold` first;
  * **poly pressure**: updates the fold for that key and sends the folded pressure; a note-off clears its key;
  * **a CC** other than 64 and 120 to 127: `cc.receive` now returns whether it used the message (a mapping, or MIDI
    learn). If it didn't and the CC is 0 to 119, it is expression, routed like pitch bend;
  * **CC121** (*Reset all controllers*) also puts the expression this port and channel set back at rest.
* **Rerouting:** the adapter keeps, per port and channel, the tracks it sent expression to and which controls. When
  `liveNoteRouting` changes, a track no longer in that port and channel's set gets those controls at rest; a track that
  joins starts at rest and takes the next message.
* `release(port, channel)` already sends `notes/releaseSource`, which now resets expression too; it also drops the
  port's folds and bookkeeping. `disable`, Panic and a document change clear them.
* `EngineControls.expression` sends `track/expression` at once, unthrottled (spec § Expression on a track).

### The view

* **MIDI settings → Track inputs:** each row gets *Bend ±* (a number field, 0 to 24 semitones; decision E4).
* **Quick-add and the node docs:** the MIDI CC node under *Sources*; the Note node's two new outputs with their docs.

### Differences from the spec

* The spec's *Bend +0.42 on ch 1* "in the status line": `describeMidiMessage` gets these strings, but no view shows
  received messages today, so nothing new is shown. A monitor of incoming MIDI is not part of this work.
* The spec puts `bendRange` under format v15; this plan adds it as an optional field now (decision E1), and part 2's
  v15 is for the expression target only.

## Steps

1. **Parsing** (`core/midi/message.ts`): the three kinds, 2-byte pressure, descriptions; the parser table replaces the
   "pitch bend is ignored" case.
2. **Expression helpers** (`core/midi/expression.ts`): controls, rest values, `bentFrequency`, `PressureFold`; tables.
3. **The instrument and nodes** (`core/dsp`, `core/instrument`): `NoteState` fields, `TrackExpression`,
   `ProcessContext.expression`, voices bent per block, the Note node's outputs, the MIDI CC node, its docs and
   registry entry.
4. **The engine** (`core/engine`, `core/sync`): `track/expression`, resets on release, panic and stop, the state kept
   across `setPatch` and `setVoices`, `bendRange` on `track/add` and `track/setBendRange`, `diffProject`.
5. **The project** (`core/project`, `core/persistence`, `state`): `bendRange`, its edit and sanitizer, duplicate and
   library, the store action.
6. **The adapter** (`app/midi-input.ts`, `app/midi-controls.ts`, `app/engine-controls.ts`): routing, mapped versus
   unmapped CCs, the fold, CC121, rerouting and release.
7. **The view:** *Bend ±* in MIDI settings; quick-add picks up the node from the registry.
8. **Browser tests and docs:** the tests below; `architecture/midi.md` (expression: parsing, routing, the engine) and
   `architecture/graphs-and-nodes.md` (the Note node's outputs, the MIDI CC node); the guide's node list if it has
   one; decisions; the spec's status.

## Behavior changes

* **A keyboard's pitch wheel now bends** what it plays (it did nothing before). Pressure and unmapped CCs change
  nothing until a patch uses the Note node's Pressure or a MIDI CC node.
* MIDI settings' *Track inputs* rows get *Bend ±*.
* The Note node shows two more outputs; quick-add has *MIDI CC*.
* A project that sets a bend range other than 2 saves `bendRange`; nothing else changes in saved files, and exports
  are unchanged (nothing authored bends yet).

## Verification

* **Unit (`core`):** the parser table (bend at 0, 8192 and 16383, LSB order, 2-byte pressure, a 2-byte message of
  another kind refused, poly pressure, out-of-range bytes); `bentFrequency` at ranges 0, 2 and 12; `PressureFold`
  (highest wins, key-up, channel pressure falling below a held key's); an instrument whose oscillator follows the Note
  node plays a bent frequency after `track/expression` (the energy at the bent and unbent frequencies, with the instrument
  tests' Goertzel `energyAt`),
  a note started bent, the Note node's Pressure and Bend and the MIDI CC node's value read through an indicator;
  expression kept across `setPatch` and `setVoices`; `releaseSource` resetting only its own controls, panic and stop
  resetting all; `diffProject` sending `track/setBendRange`; the sanitizer and the edit (rounding, clamping, 2
  removing the field).
* **Unit (`app`):** with fake ports, bend and pressure reach the tracks a note-on would (own input, followed, armed); a
  mapped CC goes to its mapping and not to the track, an unmapped one the other way round, one during MIDI learn to
  learn; poly pressure folded and cleared at key-up; CC121 resets; a routing change sends rest to the track left
  behind; disconnect resets.
* **Browser smoke (fake ports):** *Bend ±* edits, undoes and reloads; the MIDI CC node is in quick-add and its indicator
  follows a CC sent through a fake port.
* **Browser audio (real worklet):** a held note's pitch moves by the expected ratio after a fake port sends a full bend
  at range 2 and range 12, and back after the centre (the pitch measured from the captured output), and ■ puts it back.
* **By hand** (added to [BACKLOG](../../BACKLOG.md) V5): a real keyboard's wheel and pressure, and a controller's mod wheel
  through a MIDI CC node.

## Decisions to sign off

Signed off 2026-11-06: every decision as proposed.

| # | Decision | Proposed | Alternatives |
|---|---|---|---|
| E1 | When `bendRange` is saved | **Now, as an optional field with no format bump** (like `midiInput`); part 2's v15 is only for lanes | Bump to v15 in this part and leave part 2 without one, or wait for part 2 (the range not kept until then) |
| E2 | Where poly pressure is folded | **In the adapter**, per input and channel; the engine knows only a track's pressure | In the engine, per source (it already knows held notes, but folding needs the key's pressure, which it doesn't keep) |
| E3 | Smoothing | **None:** values change once per block (≤ 2.7 ms); a patch that steps audibly uses the Smooth node | A built-in 5 ms slew on pressure and CCs (smooth by default, a little lag everywhere) |
| E4 | Where the bend range is set | **MIDI settings, the track's *Track inputs* row** | The track's context menu; the instrument panel |
| E5 | Two sources on one track | **The last message wins** per control; a source's release resets only what it set last | One value per source, combined (max for pressure, sum for bend) |
| E6 | What carries the bend range | **The track:** *Duplicate* and track library items keep it; patch presets don't | The patch (presets carry it, a patch swap changes it) |

## Changes made while implementing

* **The instrument (step 3).** `NoteState.pressure` and `bend` are optional (absent is 0), so the note literals in
  insert graphs, helpers and tests stay as they are. `Instrument` takes the `TrackExpression` as its last constructor
  argument (a fresh one by default); `Voice` reads it at `start` and before each block. `ParamSpec.format` gains
  `midiCC`: the patcher shows the CC's common name beside the number, the tooltip *1 Mod wheel*.
* **Imports (step 4).** The engine and the instrument import `core/midi` through its index, as the architecture test
  requires of every core module.
* **The library (step 5).** Decision E6 said "track library items" keep the bend range. There are none: a library
  *instrument* item holds a patch, a note graph and voices, and carrying the range there would change the library
  format. It stays with the track: *Duplicate* keeps it, library items and presets don't.
* **The adapter (step 6).** `createMidiControls().receive` returns whether it used a CC (a mapping, an unavailable
  mapping's feedback, MIDI learn, a pending reassignment); only one it didn't use is expression. CC121 needs no path of
  its own: CC120 to 127 already release the source and channel, and the engine's release now puts that source's
  expression back at rest. When routing takes a track away from an input, the rest the adapter sends there wins over
  whatever another source set on that control in between (two keyboards on one track, rare).
* **The view (step 7).** Quick-add takes the MIDI CC node from the registry with no change; its unit test counts the
  *Sources* from there. The browser preview serves the main checkout, not a worktree, so the view was checked through
  the smoke test rather than by eye.
* **Tests (step 8).** An output fed only by a MIDI CC node runs per voice, so the audio test holds a note to hear the
  mod wheel. The audio tap's buffer holds a little of what came before a change, so the test waits 250 ms before
  listening, as the other MIDI audio tests wait 200 ms. The bent pitch is read as a level (`hzToMidi` − 69, scaled),
  since the tap reports peaks, not samples.
* `describeMidiMessage` covers the new kinds, but no view shows received messages, as the plan said.
