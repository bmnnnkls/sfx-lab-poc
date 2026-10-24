# Implementation plan: performance and library

Status: **slices 0–7 implemented**. Product behavior and draft defaults are defined in
[SPEC-performance-and-library.md](SPEC-performance-and-library.md). Work proceeds in order below; each slice should
be independently reviewable and leave the existing examples/project files usable.

## 0. Establish reliable verification

Implemented 2026-10-17 on `codex/performance-and-library`:

- Reproduced the production failure: the installed macOS ARM64 Lightning CSS binary was truncated (`ERR_DLOPEN_FAILED`),
  and its loader masked that as a missing module. The lockfile already included platform dependencies. `npm ci` repaired
  the binary and restored production bundling without a Vite workaround or platform-specific direct dependency.
- Added Playwright-managed Chromium, `playwright.config.ts`, fresh-context browser fixtures and separate
  `test:smoke`, `test:audio` and `test:browser` commands. Smoke covers both examples playing through the real worklet,
  panel gesture undo/redo and reload, and a sample package round-trip into a fresh context. Audio covers stereo pan,
  master silence and undo with a tap that rejects zero-frame windows. Assertions/page errors fail the process;
  failure screenshots/traces and an HTML report are retained. Legacy feature scripts remain migration references.
- PR/main CI runs the unit/architecture suite and production smoke gate. Only main publishes Pages, with deployment
  permissions scoped to that job. New lockfile entries use verified public npm URLs so CI needs no local registry.
- Local verification: clean install, 1,335 unit/architecture tests (94 files), typecheck, production build, three smoke
  tests and one real-output audio test passed. GitHub's Linux job still needs its first remote run.

The original slice requirements are retained below for context. Next slice: **2. MIDI performance**.

- Make the local production build reproducible. The review on 2026-10-17 passed 1,335 tests across 94 files and passed
  typechecking, but production bundling failed because the installed Lightning CSS macOS ARM64 binary was missing.
  Diagnose installation/lockfile portability before changing application configuration to work around it.
- Add a portable browser smoke runner derived from `docs/browser-checks`: example playback, control edit/undo,
  save/reload and project package round-trip. Separate fast smoke checks from the full audio suite.
- Run checks on pull requests as well as main deployment. Keep architecture enforcement in the unit suite.

Exit: clean install, build, unit suite and smoke checks run from documented commands without cloud-only paths.

## 1. Shared target model and effective values

Implemented 2026-10-17 on `codex/performance-and-library`:

- Added framework-free `core/control`: serializable graph/mixer targets, stable structured keys, nested use paths
  guarded by module identities and node types, enumeration, live spec resolution, normalized scale conversion,
  pure base edits and explicit missing/incompatible results. Wired sockets remain wire-owned; their stored bases
  are editable, while performance overrides return an explanation directing callers upstream.
- Track instrument, note and insert graphs, return effects, master effects/volume, pan and post-fader sends share
  the same model. Instrument/insert parameter commands now carry graph scope to prevent ID collisions across domains.
- Per-instance graph values are saved in optional `Project.controlValues`; format v2 has an explicit v1 migration,
  bounded validation and committed v1/v2 fixtures. Existing exposed module knobs remain valid defaults. Group/unlink
  remap saved routes, including edits inside shared definitions; generic owner/node/module/return ID maps and explicit
  routes support future duplicate/asset insertion callers and report unavailable targets.
- Transient overrides live in a separate state store. The sync adapter diffs an effective engine projection; history,
  autosave and offline exports retain authored values. Release, stop and document replacement restore bases;
  invalid or newly wired targets lose transient ownership. Compact panel/property/mixer readouts show effective versus base
  and offer release. Voice-count rebuilds preserve the current effective instrument parameters.
- Panel instance controls, graph/property controls and mixer values use a common explicit gesture transaction: a long drag is one undo step,
  consecutive gestures remain separate, and XY changes commit atomically. Shared-definition panel edits retain their
  existing graph-authoring path. Wheel bursts share an 800 ms inactivity boundary. No MIDI, automation scheduling
  or later-slice UI is included.

- Verification: 1,357 unit/architecture tests across 98 files, typecheck, production build, four production smoke
  tests and one real-output audio test passed. New coverage includes nested instance identity, migrations and bounded
  parsing, wired module boundaries, group/unlink and asset-closure remapping, real engine override/release with zero
  autosave writes, long/separate/XY gestures, graph-domain isolation and voice-count rebuilds. Browser coverage checks
  independent shared-module values across panel/property edits, undo and reload. The build retains its chunk-size warning.

The original slice requirements are retained below as the shipped scope.

Likely touchpoints: new `core/control` module; `core/patch` resolution/flattening; `core/project`; `core/sync`;
`core/engine`; `state/project-store`; panel and mixer adapters. Extend architecture allow-lists deliberately.

- Define discriminated target types, target enumeration, spec resolution, normalized value conversion and pure base-value
  edits. Reuse existing scale helpers by moving shared arithmetic into core where needed, avoiding duplicate formulas.
