# MIDI, automation, presets and library

Status: **draft product behavior; verification, control/MIDI foundations and clip/return/master automation and Touch recording implemented (slices 0–3)**. Written 2026-10-17.

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

After basic recall ships, add A/B morphing using a slider between compatible snapshots; an XY control can blend four
compatible corners later. Interpolate continuous values in their normalized scales, switch discrete values at a defined
threshold, and exclude momentary buttons. Record a morph through the same automation path.

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

## Library bundles

Export selected items or a whole folder subtree, with all required modules, asset revisions, presets and sample bytes.
Proposed extension: `.sfxlib`, a versioned ZIP containing a manifest, item records, folder structure and hash-addressed
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

## Tempo polish

After the above, add free-seconds and synced beat-division modes to Delay and Ping-pong delay, including dotted and
triplet divisions. Preserve old projects' seconds values and tails. Tempo changes follow the engine clock without
rebuilding graphs; define smoothing to avoid clicks. Audit existing buffer limits for slow tempos and long divisions,
and cap/report unsupported times rather than silently clamp. Update the example echoes to use sync. General timing
controls can reuse the same beat-division representation where useful.

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
