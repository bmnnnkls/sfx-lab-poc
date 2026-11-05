---
status: done
date: 2026-11-05
shipped_in: architecture/library-and-presets.md
note: "Phase 5 of SPEC-library-ux.md (C1): remember how a library sound's IDs were mapped when it was inserted, so library presets recall onto the track and project presets save back into the library sound. Decisions signed off 2026-11-04, including the D11 correction. Shipped in 1da0715, df33d91, dd1c678, d2d50d4 and the docs commit; src/core became its own build chunk on the way."
---
# Library phase 5: the link between a track and its library sound

Phase 5 of [SPEC-library-ux.md](SPEC-library-ux.md) (§ 4.3, D11). It needs [phase 4](PLAN-library-4-sounds.md)'s Sounds
view. Inventory taken at `9b4f2cd`, re-checked at `9d9d6e1` (see *Changes made while implementing*).

## Goal

When a library sound is inserted onto a track, the project remembers how its node and module IDs were mapped. While
the track's graph keeps that structure:

* Sounds shows a **From the library · *Big bass*** section: the library sound's own state and its presets. Clicking
  one recalls it onto the track as an ordinary recall. The graph isn't replaced, so automation and MIDI mappings stay.
* ***Save to library*** on a project preset of that track adds it to that library sound as a new preset, instead of
  making a new sound.
* When the graph has been rewired, the section says "This sound has changed since it came from the library" and
  offers nothing. Knob changes don't break the link.

Out of scope: pushing structural changes back to the library sound (linked updates, backlog L3), and links for sounds
inserted before this phase.

## Inventory

* `copyAsset(payload, owner)` (`core/library/assets.ts:49`, not exported) builds `nodes: Map<old, new>` and
  `modules: Map<old, new>` with `createId`. Interface ports and knobs are mapped **by index** into the copied module
  (`copied.knobs[knobIndex]`, `copied[direction][index]`). It returns the payload and a `target()` mapper, and the
  maps are then dropped.
* **Preset targets name leaf nodes only.** A graph target is `{ owner, domain, path: [{ nodeId, moduleId }], nodeId,
  nodeType, paramId }`, and `graph-param.ts` turns an exposed knob into its inner node's parameter, so no target holds
  a knob or port ID. `copyAsset`'s `target()` maps `nodeId` and the path only. The node and module maps are therefore
  all a library preset needs; ports and knobs by index matter only for copying the payload itself.
* `insertLibraryAsset` copies **all** the item's presets, with `copy.target`, into `project.presets` under a new
  project revision. It records `libraryOrigins: { itemId, revisionId (the library's), trackId?, domain }`.
* **Project graphs go through it too** (phase 3): *Copy to new track* and a graph dropped on another owner call
  `library.insert(item, …, from)` with a throwaway catalog from `projectGraphItem`, whose item ID is
  `project:track:<id>:patch`. Those inserts write an origin naming that ID.
* `assetSignature(payload)` includes node and module IDs, so a project copy never matches its library revision.
* `deleteProjectPreset` prunes revisions no preset references, so a project revision may not outlive its presets.
  The link therefore can't rely on a project revision ID.
* **The format precedent:** optional fields with a safe default have shipped without a version bump: group buses,
  group mute and solo, and pins all stayed at version 10, and scene names never bumped. The sanitizer rebuilds known
  fields only, so an older build drops an unknown field silently. For a link that only loses the link, which is
  harmless. `sanitize-library-origins.ts` bounds origins at 4096, with IDs of up to 256 characters.
  `readControlOwner` (`sanitize-control-values.ts`) reads an owner.
* **`duplicateTrack`** (`core/project/track-duplicate.ts`) keeps the track's graphs as they are, so the copy's node
  IDs and module uses are the original's; it leaves out presets and snapshots. A duplicate's link is the original's
  with the owner moved; no maps to compose.
* **Sounds** is phase 4's `SoundsPanel` (`ui/presets/SoundsPanel.tsx`), which replaced `PresetsPanel`. Its list is
  one `<section>` *In this project* inside the scrolling `.sounds` box; the library section goes beside it.
  `recallablePresets` captures the owner's graph once per project change. A preset row's *Save to library* is
  `sound.save-to-library` (`state/actions/sound.ts`), calling `saveToLibrary({ kind: 'preset' })`.
  `recallSavedSound(sound, scope)` (`state/preset-actions.ts`) does a recall's undo step, Touch and Read handling.
* **The catalog in the UI:** `useLibraryStore.catalog` stays empty until the Library has been shown (the service
  loads lazily), so Sounds reads it (`library.read()`) when the selection has a link.
* **Specs** are in group folders since `60e7025`: `tests/browser/library/presets.smoke.spec.ts` and
  `tests/browser/audio/automation.audio.spec.ts`.

## Design

### The record

`LibraryOrigin` gains two optional fields:

