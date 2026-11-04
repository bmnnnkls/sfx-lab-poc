# Library, snapshots and presets

Snapshots, asset revisions and presets, the personal library catalog and `.sfxlib` bundle exchange (format: [reference/library-bundle.md](../reference/library-bundle.md)).

## Snapshots, asset revisions and project presets

`core/preset` owns storage-independent `SnapshotScope`, `Snapshot`, `SampleTarget`/`SampleBinding`, discriminated
`AssetPayload`, immutable `AssetRevision` and `ProjectPreset` records. Capture walks the shared control target model,
keeps authored per-use bases and excludes momentary/trigger, wire-owned and configuration controls. Snapshot recall
uses guarded resolution and returns applied values plus missing/incompatible diagnostics; it never replaces graphs.
A/B morph validates matching scopes/target sets, interpolates via shared normalized scale helpers and snaps real values;
selectors/toggles switch at 0.5. The UI's common gesture records morphs through existing Touch buffers.

Asset payloads contain instrument+note graphs and voices, or an audio/note effect graph, their transitive modules and
sample IDs. Graph nodes embed panel presentation. Opaque revision IDs are distinct from canonical structural signatures;
compatibility ignores sound values, samples, labels and positions, while graph topology, module interfaces, control
configuration, stereo/bypass and voice settings participate. A preset stores control/sample state referencing a compatible
revision and can recall into another owner with identical graph identities. External track-routing nodes are refused;
clips, mixer routing and hardware mappings never enter assets/presets. Catalog insertion/remapping ships in slice 5 below; bundle exchange ships in slice 6 below. `projectSampleDependencies` includes saved presets/revisions separately from playback `usedSampleIds`.

`Project.sampleBindings` guards owner/domain/nested use identities and sampler type. Missing bindings inherit node
`sampleId` defaults, null explicitly silences a use. `projectWithSampleBindings` flattens affected graphs in the transient
engine projection before numeric control values; live sync and offline bounce share it. Group/unlink rewrite binding
routes, including uses of edited shared definitions. Removing samples clears active bindings; saved presets retain
missing dependency references for diagnostics. The Sounds tab lists per-use bindings with reset-to-default, and root
property sample pickers resolve/edit the same active binding. Shared-definition editors still edit shared defaults.
Each snapshot and preset row in Sounds has a menu (*Recall*, *Update*, *Rename*, *Duplicate*, *Delete*) and renames in
place; the *Sound name* field is for saving.

`state/preset-actions` commits one recall to history. Normal Read recall edits authored bases, releases affected temporary
overrides, leaves lane points alone and reports Read-controlled values. Armed recall finishes pending Touch gestures,
preflights every active owner/destination against the audio recording clock, and builds all base/sample changes plus
hold lane events before committing once. `stepRecallLane` guards the previous curve just before the recall beat and holds
the new value to the next authored point/loop end. Missing/unacknowledged destinations or point/lane overflow reject
that recall atomically. Sample choices are discrete saved state, outside numeric automation. Morph uses common gesture
transactions, including explicit pointer/key/blur/unmount cleanup (React documentation checked via Context7).

Format **v6** adds optional snapshots, presets, asset revisions and instance sample bindings. The explicit v5→v6 migration
drops formerly unknown fields. `sanitize-presets` reconstructs only known fields, bounds records (128 snapshots/presets,
64 revisions, 4096 values/bindings, 32 path steps, 256-character IDs), deduplicates targets/IDs, sanitizes graph payloads
through existing graph/module validators and recomputes compatibility signatures. Well-formed unavailable references
survive for recall diagnostics. Committed v1–v6 fixtures cover migration and round trips. Deleting presets prunes
unreferenced revisions. No browser, storage adapter or library catalog code is needed by these types or pure edits.

Verification includes partial recall, revision mismatch, shared defaults and independent overrides, explicit silence,
group/unlink, Read/Touch atomic steps and lane-limit rejection, scope/scale/discrete/momentary morph rules, and hostile
parsing/migrations. Production smoke saves/recalls/undoes/reloads two sounds and inspects morph UI. Real-output tests
recall numeric and sampled presets; two shared sample-instrument uses with different samples survive fresh reload and
match offline output within 0.00002 amplitude. Physical MIDI hardware remains untested.

## Personal library catalog, independent copies and preview

`core/library` owns `LibraryCatalog` (schema v2), folders, mixed item contents and pure edits. Item IDs survive names
and folder moves. Instruments/audio effects/note effects reference immutable `AssetRevision` payloads plus a saved
`ProjectPreset` current state. Associated preset items are first-class catalog entries referencing the same revision.
Capture includes compatible presets for the selected owner, transitive modules, node defaults, per-use sample bindings
and every associated preset's sample choices. Missing modules/samples and external send/track taps are errors; cycles
are refused. Catalog folders/items cap at 1024/4096. Deletion is recursive recoverable trash. Restore makes the parent
path visible. Revisions and hash blobs are never automatically collected, preserving project references and undo.

