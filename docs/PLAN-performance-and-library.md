# Implementation plan: performance and library

Status: **slices 0–1 and 2a implemented; slices 2b–7 planned**. Product behavior and draft defaults are defined in
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

Likely additions: browser-facing `midi` adapter layer, `app/midi-input`, `state/midi-store`, settings/mapping UI;
project mapping persistence and the control gesture adapter from slice 1.

- Check current official browser MIDI documentation and compatibility during implementation, following repository
  Context7 instructions. This plan does not depend on unverified browser API signatures.
- Parse supported messages into pure core intents; keep permissions/device objects outside core and saved projects.
- Implement settings, selected/armed destination, connection lifecycle, channel filter and panic.
- Implement learn/cancel/reassign/remove, missing-device rebinding, scale conversion, pickup and gesture grouping.
- Model mapping feedback separately from audio-rate status. Do not flood project history with raw incoming messages.

Exit: fake-port browser tests cover permissions, learning and disconnect; engine tests cover parsed lifecycle commands.
Perform a manual hardware check with a real keyboard/CC controller and record the browser/device used. Verify a mapped
Low Light filter survives reload. Hardware absence does not block parser/unit/browser adapter tests.

## 3. Automation

### 3a. Saved lanes, engine playback and drawing editor

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

- Add automation-only slots to return/master documents, session UI and quantized launch scheduling.
- Reuse the lane editor and evaluator, adding independent loop length and clear empty-slot behavior.
- Extend scene launch/stop/status and scene bounce. Clip-only export excludes unrelated return/master automation.

Exit: a master sweep and return throw launch with a scene, repeat correctly, stop/reset correctly and appear in scene
exports. Removing a return handles its lanes and target references without damaging other tracks.

### 3c. Touch recording

- Add explicit arm, active-owner destination checks and an audio-clock timestamp bridge for main-thread gestures.
- Capture separate take buffers from pointer/MIDI sources; define pickup, release timeout, wrap and interrupted-take rules.
- Replace only touched intervals with preserved boundary values; simplify within a tested error tolerance.
- Commit one undoable take without per-message persistence. Expose recording/override state in controls and lanes.

Exit: recording two passes over a loop preserves untouched material, undo restores the prior lanes, and playback after
reload/export reproduces the recording. Test fast turns, long holds, UI stalls, tempo changes, disconnect and stop.

## 4. Snapshots and project presets

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

The salvage provides a basic `off`/`beat` mode and beat-based example echoes. It retains the existing
two-second delay capacity and unsmoothed block-boundary time changes; the requirements below remain open.

Likely touchpoints: delay/ping-pong DSP definitions, timing helpers, node properties/previews, persistence and examples.

- Define seconds versus beat division and dotted/triplet representation; audit memory limits at supported BPMs.
- Update delay processing and smoothing with no graph rebuild on tempo change. Preserve old seconds-mode documents.
- Convert example echoes and document audible behavior when BPM changes.

Exit: known impulse timings at several BPMs, tempo changes with running tails, persistence, stereo behavior and offline
rendering agree. The examples remain playable at their original tempo and follow tempo edits.

## Delivery discipline

- Implement one slice at a time; update this plan and TASKS as slices ship. Document shipped contracts in ARCHITECTURE.
- Each saved-shape change gets migration fixtures and round-trip tests; each new import surface gets bounded validation.
- Run relevant pure tests during work, then the unit/architecture suite, typecheck, production build and fast browser
  smoke set before delivering a slice. Run focused full audio checks when scheduling, routing or DSP behavior changes.
- Use portable simulated inputs for repeatable MIDI tests; retain a manual hardware acceptance check for timing/feel.
- No cloud service, filesystem watcher, automatic library linking, arrangement editor or external MIDI synchronization
  is required to finish this plan. Revisit those only as explicit scope additions.
