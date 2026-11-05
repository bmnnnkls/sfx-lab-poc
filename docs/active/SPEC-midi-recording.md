---
status: active
date: 2026-11-05
note: "Signed off 2026-11-05, every decision as proposed. Recording MIDI notes into Session slots and the Arrangement (backlog M2, user testing 11); parts 1-2 done, part 3 planned, not signed off."
---
# Recording MIDI clips (spec)

Status: **spec, signed off** 2026-11-05, every decision as proposed. Parts 1 to 3 can now be planned, in order; parts 1 and 2 are done ([part 1](../archive/midi-recording/PLAN-midi-recording-1-session.md), [part 2](../archive/midi-recording/PLAN-midi-recording-2-overdub.md), 2026-11-05); part 3 is planned ([plan](PLAN-midi-recording-3-arrangement.md), not signed off). Written 2026-11-05 on `feat/user-testing-quick-wins` at `608c10d` (after
per-track MIDI inputs). No code was changed. The item is [BACKLOG](../BACKLOG.md) M2, from
[user testing](REVIEW-user-testing-2026-11.md) note 11: *"how can I record MIDI clips in sessions and directly in
arrangement?"* It follows the shape of the [round 12 spec](SPEC-round-12-arrangement-editor.md).

The plans for each part take their steps, tests and verification from here. Where a plan and this spec disagree
later, the plan wins and says so.

**One rule for every choice below: do what the app already does.** Touch recording has settled how a take is timed,
where it goes and how it is undone; the session grid and the arrangement follow Ableton, so where the app has no
precedent this takes Ableton's most common behaviour and leaves a seam for a setting.

## Goal

After this work you can play a MIDI keyboard into the app and keep what you played:

* **arm** one or more instrument tracks;
* in the **Session**, press ● on an empty slot of an armed track: recording starts at the next bar, the notes appear in
  the clip as you play, and pressing again ends it at the next bar, after which the new clip loops. With ● **Rec** on,
  notes played over a clip that is already playing are **overdubbed** into it, pass after pass;
* in the **Arrangement**, with ● **Rec** on, ▶ records every armed track into a **new region** from where it started to
  where it stopped, and with the loop brace on, the passes are merged into one region;
* a **metronome** clicks while the transport runs, and an optional **count-in** gives one or two bars before a take
  that starts from a stopped transport;
* every take is **one undo step**, saved like any other clip, and plays back where it was played, within the browser's
  timing.

