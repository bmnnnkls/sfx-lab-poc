---
status: done
date: 2026-10-18
shipped_in: architecture/control-and-automation.md
note: "Slices 0-7 implemented: MIDI and learn, automation, snapshots and presets, library, bundles, delay timing."
---
# MIDI, automation, presets and library

Status: **slices 0–7 implemented**. Written 2026-10-17.

This is the product specification for the next development sequence. The implementation slices and verification
gates are in [PLAN-performance-and-library.md](PLAN-performance-and-library.md). This document takes precedence
over older sketches in TASKS.md where they disagree.

## Outcome and order

Turn the existing patcher and session view into an instrument people can perform, record, revisit and reuse:

1. Play instruments with MIDI and map hardware controls to the panel and mixer.
2. Draw and record control automation, then edit it alongside clips.
3. Save snapshots and instrument/effect presets.
4. Organize instruments, effects, presets, clips and samples in a personal folder library.
5. Exchange folders and their dependencies as library bundles.
6. Add tempo-synced delays and related timing polish.

The shared parameter-addressing foundation comes first. It prevents each feature inventing its own way to identify
a knob. Deliver each numbered feature in usable slices; do not wait for the library before shipping MIDI.

## Existing foundations

The app already has polyphonic instruments, note graphs, audio clips, reusable modules, panel controls, insert graphs,
returns, master effects, a mixer, immutable project history, autosave, project packages and deterministic offline WAV
rendering. The engine is pure TypeScript and runs both offline and in the audio worklet.

Important gaps in the current implementation:

- The engine exposes a short audition command, not a held-note input lifecycle. Audition releases after 0.3 seconds.
- Module definitions are shared, but exposed controls can have values per use. A performance target must address the
  particular use rather than accidentally change every instrument using that module.
- Parameters, mixer values and module overrides currently have different edit paths.
- There is no saved automation or personal library catalog. Sample bytes already live in IndexedDB by content hash.
- Offline export launches one clip or scene. New automation must be rendered by the same engine, not by UI timers.

## Shared control targets and value ownership

Introduce a typed, serializable control target used by mappings, automation, snapshots and presets. Proposed shape:

- Owner: a track, return, or master.
- Domain: instrument graph, note graph, insert graph, or mixer.
- Graph target: stable module-instance path, node ID and parameter ID.
- Mixer target: volume, pan, or send amount; sends include the destination return ID.

Use structured fields rather than concatenated display names or canvas positions. Resolve instance paths through the
existing module flattening and override machinery. Renaming/reordering must preserve a target. Duplicating an object
must remap its internal targets. Replacing a graph must report targets that no longer exist.

Every target exposes its range, scale, step, default and whether it can be automated. Continuous values use normalized
0..1 positions for mapping and curve interpolation, converted through the parameter's scale. Stepped values snap;
enums and switches use hold interpolation. An XY pad has two independent targets. Structural choices such as graph
topology, sample selection and track routing are not continuous automation targets in the first release.

Keep authored base values separate from effective playback values. Automation playback and live readouts must not
write project history or trigger autosave every audio block. When playback releases a target, its base value returns.
An unautomated UI or MIDI edit changes the base value; one gesture is one undo step.

Wired parameter sockets retain the existing wire-driven behavior. Initially, direct automation/MIDI of a driven
parameter is unavailable with an explanation; users target the upstream control instead. This avoids two competing
sources silently overriding each other.

## MIDI input and learn

### Playing

Provide a MIDI settings surface with available inputs, enable/disable, channel filter and connection status. Request
browser MIDI access only from a user action. Unsupported or denied access leaves the rest of the app usable.

Default routing is to the selected instrument track. A track can be armed/pinned as the input destination so selecting
effects or another clip does not redirect a performance. Only one note destination is armed initially. Notes flow
through that track's note graph before reaching the instrument, including while transport is stopped.

Support note-on, note-off, velocity, sustain pedal and all-notes-off. Treat zero-velocity note-on as note-off. Track held
notes by source and channel as well as pitch; live notes and looping clip notes must not release each other's voices.
Release affected notes on disconnect, destination change, disable, project replacement and panic. Sustain affects the
matching live source only. Provide a visible Panic action. Do not implement MIDI clock, output, MPE, SysEx or external
transport sync in this sequence. Pitch bend and pressure are follow-ups.

### Learning controls

Right-click a panel control or mixer value and choose **MIDI learn**. The next eligible CC binds it; Escape cancels.
Show, edit and remove bindings in a mappings list. Learning does not change the sound before a binding is confirmed
by the first CC. Sustain and MIDI channel-mode messages are reserved, not accidentally learned.

