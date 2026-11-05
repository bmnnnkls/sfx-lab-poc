# Control targets and automation

How a parameter is addressed and what value it effectively has, clip and return/master automation lanes, and touch recording.

## Shared control targets and effective values

`core/control` is the common framework-free control model. A `ControlTarget` names a track, group or master owner and
either an instrument (`patch`), note (`notes`) or insert (`fx`) graph, or a mixer control (volume, pan, send with return
ID). Returns use their track IDs; a group (`{ kind: 'group', groupId }`) is its bus. `controlOwnerId(owner)` is the id
an owner has in the project and the engine. Graph targets carry an ordered path of `{ nodeId, moduleId }` uses, the leaf node ID,
expected node type and parameter ID. Names, panel order and canvas positions never enter identity. Canonical keys
serialize these fields in a fixed order. Resolution checks every use before flattening and refuses ambiguous flat IDs;
a replaced module or node type is incompatible, while absent nodes, parameters, returns and owners are missing.

`enumerateControlTargets` walks graphs and nested definitions, including independent XY axes. Resolution provides the
live `ParamSpec`, authored base, availability for performance and linear/hold interpolation. Scale conversion reuses
`dsp/param-scale` (linear, logarithmic and exponential), clamps and snaps, and selectors use their configured count.
Control configuration parameters can be inspected but are unavailable for performance. A wired parameter remains
wire-driven: base edits still work, but runtime override is refused with “target the upstream control.” Detection uses
the flattened graph, so wires crossing module boundaries retain the same rule.

`editControlBase` is a pure edit with an explicit result. Root/mixer edits use existing document fields. Values inside a
module use go in optional `Project.controlValues`, a list of target/value records; they never edit the shared definition.
Old exposed knob/control values on module uses remain defaults until an explicit target value supersedes them.
Format **v2** adds this field; v1 migrates without changing authored values. The parser bounds the list (4096), path
length (32) and ID lengths, rejects malformed values with warnings, deduplicates by canonical key and retains well-formed
unavailable references. Committed v1 and v2 fixtures round-trip. Group/unlink rewrite saved routes, including all uses
when editing a shared definition. `remapControlTarget`/`remapControlValues` accept explicit routes and owner/node/module/
return ID maps for duplication and future asset insertion, validate the destination and report failures without guessing.
Deleting/replacing a graph leaves references explicitly unavailable rather than matching nodes by labels or position.

`projectWithControlValues` builds an ephemeral engine projection, applying saved instance values and then active
runtime overrides. `diffProject` applies saved instance values for both live and offline rendering. `state/control-store`
holds only transient overrides; `app/project-sync` subscribes separately and diffs successive effective projections.
It never writes the project, history or autosave. Release restores the latest base, transport stop releases all overrides,
document replacement/reset releases ownership, and edits that remove/invalidate/wire a target drop its live override.
The project store's `documentEpoch` is unsaved lifecycle metadata for this purpose. Offline exports use authored bases.
Instrument/insert `track/setParam` commands carry graph scope so equal IDs across domains cannot affect each other;
legacy unscoped commands retain their behavior. Runtime instrument parameters are kept across voice-count rebuilds.

`createControlGesture` gives panel instance, graph/property and mixer controls one shared transaction path, committing an XY
change atomically. Explicit begin/end boundaries use a unique merge key with no duration cutoff: long drags undo once,
and consecutive gestures do not merge accidentally. Wheel bursts use an 800 ms inactivity boundary. Pointer cancellation ends the gesture and keeps its latest value;
undo restores its starting value. Shared-definition panels keep the graph editor's authoring path. Panel, property and mixer
`EffectiveValue` outputs show active Read/override values, show the base in a tooltip and provide re-enable/release. The pure
`effectiveControlReadouts` helper returns only active compatible overrides rather than every parameter on every frame.