`insertLibraryAsset` creates a new instrument track or replaces an explicit compatible graph. It remaps nodes, wires,
module definitions, nested interfaces, derived exposed port/knob IDs and all their references, automatic module-control
keys, guarded target paths, per-instance overrides, preset states and fresh revision signatures. Interfaces must be
remapped because the project parser reconstructs their IDs from inner identities. Audio effects require the correct
track/return/master input boundary. Instruments replace patch+noteGraph+voices; effects replace only their domain.
Existing clips/mixer/MIDI mappings retain their authored state and unavailable old targets remain diagnosable. No
external project routing is imported. Immutable copies never resolve through library IDs at playback.

`captureLibraryClip` stores MIDI notes or full audio state and owner-relative lanes. Graph lanes carry a flattened
node-order/topology/control-configuration signature and flattened node index; compatible destinations enumerate a fresh
guarded target, while mixer volume/pan remain owner-relative. Sends, taps and cross-owner targets are refused.
Insertion refreshes note/clip/lane/point IDs, preserves audio trim/warp/fades/gain, and reports omitted incompatible
lanes. Different flattened node order is deliberately considered incompatible. Occupied slots require explicit replace.
Sample catalog items reference the same hash metadata/blob; no duplicate audio bytes are written for a folder copy.

`storage/library-database` opens **sfxlab v2** for both catalog and sample adapters. Upgrade adds `catalog` without
recreating `samples`. Connections close/reset on `versionchange`; blocked legacy tabs produce a close-and-retry error.
`storage/library-storage` stores the catalog snapshot at `current`. Each read/write transaction reads the latest
catalog and invokes a synchronous edit before queuing catalog and optional sample writes; concurrent connections
serialize rather than overwrite stale snapshots. Promises resolve only on `transaction.complete`, and reject on
abort/quota, including after successful requests. The sample adapter now has the same completion guarantee. There is
an in-memory adapter for storage-less environments. Both adapters reject unsupported next catalog versions before
publishing metadata or bytes. Bundle exchange now validates/stages before this transaction (slice 6 below).

`app/library` bridges storage to the document via `state/PersonalLibrary`; successful insertion commits once to project
history. Saves and catalog edits do not change that history. Missing bytes are preflighted before save/load. Project
format **v7** adds optional bounded `libraryOrigins` (4096 records, ID fields 256 characters), known-field rebuilding,
an explicit v6→v7 migration dropping formerly unknown origin fields and a committed v7 fixture. Origins are informational
and never linked updates. Loaded project revisions/presets/sample metadata are self-contained for reload/package export.

`libraryPreviewProject` creates a temporary project with a test note/tone and the appropriate effect input. `app/library`
renders it through a fresh `Bounce`/`Engine`, decodes its own samples and plays the bounded result on a separate
AudioContext/source. Generation tokens cancel asynchronous decoding/rendering; navigation stops/disconnects sources
and closes contexts, including before source start. Preview resolves explicitly as started/canceled; stale failures
resolve as canceled while current failures remain errors. The panel gates busy/status/catalog updates by operation
ownership, invalidating pending preview UI work on stop/navigation/unmount. Preview does not use the project engine, transport, history or
autosave. `app/library-service` and `ui/library/LibraryPanel` load on demand to keep production chunks below the existing
warning limit. The Library panel provides folder navigation, mixed lists, search/type filters, dependency/sample detail,
explicit save/insert/replace, preview and recoverable trash controls. Items and folders have menus, and rename in
place; the toolbar's name field is for saving. The catalog and the open folder are in `state/library-store.ts`, which
the view and the library's actions keep current; the view's buttons run those actions and report on its status line. Bundle selection is reconciled against current
nontrashed items, with hidden-selection counts and a clear action. Invalid scene inputs disable insertion; the core
still enforces integer/range checks and occupied-slot replacement.

Verification covers full nested interface/control/sample remapping and preset recalls after reload, independent project
package export after catalog changes/deletion, one-step insertion undo, duplicate names/cycles, conservative retention,
quota and interrupted-request rollback, cross-connection serialization, legacy tab blocking and version-change closure.
Production browser checks exercise folders/presets/trash/reload, blocked upgrade recovery and preview cancellation/resource
release. Real worklet output for an inserted sampled asset after trash/reload matches offline within 0.00002 amplitude;
existing capture readiness and finite-window checks remain. No physical MIDI hardware was tested. Tempo polish, orphan cleanup, drag/drop and automatic linked updates remain outside this slice.