- Resolve nested module-instance paths without changing shared definitions. Include mixer sends and master targets.
- Define missing/incompatible target results and ID-remapping helpers for duplicate, unlink, group and asset insertion.
- Add runtime effective-value overrides and compact status readouts. No playback mutation of the project document.
- Route manual controls through a common gesture transaction without enlarging the already broad project store API
  unnecessarily; keep UI adapters thin.
- Add versioned migrations/fixtures as saved fields arrive. The starting format was version 1; slice 1 explicitly migrates it to version 2.

Exit: one parameter in a module used twice can be addressed independently, survives rename/reload, and a runtime override
does not change history or autosave. Graph edits cannot silently redirect an old target to a different control.

## Salvaged foundations before slice 2 (2026-10-17)

Merged the independent `codex/salvage-claude-work` branch, based on `main`: per-block math-node parameter
reads and unwired pure-node evaluation; basic beat-synced Delay/Ping-pong and updated example echoes; filter
key tracking and Comb; and a pure, byte-validated MIDI message parser. Sources and deferred work are listed in
[ROADMAP.md](ROADMAP.md). The existing portable verification and slice 1 control model remain authoritative.

At the salvage merge, no held-note engine path, browser MIDI input or mappings had shipped. Slice 2a is now
implemented below; 2b can reuse `core/midi`. Slice 7 remains open for divisions, smoothing, buffer limits, persistence and timing verification.

Validation: the standalone salvage passed 1,362 tests across 96 files and typecheck/production build.
After integration, 1,384 tests across 100 files, typecheck, production build, four production smoke tests
and one real-output audio test passed. The sole textual merge conflict was the core export list; both
`control` and `midi` exports are retained. These counts describe the salvage integration, before slice 2a.

## 2. MIDI performance

### 2a. Held-note engine path

Implemented 2026-10-17 on `codex/performance-and-library`, preserving the integrated salvage after `5ad970f`:

- Serializable `track/noteOn` / `track/noteOff` commands carry adapter-assigned per-press IDs, source IDs and zero-based
  channels. `notes/sustain`, `notes/releaseSource` (optionally channel-scoped) and `notes/panic` are available through
  `EngineControls` and the existing worklet protocol. The short, graph-bypassing audition remains independent.
- Live and clip events join before the note graph. Its continuous render clock runs while transport is stopped;
  clip scheduling still follows transport, and grid generators align to transport beat zero when playback starts.
  Stop clears input/generator state while instruments, inserts, returns and master keep rendering release/effect tails.
- Runtime identity survives clip loops/edits, mapping and range splits, graph branches, arpeggiation, echoes and taps.
  Voices release by identity, including after stealing; same-pitch live/clip/source/channel owners remain independent.
- Disconnect/release cancels only the matching source/channel, including sustained and queued generated events in every
  graph. Panic releases all keys/pedals/generated events without stopping clip transport; future clip note-ons continue.
  Note topology, bypass or tap changes, instrument/voice rebuilds and track removal/replacement clear the affected
  track and its transitive note readers. Ordinary parameter edits keep state. Physical keys need a fresh press after
  structural cleanup. Document replacement and engine-sync disposal panic even when document IDs are unchanged.
- All ownership is transient, framework-free and independent of wall clocks, history, autosave and saved project data.
  No saved-shape change or migration. Offline rendering creates its own engine and remains deterministic; the heard-note
  preview uses the same clip identities and matching as playback. Slice 1 control targets and wired values are unchanged.
- Acceptance coverage includes held chords, repeated/equal-pitch sources/channels, sustain, clip/live overlap and clip
  edits/stops, transformed and arpeggiated live notes, delayed echo cancellation, stealing, panic, graph/tap cleanup,
  stop/restart, uneven render sizes, pitch and release tails. Production audio checks inject serializable commands into
  the real worklet to verify stopped holds, sustain, source release, note effects and panic, without Web MIDI access.

Limitations: incoming commands apply at the next render boundary; a complete press between renders is discarded as
zero-duration. Adapters must assign a unique note ID per press and pair physical releases with it. Natural key releases
allow echo repeats and the current arpeggio gate to finish; source release/panic cancel them. Panic preserves envelope
and effect tails. The existing rounding tolerance at odd render block boundaries remains one sample. Web MIDI access,
port lifecycle/parsing/settings, visible Panic UI and learn/CC mappings remain slice 2b.

Verification: 1,420 unit/architecture tests across 101 files, typecheck, production build (no chunk-size warning),
four production smoke tests and both real-output audio tests passed. The focused held-note audio test also passed
again against the final production build. Browser checks ran outside the filesystem sandbox because its local
preview server could not bind a port inside it.

### 2b. Browser adapter and MIDI learn

Implemented 2026-10-17 on `codex/performance-and-library`, after committed slice 2a (`c2d18c0`):

- `app/midi-input` owns Web MIDI access and ports. Only **MIDI → Enable MIDI** requests access (SysEx disabled)
  and starts audio from the user action. Unsupported/denied access is nonfatal; pending grants cannot re-enable a
  disabled/disposed adapter. Input status, individual input enable, channel filtering and selected/pinned instrument
  routing are available in settings. Ports detach/close on disable/disconnect and reopen on reconnection.
