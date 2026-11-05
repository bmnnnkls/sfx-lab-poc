# MIDI

Parsing, held-note input to the engine, browser MIDI devices and MIDI learn.

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
already an off from the parser. Default routing follows the selected instrument, or one pinned instrument. Selection of
an audio/return/master destination routes no notes. Pinning keeps input stable while navigating elsewhere. Destination,
filter and input lifecycle changes release affected sources. CC64 drives source/channel sustain; reserved CC120–127
release that source/channel. Project document-epoch changes discard adapter queues and panic, even with identical IDs.
Visible Panic clears queues/pedals/generated events without stopping transport; Stop also forgets physical ownership.
Fresh presses are required after cleanup. The held-note engine retains release/effect tails. Notes never edit a project.

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
autosave use the same format; mapping CRUD is undoable. No note recording or later library slice is included in MIDI slice 2b; clip automation is described above.

Fake-port unit and production browser tests cover permissions/late grants, learn/cancel/conflicts, device lifecycle,
routing, channel conversion, source ownership, effective pickup, scale/snapping, momentary/nested/wired controls, history
and Low Light DJ-filter reload. The real-output audio test replaces only browser ports, exercising the parser, adapter,
commands and actual worklet. **No manual physical keyboard/controller check was performed.**

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