Start with absolute 7-bit CC input. Use the target's existing scale and snapping. Continuous controls default to
pickup: the hardware must cross the current effective value before taking control, avoiding jumps after preset recall.
Switches/selectors map CC ranges to valid states; momentary controls follow press/release thresholds. Relative encoders,
14-bit CC and hardware feedback are later work.

A source CC maps to one target by default. Learning an already assigned source presents an explicit reassignment
choice rather than silently changing both controls. A target can have separate bindings from different inputs.

Mappings belong to the project as a collection of target references, not to shared module definitions. Device/channel/
CC selectors travel with the project; browser-specific device resolution remains local. A missing device is shown as
unavailable and can be rebound without recreating target assignments. Library presets do not carry hardware mappings.

CC changes use the same control-edit path as mouse gestures. Coalesce a continuous movement into one history entry,
with a bounded inactivity timeout for devices that provide no gesture boundaries. Live note messages never enter
project undo history. MIDI note recording into the piano roll is a separate follow-up; this sequence records controls.

## Automation editor and recording

### Scope and launch behavior

Start with automation attached to instrument and audio clips. A clip owns lanes that target its own track's instrument,
note graph, effects or mixer. Audio clips can automate effects and mixer values. Lane timing is in beats relative to
the clip, loops with it, and follows its launch/stop/retrigger behavior and tempo changes.

Then add dedicated automation slots for returns and master, indexed by session scene. These contain automation only,
have their own loop length, and launch/stop with the same quantization as other slots. An empty scene slot stops the
previous automation on that owner and restores its base values. No cross-track lane targets in this release. This gives
master sweeps and return throws a clear owner without conflicting clips fighting for a parameter.

There is no song arrangement timeline in this sequence. A dedicated automation slot is the later foundation for longer
performance sequences. The existing clip/scene WAV export includes all automation belonging to the selected scope;
scene export includes return/master automation slots in that scene.

### Editing

Add an Automation view beside the clip's note/waveform editor. Choose targets by **Show automation** on a control or
through a searchable target picker. List lanes by readable owner/control names, with unavailable targets visibly marked.

Support adding, moving and deleting points; selection, copy/cut/paste, duplicate, time snapping, zoom, lane enable,
clear, and undo/redo. Allow typed point time/value entry. Continuous segments offer linear or hold interpolation;
curves beyond linear are deferred. Display values in the control's real unit even though interpolation uses normalized
positions. Points at equal times collapse deterministically. One drag is one undo step.

An empty lane has no effect. With points, hold the first value before the first point, interpolate between points and
hold the last value until the loop boundary; restart at the first value on wrap. Do not interpolate across the loop
boundary implicitly. Clip shortening trims out-of-range points with undo; doubling repeats the lanes as well as notes.
Clip duplication and movement preserve/remap the appropriate targets.

### Playback and precedence

Read mode plays enabled lanes. Manually touching an automated control temporarily overrides its lane and shows an
override state. **Re-enable automation** or the next clip launch restores lane control. Stopping clears overrides and
automation so the saved base values return. Distinguish base and effective values in the control/property display.

Evaluate automation in the engine using musical time. Continuous changes must be smoothly applied within render
blocks, rather than arrive as coarse UI updates. Stepped transitions occur at the correct event boundary. Audio-rate
patch modulation keeps its existing semantics; automation changes control/base parameter inputs rather than adding
another arbitrary modulation wire.

### Recording controls

Use an explicit automation arm and **Touch** recording as the first write mode. During playback, mouse and learned
MIDI movements write the active clip/automation slot of the target owner. No active destination means recording is
disabled with a reason; it must never overwrite an unrelated clip.

Capture beat timestamps from the audio clock, not from render-frame counts. Touch overwrites only the touched span,
preserving points outside it and inserting boundary values to prevent accidental ramps into untouched material. On
release, return to the underlying lane; define MIDI release by a documented inactivity timeout. Split takes at wraps;
the latest pass replaces only its touched spans. Sustain recording is outside control automation.

Simplify captured curves with a bounded error measured in normalized control positions, preserving endpoints and
steps. Set limits on lanes, points and recording duration. Commit the completed take as one undoable transaction;
keep an in-progress buffer separate from the saved project. Stop, disconnect or project replacement closes or cancels
the take explicitly. Latch, destructive Write mode and overdub/combine modes are later work.