```ts
interface LibraryLink {
  /** A stable 64-bit hash (hex) of the inserted graph's assetSignature: the link is live while the owner's graph hashes the same. */
  readonly shape: string
  /** Library node id → project node id, and library module id → project module id. Ports and knobs follow by index. */
  readonly nodes: readonly (readonly [string, string])[]
  readonly modules: readonly (readonly [string, string])[]
}
interface LibraryOrigin { …; readonly owner?: ControlOwner; readonly link?: LibraryLink }
```

* `owner` generalizes `trackId`, which is kept and still written for older readers, so buses and the master can link
  too.
* **Bounds** in the sanitizer: at most 2048 node pairs and 128 module pairs per link, and 16 384 pairs across the
  file. Pairs past a bound drop the link, with a warning; a link with a malformed pair is dropped. IDs up to 256
  characters.
* **No format bump**, following the precedent: a file without links, or one read by an older build, just has no link.
  A committed fixture, `v13-library-link`, pins that it reads back identical. (This corrects the spec's D11, which
  assumed format 14.)

### Core functions (`core/library/link.ts`)

* `copyAsset` is refactored to return its maps. `insertLibraryAsset` writes `link` from them, and `shape` from the
  copied payload's signature.
* `linkOf(project, owner, domain)`: the latest origin for that owner and domain whose `shape` matches
  `hash(assetSignature(captureAsset(project, scope)))`. It returns `{ origin, live: true }`, or `{ origin, live: false
  }` when the shapes differ, or undefined.
* `presetFromLibrary(project, catalog, link, state)`: translates a library preset's targets through the maps,
  forward, with ports and knobs by index against the project's module definitions, into a `ProjectPreset` against
  the owner's current graph. `recallSavedSound` then recalls it. **This needs a recall that takes the shape from the
  current graph** rather than from a stored revision: `recallPresetState(project, state, scope)`, which checks the
  shape and then runs the same body as `recallProjectPreset`.
* `presetToLibrary(project, catalog, link, preset)`: the inverse maps, giving a library preset state for the origin
  item. It refuses when the library item is gone or trashed.
* **Duplicating a track copies its origins** onto the new track, composing the maps if `duplicateTrack` renews node
  IDs. **Removing a track** leaves its origins, as today (informational, and capped).

### Where it shows

* **Sounds**: under *In this project*, a *From the library · Big bass* section with the item itself and its live
  presets. Click recalls (one undo step, Read and Touch rules unchanged). A dead link shows the one line and no rows.
  A trashed library item shows "The library sound is in the trash".
* **A preset row's *Save to library***, with a live link, adds a preset to the origin item and reports "Added *Deep*
  to *Big bass*". Without one, it falls back to phase 2's single-preset save.
* **Library details** for an item show "Used on Bass" when the open project links to it. That's informational, with
  no live update.
* **Factory** (phase 6) items link the same way.

## Steps

1. **Record and sanitizer.** `LibraryLink`, `owner`, the bounds, the fixture, and the duplicate check. Unit tests:
   round trip; each bound; malformed pairs; an older-shaped origin still loads.
2. **Writing links.** The `copyAsset` maps, `insertLibraryAsset` writing the link, and duplicating a track. Unit
   tests: an inserted instrument, effect and note effect each link with the right shape; a nested module's knobs map
   by index; a duplicate is linked.
3. **Using links.** `linkOf`, `presetFromLibrary`, `recallPresetState`, `presetToLibrary`. Unit tests:
   * recall of a library preset onto an inserted sound equals inserting that preset, values and sample choices both;
   * a rewire kills the link and a knob change doesn't;
   * automation lanes and MIDI mappings survive a library recall;
   * round trip: save a project preset back, re-insert the sound in a fresh project, and recall it.
4. **The views.** Sounds' library section, the linked *Save to library*, and the details' "Used on". Smoke, in
   `presets.smoke.spec.ts`:
   * insert a library sound with two presets, add a third in the library, and recall it from Sounds;
   * save a project preset back and see it under the item in the Library;
   * rewire, and the section says it changed.

   Audio: a library recall renders the same as an insert of that preset, within 0.00002, in `automation.audio.spec.ts`.
5. **Docs.** `library-and-presets.md` (the link), `reference/formats-and-versions.md` (version 13's row notes the
   optional link, without a bump), and a row in `decisions/README.md` for "no bump" and for the hash-based shape. This
   plan's notes are sorted.

## Behavior changes

Intended: inserting a library sound records a link; Sounds offers that sound's library presets; saving a project
preset of a linked sound adds it to the library sound. Files gain optional fields that older builds drop silently.
Playback, insertion results and independence don't change: the project never reads the library to play.

## Verification

