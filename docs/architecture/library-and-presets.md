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
missing dependency references for diagnostics. Sounds lists the selected graph's per-use bindings under a collapsed
*Sample choices (n)*, each named by the node titles along its path, with *Default* to reset; root property sample
pickers resolve/edit the same active binding. Shared-definition editors still edit shared defaults.

**The Sounds view** (`ui/presets/SoundsPanel.tsx`) shows the presets and snapshots of the selection: the owner (a
track, a group's bus or the master, or the first track when nothing is selected) and a tab for its graph. An
instrument track has *Instrument*, *Effects*, *Notes* and *Track*; another track, a bus and the master have *Effects*
and *Track* (`soundsTabsOf`). The rows are the presets that can be recalled onto that graph
(`recallablePresets(project, owner, domain)`: the owner's own and other owners' whose revision signature matches,
captured once per list) and the owner's snapshots of that domain. A row is a button named *Recall Bass 1*: a click,
Enter or Space recalls it onto the selection, its menu has the rest (*Recall*, *Set as A*, *Set as B*, *Update*,
*Save to library*, *Rename*, *Duplicate*, *Delete*), and a preset row drags onto a track whose graph matches it. Its
kind label says *Preset* or *Snapshot*, with the owner for another owner's preset, and the morph's A and B. The row
recalled last shows ● until its graph changes. *+ Save preset* (not on *Track*) and *+ Snapshot* save a sound named
after its owner (*Bass 1*, `nextSoundName`) and start renaming it in place. The status line shows the save and a
recall's report. ⋯ has *Show all in project*, a view preference kept per browser (`sfxlab:sounds-show-all`), which
lists every sound under owner and graph headings, each recalling onto its own owner. With nothing to list, one line
says what presets and snapshots are for. Below the project's sounds, a graph inserted from the library has **From the
library · Big bass** (`ui/presets/LibrarySounds.tsx`; the link is described below): the library sound and its presets
that fit, as rows *Recall Dark* described *Library sound* or *Library preset*, recalled onto the selection through the
link, with the ● mark as for project sounds. A rewired graph shows "This sound has changed since it came from the
library" and no rows; a trashed sound "The library sound is in the trash"; a graph without a link, or whose sound is
gone, nothing. Not with *Show all*, nor on *Track*. The section reads the catalog itself (`library.read()`), since the
library store's copy stays empty until the Library has been shown.

The view's state is `state/sounds-store.ts`: `tab`, the morph's ends `a` and `b` (snapshot IDs), `showAll` and the
`recalled` mark (the sound, the scope it went to, and `scopeState` of that scope just after; an instrument preset's
covers its notes). The store follows the layout: when Instrument, Effects or Notes becomes visible, `tab` moves to its
graph (`editorTabOf`), and a tab chosen by hand holds until then. It follows the project too: A, B and the mark go
when their sound does. The morph's slider shows only while A and B pair up (`morphPair`: the same scope and targets).
The `sound` subject carries `onto?: ControlOwner`: Sounds' rows set it to the selected owner, and `sound.recall`
recalls a preset onto it in the preset's domain (disabled, with the reason, where its graph doesn't match). Without it
a preset recalls onto its own owner; a snapshot always does. `soundSubject(soundId, preset, onto?)` builds the subject
with its keys in one order, since the rename store compares subjects as JSON.

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
parsing/migrations. Production smoke saves two snapshots named in place, recalls them by click and Enter, undoes, reloads and morphs between
rows set as A and B, and recalls a preset saved on one track onto a copy of it. Real-output tests
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