**Out of scope** (see [Wishes](#wishes-later)):

* recording audio;
* recording what the note graph makes (arpeggios, echoes): a take is the notes that reach the track, before its note
  graph;
* CC, pitch bend and aftertouch as clip data (clips hold notes only); the sustain pedal is folded into note lengths;
* replacing or splitting the regions a new take lands on, comping takes, punch-in and -out points set ahead of time;
* quantising while recording (the Groove panel does it afterwards);
* MIDI clock and MIDI output ([BACKLOG](../BACKLOG.md) D1), MPE (D2).

## Inventory

What exists at `608c10d`.

### Clips, slots and regions

* **A MIDI clip** is `{ id, name, lengthBeats, notes, automation? }`; a note is `{ id, pitch, start, duration, velocity }`
  in beats from the clip's start (`core/project/types.ts`). Lengths run from 0.25 to **256 beats** (`MAX_CLIP_BEATS`,
  64 bars of 4/4) and a clip holds at most **5000 notes** (`LIMITS.notesPerClip`).
* **Slots.** `slot.create-clip` makes an empty clip in an empty slot of an instrument track and opens it
  (`state/actions/slot.ts`). Launching is queued to the next bar (`LaunchQueue`, one-bar quantisation; other values are
  [BACKLOG](../BACKLOG.md) G6), and a playing clip loops by its length from the beat it started
  (`LauncherStatus.startBeat`). An edited clip is swapped in while it plays (`LaunchQueue.sync`): notes already started
  keep their identity, notes after the play position sound on this pass.
* **Regions** are `{ id, trackId, startBeat, content, loop? }`, `content` a copy of a clip; regions may overlap and both
  play; the timeline reaches 4096 beats ([clips-and-arrangement](../architecture/clips-and-arrangement.md#the-arrangement-clips-on-a-timeline)).
  There is no split.
* **Two playback modes.** The engine follows either the session's launchers or the arrangement
  (`EngineStatus.mode`); `arrangement/play` switches to the timeline, launching a clip switches back.

### Live notes

* **Routing** (just shipped): a note-on goes to the tracks whose own input matches it, else to the selected or pinned
  instrument if it follows the selection (`liveNoteTracks`, [midi](../architecture/midi.md#where-live-notes-go-track-inputs)).
  The adapter keeps each held press with the notes it started, per input, channel and pitch.
* **Timestamps.** Each MIDI message carries the browser's event time (`MIDIMessageEvent.timeStamp`), which the adapter
  already passes on for CCs.
* Notes **never edit the project** today, and nothing records them.

### Touch recording, the precedent

* **One global arm**, ● *Touch* in the transport bar (`state/touch-store`). A take goes to the owner's playing clip or
  slot (`touchDestination`, one branch per playback mode), its samples are buffered outside the project and committed
  on release as one undo step; a take stops after 256 beats.
* **The recording clock** (`audio/recording-clock`, `AudioHost.recordingBeat`) turns a native event timestamp into a
  transport beat across tempo changes, transport starts and stops, and the arrangement loop's jumps; it returns nothing
  while the transport is stopped or the context suspended.
* `applyTouch` (`core/automation/record`) splits a capture at loop wraps. Round 12d (touch into the arrangement) is
  planned, not built.

### Things that don't exist

* No **arm** per track, no **record** button, no **metronome**, no **count-in**.
* No allowance for **output latency**: `AudioContext` is created with `latencyHint: 'interactive'` and its
  `outputLatency` / `baseLatency` are never read.

## Design

### The arm and the record button

* **Arm per track.** An instrument track gets an **arm** toggle (●) on its session header and its arrangement header.
  Several tracks can be armed. Arming is **transient**, like the touch arm: not saved and not an undo step
  (decision 2). Audio and return tracks, groups and the master can't be armed.
* **Arming makes a track hear the keyboard.** An armed track that follows the selection receives notes as if it were
  selected; the selected track still does too, and tracks with their own input keep their rule (`liveNoteTracks` gains
  the armed tracks in its follow set). So arming two following tracks layers them while you record, and recording a
  track never needs it selected (decision 3).
* **● Rec** in the transport bar, beside ● *Touch*, with the command `transport.record` (F9 by default, Ableton's key).
  Like touch, its **destination follows the playback mode**: in the Session it overdubs into the clips playing on armed
  tracks; in the Arrangement it records armed tracks into new regions (decision 1). Its menu holds the record settings:
  fixed length, count-in, metronome level.
* A slot's own ● (below) works on an armed track **without** ● Rec, as in Ableton: pressing a slot is already the
  intent to record.

### Session: a new clip in an empty slot

1. On an **armed** track, an empty slot shows **●** instead of **+** (its menu still has *Create clip*).
2. Pressing ● **queues a recording** in that slot at the next launch boundary (the next bar), as launching a clip does,
   and starts the transport if it is stopped (after the count-in, when one is set). A new empty clip, named as *Create clip* names
   one, is made in the slot at once (one undo step with the take) and launched, so it plays from the boundary like any clip.
3. **While it records** the slot blinks red. Notes are written into the clip as they end (§ What a take captures); the
   piano roll, if open on it, shows them arriving.
4. **Ending:** pressing the slot again, ■ on the track, or a fixed length running out ends the take **at the next bar**
   after the press (the fixed length ends it exactly). The clip's length becomes the whole bars recorded, at least one,
   and the clip **keeps playing and loops** from there, in time, because a clip loops from the beat it started.
5. **Fixed length** (● Rec menu): *Off* (the default, until pressed), 1, 2, 4, 8, 16 bars. With it on, the take ends on
   its own and loops (decision 4).
6. **Limits:** a take ends by itself at 64 bars (`MAX_CLIP_BEATS`), with a notice, and loops.
7. An **empty take** (nothing played) leaves an empty clip of the recorded length: the slot was pressed on purpose.
8. Stopping the transport ends every take at once, at the stop, rounded up to the bar.

While the clip is recording, its provisional length is the fixed length, or 64 bars; on ending, its real length is set
in the same undo step. Because the launcher loops by `(beat - startBeat) mod lengthBeats`, setting the length to the
bars elapsed at a bar boundary makes the next pass start right there.

### Session: overdub

With **● Rec on** and a clip playing on an armed track, what you play is **added** to that clip, on every pass, until
● Rec goes off or the clip stops (decision 5). Nothing is erased. Notes are placed by `(beat - startBeat) mod length`,
and a note held across the loop end is cut at the end (a clip's notes stay inside it). Each overdub (from ● Rec on to
off, per clip) is one undo step.

### Arrangement: new regions

1. With **● Rec on**, ▶ *Arrangement* records **every armed track** from the position; turning ● Rec on while the
   arrangement plays punches in there, and off punches out (decision 6).
2. Each armed track that received at least one note gets **one new region**: from the start of the bar where recording
   began to the end of the bar where it ended, its clip holding the notes at their exact times. A track that got no
   notes gets nothing.
3. **Under it,** existing regions are left alone, and both play, as overlapping regions already do (decision 7). The
   new region is drawn on top and selected. Trimming what is under it needs a split, which is a wish.
4. **With the loop brace on,** passes are merged into one region spanning the brace (overdub across passes, the
   recording clock's jumps mapping each note to its pass, as touch does). Takes per pass are a wish (decision 8).
5. **Longer than 64 bars:** the region ends at 64 bars and the take continues in a new region from there, so nothing is
   lost (decision 12).
6. Notes appear in the region as they end, and a take is one undo step, as in the Session.

### What a take captures

* **The notes that reach the track**, before its note graph: pitch, velocity, start and end. An arpeggiator on the
  track plays during recording but its output isn't recorded; the clip then plays through it again (decision 9).
* **Start** is the note-on's event time on the recording clock, **end** the note-off's. A note held when the take ends
  ends there.
* **The sustain pedal** extends notes: a note released while the pedal is down ends when the pedal comes up (or the
  take ends), so the clip plays as it sounded. The pedal itself isn't stored.
* **Early notes:** a note played less than a sixteenth before the take's first beat counts as on that beat (people
  play the downbeat early). Earlier ones are dropped.
* **Layered tracks** each record their own copy.
* **Written as they end:** each finished note is written into the clip at once, under the take's merge key, so the piano
  roll shows it, an overdubbing clip plays it on the next pass, autosave keeps it, and the whole take is still one undo
  step (unless other edits are made in between, which split it, as for any merged edit) (decision 10). Undo during a
  take ends the take first.
* **Limits:** past 5000 notes in a clip, the take stops on that track with a notice.

### Timing

* **The clock:** a note's beat is `recordingBeat` at its event timestamp, exactly as touch does, so tempo changes,
  starts and the loop's jumps are already handled.
* **Latency:** what you hear lags the transport by the output latency, and you play to what you hear, so a note is
  placed earlier by `outputLatency + baseLatency` (in beats at the tempo of the moment), where the browser reports them,
  plus a **manual offset** in MIDI settings (−50 to +50 ms, default 0) for what the browser doesn't report
  (decision 11). The same offset could later serve touch.
* **No quantise while recording.** The Groove panel quantises afterwards, as now.

### Metronome and count-in

* **The click** is made in the engine: a short tone, higher on the first beat of the bar, mixed **after the master
  graph and volume**, so effects never colour it, and **never into an export or bounce** (decision 13).
* **♩** in the transport bar turns it on and off; its level is in the ● Rec menu. It clicks whenever the transport runs,
  in either mode, recording or not. Both are browser preferences, like the layout, not part of the project.
* **Count-in** (● Rec menu): *Off* (default), 1 or 2 bars. Only when a take starts from a **stopped** transport: the
  engine clicks the count-in, then starts the transport at the start (Session) or the arrangement position. Notes played
  during the count-in sound and aren't recorded, except early notes at the first beat (decision 14).

### The view

* **Arm buttons** on session and arrangement headers (● dim, red when armed; a tooltip says what arming does).
* **Slots:** ● on empty slots of armed tracks; a recording slot blinks red; overdub shows a red dot on the playing slot.
* **Arrangement:** the region being recorded grows on its lane in red, with notes appearing in it.
* **Transport bar:** ● Rec (red while on), its menu (fixed length, count-in, metronome level), ♩, and, during a
  count-in, the bars left.
* **Feedback** like touch's: "Recording Bass, Lead", "Armed tracks: none" when ● Rec is on and nothing is armed, "64
  bars reached: the take ended".

### Engine and protocol

* **Metronome:** `transport/metronome { on, level }` and a click source in the engine after the master; `bounce`
  leaves it out.
* **Count-in:** `transport/countIn { bars, then }`, where `then` is the play or launch command to run after it; the
  status reports `countIn: { barsLeft }` so the UI can show it, and the recording clock anchors the transport's start as
  it does for any start.
* **Nothing else:** recording runs on the main thread (a record store beside the touch store), and reaches the engine
  as ordinary clip and region edits through `diffProject`.

### Persistence

No new saved fields: a take is an ordinary clip or region. Arming, ● Rec, the fixed length, count-in and the
metronome are not saved in the project (the last three are browser preferences). No format bump.

## Parts

1. **Session recording.** Arm (with routing), the slot ●, takes into a new clip with fixed length, ending and looping,
   the metronome, latency compensation and offset, undo, feedback. The take model (`core`: notes from timestamped
   on/off/pedal events, early notes, cutting at the end) is shared by the later parts.
2. **Overdub and count-in.** ● Rec in the Session, overdub across passes, count-in, the ● Rec menu complete.
3. **Arrangement recording.** Regions from takes, punch in and out, the loop brace merging passes, chaining past 64
   bars. Independent of round 12c/12d (automation on the timeline), which can come before or after.

## Verification

* **`core`:** the take model as tables: start and end from beats, pedal folding, early notes, notes held at the end,
  loop-pass placement and cutting at a clip's end, chaining past 64 bars, limits.
* **`app`:** the adapter feeds the record store with fake ports and timestamps; arming routes notes; layering records
  each track.
* **Engine:** the click is in the output and not in a bounce; count-in starts the transport after the right number of
  frames.
* **Browser smoke (fake ports):** arm, ● a slot, play, end, the clip's notes and length, undo and redo, reload; overdub
  adds on a second pass; an arrangement take makes a region where played.
* **Browser audio (real worklet):** a recorded clip plays back at the timing it was played, within one render quantum
  plus the browser's timestamp precision; the export has no click.
* **By hand (V5):** a real keyboard, with and without the metronome, at two tempos, checking the latency offset.

## Decisions to sign off

Signed off 2026-11-05: every decision as proposed.


| # | Decision | Proposed | Alternatives |
|---|---|---|---|
| 1 | One record button or two | **One ● Rec** whose destination follows the playback mode, as touch's does | Separate Session and Arrangement record buttons (Ableton) |
| 2 | Is arming saved | **Transient**, like the touch arm: not saved, not undone | A saved view field per track (Ableton saves it) |
| 3 | Does arming route notes | **Yes:** an armed track that follows the selection hears the keyboard as if selected | Arming only records what already reaches the track (select, pin or give it an input first) |
| 4 | How a Session take ends | **Press again** (ends at the next bar) by default, with an optional **fixed length** | Fixed length only; or end exactly at the press without rounding to the bar |
| 5 | Overdub | **Adds** notes on every pass; nothing erased | Replace what is under the play position (a "replace" mode as a setting later) |
| 6 | Arrangement punch | ● Rec on/off while playing punches in and out; ▶ with ● Rec records from the position | Record only from ▶ (no punch while playing) |
| 7 | What a new region does to regions under it | **Nothing:** both play, the new one on top | Trim or split them (needs split first) |
| 8 | Loop brace while recording | **Merge passes** into one region | A region per pass (takes), comping later |
| 9 | What is recorded | **The notes that reach the track**, before the note graph | What the note graph outputs (an arpeggio as notes) |
| 10 | When notes reach the clip | **As each note ends**, under the take's merge key (live display, overdub plays them next pass, one undo step) | Buffer and write at the end of the take (simpler, no live notes, overdub can't play them until it ends) |
| 11 | Latency | **Subtract the reported output latency, plus a manual offset** in MIDI settings | No compensation; or a manual offset only |
| 12 | Takes past 64 bars | Session: **end and loop** at 64 bars; Arrangement: **continue in a new region** | Raise `MAX_CLIP_BEATS`; or end the Arrangement take too |
| 13 | The click | **Engine-made, after the master, never exported**; on/off and level are browser preferences | Saved per project; or a click the user can route and export |
| 14 | Count-in | **Off, 1 or 2 bars**, only from a stopped transport | No count-in in this work; or count-in on every take |
| 15 | The record key | **F9** for `transport.record` (Ableton's), changeable like every key | No default key |
| 16 | Order | Parts **1, 2, 3** as above | Arrangement before overdub (part 3 before 2) |

## Wishes, later

* Replace mode for overdub; trimming or splitting the regions a take lands on; takes per pass and comping.
* Record-quantise; punch-in and -out points set ahead of time; pre-roll.
* Recording CC, pitch bend and the pedal as clip data; recording a note graph's output.
* Arm and input on the mixer strip and the track header (backlog M3).
* Recording audio.