- Reuses the byte-validated parser, explicitly converting its 1–16 channels to engine 0–15. Each physical press has
  a unique ID; equal pitches are paired FIFO per source/channel. Sustain and channel-mode cleanup are source/channel
  scoped. Disconnect, input disable, route/filter changes, project replacement, Stop and visible **Panic** clear
  affected ownership; the slice 2a engine preserves release/effect tails and cancels queued generated notes.
- Right-click panel controls (separate XY axes) and mixer pan/send/faders to learn absolute 7-bit CC. The confirming
  message changes no sound. Escape/cancel, explicit conflict reassignment, learn-again, removal and device rebinding
  are implemented. Missing/wired targets remain unavailable with a reason; sustain CC64 and CC120–127 are reserved.
- Continuous controls, including stepped knobs, default to pickup against the current effective value. Crossing
  or reaching within half a CC step acquires control. Manual/base/effective changes, undo and reconnection rearm it.
  Conversion reuses the control scale/snapping helpers; selectors/switches use valid states and momentary switches
  follow the 64 threshold. Momentary release, disconnect, disable and mapping removal finish their common gesture.
- Unautomated CC edits use `createControlGesture`: one continuous burst within 800 ms inactivity is one undo step;
  a momentary press/release is one explicit gesture even across long holds. Existing transient overrides keep their
  ownership and receive effective edits. Notes/port/pickup feedback never enter project history or autosave.
- Project format **v3** adds bounded, portable `midiMappings` target/device/channel/CC records, with an explicit v2→v3
  migration and committed v3 nested/mixer fixture. Older unknown mapping fields are not reinterpreted. Group/unlink
  remap binding targets alongside saved instance values. Browser objects/settings and held input remain unsaved.