A preset belongs with its sound. `moveLibraryEntry(catalog, id, folderId)` moves an item with its live presets (all
of them for a trashed sound, which restoring brings back), or a folder; it refuses a folder into itself or a folder
inside it, a trashed or missing destination, and a preset on its own. Moving a trashed entry restores it where it
lands, as one edit: the move comes first, so the restore walks the destination's path and the old parents stay in the
trash. `libraryItemDuplicate` copies a live item and its presets, named "… copy" only beside the original;
`duplicateLibraryFolder` deep-copies a live folder's live contents with new ids, sharing revisions and samples (they
are immutable), and carries a preset when its sound is copied, wherever the preset was kept. Both check the caps
before writing anything. An older catalog may hold a preset in another folder than its sound: the Library shows it
under the sound, and the next move takes it along.

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
an explicit v6→v7 migration dropping formerly unknown origin fields and a committed v7 fixture. Origins are informational:
a link on one (below) lets Sounds offer the library sound's presets, but the project never reads the library to play,
and nothing updates a copy from the library. Loaded project revisions/presets/sample metadata are self-contained for reload/package export.

`libraryPreviewProject` creates a temporary project with a test note/tone and the appropriate effect input. `app/library`
renders it through a fresh `Bounce`/`Engine`, decodes its own samples and plays the bounded result on a separate
AudioContext/source. Generation tokens cancel asynchronous decoding/rendering; navigation stops/disconnects sources
and closes contexts, including before source start. Preview resolves explicitly as started/canceled; stale failures
resolve as canceled while current failures remain errors. The panel gates busy/status/catalog updates by operation
ownership, invalidating pending preview UI work on stop/navigation/unmount. Preview does not use the project engine, transport, history or
autosave. A preview reports when it stops, by ending or by `stopPreview` (`preview(item, onStop)`), so the Library
shows ■ on the item while it plays. `app/library-service` and `ui/library/LibraryPanel` load on demand to keep
production chunks below the existing warning limit; the deferred service passes `onStop` on, and calls it for a
preview cancelled while it loads.

