---
status: done
date: 2026-11-05
shipped_in: architecture/midi.md
note: "Part 1 of the MIDI recording spec, done: arm, recording into an empty Session slot, the metronome, latency. Not checked with a real keyboard (backlog V5)."
---
# MIDI recording, part 1: Session recording

Status: **done** 2026-11-05 on `imp/midi-recording-part1-b60ea0`. Signed off 2026-11-05, every decision as proposed.
Shipped in [midi](../../architecture/midi.md#recording-notes-into-a-clip),
[clips-and-arrangement](../../architecture/clips-and-arrangement.md#recording-into-a-slot) and
[mixing-and-routing](../../architecture/mixing-and-routing.md#the-master-bus); not checked with a real keyboard
([BACKLOG](../../BACKLOG.md) V5). Written 2026-11-05 on `feat/user-testing-quick-wins` at `608c10d`. Carries out
part 1 of the signed-off [MIDI recording spec](../../active/SPEC-midi-recording.md) (§ Parts). The spec's decisions are settled and
not repeated here; this plan adds only the ones it raises (§ Decisions to sign off). Where it differs from the spec,
it says so.

## Goal

After this part you can record a MIDI keyboard into a new clip in the Session:

* **arm** instrument tracks (● on their session and arrangement headers, and in their menu); an armed track that follows
  the selection hears the keyboard as if it were selected;
* on an armed track, an empty slot shows **●**: pressing it records into a new clip from the next bar, notes appear as
  they are played, pressing again ends the take at the next bar and the clip loops;
* an optional **fixed length** (1 to 16 bars) ends a take by itself;
* a **metronome** (♩ in the transport bar) clicks while the transport runs, never into an export;
* notes are placed by the **recording clock**, moved earlier by the **output latency** the browser reports and a
  **manual offset** in MIDI settings;
* a take is **one undo step**, saved like any clip.

**Out of scope** (parts 2 and 3): the ● Rec button, overdub, count-in, recording into the Arrangement.

## Inventory

What part 1 touches, beyond the [spec's inventory](../../active/SPEC-midi-recording.md#inventory).

### Engine

* `Engine.render` (`core/engine/engine.ts`) renders blocks of at most 128 frames (`renderBlock`, which runs the tracks,
  then `processMaster`: the master graph and the master fader), then mixes the sample preview in (`preview.mixInto`,
  "not part of the mix, so it skips the master graph") and soft-clips. The metronome goes in the same place as the
  preview.
* Commands are a union in `core/engine/commands.ts`; `transport/*` are applied in `Engine.apply`. A bounce
  (`core/engine/bounce.ts`) builds a **fresh** `Engine` and sends only what `diffProject` makes, so anything not in the
  project never reaches it.
* `clip/launch` queues the clip and starts the session transport; launched from a stopped transport, the clip starts
  at beat 0 at once. The status reports each track's `playingClipId`, `startBeat` and `queued` (~30 times a second).
* A clip edited while it plays is swapped in (`LaunchQueue.sync`); its loop is `(beat - startBeat) mod lengthBeats`.

### Clock and latency

* `AudioHost.recordingBeat(agoMs)` (`audio/audio-host.ts`) is the beat `agoMs` before the context's current time, or
  undefined while the transport is stopped or the context isn't running. Touch reaches it through
  `setTouchClock` / `touchBeatNow` in `state/touch-store`.
* The `AudioContext` is created with `latencyHint: 'interactive'`; `outputLatency` and `baseLatency` are never read.

### State

* `state/touch-store` is the model for a recorder: a transient arm, takes buffered outside the project, feedback text,
  epoch checks, commits through `useProjectStore` with `commit(history, project, { key, mergeWindowMs })`, which merges
  edits with the same key into one undo step until another edit comes in between.
* `createClip(trackId, scene)` in the project store makes `Clip <scene + 1>` with the default length.
* The MIDI adapter (`app/midi-input.ts`) routes each note-on through `liveNoteTracks(project, deviceId, channel,
  follow)`, keeps each press with the notes it started, and re-routes held notes when `liveNoteRouting` changes. It has
  the event's `timeStamp` but passes it only to CCs. Sustain goes to the engine per source and channel.
* MIDI settings (channel, disabled inputs) are not saved anywhere; the arrangement's and the wave editor's view
  settings are browser preferences in `localStorage` through small storage hooks.

### UI

* Session cells: `MidiClipSlot` draws an empty slot as **+** (`slot.create-clip`); the header (`TrackHeader`) has the
  name, badges, the volume slider and ■. The arrangement header (`ArrangementHeader`) has the name and M S.
* The transport bar has ▶, ■, ● *Touch*, the tempo, history, the view switch. Commands live in
  `state/commands/state-commands.ts` (`transport.touch` among them), default keys in `ui/commands/keybindings.ts`.

## Design

### The take model (`core/record/`)

Pure, tested as tables, shared by parts 2 and 3.

* **Input:** a list of events in **absolute transport beats**, each `{ beat, kind: 'on' | 'off' | 'pedal', source,
  channel, pitch?, velocity?, down? }`. One take per track; layered tracks get their own copy of the events.
* **`takeNotes(events, { start, end, early })`** pairs ons and offs per source, channel and pitch in order (a repeated
  pitch is two notes), and returns `Note`s with `start` relative to the take's start:
  * a note-off while that source and channel's pedal is down ends the note at the pedal's release;
  * a note still held at `end`, or sustained at `end`, ends at `end`;
  * a note-on in `[start - early, start)` starts at `start` (`early` is a sixteenth, a quarter of a beat); earlier ones
    are dropped; so are notes starting at or after `end`;
  * a note that would be shorter than 1/128 beat is lengthened to that (a press and release in one render quantum);
  * velocity is the parser's 0..1, as live notes have it.
* **`finishedNotes(events, start, now)`**: the notes whose end is known by `now`, for writing them as they end.
* Note ids are made from the take id and a counter, so they are stable across the live writes of one take.

### The metronome (`core/engine/metronome.ts`)

* A `Metronome` renders into the output after `processMaster`, beside the preview (`render` mixes it before the soft
  clip). Each block, `renderBlock` tells it the transport beats the block spans; it starts a click at every whole beat
  inside the span, at the exact frame, and keeps a click that runs past the block's end.
* **The click:** a 25 ms sine burst with a 1 ms attack and an exponential decay, 1500 Hz on the first beat of a bar
  (4/4) and 1000 Hz on the others, at the level set (default −12 dB, 0 to −40 dB).
* `transport/metronome { on, level }` sets it. Off by default, so a bounce (a fresh engine) never clicks. It clicks only
  while the transport plays, in either mode; a loop jump makes the next click the loop start's beat.

### Latency and the record clock

* `AudioHost.outputLatency()`: `outputLatency + baseLatency` of the context in seconds (each 0 when the browser doesn't
  report it), read when asked, since it changes with the output device.
* `state/record-clock.ts`: `setRecordClock(read)` like `setTouchClock`, with `recordBeat(eventTimestamp)` returning
  `recordingBeat(performance.now() - timestamp + latencyMs)`, where `latencyMs` is the reported output latency plus the
  manual offset. Undefined while the transport is stopped.
* **The manual offset** is in MIDI settings (−50 to +50 ms, default 0, a number field with a slider), a browser
  preference. A positive offset places notes earlier.

### The recorder (`state/record-store.ts`)

* **Armed tracks:** `armed: readonly string[]`, transient (not saved, not undone). `arm(trackId, on)`; arming a track
  that isn't an instrument does nothing; a track removed, or a new document epoch, drops out of the set.
* **Takes:** `takes: Record<trackId, Take>`, at most one per track: `{ id, clipId, scene, state: 'queued' |
  'recording' | 'ending', start?, end?, events }`.
* **`recordInSlot(trackId, scene)`** (the slot's ●): creates the clip in the slot (`Clip <scene + 1>`, length the fixed
  length or 64 bars), launches it, and opens a queued take, under the take's merge key `record:<take id>`.
* **The start** is the launcher's: when the status reports the take's clip playing with a `startBeat`, the take records
  from there. Events that came before are kept and placed by their beats (the early-note rule applies).
* **Notes:** the MIDI adapter calls `recordNote(trackId, event)` for every note-on and note-off it sends to an armed
  track with a take, and `recordPedal(source, channel, down)`; each event carries its beat from `recordBeat`. An event
  with no beat (the transport is stopped) is dropped.
* **Writing:** after each event, the notes `finishedNotes` returns that aren't in the clip yet are written into it with
  `setClipNotes` under the take's key, so the piano roll shows them, autosave keeps them and the take is one undo step.
* **Ending:** pressing the slot again, ■ on the track, or reaching the fixed length or 64 bars. The end is the next bar
  after the press at least a quarter beat ahead (decision P2), and the clip's length is set to `end - start` **at the
  press**, so the engine loops at the end with no gap; when the status passes `end`, the held notes are closed at `end`
  and written, and the take is done. The clip keeps playing and looping.
* **Stopping the transport** ends every take at once, at the bar after the stop's beat; the clip keeps that length.
* **Undo or redo during a take** ends it first (as of now), then undoes. A new document epoch drops takes unwritten.
* **Feedback** like touch's: `Recording Bass` / `Recording Bass, Lead`, `Recorded 4 bars into Clip 3`, `64 bars
  reached: the take ended`, `Arm a track to record into it`.

### Routing (`core/project/midi-routes.ts`)

`MidiFollow` gains `armed: readonly string[]`. `liveNoteTracks` sends a note that matches no track's own input to the
followed track **and** every armed track that follows the selection (each once); a track with its own input keeps its
rule. `liveNoteRouting` includes the armed set, so arming or disarming re-routes held notes as any routing change does.

### The view

* **Arm:** a ● toggle on `TrackHeader` (beside ■) and on `ArrangementHeader` (after M S), instrument tracks only,
  `aria-pressed`, red when armed, tooltip "Arm for recording: an armed track hears the keyboard and records into a slot
  you press ●". Also *Arm for recording* in the track's menu (`track.arm`, a toggle).
* **Slots:** an empty slot of an armed track shows **●** (`slot.record`, "Record a clip here from the next bar"); a
  queued take's slot blinks, a recording one is red with ● and the clip's name, and pressing it ends the take
  ("Stop recording at the next bar"). `+` stays in the slot's menu.
* **Transport bar:** **♩** toggles the metronome (`transport.metronome`); its ▾ menu holds the metronome level and the
  fixed length (Off, 1, 2, 4, 8, 16 bars) until ● Rec arrives in part 2 (decision P1). The feedback text sits after
  it, as touch's does.
* **MIDI settings:** *Latency offset (ms)*.
* **Preferences:** metronome on and level, fixed length and the offset are kept in `localStorage`
  (`sfxlab.record`), validated on load (decision P4).

## Steps

1. **The take model** (`core/record/`): `takeNotes`, `finishedNotes`, note ids; tables for pairing, repeated pitches,
   pedal, early notes, held at the end, the minimum length, out-of-range notes.
2. **The metronome** (`core/engine/metronome.ts`, `Engine`, the command): click placement against beats, accent, a
   click across blocks, a loop jump, nothing while stopped, nothing in a bounce.
3. **Latency and the record clock** (`audio`, `state/record-clock.ts`): the host's latency, the clock bridge with the
   offset; wired in `App` beside `setTouchClock`.
4. **Routing with the arm** (`core/project/midi-routes.ts`): `armed` in `MidiFollow`; tests for layering an armed
   follower with the selected track and for re-routing on arm.
5. **The recorder** (`state/record-store.ts`): arm, `recordInSlot`, start from status, events, live writes under one
   key, ending (press, fixed length, 64 bars, transport stop), undo during a take, epochs, feedback.
6. **The adapter** (`app/midi-input.ts`): pass timestamps, beats and pedal to the recorder; the armed set in `follow()`.
7. **The view:** arm buttons and action, slot ● and its states, ♩ and its menu, the offset field, preferences,
   commands and their palette entries.
8. **Browser tests and docs:** smoke and audio tests (below); `architecture/midi.md` (recording), `clips-and-
   arrangement.md` (the slot), `mixing-and-routing.md` or the engine notes (the metronome); decisions; the spec's status.

## Behavior changes

* An empty slot on an armed track shows ● instead of +; *Create clip* stays in its menu.
* Arming a track that follows the selection makes it play what you play on the keyboard, as well as the selected
  track (spec decision 3).
* The transport bar gets ♩; MIDI settings get a latency offset.
* Nothing changes for a project that is only played back: no saved field, no format bump, and exports are unchanged.

## Verification

* **Unit (`core`):** the take model's tables; the metronome's clicks at the expected frames (120 and 97 BPM, 44.1 and
  48 kHz), across a block boundary and a loop jump, silence while stopped, and a bounce identical with the metronome on
  in the live engine; routing with `armed`.
* **Unit (`state`, `app`):** the recorder with a fake clock and fake status: a take from a running transport and from
  a stopped one, early notes, live writes merging into one undo step, ending at the next bar with the length set at
  the press, the margin rule, fixed length, 64 bars, transport stop, undo during a take, an epoch change; the adapter
  feeding the recorder with timestamps and pedal, layered armed tracks recording one copy each.
* **Browser smoke (fake ports):** arm from the header and the menu; ● on an empty slot; play notes; end; the clip's
  notes and length in the piano roll; undo removes the take and redo brings it back; reload keeps it; the slot shows
  + again after disarming.
* **Browser audio (real worklet):** a recorded clip plays its notes back on the beats they were played, within one
  render quantum plus the timestamp precision (fake ports with timestamps placed on known beats); the metronome is in
  the live output and absent from an exported WAV.
* **By hand (V5):** a real keyboard at 90 and 140 BPM with the metronome; the latency offset nudges notes as expected.

## Decisions to sign off

Signed off 2026-11-05: every decision as proposed.


| # | Decision | Proposed | Alternatives |
|---|---|---|---|
| P1 | Where the fixed length and the metronome level live before ● Rec exists | A ▾ menu on **♩**; part 2 moves them to ● Rec's menu | Ship ● Rec in part 1 with only the menu working |
| P2 | A press very close to the next bar | Ends at the next bar **at least a quarter beat ahead**, else the bar after, so the length reaches the engine before the loop point | Always the next bar (a late message could miss the first beat of the second pass) |
| P3 | Notes before a take that starts from a stopped transport | **Dropped**: there is no beat before the transport runs; count-in (part 2) is the answer | Place them at the first beat if within a sixteenth of wall-clock time |
| P4 | Where the record settings are kept | **Browser preferences** (`localStorage`, `sfxlab.record`): metronome on and level, fixed length, latency offset | Not kept (back to defaults on reload) |
| P5 | The click | 25 ms sine, 1500 Hz on the bar, 1000 Hz on beats, −12 dB by default | A noise tick; a sample the user picks |
| P6 | Arm in the arrangement header now | **Yes**, the same arm (routing works anywhere); recording into the timeline is part 3 | Only on the session header until part 3 |

## Changes made while implementing

* **The record clock (step 3).** `AudioHost.recordingBeat` read `currentTime`, which moves by the output callback (256
  frames, 5.3 ms, in Chromium on macOS) and sometimes two at once, so notes were placed up to 8 ms off. It now reads the
  render clock through `getOutputTimestamp`: the median offset of recent output timestamps from `performance.now()`,
  plus `currentTime`'s lead over that, the top of the readings' spread (`renderLead`). Touch reads the same clock.
* **The output latency (step 3).** Chromium's `outputLatency` flips between estimates 8 ms apart while playing, which
  moved single notes by 8 ms. `outputLatency()` is the median of the last 64 readings, sampled with each status.
* **A note at the very start (step 3).** With the latency taken off, a note played right after a take started from a
  stopped transport fell before the transport ran, where the clock has no beat, and was dropped. `recordBeat` then
  counts back from the event's own beat at the tempo, so it lands just before the start and counts as on it (the early
  rule). Found by the smoke test.
* **The take model (step 1).** A sustained note ends when its pitch is played again, so a clip never holds two of one
  pitch from one key. 5000 notes in a clip (`MAX_TAKE_NOTES`, the file format's limit) end the take with a notice, as the
  spec says.
* **The recorder (step 5).** Undo and redo reach the recorder through a hook in the project store (`guardHistory`), as
  the project store can't import the recorder. The take's edits commit with no merge window (the default 800 ms would
  split a take). A take that waits more than 2 s without its clip reported queued or playing is given up (a status sent
  before the engine had the launch says nothing). A press before the take has started ends it a bar after its start.
  ● on another slot of a recording track ends the take at the next bar, where the new one starts. Disarming a recording
  track ends its take at the next bar. ■ on the track, or another clip launched, ends the take where the clip stopped.
  Arming shows *Press ● on an empty slot to record*.
* **The view (step 7).** The preference key is `sfxlab:record`, as every other key is `sfxlab:…` (the plan said
  `sfxlab.record`). The session header's ■, ● and × are narrower, so a name keeps its room in a 150 px column.
  *Record a clip here* is in an empty slot's menu, disabled until the track is armed, and a recording clip's menu has
  *Stop recording*. The commands are `transport.metronome`, `transport.metronome-level` and `transport.fixed-length`;
  the latency offset is a field in MIDI settings only. Command menus didn't show a choice's check mark
  (`menuEntriesOf` dropped `checked`); they do now.
* **Tests (step 8).** The fake MIDI ports take a timestamp (`sendMidi(page, bytes, id, timeStamp)`). The audio test
  places notes by timestamps a beat and a beat and a half apart and checks the recorded spacing and the playback's
  (which can't tie a beat to `performance.now()` from the page, so the absolute placement is left to the unit tests
  and V5); it checks the click's live spacing within 32 frames, since the bar's higher click crosses a threshold a few
  samples sooner (the engine's unit tests pin the frames).