## Library bundle exchange

`core/library/bundle` owns versioned manifest/stage/selection contracts, deterministic transitive selection,
strict catalog closure validation, conflict summaries and independent-copy merging. `core/persistence/validate-library`
reuses record sanitizers in strict comparison mode: repaired/dropped/unknown fields reject the entire bundle.
References, folder/module/preset cycles, signatures, external routing, target resolution and expanded module fan-out
are checked before publication. Module/node/interface IDs remain private within each immutable revision; catalog
folder/item/revision/state identities are refreshed on every import and project insertion remaps the full payload.

`storage/library-transfer` owns independent bundle migration dispatch, canonical `.sfxlib` export, hash checking,
read-only staging and commit. `.sfxlab` project transfer remains separate; slice 6 retained project v7 and slice 7 adds project v8 independently.
`storage/library-archive` preflights every ZIP local/central header and path before expanded allocation, then
uses bounded incremental fflate inflation and actual-output/CRC checks. Limits cover compressed/aggregate expanded
bytes, each entry, entry count, JSON size/objects/values/depth and module expansion. The complete format, strict ZIP
subset and budgets are in [reference/library-bundle.md](../reference/library-bundle.md).

Library review displays items/folders/dependencies/bytes/conflicts/missing files before export or import. Partial
export requires an explicit checkbox and manifest/filename markers. Partial imports can be reviewed but cannot commit.
Cancel/staging never write storage. Confirmed import always creates a fresh named root; repeated imports add independent
copies. `library-storage` compares existing hash bytes inside the same serialized read/write transaction, retains equal
bytes and aborts on conflicts. Metadata plus new blobs succeed only at transaction completion. Memory adapters share
one blob map. Validation, capacity, byte conflict, quota and abort failures preserve previous metadata and bytes.

Production browser coverage exercises review/cancel, duplicate import, folder export, fresh-context import/reload,
independent project insertion and package export after library trash. Unit coverage includes nested sample/module and
preset closures, empty/conflicting catalogs, future versions, missing bytes, hashes, dependency cycles, hostile paths,
resource limits, forged expanded sizes, and transactional rollback/deduplication. Existing project/package and real-output
audio gates remain required. Slice 7 tempo polish, snapshot XY corners and automatic linked updates stay deferred.

Slice 6 verification: 1,562 unit/architecture tests across 124 files, typecheck, warning-free production build,
16 smoke checks and ten real-output audio checks passed. An imported sampled bundle asset remains independent
after trash/reload and matches offline within 0.00002 amplitude. Bundle review/panel screenshots were inspected.
Browser verification used isolated port 4175 with a temporary config removed before commit; default config stays 4173.
No physical MIDI hardware was tested.


Slice 7 verification (2026-10-18): 1,591 unit/architecture tests across 126 files, typecheck, warning-free production
build, 17 smoke checks and 12 real-output audio checks passed. The cap/selector screenshot was inspected. Live stereo
Delay and Ping-pong tails match offline through stamped 120→60→240 BPM changes within 0.00002 amplitude. Browser
checks used isolated port 4175; the temporary configuration was removed before commit. Snapshot XY corners remain
deferred. No physical MIDI hardware was tested.


### Review fixes: send invalidation, snapshot routes, learn conflicts, bundle validation

Send level writes compare destination membership, including zero-valued destinations, before invalidating order and
mute/solo caches. Constant/ramping gains on existing sends do not rebuild those caches. New/deleted destinations
still invalidate before mixing. Focused F2 integration also covers notes-plus-send automation in the R1 candidate; final R1 capacity acceptance remains open.
Identity-preserving group/unlink applies the existing guarded route rewrite to snapshot values, including shared module
uses, while keeping immutable preset/revision payloads unchanged. Unavailable old routes are retained without guessing.
Duplicate track-owner ID repairs now warn that references are ambiguous and were not rebound.
A pending MIDI learn conflict suppresses its own device/channel/CC tuple; other mappings and held momentary releases
continue. Confirming messages retain their existing no-sound-change rule. Empty automation Copy/Cut does nothing.

Bundle validation indexes record/module/sample IDs and memoizes validated folder ancestry within each call. Selection
closure indexes folder children and shares completed ancestor walks. Identical revision/scope/value/sample sounds share
the graph-instantiation check, after every record has passed strict field sanitation. No persisted signatures or format
versions changed, and stage/commit validation, expansion/object budgets and transactional publication remain enforced.
Strict portable clips carry automation only in owner-relative `lanes`; embedded project-owner clip automation is refused.
Different sound states still receive independent graph/value checks. See `docs/measurements/README.md` for bounded
validation evidence and the outstanding core acceptance gates; this does not establish overall merge readiness.
