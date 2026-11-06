---
status: active
date: 2026-11-06
note: "Pitch bend, aftertouch and CC: played live, kept as automation lanes, recorded with the notes. Signed off 2026-11-06 (decisions 3 and 8 changed in review); parts 1 and 2 done 2026-11-06; part 3 planned and signed off."
---
# Pitch bend, aftertouch and CC (spec)

Status: **spec, signed off** 2026-11-06: decisions 3 and 8 changed in review, the rest as proposed. **Parts 1 and 2 are done**
(2026-11-06, plans for [part 1](../archive/midi-expression/PLAN-midi-expression-1-play.md) and
[part 2](../archive/midi-expression/PLAN-midi-expression-2-lanes.md)); part 3
([plan](PLAN-midi-expression-3-recording.md)) is planned and signed off (2026-11-06). Written 2026-11-06 on `feat/midi-recording` at `9d6df92` (MIDI recording
parts 1 to 3 and round 12c done). No code was changed. It picks up two items left out of
[MIDI recording](../archive/midi-recording/SPEC-midi-recording.md): its out-of-scope line *"CC, pitch bend and
aftertouch as clip data"* and its wish *"Recording CC, pitch bend and the pedal as clip data"*. The sustain pedal stays
folded into note lengths. Release velocity is not part of this work.

The plans for each part take their steps, tests and verification from here. Where a plan and this spec disagree later,
the plan wins and says so.

**One rule for every choice below: do what the app already does.** Automation lanes already store, edit, play and
bounce a control's movement over time, and touch recording already turns a gesture into lane points. So pitch bend,
pressure and CC become **controls with lanes** (a new kind of control target), and recording writes those lanes the way
touch does, into the clip or region the notes go into. Where the app has nothing to copy, this follows Ableton (CC
and pitch bend kept in the clip as envelopes, a ±2-semitone bend by default).

## Goal

After this work:

* **Pitch bend** on a keyboard bends what an instrument track plays, by a bend range set per track (±2 semitones by
  default), without changing the patch.
* **Aftertouch** (channel pressure, and polyphonic pressure folded into it) and **any CC that isn't mapped** reach the
  instrument as signals. A patch uses them through the *Note* node's new **Pressure** and **Bend** outputs and a new
  **MIDI CC** node, for example the mod wheel driving vibrato depth or pressure opening a filter.
* An instrument track's clips and regions can hold **expression lanes** (*Pitch bend*, *Pressure*, *CC 1 (Mod wheel)*
  and so on), drawn and edited like any automation lane.
* **Recording** with ● (a slot take, an overdub or an Arrangement take) also records the pitch bend, pressure, mod
  wheel and the CCs chosen in MIDI settings that reach each armed track, into that clip's or region's expression lanes,
  as part of the take's one undo step.