**A group as an owner.** A group's bus has a fader, pan, sends and an insert graph in domain `fx`; they resolve,
enumerate, edit (`editControlBase` writes back to the bus) and project (`projectWithControlValues`) like a track's. A
folder has nothing to control: its targets are missing, "The group has no bus". `patch` and `notes` are incompatible, as
on a return. Panel controls, MIDI learn, snapshots and presets (`SnapshotScope { owner: group, domain: 'fx' }`), sample
bindings, the bounce and automation on the arrangement's timeline (below) reach a bus. A group has no clips or session
cells to hold a lane, so the clip and slot parsers keep refusing a group owner with their unsupported-owner warning,
*Show automation in clip* is not offered on a group's control, and touch on one authors its base. `ungroup`,
`removeGroup` and a group losing its last track drop the control values, mappings and timeline lanes its bus owned;
switching the bus off keeps them, unavailable, for undo.

This control foundation is reused by MIDI and clip automation below. Snapshots and project presets ship in slice 4 below; library insertion ships in slice 5 below. Touch recording is described below. Manual overrides reach the engine through main-thread commands; lane evaluation follows its beat clock.
The existing panel shows directly nested controls; deeper paths are supported by the control API and saved values,
while opening a module definition still edits the shared definition deliberately.

## Clip and return/master automation

`core/automation` owns serializable lanes/points, bounded canonicalization, pure resize/double/copy/remap edits,
normalized evaluation and compilation against current control specs. Clip lanes address only their own track's
instrument, note graph, insert effects or mixer. Missing/wired targets stay in the document with feedback and do
not acquire runtime ownership. Group/unlink remap lane paths together with instance values and MIDI mappings.
Return/master slots arrived in format **v5** (clip lanes in v4; v6 adds saved sounds; v7 adds library origins below; v8 adds optional delay divisions; v9 versions deterministic signatures; current format v10 adds track groups): optional `Clip.automation` / `AudioClip.automation`, at most 64 lanes per clip and
2048 points per lane, bounded IDs/paths and finite numbers. The explicit v3→v4 migration drops formerly unknown
lane data; v4→v5 drops formerly unknown return/master slot fields. Committed v1–v8 and v10 fixtures cover compatibility. Saved bases remain authored values.

Each point holds a normalized value and linear/hold interpolation to the next point. Points are sorted, equal
times collapse with last input winning, and the valid time interval is [0, clip length]. Before/after the point
range, hold its first/last value. The endpoint is approached before wrap; there is no implicit last-to-first ramp.
Shortening trims, doubling repeats with explicit join boundaries (a 1e-9 beat left-limit point), and undo restores
trimmed material. Doubling refuses point-limit overflow. Session copies use fresh clip/note/lane/point IDs; moves
preserve identities and rewrite the owner. Incompatible destination nodes remain visibly unavailable.

`EngineAutomation` owns launch queues, beat-phase evaluation and temporary overrides. Configuration is compiled
from authored data, separately from the main thread's effective-value projection. The engine evaluates automation once per required sample in a bounded planning horizon, routing note writes
immediately to the note runtime and retaining audio/mixer writes in reusable block curves. Instrument stages apply curves only to addressed DSP processors; varying helper
buffers propagate to parameter-socket consumers without taking ownership away from the wire. Mono/stereo scratch
buffers preserve port shape. Send sinks accept an optional segment offset so automated Send nodes write at the
correct frame. Mixer volume/pan/post-fader sends read curves inside their sample loops. Unrelated processors keep
normal block processing. An outer block is at most 128 frames; actual note actions split audio runs, while changing a
note parameter alone does not split the mix. Curves survive every subrun and are sliced at its horizon-relative offset.
Planning stops at audio start/stop/replacement or the current one-shot end; newly started clips supply their new end
before further planning. This keeps base restoration ahead of the first effect-tail sample.

Before first audible playback, `AudioHost` suspends its context, sends queued commands and requests preparation.
The worklet primes a separate temporary Engine, sharing decoded assets for read access, and precompiles only topology/
routing caches on the actual Engine. It does not render, schedule notes, tick automation or advance actual helper/
transport clocks during preparation. A processor guard emits zeros before ready. The host queues later commands,
waits for readiness, flushes them, then connects/resumes; preparation failure closes the suspended context. Initial
sample buffers transfer once. This reviewed C4 phase adds first-use startup latency and temporary memory, measured
in `docs/measurements/f1-fix/startup/README.md`. The entire actual callback window still includes the first render.
The [implementation status and decision review](../archive/2026-10-perf-library/REPORT-fix-F1-implementation-status.md) records approved
tradeoffs, passing correctness checks and the remaining F1 capacity failures; startup preparation is not gate signoff.