Shipped Touch defaults (slice 3c): 800 ms wheel/MIDI inactivity, 0.002 normalized simplification error, 256 beats and
16,384 raw samples per take, 64 target lanes and 2048 saved points per lane. Explicit release/cancel, disarm,
re-enable and disconnect finish valid takes. Owner stop/retrigger/one-shot end closes at its musical boundary;
project replacement cancels and disarms. Destination removal, resize or incompatibility discards that take atomically.
Concurrent sources have separate buffers and cannot write the same target simultaneously. Without a recording
destination, ordinary manual control editing remains available with clear Touch-unavailable feedback.

## Snapshots and presets

A **snapshot** saves control values for an existing instrument/effect setup in this project. It does not replace nodes,
wires, samples, clips or MIDI mappings. Scope is one instrument, note graph, effect graph, or optionally a track's
instrument/effects/mixer together. Include module-instance overrides. Save/name/update/duplicate/delete/recall; recall
is one undo step. Missing targets produce a partial-recall report rather than corrupting the graph.

A **preset** is a named sound state associated with a reusable instrument or effect revision. An instrument asset
contains its instrument graph, note graph, voice settings, panel presentation and dependencies. An effect asset is a
typed audio or note-processing graph with its interface, panel and dependencies. Presets store values plus any sample
selections needed for that sound, referencing a compatible asset revision. They exclude clips, hardware mappings and
unrelated track routing. A structural edit creates a new asset revision instead of pretending a values-only preset
can reproduce a different graph.

Offer Save snapshot, Save as preset and Recall with clear scope. Before the personal library exists, keep named
presets embedded in the project; later **Save to library** promotes the same records without a format rewrite.

Automation remains authoritative until touched/re-enabled according to the rules above. Recall updates base values
and shows which values automation currently controls. With automation armed, recalling a snapshot records affected
controls as an atomic set of stepped changes at the recall beat. Otherwise recall never rewrites lane points.

A/B morphing ships as a slider between compatible snapshots; an XY control can blend four
compatible corners later. Interpolate continuous values in their normalized scales, switch discrete values at a defined
threshold, and exclude momentary buttons. Record a morph through the same automation path.

### Shipped slice 4 defaults

The **Sounds** tab captures authored base controls, including nested instance overrides; it excludes momentary/trigger
buttons and wire-owned/structural controls. Snapshots leave sample choices unchanged. Continuous A/B morphing uses the
live normalized scale, numeric stepped controls interpolate then snap, and selectors/toggles switch at **50%**.
Morph requires identical scopes/target sets and all targets available. A gesture is one undo step and can record Touch.

Embedded presets include discrete sample choices, including explicit silence. Instance bindings are independent of
shared definitions; **Use shared default** removes the binding. Root sampler property pickers edit the active binding.
Instrument presets also capture note-graph controls; audio/note effect presets capture only their selected graph.
Assets carry graph/panel/voice/module/sample payloads. Values and samples may change within a compatible revision;
topology, control configuration, stereo/bypass and instrument voice settings require a new revision. Names and canvas
positions do not affect compatibility. An existing compatible graph may belong to another owner. Library insertion now remaps the complete dependency closure as described below. External track-routing nodes are refused on preset save/recall;
presets never capture mixer sends or MIDI assignments. Missing samples/targets produce explicit partial-recall reports.

Normal recall updates bases, releases the recalled controls' temporary overrides, leaves authored lanes unchanged and
reports controls still owned by Read. Armed recall first finishes existing Touch gestures, then requires an acknowledged
playing destination for every affected control. It commits all base/sample changes and stepped lane points at the same
recording-clock beat as one undo step. Steps hold until the next authored point or loop end. A stopped/unacknowledged
owner or exceeded lane/point limit rejects that recall atomically. Sample choices remain discrete project state and do
not become numeric automation lanes. Project format v6 caps snapshots/presets at 128 each, immutable asset revisions at
64 and each value/sample-binding collection at 4096; unavailable saved references remain diagnosable on recall.

## Personal library

Use a browser-local library with user-created folders and mixed item types: **instruments, effects, presets, MIDI clips,
audio clips and samples**. Effects include audio effects and note effects, distinguished by compatible ports. Folders
can be nested, renamed and moved; item names need not be unique. IDs, not folder paths, identify records.

Show a folder tree, search, type filters and item details. Instruments/effects expose their preset list. A preset belongs
to its asset but can be browsed as a first-class item. Saving an asset with presets saves their dependency relationship.
Support move, duplicate, rename, delete with a dependency summary, and audition/preview where appropriate. Start with
explicit Save/Load/Insert buttons; drag-and-drop can follow without blocking the library.

