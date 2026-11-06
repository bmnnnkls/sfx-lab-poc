---
status: active
date: 2026-11-06
note: "Part 3 of the pitch bend, aftertouch and CC spec: ● records pitch bend, pressure, the mod wheel and chosen CCs into the take's clip or region lanes, in the take's undo step; Recorded CCs in MIDI settings. Signed off 2026-11-06, every decision as proposed; needs part 2."
---
# Pitch bend, aftertouch and CC, part 3: recording them

Status: **plan, signed off** 2026-11-06, every decision as proposed. Written 2026-11-06 on `imp/spec-midi-expression` after part 1, with part 2
planned ([plan](PLAN-midi-expression-2-lanes.md)) but not built; this part needs it. Carries out part 3 of the
signed-off [pitch bend, aftertouch and CC spec](SPEC-midi-expression.md) (§ Recording, § Parts). The spec's decisions
are settled and not repeated here; this plan adds only the ones it raises (§ Decisions to sign off). Where it differs
from the spec, it says so.

## Goal

After this part, what you play with the wheel, pressure and the mod wheel is kept with the notes:

* a **slot take**, an **overdub** and an **Arrangement take** each record the **pitch bend**, **pressure** and **mod
  wheel** (CC 1) that reach an armed track, and the unmapped CCs ticked under **Recorded CCs** in MIDI settings, into
  expression lanes of the clip or region the notes go into;
* expression is recorded in **spans**: the wheel from leaving the centre to coming back, pressure from rising above 0 to
  falling back, a CC until 800 ms without a message. Only the spans touched are written: an overdub pass replaces its
  spans and keeps the lane around them;
* the lanes grow while you play and are part of the take's **one undo step**;
* a lane that runs out of points stops recording with a notice; the notes and other lanes go on.

## Inventory

