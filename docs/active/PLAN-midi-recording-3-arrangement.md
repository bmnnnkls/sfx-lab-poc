---
status: active
date: 2026-11-05
note: "Part 3 of the MIDI recording spec: recording into the Arrangement. Signed off 2026-11-05, every decision as proposed; not built yet."
---
# MIDI recording, part 3: recording into the Arrangement

Status: **plan, signed off** 2026-11-05, every decision as proposed. Written 2026-11-05 on `imp/midi-recording-part3-plan`, branched from
`imp/ecstatic-lehmann-5efb9d` at `83cc366` (parts 1 and 2 done, neither merged). No code was changed. Carries out
part 3 of the signed-off [MIDI recording spec](SPEC-midi-recording.md#parts), after
[part 1](../archive/midi-recording/PLAN-midi-recording-1-session.md) and
[part 2](../archive/midi-recording/PLAN-midi-recording-2-overdub.md). The spec's decisions 1 to 16, part 1's P1 to P6
and part 2's O1 to O6 are settled and not repeated. This part replaces O7. It adds only the decisions it raises
(A1 to A10). Where it differs from the spec, it says so.

## Goal

After this part:

* with **● Rec on**, ▶ *Arrangement* records **every armed track** from the position. Each track that got at least one
  note gets **one new region**, from the start of the bar where recording began to the end of the bar where it ended;
* **punch in and out**: turning ● Rec on or off while the arrangement plays starts or ends recording there;
* with the **loop brace** on, the passes are **merged into one region**: what you play on each pass is added to it;
* a take **longer than 64 bars** goes on in a new region, with nothing lost;
* with a count-in set, ▶ *Arrangement* from a stopped transport **counts in** first;
* the region being recorded **grows on its lane in red**, and notes appear in it as they end;
* a recording pass is **one undo step**.

Regions under the new one are left alone (spec decision 7). Takes per pass, comping and split are still wishes.

## Inventory

What part 3 builds on, beyond [midi.md](../architecture/midi.md#recording-notes-into-a-clip) and
[clips-and-arrangement.md](../architecture/clips-and-arrangement.md#the-arrangement-clips-on-a-timeline).

### Regions

* `ClipRef` (`core/project/clip-ref.ts`) addresses a session clip or a region's content: `regionClipRef(regionId)`.
  `setClipNotes` and `setClipLength` already take one. `setClipLength` trims notes past the new length.
* `createArrangementClip(trackId, startBeat, content)` makes a region with a fresh id and clamps its start to the
  timeline (4096 beats). `updateArrangementClip` edits start, track, loop or content. New regions are appended, so they
  are drawn last, on top.
* The arrangement plays what the position covers. A note written behind the playhead doesn't sound until the
  playhead passes it again (the next pass of the brace). `arrangement/set` sends the whole region list on every edit.
* The selection holds **one** region, and selecting it also selects its track (`selectRegion`).

### Transport, loop and clock

* ▶ *Arrangement* is `playArrangementFromPosition` (toolbar button). A ruler click while the arrangement plays
  **seeks** through the same `playArrangement(fromBeat)` (`state/arrangement-transport.ts`). ■ stops and leaves the
  position. Space plays the Session.
* `EngineControls.playArrangement` is **not** wrapped for a count-in yet (`app/engine-controls.ts`). The engine already
  accepts `transport/countIn { then: arrangement/play }`. After the count-in, the clock jumps from 0 to the position,
  stamped as a clock edge.
* The loop jump (`Transport.loopJump`, `Engine.seekArrangement`) and a command seek both go through `Transport.seek`.
  The clock packet after either one carries only `{ tempo, playing, beat, countIn }`.
* `RecordingClock` keeps anchors of beat against audio time. After a loop jump, beats **go backwards**. Nothing says
  how many jumps happened between two times, and nothing separates a loop jump from a seek.

### The take model

* `pair()` **sorts events by beat** before pairing. With beats that go back at each jump, a note-on of pass 2 would sort
  before a note-off of pass 1 and pair wrongly. A note held across a jump would end before it starts.
* `loop: { anchor, length }` places a note at `(on - anchor) mod length`, relative to the clip's start, and cuts it at
  the clip's end. It assumes the take's events run forward in time and that positions are counted from `anchor`.

### The recorder

* One take per track, `kind: 'slot' | 'overdub'`, addressing its clip by `trackId` and `clipId` (`sessionClipRef`).
  `write` appends new notes to the clip. `TakeView` exposes `clipId` and `scene`.
* `recFeedback` says *Recording into the Arrangement isn't available yet* in Arrangement mode (O7).
* **Every take commits under its own key** (`record:<take id>`). `commit` merges an edit only with the last edit's key,
  so **two takes running at once split each other into many undo steps**. This already happens in the Session with two
  layered armed tracks. Part 3 records every armed track at once, so it must not.

### The view

* `ArrangementRegion` draws a region and handles its drag and resize. Nothing marks a region as recording.
* The arm button is already on `ArrangementHeader` (P6).

## Design

### Take time: counting passes and runs (`core/engine`, `audio`)

A take needs times that only go forward, even when the playhead jumps back. The engine counts both kinds of jump
(decision A1):

* **`lap`**: how many loop jumps since this run began. The loop-jump branch of `render` adds one.
* **`run`**: a counter that grows by one at every start (from stopped, or at the start of a count-in) and every seek
  while playing (`arrangement/play` while the arrangement plays). A new run sets `lap` to 0. A stop doesn't change
  `run`, so the next start is always a new one.
* `Engine.clock()` and the status carry both. `RecordingClock` stores them in each anchor, makes a new anchor when
  either changes, and gains `position(audioTime): { beat, lap, run } | undefined`. `beat()` stays for touch.
* `AudioHost.recordingPosition(agoMs)`, and in `state/record-clock.ts`, `recordPosition(timestamp)` and
  `transportPosition()`, mirror `recordBeat` and `transportBeat`, including the latency and the count-back near a start.
  The MIDI adapter passes a position instead of a beat. The recorder turns it into the take's own time.

**Take time** for an arrangement take with the brace `[from, to)`, length `L = to − from`, is
`u = beat + lap × L`. It only goes forward within one run. A take keeps only events of **its own run**, so a note
played just before a seek can't land in the take after it, even though its beat is valid in the old run.

**Count-in beats.** The count-in is part of the run it starts, at beats −4 × bars up to 0, and then the clock jumps to
the position P. A negative beat can only come from a count-in, so the recorder reads it as `P + beat`. The early
rule then decides (kept on P within a sixteenth, else dropped). For a Session start, P is 0, so nothing changes there.

### The take model: one region across passes (`core/record/take.ts`)

Arrangement events are given to the take model in **take time**, so pairing, the pedal and the early rule work
unchanged. `loop` is reused with the brace as anchor and length, plus a new **`origin`** (decision A2):

```ts
interface TakeLoop {
  anchor: number   // Session: the clip's startBeat. Arrangement: the brace's `from`.
  length: number   // Session: the clip's length. Arrangement: the brace's length.
  /** Where positions are counted from; the anchor by default. Arrangement: the region's start on the timeline. */
  origin?: number
}
```

* A note's place on the timeline is `t = u` while `u < anchor + length` (the first pass, and any lead-in before the
  brace), else `anchor + ((u − anchor) mod length)`. Its position in the region is `t − origin`.
* It is cut at the end of the pass: its length is at most `anchor + length − t`. At a loop jump the engine releases
  held notes, so what you heard was cut there too. The part after the jump isn't recorded, as in Session overdub.
* Without `origin`, positions match part 2 exactly, since a Session overdub's notes never start before the anchor.
* A take that starts at or after the brace's end never loops, so it is given **no** `loop`, and positions are
  `t = u`, counted from the region's start.

**The 64-bar chain** (decision A7). `splitRegions(notes, every = 256)` cuts a take's notes into consecutive regions,
256 beats each from the first region's start. A note held across a split becomes two: one to the end of its region,
and one from the start of the next, with the same pitch and velocity and the id `<note id>~<n>`. It's pure, and
tested as a table.

### Arrangement takes (`state/record-store.ts`)

A third kind, `kind: 'region'`, beside `'slot'` and `'overdub'`. One take per track still applies.

* **What it keeps:** `run`, the run it records in; `start`, in take time; `origin`, the start of the bar where it
  began, on the timeline; `loop`, when the brace is on and `start` is before its end; `regions`, the ids of the regions
  it has made so far, in order (empty until the first note); and `pass`, the key it commits under (below).
* **Addressing.** A take writes its regions through `regionClipRef(regionId)`, and writes each region **whole**:
  `{ startBeat, content: { lengthBeats, notes } }` in one `updateArrangementClip`. Writing whole keeps it simple
  when the region's start moves (the loop below) and when notes split across a chain. Only the regions whose content
  changed are written.

**Opening.**

* **▶ *Arrangement* with ● Rec on** (`startArrangementTakes(P)`, called by `EngineControls.playArrangement` before it
  sends): one queued take per armed track, starting at P, with early notes allowed. The take adopts the **first run
  higher than the one current at the press**, as the clock or status reports it, and keeps only events of that run.
  Events that come before the take knows its run are held and filtered once it does. This includes notes played in
  the count-in.
* **Punch in** (● Rec turned on while the arrangement plays) and **arming a track** while recording: a take from the
  press, in the current run, with **no** early notes, as at a punch-in in the Session (part 2).
* With ● Rec on but nothing armed: *Armed tracks: none*, and the arrangement plays as usual.

**Where a region starts and ends** (spec § Arrangement 2, decision A3).

* Without a loop: from the start of the bar where recording began (`origin`, so a punch-in at beat 6 starts the region
  at beat 4) to the end of the bar where it ended (a punch-out at 6.5 ends it at 8). At least one bar.
* Once a take has looped (`lap` has gone up since its start), its region becomes **the brace exactly**, extended back
  to `origin` when recording began before the brace. A punch-in inside the brace at beat 6, with the brace on beats
  2 to 12, makes a region on beats 4 to 8 at first. At the jump it becomes 2 to 12, because pass 2 can put notes
  anywhere in the brace. Its end stays at the brace's end, even after a punch-out.
* Before the take loops, the region's end never goes past the brace's end, since the playhead jumps there.

**Growing** (decision A4). The region appears when the take's **first note ends**, from `origin` to the end of the
current bar. While the take runs, each status that finds the playhead in a later bar extends it to the end of that
bar, as part of the take, so a note always ends inside it. That is one small edit per bar (2 s at 120 BPM). A track
that never gets a note never gets a region. Until then, the view shows a red outline from `origin` to the playhead
(below), which is not in the project.

**Writing.** After each event, `finishedNotes` in take time, mapped and split as above, gives the regions' notes. The
regions that changed are written under the pass's key. A note that ends now lands behind the playhead. With the brace
on, it plays from the next pass, which is the overdub across passes the spec asks for.

**Chaining.** When the playhead reaches 256 beats past the current region's start, the next region starts there and
grows the same way. A region full at 5000 notes ends that track's take with a notice (spec § What a take captures).
The timeline's end (4096 beats) ends the take with *The timeline ends here: the take ended*.

**One undo step per pass** (decision A8). The takes opened together (one ▶, one punch-in, one seek) commit under one
key, `record:<pass id>`. A track armed during the pass joins that pass's key. Undo removes every region the pass
made. The Session's takes that run at the same time share a key in the same way, which fixes the split undo steps
found above.

**Ending.** An arrangement take closes its held notes at its end, writes everything, and sets the last region's end.
It ends on:

* **● Rec off** (punch out) or **disarming**: at the press;
* **■**: at the stop's beat (`stopTakes`, as now). ● Rec stays on, and the next ▶ records again;
* **a seek** (a ruler click while playing; decision A5): at the press. The seek opens new takes from the new position,
  in the new run: new regions and a new undo step. Every seek through `setArrangementPosition` counts, from the ruler, a marker or the keys;
* **the Session taking over** (a clip or scene launched): at the switch, read as part 2 reads it (`status.mode`). The
  Session's overdub rules then apply to armed tracks with playing clips;
* **the brace changed** (range, or on and off; decision A6): at the change, with a new take opened from there. The
  brace defines where passes fall, as a clip's length does for overdub (O6);
* **undo or redo**: first, as now (`guardHistory`). With ● Rec still on, the next status opens new takes from there;
* **its region removed, or changed by anything but the take** (decision A10): at that moment. The region is left as it
  is, and no new take opens on that track until ● Rec, ▶ or the arm is pressed again;
* **the track removed, or a new document**: dropped, as now;
* **5000 notes in a region, or the timeline's end**: with a notice.

**At the end** (decision A9): if the selected track recorded a region in this pass, its last region is selected, so the
selected track, and with it the keyboard's routing, doesn't move. Feedback: *Recorded 8 bars on Bass, Lead*, or
*Nothing played: no region made*.

**Count-in.** `EngineControls.playArrangement` goes through the same `start()` as ▶ and launches. `countInBars()`
returns the setting from a stopped transport with ● Rec on, extending O1 ("any start with ● Rec on") to ▶
*Arrangement*. A seek is played, so it never counts in. ■ during the count-in drops the queued takes (*Count-in
stopped: nothing recorded*). They made nothing yet, so there is nothing to remove.

### The view

* **The recording region** is drawn red (a `recording` flag on `ArrangementRegion`, read from `TakeView`), on top, with
  its notes as for any region. It can't be dragged, resized or deleted from the view while it records. Its menu has
  *Stop recording*, which ends that track's take as disarming does.
* **Before the first note**, an armed track's lane shows a red outline from `origin` to the playhead, so it is clear
  what is recording. It goes when the region appears or the take ends.
* **`TakeView`** gains `kind: 'region'` and `regions` (ids). `clipId` and `scene` stay for the Session kinds.
* **● Rec's tooltip** says what it does in both modes: *Record: overdub into playing clips in the Session, record new
  regions in the Arrangement*. O7's feedback goes.

### What doesn't change

No saved field and no format bump: a recorded region is an ordinary region. Exports are unchanged. Touch keeps
`recordingBeat`. Round 12d (touch into the arrangement) can later read `lap` and `run` the same way.

## Steps

1. **The take model** (`core/record/take.ts`): `origin` in `TakeLoop`, the lead-in rule, `splitRegions`. Tables:
   * a lead-in note before the brace, then notes in passes 1 and 3;
   * a note held across the jump, cut at `to`;
   * a punch-in in pass 3 (take time already offset by 2 × L);
   * a brace that isn't bar-aligned, with `origin` before `from`;
   * a take after the brace's end (no loop);
   * a note held across a 256-beat split, split in two;
   * part 2's tables unchanged without `origin`.
2. **The engine** (`core/engine`): `lap` and `run` in `Engine`, `clock()` and the status. Tests:
   * a loop jump at block sizes 1, 97, 128 and 4096 adds one lap;
   * a seek while playing and a start add one run and reset `lap`;
   * a count-in and its start make one run, not two;
   * a stop leaves `run` alone.
3. **The clock** (`audio/recording-clock.ts`, `audio-host.ts`, `state/record-clock.ts`, the worklet): `position()`,
   `recordingPosition`, `recordPosition`, `transportPosition`; the adapter passes positions. Tests: a time before and
   after a jump; a time across a seek; the count-in segment.
4. **The recorder** (`state/record-store.ts`):
   * region takes: opening (▶, punch-in, arm), run adoption, take time and count-in beats;
   * writing regions whole, growing, the loop's region edges, chaining;
   * every ending above, and the selection at the end;
   * the pass key, for region takes and for Session takes that overlap;
   * feedback.
5. **Engine controls** (`app/engine-controls.ts`, `state/arrangement-transport.ts`): `playArrangement` counts in and
   calls `startArrangementTakes`; a seek ends the takes first.
6. **The view:** the red recording region and its lock, the outline before the first note, *Stop recording*, ● Rec's
   tooltip.
7. **Browser tests and docs** (below):
   * `architecture/midi.md`: recording into the Arrangement, take time;
   * `clips-and-arrangement.md`: the recording region, `lap` and `run` in the clock after a jump;
   * the decisions, the spec's status, and the spec and its three plans to `archive/midi-recording/`.

## Behavior changes

* With ● Rec on, ▶ *Arrangement* records armed tracks into new regions. It used to record nothing and say so (O7).
* With ● Rec on and a count-in set, ▶ *Arrangement* from a stopped transport counts in first.
* A ruler click while recording ends the takes there and starts new ones from the click.
* Two Session takes running at once are one undo step, not many.
* The engine's status and clock packets carry `lap` and `run`. No saved field, no format bump, exports unchanged.

## Verification

* **Unit (`core`):** the take model's tables (step 1); the engine's counters (step 2).
* **Unit (`audio`):** `RecordingClock.position` across a loop jump, a seek, a stop and a count-in.
* **Unit (`state`, `app`), with a fake clock and status:**
  * ▶ from P mid-bar: the region starts at P's bar and holds the notes at their beats; an early note at P is kept;
  * punch in at beat 6 and out at 6.5: one region on beats 4 to 8; a punch-in note just before the press is dropped;
  * two armed tracks, one played: one region, on the played track only;
  * the brace on: three passes into one region spanning the brace; a lead-in from before it; a note held across the
    jump, cut;
  * a brace change during a take: two takes, two regions;
  * a seek: the first take ends at the press; the second starts at the click; a stale event from the old run is
    dropped;
  * ■, a clip launched, undo during a take, the region deleted, the region moved;
  * 70 bars: two regions, adjacent, a held note split across them;
  * count-in: a note in it within a sixteenth of P lands on P; ■ during it leaves nothing;
  * one undo step for a pass on two tracks, and for two overlapping Session slot takes;
  * the region grows a bar at a time, and the selection at the end.
* **Browser smoke (fake ports):**
  * arm two tracks, ● Rec, ▶ *Arrangement*, play on one, ■: one region where played, with the notes;
  * the region is red while recording and grows;
  * the brace on, two passes: one region, the second pass's notes in it;
  * undo removes the pass, redo brings it back, reload keeps it.
* **Browser audio (real worklet):** a take over two passes of a one-bar brace, with notes stamped on known beats of
  each pass, plays back on those beats within a render quantum. As in parts 1 and 2, the absolute placement against
  `performance.now()` is left to the unit tests and V5.
* **By hand (V5):** a real keyboard, recording 8 bars from bar 5, punching in and out by F9, and a 2-bar loop over
  three passes, at 90 and 140 BPM.

## Decisions to sign off

Signed off 2026-11-05: every decision as proposed.

| # | Decision | Proposed | Alternatives |
|---|---|---|---|
| A1 | How the recorder knows which pass and which run an event is in | **The engine counts** loop jumps (`lap`) and starts or seeks (`run`), in the clock and the status | The recorder infers passes from beats going back (fails when a note is held over two passes, or a pass has no events); or the worklet flags loop edges and the clock counts them |
| A2 | How notes across loop jumps map into one region | **Take time** (`beat + lap × L`) so events only go forward, and part 2's `loop` with the brace as anchor and length, plus an `origin` (the region's start) | Events keep `(lap, beat)` and a separate arrangement mapping; or a take per pass, merged when the take ends |
| A3 | A looped region's edges | **The brace exactly**, extended back to the bar recording began in, if that is before the brace | Rounded out to whole bars on both sides; or only the bars the playhead crossed while recording |
| A4 | When the region appears | **At the first note's end**, growing a bar at a time; a red outline (view only) before that | In the project from the punch-in, removed at the end if empty (create and remove in one step); or only at the end of the take (no live notes, against spec decision 10) |
| A5 | A seek while recording | **Ends the takes there and opens new ones** from the new position (new regions, new undo step) | Ends recording (● Rec off); or ignores seeks while recording |
| A6 | The brace changed or toggled during a take | **Ends the take and opens another**, as a clip's length change does for overdub (O6) | Keeps the take, mapping by the old brace |
| A7 | A note held across a 64-bar split | **Split in two**, the second half starting the next region: playback still holds it, with a retrigger | Cut at the split (as at a loop jump, where the engine also cuts what you hear) |
| A8 | Undo steps when several tracks record | **One step per pass**: takes opened together share a key; and Session takes that overlap share one too, fixing parts 1 and 2's split steps | One step per track (still needs the interleaving fixed); or leave the Session as it is and log it in the backlog |
| A9 | The new region's name and the selection | Content named after the **track** (*Bass*); at the end, the selected track's new region is **selected**, so the selected track and routing don't move | Named `Clip N`; or select the last region made on any track (moves the selected track) |
| A10 | Editing a region while it records | **Locked in the view**; any other change to it (the palette, a script) ends its take and leaves the region as it is | Allow edits and keep writing (the take would overwrite them) |