Things are saved where they are: a track's, bus's or the master's menu has *Save to library* (an instrument's ▸
*Instrument + notes*, *Audio effects*, *Note effects*, the last only with a note graph) or *Save effects to library*,
a session clip *Save to library* and a sample *Add to library* (`state/actions/library-save.ts`). The new item is
named after its source (*Bass*, *Bass effects*, *Bass notes*, *Master effects*, the clip's or sample's name), goes into
the folder open in the Library (the top level when it is gone or trashed) and is found as the one id the catalog
didn't have before. The action resolves with "Saved Bass to Drums" and a *Show* button for its toast, which reveals
the item in the Library and starts renaming it. A refused capture (a graph with a track's audio in it) reports its
reason. The same saves are the transport bar's *Library* menu, run on the selection, and what dragging a track, group,
session clip, sample or project preset onto a library folder does (into that folder; see
[workbench.md](workbench.md#drag-and-drop)). `externalRoutingIn(project, scope)` (`core/preset/routing.ts`) finds the
first `send`, `trackAudio` or `trackNotes` node a capture of a scope would read, in its graph, its modules and an
instrument's note graph, with the track it reads, so a drop is refused before the capture runs.

A project preset can be saved on its own: *Save to library* in its Sounds row menu, or the row dragged onto a folder.
`captureLibraryPreset(catalog, project, presetId, folderId)` stores the preset's own revision from
`project.assetRevisions` under a fresh id and makes a sound named after the preset whose `state` is the preset, with no
preset items under it. It never reads the current graph, so it works after the preset's owner has been rewired. It
refuses external routing in the revision and missing sample metadata, and `PersonalLibrary.savePreset(presetId,
folderId)` runs the same sample-bytes preflight as the other saves. A snapshot has no graph of its own and can't be
saved. A preset of a **linked** sound saves back instead: when `presetLink` finds the link its revision was saved
through, and the library sound is there and not trashed, *Save to library* (`savePresetToLibrary` in
`state/actions/sound.ts`) runs `PersonalLibrary.addPresetToSound(presetId)`, which adds it to that sound as a new
preset and reports "Added *Deep* to *Big bass*" with *Show*. Otherwise it saves a sound of its own as above; its
tooltip says which.

The Library view is one tree (`ui/library/library-tree.ts` for the rows and keys, `LibraryTree.tsx`): *This project*
(below), *My library* and *Trash*, folders first and then items in each folder by name with numbers in order, and each sound's presets under it,
wherever their own folder points. A preset whose sound is trashed or gone shows as an item in its own folder. The trash
shows what was trashed at its top-most level, a folder with its contents. A search or a type filter shows the matches,
the folders above them and a matching preset's sound, all open; a preset also matches on its sound's name, and the trash
is searched only while it is open. Rows are `ActionMenu` triggers, drag sources (not the roots), drop targets (folders
and roots) and spring open under a resting drag (see [workbench.md](workbench.md#drag-and-drop)). The active row is the
one Tab reaches and the details show; a click selects, ⇧ extends along the rows, ⌘ toggles; Enter runs the details'
main button and Space previews or stops. The header is search, the type filter and ⋯ (*My library*'s menu and *Export
selection…*). The status line shows only with something to say, and carries *Retry* after the catalog failed to read
(an older tab holding the database). The details (`LibraryDetails.tsx`) show the kind, one line of facts, the samples,
one main button and ⋯ for the rest: *Add as new track* for an instrument or a preset of one, *Replace effects (notes)
on Bass* for effects, *Insert into scene n of Bass* for a clip (the first empty slot of the selected track of its kind),
*Add to project* for a sample, *Restore* for anything trashed; a button that can't run is disabled with the reason
beside it. An empty library says how things get in and offers to save the selected instrument. When the active row
goes to the trash, the view moves on to its folder.

**This project** is the tree's first root, named after the open project (◆ *Low Light*) and collapsed until opened.
Its rows are built live from the project store and never stored (`projectRows`, from `projectModel(project)`): each
clip track in Tracks order, then the returns, the group buses (*Drums bus*) and the master; under each owner its
*Instrument*, *Effects* and *Notes* graphs that hold a node other than their ends (or have presets), each graph's
project presets under it, and a track's session clips under *Clips*; then *Samples* and *Modules*. A graph that reads
another track shows ⚠, with the reason as the row's tooltip (`routingRefusalIn`, the wording the drops use: "Uses Track
audio from Kick"); an instrument's includes its note graph, since saving the instrument takes the notes along. Nothing
is captured to build them: names, counts and a node-type scan. `projectModel` is memoized on the project object, and a
project whose rows are unchanged (a value edited, a knob dragged) gets the previous model back, so the tree, which
selects it, doesn't re-render. What is open under the root is kept in the library store per loaded project (its
`documentEpoch`), so another project starts collapsed. Search and the type filter cover the root while it is open, as
with the trash: an owner's name is matched by the rows under it, a graph is its kind (instrument, audio or note
effect), clips, samples and presets theirs, and modules match search only.

The root is read-only as a library: owner, clip, sample, preset and module rows are the project's own subjects, with
their own menus (*Rename* renames in place in the row, as in their views); owners don't drag. A graph row is a
`project-graph { owner, domain }` subject (`state/actions/project-graph.ts`) with *Preview*, *Show* (`openPinnedEditor`:
selects the owner and shows its Instrument, Effects or Notes view), *Save to library* and, for an instrument, *Copy to
new track* ("Bass copy"); a graph that reads another track refuses all but *Show*, with the reason. Clip, sample, preset
and graph rows drag (see [workbench.md](workbench.md#drag-and-drop)). A graph row shows ▶ (Space previews it) unless it
is refused, Enter saves it, and the details describe any row of the root.

**A source catalog.** Copying and previewing a graph capture it into a throwaway catalog: `projectGraphItem(project,
owner, domain, name)` runs `captureLibraryAsset` into `emptyLibrary()` and gives the item the ID
`project:track:<id>:patch` (`group:<id>`, `master`). `PersonalLibrary.insert(item, destination, scene?, replaceClip?,
from?)` and `preview(item, onStop?, from?)` read `from` instead of storage, and check sample bytes against it the same
way, so a sampled instrument's bytes are found in the project's sample storage. A copy is a library insert: fresh node
IDs, its own modules and the source's compatible presets (the inserted sound's own state among them), one undo step, and
a `libraryOrigins` record. The insert's destination names the scope it was captured from (`carry`), so the copy's
origin carries the source's live library link, composed with the copy's own maps, rather than naming the throwaway
ID; a source without a live link gives a copy without one. `graphFitsOwner(item, owner, from?)`
reads `from` too. The library item's *Preview* and the graph's share `previewLibraryItem(item, context, from?)`, so ■
stays on the latest preview of either.

**The library link** (`core/library/link.ts`). `insertLibraryAsset` keeps what `copyAsset` mapped: an origin records
the `owner` (beside `trackId`, still written for older readers) and an optional `link { shape, nodes, modules }`: the
library node and module IDs paired with the project's, and `shape`, a 64-bit hash (`stableHash64`, 16 hex digits) of the
inserted graph's `assetSignature` (`linkShape`). Preset targets name leaf nodes only (an exposed knob is its inner
node's parameter), so the two maps are all a preset needs. `linkOf(project, owner, domain)` gives the latest linked
origin whose shape matches the owner's graph now (`live`), or else the latest one (not live: the graph was rewired);
knob changes don't touch the signature, so they don't break it. `linkedSounds(catalog, origin)` gives the library sound
(an origin naming a preset resolves to its sound), whether it is trashed, and its states that fit: the sound and its
live presets whose revision has the signature of the revision the origin names. `presetFromLibrary(origin, state)`
puts a state's targets through the maps forward, onto the linked owner, and `recallLinkedPreset` recalls it through
`recallPresetState`, which takes the shape from the owner's current graph instead of a stored revision (and runs the same
body as `recallProjectPreset`); `recallLinkedSound` in `state/preset-actions` makes that one undo step, with Touch and
Read as for any recall. The graph isn't replaced, so its automation and MIDI mappings stay. Saving back is the inverse:
`presetLink(project, preset)` finds the link whose shape is the preset's own revision's (so a preset saved before a
rewire still saves back), and `presetToLibrary` puts the targets through the maps backward onto the sound's own owner
and revision, in the sound's folder, adding the sample metadata it needs; it refuses a gone or trashed sound.
Duplicating a track carries its links as they are (`carryLibraryLinks`, run by the project store's `duplicateTrack`),
since a duplicate keeps node IDs; removing a track leaves its origins. A link past `LINK_LIMITS` (2048 node pairs, 128
module pairs, 16 384 pairs across the file) isn't written, and the sanitizer drops one with a warning. Links for sounds
inserted before links existed aren't guessed. The Library's details show "Used on Bass, Bass copy" for a sound that
owners of the open project are linked to, live.

`state/library-store.ts` holds the catalog, the active row, the selected items, the item being previewed and a request
for the view (an export to review, an import to pick), which the menus set and the view takes. The open folder, where
saves go, is derived from the active row (`openFolderOf`: the active folder, or the active item's, its sound's for a
preset). The view's buttons run the library's actions and report on its status line; menus report to the toasts.
Selected items that leave (trashed, gone) leave the selection. The scene choices for a clip (*Insert into Bass ▸*,
*Replace clip in Bass ▸*) disable the scenes that can't take it, with the reason; the core still enforces range checks
and occupied-slot replacement.

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

Library review is a modal dialog (`BundleDialog.tsx`, *Bundle review*), opened by *Export as .sfxlib…* on an item or
folder, ⋯ ▸ *Export all…* or *Export selection…*, *Import .sfxlib…* (the view's hidden file input), or an `.sfxlib`
dropped on the view. It says in a sentence what the bundle holds and where an import goes, warns about missing
samples, and lists items, revisions and samples under *Details*, before export or import. Partial
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