MIDI clips contain notes, length and portable automation. Audio clips contain trim/loop/warp/fades, sample references
and portable automation. Clip lanes use owner-relative target descriptions when saved; loading resolves them against
the destination and reports incompatible lanes. Do not bake a project's track IDs into library clips. A MIDI clip does
not silently replace the destination instrument; optionally save its associated instrument as an explicit dependency.

Loading an asset copies its dependency closure into the project with remapped IDs. The project remains self-contained,
works without library access and never changes because a library item was edited or removed. Existing shared module
behavior within a project remains intact. Keep origin ID/revision metadata for an explicit future update action;
automatic linked library updates are outside this release.

All sample choices, including those inside nested modules and presets, must survive save/load. Define an instance-level
sample override mechanism before advertising reusable sample instruments; today's module controls do not provide it.
Existing project samples can be saved into the catalog without duplicating identical bytes.

Store metadata, folders, immutable asset revisions and preset records transactionally in IndexedDB. Reuse content-hash
sample blobs. Folder deletion does not delete bytes still referenced by projects, presets or other assets. Begin with
conservative retention; add explicit orphan cleanup only after reference accounting is reliable. Storage failure must
leave the previous catalog intact and show an actionable error. Library operations have their own undo/restore scope,
separate from project history; loading into a project remains one project undo step.

### Shipped slice 5 defaults

The **Library** tab saves instrument+notes, audio effects or note effects from the explicitly chosen scope, together
with compatible embedded presets for that owner. Save creates a new item/revision; duplicate names are valid. Folders
and items use opaque IDs; folders cap at 1024 and items at 4096. Presets can be browsed independently and retain their
asset association. Rename/move/duplicate and recursive trash/restore are separate from project undo. Trash retains
revisions, metadata and all sample blobs; no orphan cleanup is offered.

Load explicitly inserts a new instrument track or replaces the selected compatible graph (instrument loads also
replace notes/voices). It does not replace clips, mixer routing or MIDI mappings. IDs and nested derived interfaces,
preset controls and instance sample choices are remapped together. One insertion is one undo step. Format v7 embeds
informational origins (at most 4096, ID fields at most 256 characters); playback, reload and project packages use the
embedded project copies and shared hash blobs. Library edits/removal cannot update them automatically.

Clip insertion requires the matching MIDI/audio track and an empty slot, unless Replace clip is chosen. MIDI clips
leave the destination instrument unchanged. Portable lanes resolve against the destination's flattened node order,
topology and control configuration, independent of source IDs; equivalent graphs with a different node order may be
reported incompatible. Incompatible lanes are omitted with feedback, while compatible notes/audio state and lanes
load. Project-specific send/cross-owner/tap lane targets cannot be saved. All audio trim, loop, warp, gain and fades
are preserved. Sample items share existing content-hash bytes and show metadata plus audition.

Instrument/effect preview renders a separate temporary engine document and audio context. Instruments/note effects
receive a test note; audio effects receive a test tone using their track/return/master input boundary. No preview
writes project history or autosave. Item/folder/filter/tab navigation cancels pending work and releases its audio
resources. Asset graphs containing external sends/track taps are refused, including in nested modules; incompatible
input boundaries are reported on replacement. No implicit routing ports or cross-project track matching are provided.

The sfxlab IndexedDB schema is v2 with preserved `samples` and a transactional `catalog`. Catalog edits read current
metadata in the serialized write transaction and acknowledge only transaction completion. Failure/abort leaves the
previous catalog intact. Legacy tabs blocking upgrades must be closed before retry; current connections close on
version changes. Missing sample metadata/bytes rejects a save/load before any project insertion. Storage quota errors
ask the user to free browser storage and retry. Library UI/workflows load only when opened.

## Library bundles

Export selected items or a whole folder subtree, with all required modules, asset revisions, presets and sample bytes.
Extension: `.sfxlib`, a versioned ZIP containing a manifest, item records, folder structure and hash-addressed
blobs. Keep it distinct from existing `.sfxlab` project files. UI lists included dependencies and missing content before
export; default export requires completeness, with any partial export explicitly marked.

Import first validates into a staging area and presents a summary of items, folders, size, conflicts and missing content.
Default destination is a new folder named after the bundle. Reuse identical content by hash; remap conflicting logical
IDs while preserving every internal reference. Never overwrite local assets on a name match. An explicit future update
flow may reconcile matching origin/revision IDs; it is not required for the first bundle release.