**Out of scope** (see [Wishes](#wishes-later)):

* per-note expression: polyphonic pressure is folded into channel pressure for now, and recording it per note belongs
  with MPE ([BACKLOG](../BACKLOG.md) D2);
* release velocity;
* recording the sustain pedal as data (it stays folded into note lengths);
* mapped (learned) CCs: they move their parameter and are recorded by ● *Touch*, as today
  ([decision 2](#decisions-to-sign-off));
* expression in note graphs (an arpeggiator reading pressure) and in insert-effect graphs;
* MIDI output.

## Inventory

What exists at `9d6df92`.

### Parsing and live input

* `parseMidiMessage` (`core/midi/message.ts`) knows **note-on, note-off and CC** only. It needs 3 bytes, so a 2-byte
  channel-pressure message (`0xD0`) would be refused even if it were handled. Pitch bend (`0xE0`), polyphonic pressure
  (`0xA0`) and channel pressure come back `undefined` and `app/midi-input` drops them. A test asserts pitch bend is
  ignored.
* **CCs** in `app/midi-input`: CC64 drives the sustain pedal (and `recordPedal`); CC120 to 127 release the source and
  channel; everything else goes to `app/midi-controls`, which acts only on **mapped** CCs (learned, 0 to 119 except
  64). An unmapped CC does nothing. CCs aren't routed to tracks: a mapping names its own device and channel.
* **Notes** are routed per message by `liveNoteTracks` (a track's own input, else the followed and armed tracks), and
  reach the engine as `track/noteOn` / `track/noteOff` with a `{ sourceId, channel, noteId }` identity.

### The instrument

* A voice's `NoteState` is `{ frequency, velocity, gate, trigger }` (`core/dsp/types.ts`). `Voice.start` sets
  `frequency` from the pitch once; nothing changes it while the note sounds.
* The **Note** node (`core/dsp/nodes/note.node.ts`) outputs *Freq*, *Gate* and *Vel*, each constant for the block.
  Oscillators, the sampler (through its frequency input), the filter's key tracking and the comb all follow *Freq*, so
  changing `NoteState.frequency` bends all of them.
* Insert-effect graphs see a silent, ungated note (`NO_NOTE`).

### Control targets and lanes

* `ControlTarget` (`core/control/types.ts`) is a **graph** parameter (patch, notes or fx) or a **mixer** control
  (volume, pan, send). Resolution gives a `ParamSpec`, a base value and the interpolation. There is no target for
  anything that isn't a parameter or a mixer control.
* **Lanes** (`core/automation`): normalized points with linear or hold interpolation, at most 64 lanes per clip and
  2048 points per lane. They live in a session clip (`Clip.automation`), a region's clip (a region's own lanes, playing
  since round 12c) and the timeline (`Project.arrangementAutomation`, which wins over a region's lane for the same
  target). The engine evaluates them per sample, and a live gesture on an automated control becomes an override until
  *Read* or ■.
* **Touch recording** (`state/touch-store`, `core/automation/record`): a gesture's samples are buffered outside the
  project, split at loop wraps, simplified to a 0.002 normalized error and written on release; later passes replace only
  their own touched spans. A take stops at 256 beats, 64 targets or 16,384 raw samples, and one that would overflow
  2048 points is refused whole. Learned CCs feed it after pickup, a CC gesture ending after 800 ms without a message.
  Touch into the timeline is round 12d, not built yet.

### MIDI recording

* `state/record-store` keeps per-take events (`recordNote`, `recordPedal`) in take time, and `core/record/take.ts` turns
  them into notes, written as each note ends under the pass's merge key (one undo step per pass). There are three
  kinds of take: slot (a new clip), overdub (into a playing clip, by loop pass) and region (Arrangement, a new region
  per armed track, passes merged over the loop brace, split past 64 bars).

### Things that don't exist

* No expression state per track or voice, no bend range, no pressure, no CC node.
* No target or lane for anything a MIDI message carries other than through a learned mapping.

## Design

### Parsing

* `parseMidiMessage` gains three kinds and accepts 2-byte messages where the status calls for them:
  * `{ kind: 'pitchBend', channel, value }`: the 14-bit value (`lsb | msb << 7`) as **−1 to 1**, 8192 being 0
    (8191 steps up, 8192 down, so both ends reach ±1 exactly);
  * `{ kind: 'pressure', channel, value }`: channel pressure, **0 to 1**;
  * `{ kind: 'polyPressure', channel, note, value }`: 0 to 1.
* `describeMidiMessage` shows them in the status line: *Bend +0.42 on ch 1*, *Pressure 80 on ch 1*,
  *Pressure C4 80 on ch 1*.

### Expression on a track

Every instrument track has **expression state**: one value per control, **Pitch bend** (−1 to 1), **Pressure** (0 to
1) and **CC 0 to 119** (0 to 1). Each has a **rest value**: bend 0, pressure 0, a CC 0 (decision 13). The state is
per track, not per channel or source: a track listens to one keyboard at a time in practice, and the clip lanes that
replay it have no channel either.

* **Live messages are routed like notes** (decision 12): pitch bend, pressure and an unmapped CC from an input and
  channel go to the tracks `liveNoteTracks` gives for that input and channel at that moment (the track's own input, else
  the followed and armed tracks). A mapped CC goes only to its mapping, as now, and isn't expression (decision 2). CC64
  stays the pedal, and CC120 to 127 keep releasing; CC121 (*Reset all controllers*) also puts the track's expression
  back at rest.
* **Polyphonic pressure** is folded into channel pressure: the track's pressure is the highest of the channel pressure
  and the poly pressure of the keys held on it (decision 3). A key-up drops its poly pressure.
* **Back to rest:** a source's release (disconnect, disable, a routing change that drops the track), Panic, ■ and a new
  document put the affected tracks' live expression back at rest, as notes are released there. Where a routing change
  takes a track away from a source, that track's live bend and pressure go back to rest; the new tracks start from rest
  too and pick up the next message.
* **Engine command:** `track/expression { trackId, source: { sourceId, channel }, control, value }`, where `control` is
  `'pitchBend' | 'pressure' | { cc }`. The adapter sends each message when it arrives, not throttled to a frame (a bend
  coalesced to 16 ms would sound stepped); these are engine commands, not project edits, so they cost no history, diff
  or render. The engine applies the latest value per control at the next block.

### What it does to the sound

* **Pitch bend bends every voice of the track** (decision 4): a voice's `NoteState.frequency` becomes
  `midiToFrequency(pitch) × 2^(bend × range / 12)`, recomputed each block, so every node that follows the note's
  frequency bends with it, the sampler included. Notes started while bent start bent.
* **Bend range** per instrument track, `InstrumentTrack.bendRange`, 0 to 24 semitones, **2** by default. It's an
  optional field (absent means 2), set in the track's MIDI settings beside its input. One undo step.
* **The Note node** gains two outputs after the existing ones (decision 5): **Pressure** (0 to 1) and **Bend** (−1 to 1,
  for patches that use the wheel as a modulation source, with the range set to 0 if they don't want the pitch to move).
  Existing wires are by port id and stay put.
* **MIDI CC node** (new, *Sources*): one parameter, *CC* (0 to 119, default 1, shown with the common names: 1 Mod wheel,
  2 Breath, 7 Volume, 11 Expression, 74 Brightness…), one output, the track's value of that CC, 0 to 1. It works in
  the instrument's patch. In other graphs it outputs 0, like the Note node does there.
* **Nothing else moves by default.** Pressure and CCs do nothing until a patch reads them, so a controller full of
  knobs sends nothing audible to a patch that doesn't use them, as now.

### Expression lanes

A new kind of control target (decision 10):

```ts
{ kind: 'expression'; owner: ControlOwner; control: 'pitchBend' | 'pressure' | 'cc'; cc?: number }
```

* **Owners:** instrument tracks only. A return, the master, a group or an audio track resolves it as incompatible, with
  *Only an instrument track has pitch bend, pressure and CC*.
* **Resolution:** a `ParamSpec` per control. Bend is −1 to 1, shown in semitones at the track's range (*+1.4 st*);
  pressure is 0 to 1, shown 0 to 127; a CC is 0 to 1, shown 0 to 127. All interpolate linearly. The base is the rest
  value. They aren't wired, so they are always available. They don't appear as MIDI learn targets or panel controls.
* **Where they live:** in the same places as any lane of the track: a session clip's lanes and a region's own lanes,
  and also the timeline's (which win over a region's, as for any target). The lane rules (64 lanes per clip, 2048
  points, canonical order, one lane per target) count them like any other lane.
* **Playback:** the engine compiles them with the others. Each block, an expression lane writes the track's expression
  value for that control, and voices and nodes read it as they read a live value. When the clip stops, or the region
  ends, the control goes back to rest, as a lane's target goes back to its base.
* **Live input over a lane** (decision 6): a live message on a control a lane is playing **overrides** the lane, as a
  learned CC overrides an automated parameter today, until *Read* (re-enable) or ■. The override shows in the lane
  header as today's do.
* **In the view:** the lane picker (*+ Lane* in the clip editor and on the timeline) gets a **MIDI** group on an
  instrument track: *Pitch bend*, *Pressure*, *CC…* (a number field with the common names). Lane names read
  *Pitch bend*, *Pressure*, *CC 1 Mod wheel*. Editing, snapping, copying, doubling and trimming are the existing lane
  editor's.

### Recording

● records expression with the notes, into the same clip or region, as part of the same undo step. Whatever reaches an
armed track and is recorded as notes is recorded as expression too: the same takes, the same clock, the same
latency compensation, the same early-note grace at the start.

* **What is captured** (decision 8): **pitch bend**, **pressure** (poly pressure already folded), the **mod wheel**
  (CC1), and the unmapped CCs ticked under **Recorded CCs** in MIDI settings, that reach the armed track while its take
  records. The list is empty at first, so a controller full of knobs fills no clip with lanes unless asked to. A CC
  that isn't ticked still plays live (a MIDI CC node hears it); it just isn't kept. CC64 is never in the list (the
  pedal is folded into notes), and neither is CC1 (always recorded). Mapped CCs aren't captured by ●, ticked or not;
  with ● *Touch* on they are recorded as parameter automation, as today (decision 2).
* **Gestures** (decision 9). Expression is recorded in spans, like a touch gesture: **bend** from leaving 0 until it is
  back at 0; **pressure** from rising above 0 until it is back at 0; a **CC** from its first message until 800 ms without
  one (touch's CC rule). Only the spans touched are written: a lane keeps what it had around them.
* **Where it goes** (decision 1), with the notes:
  * a **slot take** writes the new clip's lanes;
  * an **overdub** writes the playing clip's lanes, each pass replacing only its touched spans (touch's rule:
    later passes win where they overlap) (decision 7);
  * an **Arrangement take** writes the **new region's own lanes**, so the bends move with the region; across the loop
    brace, passes replace each other's spans as in an overdub; past 64 bars the lane continues in the next region, as
    the notes do.
* **A take with only expression:** a slot take keeps its lanes, as it keeps its length. In the Arrangement, a region
  appears with its first note **or** its first expression span.
* **Writing.** A span is buffered outside the project, simplified with touch's 0.002 bound and written (as
  `setClipNotes` is for notes) when it ends, and at least once per bar while it lasts, so a long pressure swell shows as
  it grows. Each write uses the pass's merge key: the take with its lanes stays one undo step.
* **Limits.** A lane that would pass 2048 points stops recording at the span that overflows, keeping what it has, with
  *Pitch bend on Lead: too many points, stopped recording it*. The notes and the other lanes go on: unlike a touch take,
  a note take is never refused whole because of a lane. A clip that has no room for another lane (64) records no new
  lanes, with a notice. The raw buffer is the span's: simplifying at every bar keeps it bounded.
* **Undo, ending, the count-in and stop** behave as for notes: they end the spans there.

### Engine and protocol

* `track/expression` (above), reset by `notes/releaseSource`, `notes/panic`, stop and document changes.
* Per instrument: the live expression values, the lane values, the override flags and the bend range, read by
  `VoicePool` each block (frequency) and by `NoteState` (new `pressure` and `bend` fields, which the Note node and the
  MIDI CC node read; `NoteState` gains a `cc` lookup or the node reads the instrument's state through the process
  context, a plan choice).
* `automation/configure` carries expression lanes compiled like the rest; the bounce plays them, so an export bends as
  playback does.
* Nothing in the status: overrides are reported as today.

### Persistence

* **Format v15:** the `expression` control target in lanes (clip, slot and timeline lanes, and a region's), and
  `InstrumentTrack.bendRange`. Migration v14→v15 changes nothing; a v14 build would drop these lanes, which is why it is
  a version and not an optional field (decision 10). A `v15-midi-expression` fixture.
* The sanitizer refuses an expression target on any owner but an instrument track (kept as unavailable with a warning,
  as cross-owner lanes are now), a CC outside 0 to 119, a bend range outside 0 to 24.
* **Recorded CCs** is a browser preference, not part of the project: it describes the controller on this desk, like the
  latency offset. It joins the record settings (`state/record-settings.ts`, `sfxlab:record` in `localStorage`),
  validated on load (integers 0 to 119, not 1 or 64, no duplicates, at most 118). In MIDI settings it is a list of
  CC numbers with their common names, with *Add CC…* and a *Learn* that adds the next unmapped CC that arrives.

## Parts

1. **Play it.** Parsing, routing, `track/expression`, the track's expression state, pitch bend on voices, the bend
   range, the Note node's Pressure and Bend, the MIDI CC node, poly pressure folding, returning to rest. Useful on its
   own; saves only `bendRange`.
2. **Expression lanes.** The target, its resolution, compilation and playback, overrides, the lane picker and editor,
   format v15 and the fixture. Lanes can be drawn by hand.
3. **Recording.** Spans in the record store, written into slot takes, overdubs and Arrangement takes, the *Recorded
   CCs* setting, the limits and feedback.

Independent of round 12d (touch into the timeline) in both directions: 12d records parameter moves into timeline
lanes, this records expression into clip and region lanes (decision 11).

## Verification

* **`core`:** the parser as a table (pitch bend ends and centre, 2-byte pressure, poly pressure, malformed lengths);
  bend applied to a voice's frequency at ranges 0, 2 and 12, a note started bent; the Note node's and MIDI CC node's
  outputs; poly folding (max, key-up); the expression target's resolution, keys and remap; the sanitizer and the
  migration; lanes writing expression per block, back to rest at a clip's stop, override until Read; span recording
  (gesture edges, replacing only touched spans per pass, a lane overflowing while notes continue), a span across a
  region split; only bend, pressure, CC1 and the ticked CCs recorded, a mapped CC never.
* **`state`:** the *Recorded CCs* preference validated on load (bad numbers, 1, 64, duplicates dropped).
* **`app`:** the adapter routes expression like notes, a mapped CC isn't expression, CC121 resets, a routing change sends
  the dropped track back to rest; it feeds the record store with timestamps.
* **Engine:** a bend lane moves an oscillator's pitch by the expected cents; the bounce matches playback.
* **Browser smoke (fake ports):** bend live and see the status line; draw a bend lane; arm, record a slot take with a bend
  and a mod wheel move, the lanes appear, undo removes notes and lanes together, reload keeps them; an overdub pass
  replaces only its span; an Arrangement take's region has the lanes.
* **Browser audio (real worklet):** a recorded bend plays back at the pitch and time it was played, within a render
  quantum and the timestamp precision.
* **By hand** (added to [BACKLOG](../BACKLOG.md) V5): a real keyboard's wheel, pressure and mod wheel, live and recorded,
  at 90 and 140 BPM.

## Decisions to sign off

Signed off 2026-11-06: decisions 3 and 8 changed in review (per-note pressure goes to backlog D2; only bend, pressure,
the mod wheel and chosen CCs are recorded), every other decision as proposed.

| # | Decision | Proposed | Alternatives |
|---|---|---|---|
| 1 | Where recorded expression goes | **With the notes:** the take's clip lanes in the Session, the new region's own lanes in the Arrangement, so they move with the region (confirmed) | The track's timeline lanes in the Arrangement (as 12d does for touch), which don't follow a moved region |
| 2 | Mapped CCs | **Not expression:** a learned CC moves its parameter, and only ● *Touch* records it, as today (confirmed) | ● Rec also records mapped CCs on armed tracks' own targets as touch takes (two arms that both record a CC) |
| 3 | Polyphonic pressure | **Folded into channel pressure** (the highest held), live and recorded, for now; recording it per note is part of MPE, [BACKLOG](../BACKLOG.md) D2 (changed) | Per voice live but folded when recorded (live and playback differ); or per note in clips in this work |
| 4 | What pitch bend does | **Bends every voice of the track** by a per-track range, ±2 by default, without a patch change | Nothing until a patch reads a Bend output; or a range per patch instead of per track |
| 5 | How patches read pressure and CC | **Pressure and Bend on the Note node, a new MIDI CC node**; nothing moves by default | Fixed routings (pressure to volume, mod wheel to a vibrato); or only a MIDI CC node, with pressure as a CC number |
| 6 | Live input on a control a lane is playing | **Overrides the lane until Read or ■**, as for parameters now | Combine them (bend adds, pressure takes the max); or the lane wins while it plays |
| 7 | Overdub of expression | **Replace touched spans, pass by pass** (touch's rule), while notes are added | Add nothing to existing lanes (record expression only into new clips and regions); or replace the whole lane per pass |
| 8 | What ● records besides notes | **Pitch bend, pressure, the mod wheel (CC1) and the unmapped CCs ticked under *Recorded CCs*** (a browser preference, empty at first); other CCs play live but aren't kept (changed) | Every unmapped CC 0–119 except 64 |
| 9 | Span edges | **Bend: away from 0 to back at 0; pressure: above 0 to 0; CC: until 800 ms of silence** | One span per take, from the first message to the end (writes rest values over everything after the first touch) |
| 10 | Storing the new target | **A new `expression` target kind, format v15** | A hidden node in each patch whose parameters are the expression (no format bump, but every patch carries it and a lane names a node) |
| 11 | Order | **Parts 1, 2, 3**, independent of round 12d | After 12d, sharing a "MIDI to lanes" path with it |
| 12 | Where live expression goes | **The tracks a note-on from that input and channel would go to**, at each message | Only the tracks holding notes from that source (a bend before the first key is lost) |
| 13 | A CC's base value | **0**, like the other rest values | The last live value received (survives into playback, but not saved, so a reload sounds different) |

## Wishes, later

* Per-note expression and MPE ([BACKLOG](../BACKLOG.md) D2): poly pressure recorded per note, per-note bend, slide.
* Expression in note graphs (an arpeggiator gated by pressure) and in insert-effect graphs (the mod wheel opening an
  effect's filter).
* Starter patches that use the mod wheel and pressure (vibrato, brightness).
* Thinning recorded lanes by a chosen amount; *Recorded CCs* per input device.
* The sustain pedal as a lane.
* MIDI output of expression (D1).