* The usual gates, plus `npm run test:audio` at step 4.
* Manual:
  * a Low Light-sized project with ten linked sounds saves and loads with no warnings;
  * the file size grows by the maps only (record the byte growth);
  * a project saved here opens in a build from before this phase with no warning.

## Decisions to sign off

Signed off 2026-11-04: every row as proposed.

| Question | Proposed | Notes |
|---|---|---|
| Format version | **No bump: optional fields, fixture `v13-library-link`** | **Corrects D11**, which assumed 14. The pins and group-bus precedent, and an older build only loses the link. |
| What is stored | **Node and module maps; ports and knobs by index** | That's how `copyAsset` maps them; the shape check guarantees the index order. |
| Liveness | **A stored 64-bit hash of the inserted signature, compared with the current one** | Project revisions can be pruned, so they can't be the anchor. |
| Owners | **`owner` on origins, `trackId` kept** | Buses and the master link too. |
| Duplicate track | **Carries the link** | Otherwise duplicating a sound silently loses its library presets. |
| Old projects | **No link, no repair** | A guessed mapping could recall onto the wrong nodes. |

## Changes made while implementing

* **Inventory re-checked** at `9d9d6e1` (phase 4 plus the smoke-groups merge). The code had moved in five places, now
  in the inventory: `copyAsset`'s line, preset targets holding no knob or port IDs, project-graph copies going through
  `insertLibraryAsset`, `duplicateTrack` keeping node IDs (so a duplicate needs no composed maps), and Sounds being
  `SoundsPanel`, whose catalog has to be read.