Note lanes use sample-sized scheduling and `NoteControlGraph` for control/math helpers that ordinary note graphs bake
once. Installed helper nodes advance chronologically once per rendered sample at the engine rate, including while
transport is stopped or their lane is inactive/queued/disabled/overridden. Installation scope is unchanged. Compatible
parameter/configuration edits preserve helper state without processing an extra sample; a node/type/wiring change
rebuilds the helper runtime. Helper-fed parameters are applied before that sample's input and generated notes.
This deliberately corrects the previous fixed-48-kHz, once-per-scheduling-call helper speed and restores normal
block sampling of unrelated DSP sockets (C1 reviewed on 2026-10-18); no saved format or compatibility mode changed.
Clip and generated-event half-open boundaries share automation's 1e-10 beat tolerance so floating-point block ends
cannot apply the pre-boundary parameter to the next sample's note. Transport and existing event rounding remain in use.

Note graphs compile input adjacency and reuse their output maps; effective lane metadata and alternating ownership
maps are retained. Empty live/mapping outputs and per-track tap entries are reused only after downstream consumption.
Deferred actions retain immutable event objects; legitimate bursts have no event cap. Clip ownership identities are
constructed only for emitted events. The reviewed C3 scheduler compiles full undirected note-tap components,
including upstream sources and transitive readers. Components containing playing/queued notes automation or
installed clocked helpers retain sample cadence; other components keep their existing interval processors, including
autonomous generators. Topology edits rebuild the component/order caches; compatible note-graph scalar edits keep them. Deferred actions retain the original
global track order at equal frames. The separately reviewed constant-range proof allows interval scheduling only after first-sample ownership/values
commit and when endpoints plus intermediate points prove the normalized controls constant. Nonuniform wraps and
queued ownership transitions conservatively retain sample cadence; uniform loops and constant overrides remain
constant. Clocked helpers always retain sample cadence. Capacity acceptance remains open; see `docs/measurements/f1-fix/README.md`.

Clip launch/retrigger/stop/empty-scene behavior follows the shared quantized launch queue. Audio one-shot boundaries
split mix segments so automation releases when playback ends, including unwarped clips and tempo changes. Stop
clears lane/override ownership and restores bases while existing effect/release tails continue. `Bounce` configures
its own `Engine` with `diffProject`, so clip and scene exports use exactly the live evaluator and no UI clock.

`useControlStore.playback` contains sparse engine readouts, separate from saved data. Common pointer/MIDI gestures
intercept an active lane and write temporary overrides; unautomated gestures still author base values. MIDI pickup
uses the current Read/override value. Re-enable or an actual quantized clip launch restores Read; revision-acknowledged
engine snapshots discard released overrides without racing newer edits. Neither readouts nor override traffic enters
history or autosave. `ui/automation` provides a lane picker/list and beat/value editor; each point drag has a unique
history key. The internal clipboard, numeric fields, snapping, zoom, segment choice and multi-selection follow piano
roll conventions. Context menus expose Show automation, with missing/wired feedback. The built-in React pointer
capture API was checked through Context7 `/reactjs/react.dev` on 2026-10-17.

Production tests draw/undo/reload a looping filter sweep and compare captured worklet output across two loops with
offline clip/scene samples. Unit tests cover normalized/scaled/stepped evaluation, uneven blocks, loop boundaries,
BPM changes, wire-owned upstream controls, note helpers, one-shots, missing/disabled/empty lanes, edits, migrations,
MIDI/manual pickup/override/re-enable, relaunch and zero playback history/autosave writes. Note-graph lane scheduling
can cost more CPU than audio/mixer lanes. Touch recording is described below.