- Documentation verified through Context7 `/mdn/content` and current [MDN Web MIDI docs](https://developer.mozilla.org/en-US/docs/Web/API/Web_MIDI_API):
  secure context and permission required, limited browser availability, `requestMIDIAccess`, input messages,
  access state changes and port close lifecycle. Feature detection keeps unsupported browsers usable.

Verification: **1,436 unit/architecture tests across 103 files**, `npm run typecheck`, production build (no chunk-size
warning), **seven production smoke tests and all three real-output audio tests passed**. `git diff --check` passed.
Browser checks ran outside the sandbox so the preview server could bind localhost. Fake-port unit/browser coverage includes permission denial,
unsupported access, late permission grants, learning/cancel/conflicts, rebinding, disconnect/reconnect, nested targets,
wired ownership, scale/snapping, pickup, momentary cleanup, history and Low Light DJ-filter reload. Parsed lifecycle
commands are rendered in the real engine; simulated browser ports also feed the actual production worklet audio path.

Manual hardware check: **not performed**; no physical keyboard/controller/browser combination was tested. Simulated
coverage does not establish device-driver behavior or permission prompt UX on real hardware. No automation, MIDI output,
clock/sync, SysEx, MPE, pitch bend/pressure or note recording is included. Next slice is **3a**, deferred from this work.

## 3. Automation

### 3a. Saved lanes, engine playback and drawing editor

Implemented 2026-10-17 on `codex/performance-and-library`:

- Format **v4** adds optional clip `automation` lanes for instrument/audio tracks, with stable structured control
  targets, lane/point IDs, enabled state, normalized values and per-segment linear/hold interpolation. Parsing caps
  lanes at 64 per clip, points at 2048 per lane, IDs at 256 characters and paths at 32; numbers must be finite.
  Explicit v3→v4 migration discards formerly unknown automation fields. Committed v1/v2/v3 fixtures remain, with
  a new nested/mixer v4 fixture and round-trip/migration/hostile-shape coverage.
- Pure canonicalization sorts points and collapses equal times (last input wins). Points may occupy the closed
  interval [0, length]: an endpoint is approached before wrap, then the first value restarts. Empty/disabled lanes
  have no effect. Shortening trims points with undo; doubling repeats the curve and explicitly preserves its join,
  with a sub-sample left-limit point. Doubling refuses a result beyond the point cap. Clip copy/move preserves or
  remaps owner references; duplication gives fresh note/lane/point IDs. Session menus duplicate into an empty slot.
  Group/unlink route transformations now remap lanes alongside MIDI mappings and saved instance values.
- Engine-owned Read playback follows clip launch quantization, retrigger, stop, loop and tempo. Curves are evaluated
  in musical time for each sample; automated DSP processors and their wire-driven parameter consumers apply values
  within blocks, while other processors retain block rendering. Numeric stepped controls interpolate then snap;
  selectors/switches hold. Wire ownership remains authoritative. Note-graph helper controls run through a dynamic
  counterpart of constant baking before note scheduling. Audio one-shots release lanes at musical/sample endings.
- Manual and learned CC gestures temporarily override playing lanes without editing authored bases. Effective
  readouts show Read/Override and base values; re-enable, actual quantized relaunch and Stop release ownership.
  Revision acknowledgements prevent stale engine status from clearing a newer gesture. Playback/readout traffic
  has no history/autosave subscription. Offline clip/scene bounces use the same configuration and evaluator.
- Clip view switches between notes/waveform and Automation. The editor includes a searchable owner-scoped picker,
  readable lane list, enable/delete/clear, unavailable-target reasons, point drawing and multi-selection,
  grouped drags, time grid/zoom/playhead, numeric beat/real-value fields, segment interpolation, internal clipboard,
  copy/cut/paste/duplicate/delete and undo/redo. Panel/mixer context menus offer Show automation (XY axes separately).
- Verified React pointer-capture/cleanup contracts through Context7 `/reactjs/react.dev`. Production browser coverage
  draws and drags a filter sweep, undoes/redoes, reloads, and checks that playing does not rewrite autosave. A real-output
  worklet capture matches two loops of offline clip and scene filter-sweep samples within 0.00002 amplitude.

Verification: **1,463 unit/architecture tests across 109 files**, `npm run typecheck`, production build without
chunk-size warnings, **eight production smoke tests and all four real-output audio tests passed**. `git diff --check`
passed. The automation editor screenshot was inspected; browser checks ran outside the sandbox to bind localhost.
Return/master slots (3b), Touch recording (3c),
recording arm/take capture, presets and library features remain deferred. Note-graph automation currently uses
sample-sized note scheduling, which costs more CPU on dense note graphs; ordinary audio/mixer lanes keep block scheduling.
The point clipboard is internal to the app, as in the piano roll. No physical MIDI hardware check was performed.

The original slice requirements follow for context.

Likely additions: `core/automation`; clip lane fields in `core/project/types.ts`; persistence sanitizers/migrations;
automation scheduling in engine; sync commands; `ui/automation`; clip editor integration.

- Define lane/point IDs, normalized values, interpolation, enable state and numeric/count limits.
- Implement pure lane edits, canonicalization and target remapping. Cover clip length, duplicate, double and delete.
- Evaluate from engine beat time with event boundaries and continuous ramps, independent of UI refresh rate.
- Add Read, temporary manual override and re-enable behavior. Share effective-value ownership with MIDI.
- Build target picker, lane list, time/value editor, point gestures, clipboard, snapping and undo grouping.
- Extend offline rendering so clip and scene exports use the same lane evaluation as live playback.

Exit: a drawn filter sweep loops, follows BPM, survives reload, undoes, and produces matching expected timing in WAV
export. Test loop wraps, uneven render block sizes, discrete changes, missing targets and disabled/empty lanes.

### 3b. Return/master automation slots

Implemented 2026-10-17 on `codex/performance-and-library`:

- Format **v5** adds optional `automationSlots` arrays to returns/master, indexed by scene. Each slot has its own
  ID/name, 0.25–256 beat loop and bounded owner-scoped lanes. Explicit v4→v5 migration discards formerly unknown slot
  fields; the committed v5 fixture keeps earlier clip lanes and adds master/return slots. Earlier fixtures remain valid.
- Reuses the lane editor, normalized evaluator, typed targets and common manual/MIDI overrides. Session cells create,
  edit, delete and individually launch/stop automation; the Clip tab edits independent loop length with undoable trim.
  Show automation works on return/master controls. Group/unlink remaps their nested targets; missing/wired targets
  remain authored with unavailable feedback and acquire no runtime ownership.
- Scene and individual launches/retriggers use the musical launch queue. Empty cells stop that owner's previous slot
  and clear its overrides at the actual boundary, including cancellation before a queued first launch. Tempo changes
  follow beats; transport Stop restores bases. Status includes return slots and a separate typed master readout.
  Master effects/fader curves now process per mix segment so boundaries and per-sample playback agree with offline.
- Scene WAV exports include the selected row's return/master automation and default to its longest clip/slot length.
  Clip-only exports retain normal return/master processing with authored bases. Removing a return drops its slots and
  removes saved control/MIDI/send-lane references to it, preserving unrelated owners and undo.
- Tests cover independent lengths, boundaries/retrigger/empty slots, BPM, manual/MIDI pickup and re-enable, graph/
  mixer targets, wired/missing targets, slot deletion, return removal, route transforms, undo/reload, bounded parsing,
  old-version migration and clip/scene scope. Production tests exercise slot editing/status/autosave and compare actual
  worklet master sweeps/return throws with offline scenes across wraps. Touch recording and later slices remain deferred.

Verification: **1,481 unit/architecture tests across 113 files**, `npm run typecheck`, production build without
chunk-size warnings, **nine production smoke tests and all five real-output audio tests passed**. `git diff --check`
passed and the slot editor screenshot was inspected. The real-output capture now copies every quantum on a separate
render-thread worklet after a silent readiness check and requires a full finite-sample window: the legacy ScriptProcessor
tap intermittently lost startup/underflow samples. Clip and scene comparisons retain the 0.00002 amplitude limit.
React editor state reset and the AudioWorklet input/MessagePort contract were checked through Context7 official docs.
Browser checks ran outside the sandbox to bind localhost. No physical MIDI hardware check was performed.

The original slice requirements follow for context.

- Add automation-only slots to return/master documents, session UI and quantized launch scheduling.
- Reuse the lane editor and evaluator, adding independent loop length and clear empty-slot behavior.
- Extend scene launch/stop/status and scene bounce. Clip-only export excludes unrelated return/master automation.

Exit: a master sweep and return throw launch with a scene, repeat correctly, stop/reset correctly and appear in scene
exports. Removing a return handles its lanes and target references without damaging other tracks.

### 3c. Touch recording

Implemented 2026-10-17 on `codex/performance-and-library`:

- Explicit **Touch** arm is transient. Panel/property, mixer and session-header pointer/keyboard/wheel gestures
  and learned MIDI CCs address only the target owner's currently playing instrument/audio clip or return/master slot. Controls and lanes show recording/override
  state and explain missing destinations; selecting a different clip never redirects a take. MIDI pickup must succeed
  against the effective value before any capture. Competing sources cannot acquire the same touched target.
- `AudioHost` bridges AudioContext time to worklet-stamped beat/tempo reports. Native event timestamps survive delayed
  main-thread callbacks; sparse tempo/transport segments also timestamp delayed MIDI inactivity releases. No animation
  frame counts or message-arrival clocks determine recorded beats. Precision follows the audio render quantum and
  browser timestamp precision. Context suspension cannot advance a take's musical clock.
- Per-gesture/source buffers stay outside the project, history and autosave. Explicit pointer/key release or cancellation
  keeps the take; wheel/absolute CC input releases after **800 ms** of inactivity, with delayed callbacks closing at
  the original deadline. A momentary switch releases explicitly. Disconnect/disable closes valid MIDI takes. Transport
  stop, actual owner stop/retrigger and one-shot end close at their boundaries; a new movement can begin a new take.
  Disarm/re-enable/unmount finish; project replacement cancels and disarms. Removed/resized/incompatible destinations
  discard the entire affected take rather than partially commit or redirect it.
- Wraps split into local intervals, applied in chronological order so the latest pass replaces only its touched spans.
  Original values and interpolation outside each span survive, using **1e-7 beat** boundary guards to avoid accidental
  ramps. New lanes restore the saved base around the take. Linear simplification bounds normalized vertical error to
  **0.002**, retaining endpoints and hold transitions. Takes cap at **256 beats**, **64 targets**, and **16,384 raw samples**;
  saved lanes retain the existing 64-lane/2048-point bounds. Overflow finishes capture or rejects the completed take
  atomically with feedback; it never silently truncates surrounding points.
- A completed gesture commits all its controls/loop passes in one history transaction and schedules one autosave.
  Recorded points use the existing format **v5** lane representation; no new saved fields or migration are required.
  Read playback and clip/scene WAV export reuse the existing evaluator. Presets/library and later slices remain deferred.

Verification: **1,505 unit/architecture tests across 117 files**, `npm run typecheck`, production build without
chunk-size warnings, **11 production smoke tests and all six real-output audio tests passed**. `git diff --check`
passed; the Touch UI screenshot was inspected. Tests cover boundary preservation, multiple passes, holds, fast turns,
step preservation, simplification error, buffer/point limits, independent sources, atomic multi-control undo, pickup,
timeout, delayed event/release timestamps, tempo changes, exact stop/retrigger and audio one-shot endings, destination
removal/replacement and zero in-progress autosave writes. Browser checks record both mixer and session-header gestures,
undo/redo/reload, then compare a reloaded Touch take's full finite worklet sample window with offline scene rendering
at the unchanged **0.00002** amplitude limit. Browser checks ran outside the sandbox using a temporary port-4175 config
because another checkout owned port 4173; the temporary config was removed. The package-import smoke check now uses
the test page's origin for its independent context. No physical MIDI hardware check was performed.

The original slice requirements follow for context.

- Add explicit arm, active-owner destination checks and an audio-clock timestamp bridge for main-thread gestures.
- Capture separate take buffers from pointer/MIDI sources; define pickup, release timeout, wrap and interrupted-take rules.
- Replace only touched intervals with preserved boundary values; simplify within a tested error tolerance.
- Commit one undoable take without per-message persistence. Expose recording/override state in controls and lanes.

Exit: recording two passes over a loop preserves untouched material, undo restores the prior lanes, and playback after
reload/export reproduces the recording. Test fast turns, long holds, UI stalls, tempo changes, disconnect and stop.

## 4. Snapshots and project presets

Implemented 2026-10-17 on `codex/performance-and-library`, after slice 3c (`f953a5c`):

- Added storage-independent `core/preset` snapshot scopes, capture/CRUD, partial recall diagnostics and normalized
  A/B morph. The **Sounds** tab saves authored bases for an instrument, note graph, effect graph or whole owner
  with mixer; missing/replaced/wired targets report explicit reasons. Recall is one history transaction. Continuous
  morph values use the live normalized scale (including log); selectors/toggles switch at 50%, numeric steps snap,
  and momentary/trigger buttons are excluded. Morph gestures use the common gesture/Touch path and undo once.
- Defined immutable instrument, audio-effect and note-effect payloads, transitive module/sample dependencies and
  opaque revision IDs with canonical structural compatibility signatures. Instruments include notes and voice settings;
  graph nodes carry their panel presentation. Named presets stay embedded and recall against compatible revisions,
  including another owner with the same graph identities. Structural/configuration/stereo/bypass/voice changes require
  a new revision; ordinary sound values and sample choices remain preset state. Presets exclude clips, mixer sends,
  MIDI mappings and external routing; graphs containing external track routing are refused with feedback.
- Added `Project.sampleBindings` addressed by graph owner and guarded nested instance path. Absent bindings inherit
  shared sampler defaults; explicit null means silence. Sounds exposes per-instance choices and reset to shared
  defaults; root sampler property pickers show/edit the active binding. Shared definitions remain unchanged. Live and
  offline engine projections apply sample bindings before numeric values. Group/unlink preserve instance routes;
  sample removal clears active bindings while saved presets retain reportable missing dependencies. Playback sample
  discovery stays separate from the complete saved-sound dependency closure.
- Recall updates bases under Read and reports the number still controlled by automation. Armed recall requires every
  affected owner to have an acknowledged playing destination; all controls write hold steps at the same audio-clock
  beat, along with bases/sample state, in one undo transaction. Steps persist until the next authored point/loop end.
  Destination or lane/point-limit failures reject the recall atomically. Existing Touch gestures finish first.
- Format **v6** adds bounded snapshots/presets (128 each), asset revisions (64), values/sample bindings (4096 per
  record), explicit v5→v6 migration and a committed v6 nested-sample fixture alongside v1–v5. The parser reconstructs
  known fields, recomputes structural signatures, preserves unavailable references and warns on malformed/overflow
  state. Deleting presets releases unreferenced revisions. No catalog, folders, bundles or XY corners are included.
- Verification: **1,520 unit/architecture tests across 119 files**, typecheck, production build without chunk-size
  warnings, **12 production smoke tests and eight real-output audio tests**. New browser checks save/recall/undo/reload
  two sounds and morph; real worklet checks recall a numeric preset and reproduce two shared sample-instrument uses
  with different samples after fresh reload, within 0.00002 amplitude of offline rendering. Sounds screenshot inspected.
  Browser preview used isolated port 4175 outside the sandbox. No physical MIDI hardware check was performed.

The original slice requirements are retained below as the shipped scope. Next: **5. Library catalog and folders**.

Likely additions: `core/preset` for capture/compatibility/recall; project snapshot/asset records; UI preset browser;
sync/base-value integration. Keep storage-independent types ready for library use.

- Implement scope-aware snapshot capture, CRUD and partial recall reporting; one recall equals one undo transaction.
- Define reusable instrument/audio-effect/note-effect asset payloads and revision IDs before storing their presets.
- Add sample bindings per module instance and dependency collection; preserve current samples as default bindings.
- Implement presets against a compatible asset revision. Capture sample choices as discrete state, excluding hardware
  and external routing. Test shared module defaults versus per-instance overrides explicitly.
- Define recall during Read/Touch and ensure a recorded recall creates stepped events atomically.
- Add A/B snapshot morph after basic recall; defer XY corners until the shared interpolation rules are proven.

Exit: save two sounds, recall/undo/reload each, and reproduce a sample-based instrument with two different module uses.
Graph mismatches report missing targets. Morphing respects logarithmic scales and discrete values.

## 5. Library catalog and folders

Implemented 2026-10-18 on `codex/performance-and-library`, after slice 4 (`d853bce`).

- **5a:** `core/library` defines storage-independent folders, mixed items, immutable asset revisions, associations,
  dependency previews and pure copy/insertion rules. The Library tab has nested folders, duplicate names, search/type
  filters, move/rename/duplicate, and recoverable recursive trash/restore. Saving a sound captures its current state and
  all compatible embedded presets on that owner, with the full nested module/sample closure. Presets remain first-class
  browsable items associated with their asset. Every save creates a fresh immutable revision; name matches never overwrite.
- `storage/library-database` coordinates **sfxlab database v2**, adding the catalog store in place and preserving the v1
  samples store. Both adapters close on version changes. A blocked legacy tab produces an actionable retry message.
  Serialized read/write transactions read current metadata before applying synchronous edits; completion, not request
  success, acknowledges a write. Catalog and optional blob writes roll back together on abort/quota failure.
- Insertion explicitly creates an instrument track or replaces a compatible selected graph. Fresh IDs cover nodes,
  wires, modules, derived/nested port and knob IDs, automatic module-control keys, presets, revision IDs and every
  saved target/path/binding. Instruments replace instrument+notes+voices; effects replace only the chosen graph.
  Existing clips/mixer routing/hardware mappings remain authored and can report unavailable graph targets. Each
  insertion is one project undo transaction; catalog operations do not enter that history. Loaded copies play, reload
  and package independently after library rename/trash. Format **v7** adds bounded informational `libraryOrigins`, an
  explicit v6 migration and a committed fixture; origins never cause runtime library lookups or linked updates.
- **5b:** MIDI/audio clip saves preserve notes and full audio trim/loop/warp/gain/fades/sample state. Automation stores
  owner-relative targets with a normalized flattened topology/configuration guard. Compatible destinations remap to
  their fresh IDs; incompatible lanes are omitted with an explicit report. MIDI clips leave instruments unchanged.
  Occupied slots require explicit Replace. Samples are cataloged by their existing content hash with metadata,
  audition and shared bytes across folders/assets. All bytes and revisions are conservatively retained through trash.
- Preview builds a temporary document and renders a separate `Bounce`/`Engine`, then uses its own AudioContext/source.
  Instrument/note-effect previews use a note; audio effects use a test tone with the correct track/return/master input.
  Selection/filter/folder/tab navigation cancels pending rendering, stops sources and closes the preview context.
  External track taps and sends are refused on asset capture (including nested modules) and external lane targets
  are refused on clip capture; input-boundary mismatches are explicit errors. No unrelated track can be auto-connected.
- Library UI/workflows load on demand, retaining a production build without chunk-size warnings. IndexedDB upgrade,
  blocked/versionchange and transaction-abort contracts were checked via Context7 `/mdn/content` (official MDN).

Verification: **1,541 unit/architecture tests across 123 files**, typecheck and production build without chunk warnings;
**15 production smoke checks and nine real-output audio checks**. Failure coverage includes quota, interruption after
successful requests, cross-connection serialization, legacy/open-tab upgrades, duplicate names, nested derived interfaces,
sample retention and project reload/package independence. Browser preview cancellation and the Library screenshot were
inspected. The remapped sample asset still matches offline audio within **0.00002** after trash/reload; existing audio
readiness/finite-window checks and tolerances remain unchanged. Browser preview used isolated port 4175 outside the
sandbox. No physical MIDI hardware check was performed. At this slice, bundles (6), tempo polish (7) and XY corners were deferred.

The original slice requirements are retained below as the shipped scope. Bundle exchange is implemented in slice 6 below.

Likely additions: `core/library` for item/folder/dependency/remapping rules; `storage/library-storage` for IndexedDB;
`app/library`; library state interface and `ui/library`. Reuse sample blobs without treating project history as catalog undo.

### 5a. Catalog and instrument/effect/preset workflows

- Introduce folder/item/revision schema, transactions and migration. Coordinate database upgrades with the existing
  `sfxlab` sample store, including open-tab/version-change handling; never lose the existing samples store.
- Implement folder CRUD/moves with cycle prevention, search/filter and preset associations.
- Save assets with full nested module/sample closure; insert copies into projects with consistent ID remapping.
- Add explicit load/replace scopes and dependency previews. A project insertion is one undo step; library catalog
  changes use their own recoverable operation log or trash mechanism.
- Keep loaded project assets independent. Record provenance for later explicit updates without live linking.

### 5b. Clips, samples and preview

- Save/insert MIDI and audio clips, remapping portable lane targets or reporting incompatibilities.
- Catalog existing sample bytes by hash, with audition and metadata. Reuse blobs across folders and assets.
- Preview instruments/effects in an isolated temporary engine context; stop preview and release resources on navigation.
- Preserve external routing deliberately: exclude project-specific sends/track taps from reusable payloads unless
  converted into declared ports; show unresolved routing instead of binding to an unrelated destination track.

Exit: organize a folder containing an instrument with two presets, an effect with presets, MIDI/audio clips and samples;
load them into a new project; delete/change the originals; the project still reloads and exports correctly. Test storage
quota failure, interrupted writes, duplicate names, nested dependencies and conservative blob retention.

## 6. Bundle exchange

Implemented 2026-10-18 on `codex/performance-and-library`:

- Added deterministic selected-item/folder closure and reviewed `.sfxlib` ZIP export, associated presets/assets,
  immutable revisions, ancestor hierarchy, nested modules and sample bytes. Default complete export refuses missing
  content; explicit partial files carry both a manifest marker/exact missing-hash list and a partial filename.
- Added independent bundle manifest v1/migration dispatch, strict known-field reconstruction and reference/signature
  checks. Project format stays v7. [LIBRARY-BUNDLE.md](LIBRARY-BUNDLE.md) specifies the format and all budgets.
- Preflight every ZIP central/local header, path, count and size before expanded allocation. Reject unsupported ZIP
  features, aliases/overlaps/gaps, unsafe paths and CRC mismatches. Stream DEFLATE in 1 KiB compressed chunks,
  check actual output as well as declarations, and verify content hashes before writing. Aggregate byte/object/depth
  and expanded module fan-out limits supplement existing per-record limits.
- Import stages without writes and presents hierarchy, items, revisions/modules, samples, expanded size, conflicts
  and missing bytes. Confirmation always creates a fresh named root with remapped folder/item/revision/state IDs;
  repeats deliberately create independent copies. Private graph IDs remain scoped to revisions until project insertion
  remaps the entire graph/interface/target closure. Partial imports are reviewable but not publishable in v1.
- Publish against the latest catalog in one metadata+blob transaction. Compare existing bytes inside that transaction,
  retain identical hash blobs and abort on conflict; quota and post-request abort preserve the previous catalog/bytes.
  The memory fallback shares a blob map with sample storage. No cleanup or linked updates were added.
- Verification: **1,562 unit/architecture tests across 124 files**, typecheck and production build without chunk
  warnings; **16 production smoke checks and ten real-output audio checks** passed. The bundle-specific audio case
  inserts a sampled bundle asset, trashes its original, reloads and matches offline within **0.00002** amplitude.
  Worklet readiness, finite-window checks and existing tolerances remain. Bundle review/panel screenshots were inspected.
  Browser checks used isolated port 4175; the temporary config was removed. No physical MIDI hardware was tested.
  Tempo polish and snapshot XY corners remain deferred.

Original scope and exit criteria:

Likely additions: `storage/library-transfer`, versioned manifest types in core, and import/export UI. Extract shared
archive/hash helpers from `project-transfer` only where their contracts actually match.

- Export item selections and folder subtrees with deterministic dependency closure and completeness checks.
- Stage import, validate records/references/hashes and resource budgets, then show the import summary.
- Remap ID conflicts, preserve hierarchy, deduplicate blobs and atomically publish the catalog transaction.
- Keep bundle format migrations independent from project format migrations. Document the manifest and extension.

Exit: export a folder, import into an empty library and a conflicting library, then load matching sounds/clips. Verify
duplicate import behavior, preset associations, missing bytes, invalid hashes, future versions, cycles, archive limits
and rollback on storage failure. Existing project package round-trips still pass.

## 7. Tempo polish

Implemented 2026-10-18 on `codex/performance-and-library`, after slice 6 (`ac33fc0`):

- Preserves Time (0.001–2), Sync off/beat (0/1), their defaults and normalized automation ranges. New optional
  `division` is a selector: 0 retains numeric Time in beats; indices 1–24 enumerate 1/32 through four bars,
  each straight/dotted/triplet. Off ignores division and retains the original seconds value. Both example echoes
  explicitly choose dotted eighths, retaining their authored numeric beat values and original-tempo timing.
- Delay and Ping-pong allocate eight seconds per channel once at construction. At 48 kHz this is 1,536,008 bytes
  per mono line / 3,072,016 bytes for stereo Delay or Ping-pong; at 44.1 kHz it is 1,411,208 / 2,822,416 bytes.
  Live audio follows the browser/device context rate; bytes/channel are `4 * (ceil(8 * sampleRate) + 2)`
  (stereo at 192 kHz: 12,288,016 bytes). There is no line allocation or resizing on BPM edits. Project tempo supports 40–240 BPM. The longest division,
  four dotted bars (24 beats), requests 36–6 seconds over that range. Requests above eight seconds cap at eight;
  properties visibly report requested/applied time and capacity. Four straight bars fit at ≥120 BPM, dotted at
  ≥180, triplet at ≥80. No application-wide delay-count/memory budget is added; each instance incurs this fixed cost.
- Two stationary interpolated taps crossfade linearly over 20 ms on time/mode/division/tempo changes. Initial timing
  applies immediately. Feedback uses the same blended tap, including both Ping-pong channels. Running ring buffers
  never reset; there is no pitch glide or graph rebuild. Rapid changes finish the active fade then take the newest
  request, bounding settling latency at 40 ms. During a transition echoes can overlap, attenuate or repeat as the
  two historical taps mix; this is an intentional transition sound, not musical rescheduling of stored echoes.
- Properties show effective authored/per-use/Read/override timing at the current tempo; card previews use the same
  resolver and project BPM (their existing two-second picture simply omits later echoes). Wired Time remains driven;
  moving-wire pictures/readouts describe a static approximation. Long dormant echoes no longer terminate offline
  export at the short silence gate: documents containing Delay/Ping-pong render the explicit maxTail budget before
  trimming. Default/max tail limits remain 10/30 seconds; this also covers serial delays without guessing silence.
- Project format **v8** adds optional `division`; explicit v7→v8 migration discards formerly unknown divisions and
  target references throughout graph/module/revision/automation/preset data. Committed v7/v8 timing fixtures and all
  existing v1–v7 migration/package round trips remain. Absent division stays absent when sanitizing old node records,
  preserving strict existing `.sfxlib` node payloads. Catalog schema and bundle manifest remain independently v1;
  bundle exchange covers old missing divisions and new divisions, insertion and project reload.
- Verification covers known impulses across BPM/division combinations, cap endpoints, dotted/triplet arithmetic,
  crossfade discontinuity bounds and rapid edits, block-size independence with running feedback, free-seconds tails,
  stereo/ping-pong echoes, persistence, legacy bundles, UI limit reporting/undo/reload and real-worklet/offline stereo
  agreement across live tempo edits at the unchanged 0.00002 amplitude tolerance.

Final verification: **1,591 unit/architecture tests across 126 files**, typecheck and production build without
chunk-size warnings, **17 production smoke checks and all 12 real-output audio checks passed**. The timing-limit
screenshot was inspected. Browser checks used isolated port 4175 via a temporary config removed before commit;
production defaults remain unchanged. An earlier unit run hit the existing worklet import test's five-second
timeout; the unchanged final full suite passed. Existing audio tolerances, capture readiness and finite-window checks
were preserved. Snapshot XY corners remain deferred. No physical MIDI hardware was tested.

## Delivery discipline

- Implement one slice at a time; update this plan and TASKS as slices ship. Document shipped contracts in ARCHITECTURE.
- Each saved-shape change gets migration fixtures and round-trip tests; each new import surface gets bounded validation.
- Run relevant pure tests during work, then the unit/architecture suite, typecheck, production build and fast browser
  smoke set before delivering a slice. Run focused full audio checks when scheduling, routing or DSP behavior changes.
- Use portable simulated inputs for repeatable MIDI tests; retain a manual hardware acceptance check for timing/feel.
- No cloud service, filesystem watcher, automatic library linking, arrangement editor or external MIDI synchronization
  is required to finish this plan. Revisit those only as explicit scope additions.
