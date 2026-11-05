# MIDI

Parsing, held-note input to the engine, browser MIDI devices, MIDI learn and recording notes into clips.

## Browser MIDI input and learn

`app/midi-input` owns `MIDIAccess`, port callbacks and physical key queues. `state/midi-store` exposes serializable UI
status/settings, learning/conflict state and mapping feedback; `MidiService` is injected at the composition root.
Opening settings does not request access. Enable requests `navigator.requestMIDIAccess({ sysex: false })` and starts audio
from the user action; denial/unsupported access leaves the app usable. A generation guard discards permission results
arriving after disable/disposal. The adapter attaches connected/enabled inputs, detaches and closes lost/disabled ports,
and refreshes on access state changes. Runtime feature detection handles Web MIDI's limited browser availability.
API contracts were checked with Context7 `/mdn/content` and [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API)
on 2026-10-17; secure context and browser permission are required. No output ports or SysEx are used.

The adapter reuses `parseMidiMessage` and converts its musician channels (1–16) once at the engine boundary (0–15).
Each note-on allocates a per-press ID. Physical note-offs consume FIFO queues per input/channel/pitch; zero velocity is
already an off from the parser. Input lifecycle changes (disconnect, disable) release affected sources. CC64 drives source/channel sustain; reserved CC120–127
release that source/channel. Project document-epoch changes discard adapter queues and panic, even with identical IDs.
Visible Panic clears queues/pedals/generated events without stopping transport; Stop also forgets physical ownership.
Fresh presses are required after cleanup. The held-note engine retains release/effect tails. Live notes edit a project
only through the recorder, into a clip being recorded ([Recording notes into a clip](#recording-notes-into-a-clip)).

## Where live notes go (track inputs)

An instrument track **follows the selection** by default: it plays while it is the selected instrument, or the one
pinned as the destination in MIDI settings (pinning keeps input stable while navigating elsewhere; selecting an
audio or return track or the master routes no notes). The *Selection channel* setting is the followed track's: it
listens to that channel only. A track can instead have **its own input**, `InstrumentTrack.midiInput` (`MidiTrackInput`
in `core/midi/track-input.ts`: a device id, or any, and a channel, or any), which it always listens to, selected or
not. `liveNoteTracks(project, deviceId, channel, follow)` (`core/project/midi-routes.ts`) decides each note-on: every
track whose own input matches gets it (several tracks on one input make a layer, each note with its own id, released
by one key-up); only when none matches does the followed track get it, if it has no input of its own and the channel
allows. So a pad controller on channel 10 plays its drum track only, and the keyboard plays whatever is selected. CCs
are not routed this way: a mapping names its own device and channel.

**Armed tracks** hear the keyboard too: `MidiFollow.armed` lists them, and a note no track's own input takes goes to the
followed track and every armed track without an input of its own, each once, under the same channel rule. So arming
two following tracks layers them, and recording a track never needs it selected. A track with its own input keeps its
rule whether armed or not.

A held press remembers the notes it started. When routing changes (`liveNoteRouting`: the followed track, the
selection channel, the armed tracks and every track's input), each held note whose track no longer takes its press gets a note-off and
the rest keep sounding, so a pad held on a track's own input outlives a click on another track; a sustained note
released this way stays until the pedal comes up. The device is matched by id only; `deviceName` shows an input that
isn't connected, as for mappings. Inputs are set in MIDI settings (*Track inputs*: *Follows the selection*, *Any
input* or a device, and a channel), one undo step each, and a track with its own input has a `midi` or `midi <channel>`
tag on its session header. The field is optional and needs no format bump (an older build drops it and the track
follows the selection again); the sanitizer drops an input whose device or channel is malformed, with a warning,
rather than widen it to any device or any channel. Library items and presets don't carry it; *Duplicate* copies it.

## Recording notes into a clip

`state/record-store` records what reaches armed tracks, after the touch recorder's pattern: a transient arm, takes
held outside the project, feedback text, document-epoch checks, and edits committed through `useProjectStore` under a
merge key.

* **Arming** (`useRecordStore.arm`, the `track.arm` action, ● on the session and arrangement headers) is transient: not
  saved, not an undo step. Only instrument tracks arm; a removed track drops out, and a new document disarms everything.
  Disarming a track that is recording ends its take at the next bar.
* **A take** starts from an empty slot of an armed track (`recordInSlot`, the `slot.record` action, ● in the slot): it
  makes `Clip <scene + 1>` there, as long as the fixed length or 64 bars, launches it, and records from the launch
  boundary the status reports (`playingClipId` and `startBeat`), so from a stopped transport it starts at beat 0 at once.
  There is one take per track; pressing ● on another slot of a recording track ends the first at the next bar, where
  the second starts. A take whose clip the engine never reports queued or playing is given up after 2 s.
* **Events.** `app/midi-input` passes each note-on and note-off it sends to a track (`recordNote`) and the sustain
  pedal (`recordPedal`), each with its beat from the record clock. The take keeps them in transport beats; one with no
  beat (the transport stopped) is dropped, so nothing played before a stopped transport starts is kept, except during a
  count-in (below).
* **The take model** (`core/record/take.ts`, pure and shared with the later parts): `takeNotes(events, { id, start, end })`
  pairs ons and offs per source, channel and pitch in order (a repeated pitch is two notes); a note released under its
  source and channel's pedal ends when the pedal comes up, or when its pitch is played again; a note held at the end
  ends there. A note-on up to a sixteenth before the start (`EARLY_BEATS`) starts on it, earlier ones are dropped, and so
  are notes at or after the end. The shortest note is 1/128 beat. Velocity is the parser's 0..1. `finishedNotes`
  returns those whose end is known. Note ids are the take's id and the note-on's arrival index, so they stay the same
  while the take writes them.
* **Writing.** After each event, the notes that have ended and aren't in the clip yet are added (`setClipNotes`) under
  the merge key `record:<pass>` with no merge window, as is the clip's creation and its final length: the piano roll
  shows notes as they end, autosave keeps them, and the take is one undo step unless another edit comes between. A take
  opened while others run joins their pass (`passFor`), so takes recording at the same time (layered tracks, every
  armed track in the Arrangement) are one undo step together: two keys taking turns would split each other, since
  history merges an edit only with the one just before it.
  At 5000 notes in the clip the take ends with a notice.
* **Ending.** Pressing the slot again (`endTake`, the `clip.stop-recording` action) ends the take at the next bar at
  least a quarter beat ahead, and at least a bar after its start; the clip's length is set **at the press**, so the
  engine loops there without a gap, and when the status passes the end the held notes are closed there and written. A
  fixed length (1 to 16 bars) ends it by itself, and so does 64 bars (`MAX_CLIP_BEATS`), with a notice. ■ on the track
  or another clip launched ends it where the clip stopped. Stopping the transport ends every take at once (`stopTakes`
  from `EngineControls.stop`, or a status that reports it stopped): held notes close at the stop, and the clip is
  rounded up to the bar. The clip keeps playing and looping after a take ends. Undo and redo end every take first, as
  of now (`guardHistory` in the project store), so the whole take is undone. A new document drops takes unwritten.
* **Feedback** in the transport bar, after ♩: *Recording Bass, Lead*, *Recorded 4 bars into Clip 3*, *64 bars reached:
  the take ended*, *Arm a track to record into it*.

### Overdub and count-in

* **● Rec** (`useRecordStore.setRec`, `transport.record`, F9, ● *Rec* in the transport bar) is transient like the arm.
  While it is on and the engine plays the Session, every **armed track with a clip playing or queued** has an
  **overdub take** on that clip (`TakeKind` `'overdub'`; a part of the recorder beside the slot takes, one take per
  track). With nothing armed it says *Armed tracks: none*; with nothing playing, *Launch a clip on an armed track to
  overdub*; while nothing plays, *Launch a clip on an armed track, or press ▶ on the Arrangement, to record*. In the
  Arrangement it records new regions (below).
* **Where notes go.** An overdub records from the latest of: ● Rec going on, the track's arm, and the clip's start (the
  launcher's `startBeat`). It counts the clip's passes from that start: the take model's `loop: { anchor, length }`
  places a note at `(beat - anchor) mod length` and cuts a note held across the clip's end at the end. A note up to a
  sixteenth early counts as on the first beat only when the take starts with the clip; a punch-in in mid-clip keeps
  nothing from before it. Notes are written as they end, under the take's merge key, so a note plays from the next
  pass on; an overdub that records nothing makes no edit.
* **Ending.** ● Rec off, disarming, the clip stopped, replaced or relaunched, a new clip length, the transport stopped,
  the Arrangement taking over, undo or redo, or 5000 notes end it, closing held notes there. A relaunch or a new length
  moves where the passes fall, so the take ends and a new one (a new undo step) starts. A take into a slot that ends
  while ● Rec is on goes on as an overdub of its clip from its end. At such a boundary the new take is given the old
  one's events and records from the boundary with no early notes, so a note played just after it isn't lost and one
  just before isn't recorded twice. ● on an empty slot of an overdubbing track ends the overdub at the press.
* **Count-in** (*Off*, 1 or 2 bars, in ● Rec's menu). `countInBars(start)` is the bars to count in: the setting, from a
  stopped transport that isn't counting in already, when ● Rec is on or the start launches a slot take's clip.
  `app/engine-controls` wraps ▶, clip and scene launches with it, sending `transport/countIn { bars, then }`
  ([mixing-and-routing](mixing-and-routing.md#the-master-bus)). The engine queues a launch at once, so the take sees its
  clip waiting and doesn't give up; launches during the count-in join it; the status reports `countIn: { barsLeft,
  beat }`, which the transport bar shows (*Count-in 2*, ▶ dimmed). ■ or Space during it cancels it: a slot take drops,
  and the empty clip made for it goes in the same undo step (*Count-in stopped: nothing recorded*).
* **The clock through a count-in.** The status and clock packets carry the count-in's beat, from −4 × bars up to 0, and
  the recording clock runs on it as a segment of its own (its beats may be negative there), so a note played in the
  count-in has a beat, and one within a sixteenth of the first beat counts as on it. The start lands inside a render
  call; the engine reports its frame as a clock edge (`lastClockEdge`), and the worklet stamps it with that frame's
  time, as it does a loop jump.

### Recording into the Arrangement

* **Arrangement takes** (`TakeKind` `'region'`, one per armed track). With ● Rec on, ▶ *Arrangement* and a seek while it
  plays go through `EngineControls.playArrangement`, which calls `startArrangementTakes(P)` before it sends: the
  arrangement takes running end there, and every armed track gets a queued take from P (a Session take on it ends).
  Turning ● Rec on while the arrangement plays, arming a track then, or the next status after an undo or a brace change
  opens a take from the transport's position, with no early notes (a punch-in). ● Rec off, disarming, ■, the Session
  taking over, a brace change and undo or redo end them, closing held notes there.
* **Take time.** Beats go back at a loop jump, and the take model pairs events in beat order, so an arrangement take
  keeps its events in its own time, `beat + lap × brace length`, which only goes forward. The engine counts the jumps
  (`lap`) and the starts and seeks (`run`) in `EngineStatus` and the clock packets; `RecordingClock.position` returns
  `{ beat, lap, run }` and the adapter passes it with each note (`recordPosition`). A take started by ▶ or a seek adopts
  the first run after the one current at the press, holding what is played until then, and keeps only events of its
  run, so a note played just before a seek can't land in the take after it. A negative beat comes from a count-in and
  counts back from P. A take that starts at or after the brace's end never loops.
* **Regions.** The take model's `loop` takes the brace as anchor and length and the region's start as `origin`: a note
  keeps its place on the first pass (and a lead-in before the brace), later passes wrap into the brace, and a note held
  across the jump is cut at the brace's end (the engine releases it there too). A region runs from the start of the
  bar recording began in to the end of the bar it ended in; once a take has looped, it is the brace exactly, extended
  back to that bar when recording began before the brace. Past 64 bars the notes go on in the next region
  (`splitRegions`, 256 beats each from the first region's start), a note held across the split continuing as a note
  of its own (`<id>~1`). A region appears with its first note, so a track that played nothing gets none, and grows a
  bar at a time while the playhead moves; each is written whole (`updateArrangementClip`) under the pass's key, so the
  pass is one undo step. 5000 notes in a region, or the timeline's end, end the take with a notice.
* **What it leaves alone.** Regions under the new one stay. A region being recorded that anything else changes or
  removes ends its take there (`watchRegions`, comparing with what the take last wrote), and no new take opens on that
  track until ● Rec, ▶ or the arm is pressed again; the view locks it (red, no drag or resize, *Loop* and *Delete*
  disabled, *Stop recording* in its menu, `isRecordingRegion`). When a pass's last take ends, the selected track's new
  region is selected, so the selected track and the routing stay, and the feedback says *Recorded 8 bars on Bass,
  Lead*, or *Nothing played: no region made*.
* **Count-in.** `playArrangement` goes through the same `start()` as ▶ and launches: from a stopped transport with
  ● Rec on, `transport/countIn { then: arrangement/play }`. A seek never counts in. ■ during it drops the queued takes.

**The record clock** (`state/record-clock.ts`, connected in `app/project-sync` beside the touch clock):
`recordPosition(timestamp)` is `AudioHost.recordingPosition` (the beat, run and loop pass) at the event's age plus the latency to take off
(`recordLatencyMs`): the output latency the host reports and the manual offset. You play to what you hear, which lags
the transport by that much, so a positive offset places notes earlier. When that time falls before the transport
started (a note played just after a start), the note is counted back from its own beat at the tempo, so it lands just
before the take's start and counts as on it.

* `AudioHost.outputLatency()` is the context's `outputLatency` plus `baseLatency` (each 0 where not reported), read with
  each status and taken as the median of the last 64 readings: Chromium's estimate flips between values 8 ms apart.
* `AudioHost.recordingBeat` reads the render clock between the steps of `currentTime`, which moves by the output
  callback (256 frames, 5.3 ms, in Chromium on macOS): the output timestamp (`getOutputTimestamp`) pairs the audio clock
  with `performance.now()`, its offset is the median of recent pairs, and `currentTime`'s lead over it is the top of the
  readings' spread (`renderLead`: the median plus half the 10th-to-90th percentile spread). Without an output timestamp
  it is `currentTime`. Touch recording reads the same clock.

**Settings** (`state/record-settings.ts`, kept per browser in `localStorage` under `sfxlab:record` by
`useRecordSettingsStorage`, validated field by field on load): the metronome and its level, the fixed length (*Off*, 1,
2, 4, 8, 16 bars), the count-in (*Off*, 1, 2 bars) and the latency offset (−50 to +50 ms, *Latency offset (ms)* in MIDI
settings). ♩ in the transport bar toggles the metronome (`transport.metronome`); ● Rec's ▾ holds the fixed length
(`transport.fixed-length`), the count-in (`transport.count-in`) and the metronome level (`transport.metronome-level`).
None of it is in the project.

`app/midi-controls` learns eligible absolute CC0–119 except sustain. Confirmation consumes the first CC without editing
the sound. An occupied source opens an explicit reassign/cancel decision; one source maps to one target, while separate
inputs can bind the same target. Settings list mappings, availability, pickup, relearn, remove and explicit input rebinding;
missing IDs never bind by a guessed device name. Right-click panel controls and mixer values to learn; XY axes are separate.
Escape cancels. Shared-definition controls do not offer project-instance learning. Wired/missing targets explain their
unavailability and remain inert rather than overriding graph-owned parameters.

**One write per frame.** Every CC message is read at once (pickup, crossing, the value it would set), but a continuous
value is written only once per animation frame, the latest one per mapping, with the feedback for that frame
(`createMidiControls(schedule)`, `nextFrame`: a frame, or 50 ms when frames stop in a hidden tab; at once where there
are no frames, as in unit tests). A value written to the project is an edit (history, a project diff for the engine,
panels re-rendered), and a knob sends tens to a hundred messages a second, which kept the main thread busy enough to
delay notes, as pointer drags would without `frame-throttle.ts`. A value waiting to be written counts as where the
control is, so pickup doesn't rearm on its own output. Switches and selectors are written at once (a momentary press has
a begin and an end), and a source that is released writes its waiting value first; a reset drops it. Each mapping
resolves its target (which flattens the graph) once per project, not per message.

Continuous CC uses current effective-value pickup (crossing or half a 7-bit step), including controls with numeric
snapping. External/manual edits and reconnect rearm pickup. Scales and snapping use `core/control`; switch/selector states
are immediate and momentary switches follow a CC64 threshold. Common control gestures coalesce bursts within 800 ms
inactivity; long momentary presses have explicit boundaries. Disconnection/disable/removal release owned momentary
controls. Normal CC edits author base values; an existing transient override receives effective edits instead. Feedback
is a separate main-thread store, shown with current resolved values, not copied through engine audio-rate status.

Format **v3** adds optional `Project.midiMappings`: stable ID, device ID/name selector, zero-based channel, CC, pickup and
structured `ControlTarget`. No browser object or permission/route setting is saved. The parser caps mappings at 1024,
IDs/names at 256 and target paths at 32; it rejects invalid selectors, reserved CCs and duplicate IDs/sources with warnings,
and keeps well-formed unavailable references visible. Explicit v2→v3 migration removes formerly unknown mapping fields;
v1/v2/v3 fixtures verify compatibility. Group/unlink remap learned targets with saved control values. Project packages and
autosave use the same format; mapping CRUD is undoable.

Fake-port unit and production browser tests cover permissions/late grants, learn/cancel/conflicts, device lifecycle,
routing, channel conversion, source ownership, effective pickup, scale/snapping, momentary/nested/wired controls, history
and Low Light DJ-filter reload. The real-output audio test replaces only browser ports, exercising the parser, adapter,
commands and actual worklet. Recording has the same: a smoke test arms, records into a slot, ends, undoes, redoes and
reloads, and an audio test checks that a take stamped on known intervals is placed and played back on them, within a
render quantum, and that the metronome is live but not in an export. Overdub and count-in have smoke tests (● Rec by F9
and the button, two passes into one clip as one undo step, ■ during a count-in, a take after one), and an audio test
checks a count-in's four clicks a beat apart with the metronome off. **No manual physical keyboard/controller check
was performed**, for recording either.

## Held-note engine input

`EngineCommand` adds `track/noteOn { trackId, note: { sourceId, channel, noteId }, pitch, velocity }` and
`track/noteOff { trackId, note }`. Channels are zero-based 0..15, pitch is an integer 0..127 and velocity is in
(0, 1]. Invalid note-ons and missing/non-instrument destinations are ignored. Adapters must allocate a unique `noteId`
for each press and match the physical key-up to that ID; repeated equal pitches are separate notes. Duplicate active
IDs and unmatched/duplicate offs are ignored. `notes/sustain { sourceId, channel, down }` holds released keys of only
that source/channel. `notes/releaseSource { sourceId, channel? }` is the adapter's cleanup primitive for disconnect,
disable or destination change: it clears keys, pedals, voices and queued/generated events of that owner in every graph.
`notes/panic` clears all note owners/pedals/queues; it does not stop transport or clip launchers, so future clip note-ons
continue. Both release envelopes naturally and preserve insert/return/master tails. Ordinary key-up preserves echo
repeats and lets the current arpeggio gate finish; source release and panic cancel those children immediately.

`LiveNotes` owns only transient input state, never the project. The engine namespaces clip and live source IDs so a
live caller cannot collide with a clip source. Clip IDs incorporate clip, launch, loop and authored-note identity;
clip-edit releases retain the identity assigned at note-on. Mapping/range processors, delayed queues, merges, preview
and voices all retain ownership. Instrument audition still bypasses note processing and auto-releases after 0.3 s;
its unidentified voices cannot release engine-owned clip/live voices.

The engine advances a continuous musical render clock even while transport is stopped. Only instrument note graphs
schedule against that clock while stopped; audio clips and launch queues remain on transport. Clip event times are
translated to the render clock before processing, and grid generators receive the transport's beat-zero origin so
starting playback after an arbitrary stopped interval remains aligned. Stop rewinds transport and clears note input
and generators, but leaves the render clock and audio processing running for tails and subsequent live input. Incoming
commands apply at the next render boundary; a complete press released before rendering is treated as zero-duration.
There are no UI timers or wall-clock reads. Odd block-size boundary rounding retains the existing one-sample tolerance.
Offline bounces create a fresh engine, use only authored data and remain repeatable.

The existing `HostMessage` carries these commands unchanged across the worklet boundary. `EngineControls` and
`createEngineControls` expose note-on/off, sustain, release-source and panic for the browser adapter described above.
`connectEngine` sends panic on document-epoch changes and disposal, including replacements with identical IDs/graphs.
Structural cleanup intentionally requires a fresh physical press rather than replaying keys into a different graph.
Slice 2a alone adds no saved fields or migrations; browser access, port management, settings, visible Panic and CC
learn/mapping UI ship in slice 2b. Tests simulate sources in core and inject commands through the production
worklet port for real-output stopped-note/sustain/effect/panic checks.

## MIDI parsing foundation

`core/midi` parses note-on/off and 7-bit CC messages without browser or device dependencies. Velocity-zero
note-on becomes note-off; malformed bytes and unsupported messages are ignored. CCs remain raw messages here:
the browser adapter interprets sustain/channel-mode cleanup and converts parser channels (1–16) to engine channels
(0–15). The source-aware held-note path ships in slice 2a; browser input and learned mappings ship in slice 2b.