`ReturnTrack.automationSlots` and `MasterBus.automationSlots` are optional scene-indexed arrays of automation-only
`AutomationSlot` documents (ID, name, independent 0.25–256 beat loop, lanes). Missing/null cells stop the prior slot
at the next bar and restore authored bases. Scene launches launch/retrigger every present slot; individual slot
launch/stop uses the typed `automation/launch` owner command. Owner keys distinguish master from every possible
track ID. Return launch status joins `EngineStatus.tracks`; master has `masterAutomation`. Configuration edits
preserve launch phase; deletion drops ownership. Queued empty slots also cancel pending launches before first playback.
Clip and slot parsing retains well-formed cross-owner lanes with explicit unsupported-owner warnings; the editor marks
them unavailable and runtime compilation excludes them. Valid same-owner missing targets also remain recoverable.
Slots reuse the editor/evaluator and bounds, and remap nested routes through group/unlink.
Removing a return removes its slots plus saved control/MIDI/send-lane references without changing other owners' slots.

The session grid creates/edits/deletes/launches these cells. The Clip tab shows their loop-length setting and the same
lane editor; shortening is undoable and trims points. Show automation on a return/master control opens its slot in the
selected automation scene (scene 1 initially), creating it when empty. Editor keys reset point selection on slot changes,
following React's state-reset contract checked through Context7 `/reactjs/react.dev` on 2026-10-17.

Master effects and fader curves run per mix segment, including boundaries split by note events and audio endings.
Scene WAV exports launch the row's return/master slots and use the longest selected clip/slot for default duration.
Clip WAV exports launch only that clip's lanes, keeping the return/master authored bases and normal effect routing.
Production tests cover slot editing/trim/undo/reload, live status, no playback saves and real-worklet master-filter /
return-volume output against offline scene samples across wraps. A render-thread capture worklet copies every quantum
through its MessagePort after a silent readiness check; the tests require the complete comparison window and finite
samples. This avoids legacy ScriptProcessor startup/underflow capture loss. The AudioWorklet contract was checked
through Context7 against the current Web Audio specification. Simulated MIDI/manual tests cover all owner kinds;
no physical MIDI hardware check has been performed.

## Timeline automation

Automation lanes on the arrangement's timeline, in beats from the song's start, for every owner: tracks, returns, the
master and groups with a bus (`core/automation/timeline.ts`).

* **Model.** `Project.arrangementAutomation` is one `TimelineLanes { owner, lanes, open? }` per owner. The lanes are
  ordinary `AutomationLane`s with every clip-lane rule (normalized values, linear or hold, sorted, at most 64 lanes and
  2048 points, one lane per target), over `[0, MAX_TIMELINE_BEATS]`. `timelineOwnerAllowed` is the one predicate for
  who may own lanes: a track or return that exists, the master, a group with a bus. `open` is the lanes twisty, a view
  field written with `editView` and carried across undo by `withViewOf`; an entry with no lanes is kept only while open.
* **Edits.** `setTimelineLanes(project, owner, lanes)` keeps the owner's own targets, canonical, and refuses an owner
  not allowed; `editTimelineAutomation` makes it one undo step, a point drag merging under its gesture key. Lanes
  belong to owners, not regions: moving a track, a group or a region changes none. `removeTrack` drops the track's entry
  and lanes elsewhere that reference it (a send to a removed return); `withoutGroups` drops a removed group's;
  `setGroupBus(false)` keeps them, unavailable; `duplicateTrack` copies them onto the copy with fresh ids.
* **Which lane plays.** In arrangement mode, per target, at most one source: a timeline lane of its owner while it is
  enabled and has points; else a lane of the region playing on its track at the beat (the newest start under it),
  evaluated at the region's phase, wrapped while it loops up to its loop end; else the base. In session mode timeline
  and region lanes don't play. A region moved to another track has its own lanes' owner rewritten (`movedTo`), as a
  session clip's.