Use an all-or-nothing catalog transaction after validation. Reject unsupported major formats, invalid dependency cycles,
bad hashes and malformed records. Bound compressed size, total expanded size, entry count, individual entries and object
counts before decoding/allocating; reject unsafe archive paths. Reuse project packaging concepts but do not assume its
current per-entry filter alone is sufficient for complete bundle validation. A failed import leaves the library unchanged.

### Shipped slice 6 defaults

The Library tab reviews selected-item or folder-subtree exports, including associated preset/asset closure,
nested modules, immutable revisions and all sample choices. Complete export is the default. An explicit partial
checkbox produces a marked `-partial.sfxlib` with an exact missing-hash list; incomplete imports can be reviewed
but cannot be published. Review and Cancel never write storage. Import confirmation creates a fresh named root,
refreshes catalog IDs and preserves hierarchy/associations. Repeated imports create independent copies; identical
sample blobs are shared and never overwritten. Logical, validation, hash, quota and abort failures retain the
previous catalog and existing bytes. There are no automatic linked updates.

Bundle manifest v1 (`sfx-lab-library`) and migration dispatch are independent of project format v8. The strict ZIP
subset, bounded streaming decompression, checksum rules and budgets are documented in [LIBRARY-BUNDLE.md](../../reference/library-bundle.md).
Defaults: 128 MiB compressed, 256 MiB expanded, 4097 entries, 32 MiB/sample, 8 MiB manifest; 100,000 containers,
300,000 values, depth 64, module depth 16 and 10,000 expanded node visits/revision. Existing record limits remain.

## Tempo polish

Delay and Ping-pong offer free seconds (`sync=0`) or musical time (`sync=1`). Existing Time retains its 0.001–2
range, default 0.3 and legacy numeric-beat interpretation when `division` is absent/zero. A named division selector
covers 1/32, 1/16, 1/8, 1/4, 1/2, one/two/four bars, each straight, dotted (×3/2) or triplet (×2/3).
A quarter note is one beat; bars contain four beats. Named divisions ignore Time only while synced. Switching modes
never rewrites Time. Both shipped example echoes explicitly select dotted eighths and follow engine tempo edits.

Each channel has a fixed eight-second line (1.465 MiB mono / 2.930 MiB stereo at 48 kHz). Supported
project BPM is 40–240. Four dotted bars range from 36 to six seconds; requests beyond capacity play at eight seconds,
with requested/applied times and an explicit cap message in properties. Four straight bars fit at ≥120 BPM, dotted at
≥180, triplet at ≥80. Free seconds remain ≤2 seconds for compatibility. Defaults remain free 0.3 seconds, numeric
beats when Sync is enabled, Delay feedback/mix 0.4/0.35 and Ping-pong 0.5/0.35. Live audio follows the browser/device rate; line memory scales with that rate
(`4 * (ceil(8 * sampleRate) + 2)` bytes/channel; stereo at 192 kHz uses 11.719 MiB). No global instance-memory cap is imposed.

Time changes crossfade stationary read heads over 20 ms without pitch glides, line resets or graph rebuilds. Rapid
edits coalesce after the active fade (≤40 ms to settle). Feedback follows the same crossfade. Historical echoes can
briefly overlap, attenuate or repeat while the taps mix; tails continue through Stop and tempo changes. Offline export
with delay nodes renders the requested tail budget before trimming so silence between echoes cannot end it early;
its existing 10-second default / 30-second maximum still bound export, including feedback and serial-delay tails.
Card pictures use current BPM and show echoes within their existing two-second view; properties report longer times.
Moving wired values are a static approximation, marked as such.

Project v8 explicitly migrates the optional node `division` field; old seconds, numeric beats and normalized automation
ranges stay valid. Missing division remains absent in old strict library records; `.sfxlib` manifest and catalog schema
remain v1 independently. Snapshot XY corners and physical MIDI hardware verification remain deferred.

## Defaults open to refinement

These are deliberate draft choices, not implementation blockers:

- Automation starts in looping clips/session scenes; an arrangement editor is a later feature.
- MIDI controls are recorded now; MIDI notes into clips follow later.
- One armed live-note destination, absolute CC with pickup, Touch automation recording first.
- Projects embed loaded assets; library changes never automatically propagate into songs.
- Library folders are virtual browser storage, not watched filesystem directories or cloud sync.
- Snapshot A/B morphing follows reliable recall; XY morphing follows that.

Changing these defaults may change scope or sequencing. They should be reviewed before the relevant implementation
slice, while the initial control-target and MIDI lifecycle work can proceed independently.