* **Step 1:** `LibraryLink` and `LINK_LIMITS` are in `core/library/types.ts`; `stableHash64` and `linkShape(payload)`
  in `core/library/link.ts`. The hash is two 32-bit lanes mixed with `Math.imul` (cyrb53's scheme kept to 64 bits),
  synchronous, since Sounds checks liveness on every project change.
* **Step 1:** the sanitizer keeps the origin when it drops a link, and warns: "Invalid library link dropped" (a bad
  shape, list or pair), "Library link dropped: over 2048 nodes or 128 modules", "Library link dropped: links limited
  to 16384 pairs". An owner that isn't one is dropped with "Invalid library origin owner dropped". A `shape` must be
  16 lowercase hex digits.
* **Step 1:** the fixture `v13-library-link.sfxlab.json` is v6-presets' sampler inserted as *Big bass* into an empty
  project, with its real maps (8 nodes, 1 module).

* **Step 2:** `linkOf` came with this step, since the tests check a link by it and a project-graph copy needs it.
  `insertedOrigin` (in `link.ts`) builds the origin `insertLibraryAsset` records; it writes `owner` beside `trackId`.
* **Step 2:** a link past `LINK_LIMITS` (its own pairs, or every link's together) isn't written: the origin is
  recorded without it, so the file never holds a link its sanitizer would drop.
* **Step 2:** **project-graph copies carry the link too.** *Copy to new track* and a graph dropped on another owner
  insert a throwaway capture whose item is `project:…`; `AssetDestination` gains `carry` (the scope it was captured
  from), and the copy gets the source's live link composed with its own maps, naming the library item. Without a live
  link at the source, it gets none. This is the same reasoning as the signed-off duplicate row: otherwise copying a
  sound silently loses its library presets.
* **Step 2:** duplicating a track carries, per graph, the link `linkOf` finds (live or not), with the owner moved; it
  runs in the project store's `duplicateTrack` (`carryLibraryLinks`), since `core/project` can't import the library.
* **Step 2: the build warned** (runbook stop 6): the automatic `state` chunk reached 500.40 kB minified (498.44 at
  step 1). The user chose a `core` group in `vite.config.ts`'s `codeSplitting` (`src/core` in its own chunk), keeping
  the warning limit. Gzipped, before → after: `state` 146.94 → 29.73 kB, `index` 114.75 → 112.30, a new `core`
  123.04; the eager total grows about 2.9 kB, of which the step's code is under 1 kB. The lazy `library` chunk stays
  3.7 kB: the library's core code was already in the eager `state` chunk.
* **Step 3:** `recallPresetState(project, preset, scope, matches, refusal?)` is in `core/preset/assets.ts`, and
  `recallProjectPreset` runs through it. `preset` can't import the library, so the caller passes the shape check:
  `recallLinkedPreset(project, origin, preset)` (in `link.ts`) checks the link's `shape`, and refuses with "This sound
  has changed since it came from the library".
* **Step 3:** `linkedSounds(catalog, origin)` gives the library sound (an origin naming a preset resolves to its
  sound), whether it is trashed, and its *states*: the sound and its live presets whose revision has the signature of
  the revision the origin names. Sounds lists those.
* **Step 3:** `presetLink(project, preset)` finds the link a project preset saves back through: the latest linked
  origin of its owner and domain whose shape is **the preset's own revision's**, not the graph's now. So a preset saved
  before a rewire still saves back, and one saved after it doesn't. `presetToLibrary` takes that origin, puts the
  targets through the maps backward onto the sound's own owner, files the preset in the sound's folder, and adds the
  sample metadata it needs. It refuses "The library sound is gone" or "…is in the trash".
* **Step 3:** targets not in the maps keep their IDs; the recall then reports them as unavailable rather than failing.
* **Step 2, reconsidered after the user asked for `src/core/library` to stay out of the `core` chunk** so it loads
  lazily: measured, it changes nothing. With the group's test excluding `core/library/`, the library's core code still
  lands in `core` (`state` and the UI import it statically: `linkOf`, `graphFitsOwner`, `insertionScope`, the drops),
  as it was in the eager `state` chunk before the split. What loads lazily is the library service (storage, bundles,
  preview), the `library` chunk, which stays lazy at 3.7–4.0 kB in every variant. So the group stays as committed;
  making `core/library` lazy would mean moving those imports behind the service, which is beyond this round.
* **Step 4:** the section is `ui/presets/LibrarySounds.tsx`, below *In this project* (or the empty state) in the
  scrolling `.sounds` box, a `<section>` named *From the library · Big bass*. Its rows are `role=button` *Recall
  Dark*, described *Library sound* or *Library preset*, with the ● mark (the sounds store's `recalled`, keyed by the
  library item's ID). It reads the catalog (`library.read()`) when the selection's link names a new item, since the
  store's copy is empty until the Library has been shown. With no link, or the sound gone, it shows nothing; with
  *Show all*, or the *Track* tab, neither.
* **Step 4:** `recallLinkedSound(origin, state)` (`preset-actions.ts`) recalls through the same body as
  `recallSavedSound` (`recallWith`): one undo step, Touch and Read unchanged.
* **Step 4:** *Save to library* on a preset row runs `savePresetToLibrary`: with a link (`presetLink`) to a sound that
  is there and not trashed, `PersonalLibrary.addPresetToSound(presetId)` (passed on by the lazy wrapper, the phase 1
  gotcha) adds it and reports "Added *Deep* to *Big bass*" with *Show*. Otherwise, a trashed or gone sound included, it
  falls back to phase 2's single-preset save rather than refusing. Its tooltip says which it will do: "Adds this preset
  to the library sound it came from".
* **Step 4:** the details' "Used on Bass, Bass copy" is a second facts line, for a sound only (not a preset), listing
  owners whose graph is linked live to it (an origin may name one of its presets).
* **Step 4:** the smoke case is one test that covers the plan's three: Sweep saved as *Big sweep*, inserted and
  duplicated ("Used on Big sweep, Big sweep copy"); Dark recalled from the library section; *Third* saved and added to
  the sound, seen under it in the Library; Open and Third recalled on the copy (one undo step); the copy's Filter
  deleted, and the section says it changed. The library gains its third preset by the save-back, the only way the UI
  adds a preset to a library sound. The copy's Instrument view opens from its menu (*Open instrument*): Sounds' own
  *Instrument* tab shares the view tab's name, so `openView(page, 'Instrument')` is ambiguous while Sounds shows.
* **Step 4:** the audio case is a ninth mode of `automation.audio.spec.ts`, `linked-preset`: Sweep saved, put back onto
  Sweep from the library, Bright recalled from the library section; offline it matches inserting Bright itself within
  0.00002, and the real worklet matches that.
* **Step 4:** checked in the preview (dev build, Low Light): the library's *Bass* inserted, Sounds at 280 px in the
  sidebar and at about 580 px, ● on a recalled library preset; after deleting the copy's Oscillator, the section's line
  and no "Used on". One dark theme, as before.
* **Manual measurements:** Low Light with ten of its instruments saved and inserted as linked sounds (26 tracks, 282
  pairs): 510 331 bytes against 501 329 with the links stripped, so **9 002 bytes (1.8 %), about 900 bytes a link**.
  It loads with no warnings and reads back identical. The same file in a build from before this phase (`204821d`, in a
  throwaway worktree) loads with no warnings; its origins keep `itemId`, `revisionId`, `trackId` and `domain`, and
  `owner` and `link` are dropped silently.
* **Step 5:** the notes are sorted: the link, the Sounds section, the save-back and project-graph copies into
  `library-and-presets.md`; version 13's row in `formats-and-versions.md` (the optional `owner` and `link`, and
  `LINK_LIMITS`); decisions 107–111 (no bump, the hash-based shape, owners and carrying, the save-back's fallback, the
  `core` chunk); two gotchas (`openView('Instrument')` while Sounds shows; a chunk group can't make static imports
  lazy); the `core` group in `verification.md`; the bundle and file-size numbers in `baselines.md`; backlog P6 (lazy
  library code); STATUS, the tour, and the runbook's queue for the user (wording, the chunk change).