* **Engine.** `compileTimelineAutomation(project)` compiles the owners' lanes and every region's own lanes (with
  start, end or loop end, and clip length) against the current specs, and the note graphs they need;
  `automation/configure` carries it as `timeline`, from `diffProject` and `project-sync` alike, so the bounce plays
  them too. `ArrangementAutomation` (`core/engine/arrangement-automation.ts`) finds the regions under a beat once and
  keeps them while the beat stays in their span, so the per-sample `tick` searches nothing; a seek or a loop jump lands
  outside the span and finds them again. `EngineAutomation.setArrangement` follows the engine's mode: switching
  restores what the other source wrote, and into the arrangement the session's queues stop. `configured` counts only
  the current mode's lanes, so a project with none there keeps the fast block path. The constant-range proof for note
  lanes treats a region edge or a wrap inside a range as not constant. Overrides win over timeline lanes as over clip
  lanes, and last until *Read* or ■.
* **Files.** Since format v14 (`sanitizeTimelineAutomation`): an entry of a missing owner is dropped, a duplicate owner
  skipped, a lane naming another owner warned about and kept unavailable, `open` kept only for a real `true`; a group's
  entry stays while the group exists, bus or not. A region's own lanes are read with its track as their owner.
* **In the view** ([the arrangement](clips-and-arrangement.md#the-arrangement-clips-on-a-timeline)): lanes under each
  owner's row. *Show automation on timeline* (on any control, a group's included) reveals the Arrangement, opens the
  owner's lanes, adds the lane if missing and gives it the focus; *Show automation in clip* is the session clip or slot
  route above. The point gestures are shared with the clip editor (`ui/automation/point-gestures.ts`).

## Touch automation recording

`state/touch-store` owns explicit transient arm, per-gesture/source takes, target ownership and feedback. The common
control gesture (including the session header volume slider) intercepts armed edits only when that owner's instrument/audio clip or return/master slot is actually
playing. Selection cannot redirect capture. Learned MIDI enters after effective-value pickup; competing sources are
refused on a touched target. Native UI/MIDI event timestamps pass through the gesture path. Pointer/key release,
cancellation, unmount, disarm and re-enable finish; wheel/CC inactivity finishes after 800 ms. Disconnect finishes
valid takes. Document-epoch replacement cancels and disarms; incompatible, removed or resized destinations discard
that take atomically. Stop finishes before dispatch, and runtime status closes takes at actual launch/stop/retrigger
or one-shot boundaries. `LauncherStatus.stopBeat` carries owner stops even when a queued status was never delivered.

The worklet sends a compact tempo/playing/beat/audio-time clock anchor at the next quantum's start after tempo,
transport or launch commands. It builds the full track/readout/peak status once at that quantum's end, then at the
existing 30 Hz cadence. Clock snapshots do not traverse readouts or reset peaks. `AudioHost` updates recording from
both packet types but publishes only full status to UI listeners; readouts may arrive one quantum after the anchor
(2.667 ms at 48 kHz/128 frames). `audio/recording-clock` retains sparse audio-time
segments across tempo and transport changes; `AudioHost.recordingBeat` bridges AudioContext.currentTime and native
performance event timestamps into beats. Delayed events and MIDI release callbacks use their original timestamps;
render frames, animation callbacks and status message arrival times never advance recording. Suspended contexts
return no recording clock. Timing precision follows the render quantum and browser timestamp precision. Web Audio
and native Event timestamps were checked via Context7 official Web Audio and MDN docs on 2026-10-17.

`core/automation/record` splits absolute capture beats at loop wraps and applies spans in chronological order. Later
passes replace only their own touched regions. Original values/interpolation outside the span are retained with 1e-7
beat boundary guards; a new lane uses the normalized saved base around its span. Iterative linear simplification has
a tested 0.002 vertical normalized error bound and preserves endpoints/hold transitions. Takes stop after 256 beats,
64 targets or a bounded 16,384-sample raw buffer; saved limits remain 64 lanes and 2048 points per lane. Point overflow
rejects the whole take, preserving the project. Captured lanes become enabled. Source buffers never enter the
project/history/autosave; release commits all gesture targets and loop passes once, then releases overrides to Read.
Format v5 already stores the resulting lanes, so this slice needs no migration. Playback/offline rendering keep the
same evaluator, including the known extra CPU cost of sample-sized note-graph automation scheduling.
