---
status: done
date: 2026-11-05
shipped_in: architecture/midi.md
note: "Part 2 of the MIDI recording spec, done: ● Rec, Session overdub, count-in, the ● Rec menu. Not checked with a real keyboard (backlog V5)."
---
# MIDI recording, part 2: overdub and count-in

Status: **done** 2026-11-05 on `imp/ecstatic-lehmann-5efb9d` (on top of part 1, neither merged). Signed off 2026-11-05,
every decision as proposed. Shipped in [midi](../../architecture/midi.md#overdub-and-count-in),
[clips-and-arrangement](../../architecture/clips-and-arrangement.md#recording-into-a-slot) and
[mixing-and-routing](../../architecture/mixing-and-routing.md#the-master-bus); not checked with a real keyboard
([BACKLOG](../../BACKLOG.md) V5). Written 2026-11-05 on `imp/midi-recording-part1-b60ea0` at `78d38e6`, after
[part 1](PLAN-midi-recording-1-session.md). Carries out part 2 of the signed-off
[MIDI recording spec](SPEC-midi-recording.md#parts). The spec's decisions 1 to 16 and part 1's
P1 to P6 are settled and not repeated; this plan adds only the ones it raises. Where it differs from the spec, it says
so.

## Goal

After this part:

* **● Rec** in the transport bar (`transport.record`, **F9**) turns recording on and off. It is transient, like
  ● *Touch*;
* with ● Rec on, what you play over a **clip playing on an armed track** in the Session is **added** to it, pass after
  pass, until ● Rec goes off or the clip stops (overdub). Each overdub is one undo step;
* an optional **count-in** of 1 or 2 bars clicks before a take that starts from a stopped transport, then starts it;
* **● Rec's ▾ menu** holds the fixed length, the count-in and the metronome level. ♩ is only the metronome toggle.

**Out of scope:** recording into the Arrangement (part 3). With ● Rec on in the Arrangement, nothing records yet
(decision O7).

## Inventory

What part 2 builds on, beyond the [spec's inventory](SPEC-midi-recording.md#inventory) and
[midi.md](../../architecture/midi.md#recording-notes-into-a-clip).

### The take model (`core/record/take.ts`)

* `takeNotes(events, { id, start, end, early })` and `finishedNotes(events, range, now)` pair events into notes and
  return them **relative to `start`**. Notes before `start - early` or at or after `end` are dropped. A note on in
  `[start - early, start)` is moved onto `start`. Nothing wraps: a part 1 take is one pass from the clip's start.
* Note ids are `<take id>:<note-on index>`, so they don't clash with the notes a clip already has.

### The recorder (`state/record-store.ts`)

* One take per track: `{ id, trackId, clipId, scene, state, start?, end?, events, written }`. It always makes a **new
  clip** (`recordInSlot`). Its edits commit under `record:<take id>` with no merge window.
* `reconcileRecords(status)` runs on each status. It starts a queued take when its clip plays (`startBeat`), ends one
  when the status passes its end, and gives up a take whose clip isn't reported queued or playing within 2 s
  (`LAUNCH_WAIT_MS`).
* `guardHistory(endTakesNow)` ends every take before undo and redo. `stopTakes` runs from `EngineControls.stop`.
* Touch (`state/touch-store`) is the overdub precedent. It writes into the owner's **playing** clip at
  `(beat - startBeat)`. A capture whose clip, start or length changes is finished, and a new one starts.

### The engine and the clock

* `transport/play`, `clip/launch`, `scene/launch` and `arrangement/play` start the transport at once. A clip launched
  from a stopped transport starts at beat 0. Nothing can start it later.
* `Metronome.mixInto(…, fromBeat, beatsPerSample)` clicks whole beats while `fromBeat` isn't null, and only when ♩ is
  on. The level comes with every `transport/metronome`, on or off.
* The worklet (`audio/worklet/engine-processor.ts`) posts a `clock` message on any `transport/*`, `arrangement/*` or
  `*/launch` command, stamped at the call's `currentTime`. It posts another for a loop jump, stamped at the jump's own
  frame (`Engine.lastJump()`). `RecordingClock` keeps anchors `{ beat, audioTime, tempo, playing }` and clamps beats at
  0. It returns nothing across a stop.
* `recordBeat` counts back from the event's own beat when the latency puts it before a start (part 1, step 3). So a note
  on the first beat isn't lost, but anything earlier is (P3).

### Settings and the view

* `useRecordSettings`: `metronome`, `metronomeLevel`, `fixedBars`, `latencyOffsetMs`, saved under `sfxlab:record` and
  restored field by field.
* `RECORD_MENU` (`ui/commands/menus.ts`) is ♩'s ▾: `transport.metronome`, `transport.metronome-level`,
  `transport.fixed-length`.
* `transport.play-stop` (Space) plays or stops by `status.playing`.
* `MidiClipSlot` draws a recording slot red with ●. Nothing marks an overdub.

## Design

### ● Rec

* `useRecordStore` gains `rec: boolean` and `setRec(on)`. It is transient: not saved, not undone, and off in a new
  document.
* `transport.record` toggles it, with F9 as the default key (scope `outside-text`, like the editing keys). The ● Rec
  button in the transport bar sits after ● *Touch*. It has `aria-pressed` and turns red while on.
* Feedback, after touch's: *Overdubbing Bass, Lead* while takes run; *Armed tracks: none* when ● Rec goes on with
  nothing armed; *Launch a clip on an armed track to overdub* when armed tracks have nothing playing.

### Session overdub

* **Which clips.** While ● Rec is on and the engine plays the Session (`status.mode === 'session'`), every **armed
  track with a playing clip** has an overdub take on that clip. A track with a part 1 take (a new clip recording) has
  that take instead.
* **The take** is the part 1 `Take` with a kind: `kind: 'slot' | 'overdub'`. An overdub take also keeps:
  * `anchor`: the clip's `startBeat`, which its passes are counted from;
  * `from`: the beat it records from;
  * `length`: the clip's length when the take opened.
* **Opening.** `reconcileRecords` opens overdub takes as clips, arms and ● Rec change. `from` is the latest of:
  * the beat ● Rec went on (`transportBeat()` at the press);
  * the beat the track was armed;
  * the clip's `startBeat`;
  * the end of a part 1 take on the same clip (decision O4).

  Overdub starts and stops at the press, not on a bar (decision O3).
* **Early notes** count only when `from` is the clip's own start, that is the clip was launched with ● Rec on. A punch
  in the middle of a clip keeps no notes from before it. After a slot take, the slot take has already kept the notes
  around the boundary, so there is nothing to double.
* **Writing.** As in part 1, each note is written into the clip when it ends, under `record:<take id>`. The clip is
  swapped into the engine as it plays (`LaunchQueue.sync`). A note ending now starts before the play position, so it
  sounds from the next pass on. An overdub that records nothing makes no edit and leaves no undo step.
* **Ending.** An overdub take closes its held notes and ends on any of these:
  * ● Rec off;
  * the track disarmed;
  * the clip stopped or replaced (at the boundary the status reports);
  * the transport stopped;
  * the playback mode leaving the Session;
  * undo or redo (`endTakesNow`, as now);
  * 5000 notes in the clip, with a notice.

  It has no 64-bar limit: the clip's length bounds it.
* **A relaunch or a length change** ends the take and opens a new one, as a touch capture does (decision O6). Both
  move where the passes fall.
* **Clips not armed** are never touched. A part 1 take is unchanged by ● Rec, except that it flows into an overdub when
  it ends (O4).

### The take model: passes and cutting (`core/record/take.ts`)

`takeNotes` and `finishedNotes` gain an optional **loop** on their range:

```ts
interface TakeRange {
  id: string; start: number; end?: number; early?: number
  /** Overdub: notes go into a clip of `length` beats that started at `anchor`; positions wrap by the length. */
  loop?: { anchor: number; length: number }
}
```

* Without `loop`, nothing changes. A part 1 take still returns notes relative to `start`.
* With `loop`, `start` is the overdub's `from`. A note keeps its window rules: it is dropped before `start - early` and
  at or after `end`, and moved onto `start` if early. It is then placed at
  `pos = (on - anchor) mod length`, snapped to 0 within 1e-9 of `length`.
* **Cutting at the clip's end:** the note ends at `min(off, on + (length - pos))`. So a note held across the loop end
  stops at the end of the clip. The part after the wrap isn't recorded (spec § Session: overdub). The minimum length
  (1/128 beat) still applies, and is then clamped so the note stays inside the clip.
* Pairing, the pedal, a repeated pitch and note ids are unchanged. The tables gain:
  * a note in pass 1 and pass 3;
  * a note held across the end;
  * a pedal held across the end;
  * an early note at the anchor, and one at a punch-in (dropped);
  * an anchor before `start` (punch-in in pass 2);
  * fractional lengths (3 beats, 2.5 beats).

### Count-in

**The engine.** A new command:

```ts
| { type: 'transport/countIn'; bars: number; then: CountInStart }
type CountInStart =
  | { type: 'transport/play' } | ClipLaunch | SceneLaunch | { type: 'arrangement/play'; fromBeat?: number }
```

* **From a stopped transport**, the engine counts `4 × bars` beats at the current tempo, then applies `then` at the exact
  frame the count-in ends. `render` splits a block at that frame, as it already does at the loop's end. While the
  transport is playing, or with `bars` 0, `then` runs at once.
* **The clicks.** The metronome clicks the count-in's beats (−8 … −1, the bar's first beat accented), **even with ♩
  off**, at the metronome's level (decision O2). `mixInto` takes the count-in's beat as `fromBeat`, and a `force` flag.
  Tracks render as when stopped: live notes sound, clips don't.
* **During a count-in:**
  * `transport/stop` cancels it;
  * `clip/launch` and `scene/launch` queue their clips without starting the transport, so they start with it
    (decision O5);
  * another `transport/countIn` replaces `then`;
  * a tempo change applies at once.
* **The status** reports `countIn: { barsLeft, beat }`. `barsLeft` (2, 1) is for the view. `beat` is the count-in's
  position, from −4 × bars up to 0, for the clock. The spec names only `barsLeft`; `beat` is added for the clock.
  `playing` stays false until the start.
* **Bounce:** a bounce never sends `transport/countIn`, and a fresh engine has none, so exports are unchanged.

**How the recording clock anchors the start.** A note played during the count-in, or on the first beat, needs a beat,
and that start falls in the middle of a render call:

1. **The count-in itself is a segment of the clock.** `Engine.clock()` and the status carry the `countIn` beat. When
   it is present, `RecordingClock.update` treats it as a running anchor at that negative beat. `beat()` may then return
   down to −4 × bars on that segment (the 0 clamp stays for everything else). So a note in the count-in has a negative
   beat, and the take's early rule decides it: kept on the first beat within a sixteenth, else dropped. This answers P3.
2. **The start is stamped like a loop jump.** `Engine.lastJump()` becomes `lastClockEdge()`. It reports the frame and
   the beat where the transport started inside the render call, as well as a loop jump. The worklet posts it as a
   `clock` message at `currentTime + frame / sampleRate`, as it does for a loop jump today. A Session start is beat 0,
   so the segment simply carries on from the count-in. An `arrangement/play` from position P jumps from 0 to P at that
   exact time, which part 3 needs.
3. **No new path for the recorder.** `recordBeat` reads `recordingBeat` as before. Its count-back for a note just after a
   start stays for starts without a count-in.

**When there is a count-in** (decision O1). The count-in setting is *Off* (default), 1 or 2 bars. It applies only from
a stopped transport, and not already counting in, when:

* the slot's ● starts a take, or
* ● Rec is on and the Session starts: ▶, a clip or a scene.

`state/record-store` exports `countInBars()`, and `app/engine-controls` wraps `play`, `launchClip` and `launchScene`
to send `transport/countIn { bars, then }` when it is non-zero. `recordInSlot`'s `launch` goes through the same path.
`playArrangement` is left alone until part 3.

**The recorder during a count-in.** A queued take whose status reports `countIn` waits: the 2 s give-up counts from the
count-in's end, not the press. ■ during a count-in cancels it and drops the take. The **empty clip** made for it is
removed, under the take's key (decision O5). `transport.play-stop` (Space) stops during a count-in, as it does while
playing.

### The ● Rec menu and ♩

* **Settings:** `countInBars: 0 | 1 | 2` is added to `RecordSettings` and restored field by field, so a saved object
  without it gets *Off*. There is no new key and no migration.
* **Commands:** `transport.count-in` gives the choices *Off*, *1 bar* and *2 bars*.
  `RECORD_MENU` becomes ● Rec's ▾ and holds:
  * `transport.fixed-length`;
  * `transport.count-in`;
  * `transport.metronome-level`.

  ♩ loses its ▾ and keeps its toggle (P1 said part 2 moves them).
* **Transport bar:** ▶ ■ ● *Touch* ● *Rec* ▾ ♩, then the feedback. During a count-in, the feedback slot shows
  *Count-in 2 … 1*, with ▶ lit and dimmed.
* **Slots:** an overdubbing clip's slot shows a red dot beside its name (spec § The view). A part 1 recording slot is
  unchanged.

## Steps

1. **The take model** (`core/record/take.ts`): `loop` in `TakeRange`, wrapping and cutting, in both functions; the
   tables above.
2. **Count-in in the engine** (`core/engine`): the command and the type, the count-in state in `Engine`, the block
   split, the forced clicks, `countIn` in the status and `clock()`, and `lastClockEdge()`.
   Tests:
   * the start frame at 120 and 97 BPM, 44.1 and 48 kHz;
   * the clicks with ♩ off;
   * launches joining;
   * stop cancelling;
   * a tempo change during the count-in;
   * a bounce unaffected.
3. **The clock** (`audio/recording-clock.ts`, the worklet): the count-in segment with negative beats, and the start
   stamped at its frame. The worklet's tests follow the loop-jump test.
4. **Settings and commands** (`state/record-settings.ts`, `state-commands.ts`, `keybindings.ts`, `menus.ts`):
   `countInBars`, `transport.record` with F9, `transport.count-in`, and the menu move.
5. **The recorder** (`state/record-store.ts`, `app/engine-controls.ts`):
   * `rec` and `setRec`;
   * overdub takes (opening, `from`, early notes, writing with `loop`, ending, relaunch and length changes);
   * a slot take flowing into overdub;
   * `countInBars()` and the wrapped starts;
   * waiting and cancelling during a count-in;
   * feedback.
6. **The view:** the ● Rec button and its ▾, ♩ without ▾, the overdub dot, the count-in readout, and Space during a
   count-in.
7. **Browser tests and docs** (below):
   * `architecture/midi.md`: overdub, count-in, the ● Rec menu;
   * `clips-and-arrangement.md`: the slot during a count-in;
   * `mixing-and-routing.md`: the count-in clicks;
   * the decisions, and the spec's status.

## Behavior changes

* The transport bar gets **● Rec** with a ▾. ♩'s ▾ goes: the fixed length and the metronome level move to ● Rec's menu,
  beside the new count-in.
* **F9** toggles ● Rec. It was unbound.
* With a count-in set, pressing ● on a slot from a stopped transport waits 1 or 2 bars before the take, clicking even
  with ♩ off. With count-in *Off* (the default), part 1's behavior is unchanged.
* With ● Rec on, playing over a clip on an armed track adds notes to it.
* No saved field and no format bump. Exports are unchanged.

## Verification

* **Unit (`core`):**
  * the take model's new tables;
  * the count-in's start frame, its clicks (accent, ♩ off, level), launches joining, stop and tempo during it, and a
    bounce identical to one without.
* **Unit (`audio`):** `RecordingClock` with a count-in segment:
  * a note in the count-in gets its negative beat;
  * the start at a mid-call frame;
  * an arrangement start that jumps to P;
  * a stop during the count-in returns nothing after it.
* **Unit (`state`, `app`), with a fake clock and status:**
  * overdub over two passes, with notes placed by `mod length`;
  * a note held across the end, cut;
  * a punch in and out in mid-pass, and an early note at the launch;
  * one undo step per take;
  * a relaunch and a length change opening a new take;
  * a slot take flowing into overdub with nothing doubled;
  * disarming and ● Rec off;
  * an empty overdub leaving no step;
  * `countInBars()` in each case of O1, and ■ during a count-in removing the empty clip;
  * the adapter, unchanged, feeding overdub takes.
* **Browser smoke (fake ports):**
  * F9 and the button toggle ● Rec;
  * an overdub over a playing clip adds notes on a second pass, and undo removes them;
  * a slot take with a 1-bar count-in starts after the readout counts down, and its clip starts on beat 0;
  * the ● Rec menu holds the three settings, and ♩ has no ▾;
  * the settings survive a reload.
* **Browser audio (real worklet):**
  * a take with a count-in, stamped on known intervals from the count-in's start, plays back on them within a render
    quantum;
  * the count-in's clicks are in the live output with ♩ off;
  * an export has none.
* **By hand (V5):** a real keyboard, overdubbing a 2-bar loop at 90 and 140 BPM, and a 1-bar count-in with a downbeat
  played slightly early.

## Decisions to sign off

Signed off 2026-11-05: every decision as proposed.

| # | Decision | Proposed | Alternatives |
|---|---|---|---|
| O1 | Which starts count in | From a stopped transport: **the slot's ●**, and **with ● Rec on, any Session start** (▶, a clip, a scene) | Only the slot's ●; or only with ● Rec on (Ableton ties count-in to record) |
| O2 | The count-in's clicks with ♩ off | **Click anyway**, at the metronome level: a silent count-in is no count-in | Click only when ♩ is on |
| O3 | When overdub punches in and out | **At the press**, unquantised, like ● Touch | At the next bar |
| O4 | A slot take ending while ● Rec is on | **Flows into overdub** on the same clip, a new undo step: with ● Rec on, every playing clip on an armed track overdubs | The slot take's clip never overdubs until relaunched; or ● Rec turns off when a slot take ends |
| O5 | During a count-in | **Launches join it** (they start with the transport). **■ cancels** it and the take, and **removes the empty clip** made for the take | Launches start the transport at once and cancel the count-in; ■ keeps the empty clip, as part 1 does when a take ends before it starts |
| O6 | A relaunch or a length change during an overdub | **Ends the take and opens another** (two undo steps), as a touch capture does; the spec said one step per ● Rec on to off, per clip | One take across relaunches, with an anchor and length per segment |
| O7 | ● Rec in the Arrangement before part 3 | **Turns on and records nothing**, with *Recording into the Arrangement isn't available yet* as feedback | Disabled in Arrangement mode until part 3; or ship parts 2 and 3 together |

## Changes made while implementing

* **The engine (step 2).** A launch in `then`, or one sent during the count-in, is queued on its launcher at once, in
  session mode, and the transport starts at the end; `transport/play` during a count-in does nothing (the transport is
  about to start), and `arrangement/play` during it becomes what it starts. A launcher started after a count-in can
  report `startBeat` as −0.
* **The recorder (step 5).** A take that follows another at a boundary (a slot take flowing into overdub, a relaunch,
  another clip replacing the first) is given the old take's events and records from the boundary with no early
  notes, because the status that reports the boundary comes up to 33 ms after it: notes played in between would
  otherwise be lost. ● on an empty slot of a track that is overdubbing ends the overdub at the press, not at the next
  bar (one take per track). Undo during an overdub ends it first, as for a slot take, and the next status opens a new
  one. ■ during a count-in says *Count-in stopped: nothing recorded*.
* **The view (step 6).** ● Rec's ▾ is named *Recording settings*. During a count-in, the readout *Count-in 2* takes the
  feedback's place.
* **Tests (step 7).** As in part 1, the audio test can't tie a captured frame to `performance.now()`, so it checks the
  count-in's four clicks a beat apart with ♩ off and silence after them; the placement of notes in and after a
  count-in is pinned by the unit tests (the clock, the worklet's stamp, the recorder).