What part 3 touches, beyond the [spec's inventory](SPEC-midi-expression.md#inventory) and parts 1 and 2.

### The recorder (`state/record-store.ts`)

* A take (`Take`) holds its events (`TakeEvent`: `on`, `off`, `pedal`, each with a beat in take time), its kind (slot,
  overdub, region), `start`, `end`, `early`, `loop` (`TakeLoop { anchor, length, origin? }`) and `pass`, the merge key
  shared by takes recording together. `recordNote` and `recordPedal` add events (`addEvent`, which turns a beat, lap and
  run into take time and drops events of another run).
* **Writing.** `write` adds finished notes to a session clip through `commitTake` (`setClipNotes` under
  `record:<pass>`, no merge window); `writeFinished` runs after each event; `finish` closes held notes, writes them and
  sets the clip's length (`setClipLength`, which also trims lanes: `resizeAutomation`). Arrangement takes write whole
  regions (`writeRegions`, `updateArrangementClip`), split every 256 beats (`splitRegions`), grow a bar at a time from
  the status (`reconcileRecords`), and `watchRegions` ends a take whose region anything else changes, by comparing with
  the region object it last wrote.
* Ending (press, fixed length, 64 bars, ■, undo, ● Rec off, disarm, the Session or Arrangement taking over) goes
  through `finish`, `endOverdub` and `endRegion`.

### Touch, the precedent for lanes (`core/automation/record.ts`, `state/touch-store.ts`)

* `applyTouch(lane, samples, length, base)` writes a capture in local beats that may span passes (`floor(beat /
  length)`): each pass replaces its own touched span, keeping the lane around it with 1e-7 beat guards, and the captured
  points are simplified (`simplifyTouch`, 0.002 normalized). It throws past 256 beats or 16,384 samples, and when the
  result would pass 2048 points. A new lane starts from the base around the span.
* Touch buffers its samples outside the project and commits on release; a wheel or CC gesture ends after 800 ms without
  a message (`TOUCH_RELEASE_MS` in `state/touch-store.ts`), which the CC span rule reuses.

### Settings and the adapter

* `state/record-settings.ts`: the metronome and its level, the fixed length, the count-in and the latency offset, kept
  per browser under `sfxlab:record`, validated field by field (`recordSettingsOf`). MIDI settings' *Recording* section
  shows the latency offset.
* Part 1's `express` in `app/midi-input` sends expression to the tracks a note-on would go to; part 2 adds the
  override over a playing lane.

## Design

### What is recorded (`app/midi-input`, `state/record-settings`)

* **Recorded CCs**, a browser preference beside the latency offset: `recordedCCs: number[]`, empty by default, each an
  integer 0 to 119, not 1 (always recorded) and not 64, no duplicates, at most 118, kept sorted. Validated on load like
  the other fields (decision R1).
* `express` passes a control to the recorder when it is recordable: pitch bend, pressure, CC 1 or a recorded CC
  (`isRecordedExpression(control, settings)`), with the event's clock position, as notes are:
  `recordExpression(trackId, { source, channel, control, value, at, beat, lap, run })`, where `at` is the event's
  timestamp in milliseconds (decision R2). A mapped CC never reaches `express`, so it is never recorded by ●.
* The rest the adapter sends to a track that routing takes away is not recorded; that track's open spans end there
  (decision R5).

### Spans (`core/record/expression.ts`, pure)

* `TakeEvent` gains `{ kind: 'expression', beat, at, source, channel, control, value }`.
* **`expressionSpans(events, control, { start, end })`**: per control (bend, pressure, each CC), the take's events of
  that control in order, cut into spans: a bend span runs from the first value away from 0 to the first 0 after it;
  pressure from above 0 to 0; a CC from its first message to the last before a gap of 800 ms of `at` (spec decision 9).
  A span still open at `end` closes there with its last value. Events before `start - early` are dropped, those between
  count as at `start`, as notes do. Each span is samples `{ beat, value }` normalized to the lane (bend −1..1 to 0..1).
* **`placeSpan(samples, range)`**: take time to clip or region beats, by the same rules as notes (`toNote`'s): no loop,
  `beat − start`; with `loop`, the first pass and a lead-in keep their place and later passes wrap by the length from
  the anchor, shifted by `anchor − origin`. A span crossing a wrap is split at it into one piece per pass, in order.
* `applyExpression(lane, pieces, length)` applies the pieces one by one with `applyTouch` (base 0), so later passes
  replace earlier ones where they overlap. It returns the lane, or `overflow` when a piece would pass 2048 points, with
  the lane as it was before that piece.

### Writing (`state/record-store`)

* A take keeps, per control, the spans it has written and the lane it started from (`take.lanes: Map<key, { base:
  AutomationLane | undefined; written: number }>`), so each write recomputes the lane from its base and every span so
  far: the result doesn't depend on how often it was written.
* **When:** at the end of each span, and once per bar for spans still open (`reconcileRecords`, which already runs on
  each status), as notes are written as they end (decision R3). Each write goes through `commitTake` under the pass's
  key: `setClipAutomation` for a session clip, the region's `content.automation` in `writeRegions` for an Arrangement
  take, so `watchRegions` sees the take's own write.
* **Slot take:** lanes of the new clip, length the clip's provisional length; `finish`'s `setClipLength` trims them to the
  bars recorded.
* **Overdub:** lanes of the playing clip; each pass replaces its spans (spec decision 7). A lane that doesn't exist is
  created, enabled; one that exists keeps its `enabled`.
* **Arrangement take:** the region's own lanes, through `placeSpan` with the brace; past 256 beats a span goes on in
  the next region (`splitLanes`, like `splitRegions`: a piece crossing the split continues with a point at the next
  region's 0 holding its value; decision R6). A region appears with its first note **or** its first span (spec).
* **Limits:** a lane that overflows 2048 points stops recording on that track (later spans of that control are
  dropped) with *Pitch bend on Lead: too many points, stopped recording it*; notes and other lanes go on (decision R4). A
  clip or region with 64 lanes records no new one: *Lead: no room for another lane*.
* **Ending:** `finish`, `endOverdub` and `endRegion` close open spans at the end and write them with the notes. Undo
  during a take ends it first, as now, so lanes and notes undo together.
* **Live display:** a lane being written is drawn as it grows in the clip editor and on the timeline (they read the
  project), as notes are.

### The view

* MIDI settings → *Recording*: **Recorded CCs**, a row of the ticked CCs (*74 Brightness ×*), *Add CC…* (a number field,
  0 to 119, not 1 or 64) and *Learn* (adds the next unmapped CC that arrives, then stops), with a line: *Pitch bend,
  pressure and the mod wheel are always recorded.*
* Feedback as above; nothing else changes on the transport bar.

## Steps

1. **Spans** (`core/record`): the event kind, `expressionSpans`, `placeSpan`, `applyExpression`, `splitLanes`. Tables:
   bend spans (centre to centre, a return that never comes, a jump straight past 0), pressure spans, CC spans and the
   800 ms gap, early events, a span across a clip's wrap and across the brace's jump with a lead-in, later passes
   replacing earlier ones, overflow, a split past 256 beats.
2. **Settings** (`state/record-settings`): `recordedCCs`, validation, storage. Tests: load, bad values dropped, sorted.
3. **The recorder** (`state/record-store`): `recordExpression`, per-take lanes, writing at span ends and per bar, slot,
   overdub and region takes, ending, limits, feedback. Tests: a slot take with bend and CC 1 makes two lanes and one undo
   step with the notes; an overdub's second pass replaces only its span; an unticked CC isn't recorded and a ticked one
   is; an Arrangement take across the brace; a region made by expression alone; undo during a take.
4. **The adapter** (`app/midi-input`): recordable controls with timestamps; a routing change ending spans. Tests with
   fake ports and a fake clock.
5. **The view:** *Recorded CCs* with *Add CC…* and *Learn*.
6. **Browser tests and docs:** below; `architecture/midi.md` (recording expression), `control-and-automation.md` (lanes
   written by takes); decisions; STATUS; the spec moves to `archive/midi-expression/` with the three plans.

## Behavior changes

* ● records pitch bend, pressure and the mod wheel as lanes with the notes, which can make a take's undo step larger,
  and a clip or region gains lanes it didn't have.
* Unticked CCs still play live and aren't recorded.
* MIDI settings get *Recorded CCs*.

## Verification

* **Unit (`core`, `state`, `app`):** as in the steps.
* **Browser smoke (fake ports):** arm, ● a slot, play a note with a bend up and back and a mod wheel move, end: the clip
  has a *Pitch bend* and a *CC 1* lane with the shapes played; undo removes notes and lanes, redo brings them back,
  reload keeps them; tick CC 74 and record a move; an overdub pass replaces its span.
* **Browser audio (real worklet):** a bend recorded at known timestamps plays back at the pitch and beat it was played,
  within a render quantum and the timestamp precision (read as a level, as in part 1's test).
* **By hand** (V5): a real keyboard's wheel and pressure recorded at 90 and 140 BPM, played back, then overdubbed.

## Decisions to sign off

Signed off 2026-11-06: every decision as proposed.

| # | Decision | Proposed | Alternatives |
|---|---|---|---|
| R1 | *Recorded CCs* | **A browser preference, empty at first**, in MIDI settings' *Recording*, with *Add CC…* and *Learn* (spec decision 8 made it a preference) | A list per input device; or per project |
| R2 | How a CC span's 800 ms gap is measured | **On the events' own timestamps** (ms), so a tempo change doesn't stretch it | In beats at the tempo of the moment |
| R3 | When lanes are written | **At each span's end and once per bar while one is open**, under the take's key | Only when the take ends (simpler; lanes appear late and an overdub pass can't hear them on the next pass) |
| R4 | A lane past 2048 points | **That lane stops recording; notes and other lanes go on**, with a notice (the spec says so) | Thin the lane harder and go on (a looser simplification than touch's) |
| R5 | A track routing takes away mid-span | **Its open spans end there**; the rest the adapter sends isn't recorded | Record the rest as a value (the lane drops to 0 at the switch) |
| R6 | A span crossing a 64-bar region split | **Goes on in the next region**, starting with a point that holds its value | Cut it at the split |

## Changes made while implementing

None yet.
