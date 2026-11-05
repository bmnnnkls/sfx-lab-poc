---
status: active
date: 2026-11-04
note: "Phase 6 of SPEC-library-ux.md: a read-only Factory library built from the example projects and a few new starter sounds, lazily loaded, copied into My library on demand. Decisions signed off 2026-11-04."
---
# Library phase 6: the Factory library

Phase 6 of [SPEC-library-ux.md](SPEC-library-ux.md) (§ 6, D12–D15). Builds on phase 1 (the tree), phase 3 (insert and
preview from a source catalog) and phase 5 (links, so Factory sounds link like any other). Inventory taken at
`9b4f2cd`. Re-check it at the branch tip before step 1.

## Goal

* A **Factory** root in the Library tree, after *My library*, marked read-only (🔒). It holds ready-made sounds, effects,
  note effects and clips, built from code and the same on every build.
* Factory items **preview, insert, replace and drag** like library items, from the Factory catalog.
* **They can't be renamed, moved or trashed.** *Copy to My library* (menu, or a drag onto a My library folder) makes an
  editable copy.
* **Loaded lazily**, in its own chunk, the first time the Library opens.

Out of scope: presets for Factory sounds (content work for later), samples (Factory stays synthesized), and modules on
their own (backlog L2).

## Inventory

* `exampleProjects` (`core/examples/index.ts`) has *Low Light* (`createLowLight`) and *Glass Rain* (`createGlassRain`),
  deterministic, with every node `locked` except controls, and no samples. Tests already render every instrument and
  roll Randomize on them.
* **Low Light** tracks: Kick, Clap, Hat, Open hat, Shaker, Knocks, Bass, Stab (with a chord note graph), Arp (with
  chord, scale lock, arpeggiator and velocity notes), Drone, Riser, Crash, Dust. Returns: Room, Echo (dotted eighth,
  *Throw*) and Hall. Master: the DJ filter, *Cut*, width and level.
* **Glass Rain** tracks: Pad, Sub, Heart, Bells, Drops, Rain, Wind, Ticks, and Arp (whose note graph reads *Track
  notes* of the Pad). Returns: Hall and Echo. Master: Haze, width, *Hush* and level.
* **External routing**: Kick duck (`trackAudio`) is in the effects of Bass, Stab, Arp, Drone and the Echo return, and
  Glass Rain's Arp notes use `trackNotes`. These refuse capture.
* **Capture makes random IDs**: `captureLibraryAsset` and `captureLibraryClip` use `createId` for items, revisions and
  preset states. Node and module IDs inside payloads come from the example code, so those are already stable.
* Phase 3 gives `insert` and `preview` a `from` catalog.
* **Re-checked at `cb124ef`** (phase 5's tip). The code had moved in six places:
  * `vite.config.ts` has a `core` chunk group (phase 5) that takes every module under `src/core/`, so a lazily imported
    `core/examples/factory` would land in the eager `core` chunk unless the group's test leaves it out.
  * The architecture test lets `app` import only `@core` itself, not a subpath, so the dynamic import lives in core
    (`loadFactoryModule` in `core/examples/index.ts`) and `app/factory-library.ts` calls it.
  * Phase 5's link readers take one catalog: Sounds' `LibrarySounds` reads `useLibraryStore`'s `catalog` (filled by
    `library.read()`), and the details' "Used on" the same; both need the Factory catalog for a `factory:` origin.
  * The tree's roots are `LibraryRoot = 'project' | 'mine' | 'trash'`; actions and drops read items through
    `useLibraryStore.getState().catalog` (`itemOf`, `libraryItemOf`, `graphFitsOwner`'s default, `subjectName`).
  * Low Light's Stab has no clip in the Groove scene (its clips are in Stab, Hook, Break, Build and Drop).
  * Capturing an instrument takes its note graph along, so Low Light's Arp instrument carries its arpeggiator.

## Design

### The catalog (`core/examples/factory/`)

* **`createFactoryCatalog(): LibraryCatalog`** creates both examples once, captures each chosen sound into a fresh
  catalog, and builds the starters. It then runs **`withStableIds(catalog, 'factory')`**, which renames folder, item,
  revision and preset-state IDs to `factory:<folder>/<name>` (with `factory:rev/<name>` for revisions) and rewrites
  every reference (`folderId`, `parentId`, `revisionId`, `assetId`). The JSON is then the same on every build, which
  a test pins.
* **The content** is one table, `FACTORY_CONTENT`: folder, name, source (example and owner, or a starter builder), and
  domain. Its first version:

  | Folder | Items |
  |---|---|
  | Drums | Kick, Clap, Hat, Open hat, Shaker, Knocks, Crash (Low Light); Heart (Glass Rain) |
  | Bass | Bass (Low Light, instrument only); Sub (Glass Rain) |
  | Keys and synths | Organ stab (Low Light Stab, instrument + chord notes); Pluck (Low Light Arp's instrument); Pad (Glass Rain) |
  | Generative | Bells, Drops, Ticks (Glass Rain) |
  | Textures | Drone (instrument only), Riser, Dust (Low Light); Rain, Wind (Glass Rain) |
  | Effects / Tracks | Wander (Glass Rain's per-track pan wander), Low cut (starter), Widener (starter) |
  | Effects / Returns | Room, Hall (Low Light); Hall, Echo (Glass Rain) |
  | Effects / Master | DJ filter (Low Light); Haze and Hush (Glass Rain) |
  | Note effects | Minor seventh in A minor (Low Light Stab), Sixteenth arp (Low Light Arp) |
  | Clips / Low Light | the Groove and Drop scenes' clips of Kick, Clap, Hat, Bass and Stab (10 MIDI clips) |
  | Clips / Glass Rain | the Pad's clips of Fog and Storm |
  | Starters | Basic synth (saw → filter → envelope), FM bell, Noise sweep, Sine sub, Synced delay (effect) |

  Low Light's Echo return is left out (Kick duck). Names that collide across the examples get the example's name in
  the folder, not the item (*Effects / Returns* has two *Hall*s, distinguished by a short description).
* **A description per item** (`LibraryItem` has none; Factory keeps a side table, `factoryNotes[id]`) shows in the
  details: "Low Light's kick: an impulse ringing a resonant low-pass." The UI reads it only for `factory:` IDs. This
  keeps the catalog format unchanged.
* **Starters** are written with the example DSL (`patchOf`, `moduleOf`), with the same rules: locked nodes, musical
  knob ranges, no samples.

### Loading and the store

* `app/factory-library.ts` does `import('@core/examples/factory')` dynamically. If the alias can't name a subpath,
  re-export it through a lazily imported module in `app`. The first Library mount triggers it, and the store gains
  `factory: LibraryCatalog | null`.
* The tree's Factory root reads it, through the same `libraryRows`, with a read-only flag. Rows are drag sources but
  not drop targets. The kind glyphs and ▶ work as in My library.
* **Actions**: `library-item` and `library-folder` actions check `isFactory(id)`. Rename, Move, Duplicate and Trash
  don't apply. *Copy to My library* applies. Insert, Replace, Preview and Export pass `from: factory`.

### Copying

`copyLibraryEntries(from, to, ids, folderId)` in `core/library/catalog.ts`:

* It copies the chosen items and folders (folders with their contents), their revisions, and their presets, with new
  IDs. There are no samples to copy.
* It checks the caps before writing anything.

*Copy to My library* copies into the open My library folder. A drag copies into the folder dropped on.

## Steps

1. **The catalog.** `createFactoryCatalog`, `withStableIds`, `FACTORY_CONTENT`, the starters and `factoryNotes`. Unit
   tests:
   * the catalog is deterministic and passes `validate-library`'s strict checks;
   * every item inserts into the Starter project with no warnings;
   * every instrument renders finite, audible, un-blown-up audio, and survives a Randomize roll (reusing the examples'
     helpers);
   * every effect fits the input it claims;
   * the size of the built JSON is recorded.
2. **Loading and the tree.** The lazy import, the store, the Factory root, the read-only actions and `from` routing.
   Unit tests: `describeActions` on Factory items and folders. The build: the Factory chunk is separate, and the main
   and Library chunks grow by under 2 kB gzipped (record the numbers).
3. **Copying.** `copyLibraryEntries`, *Copy to My library*, and the drag. Unit tests: closure, IDs, caps; a copy
   survives a `.sfxlib` round trip. Smoke, in a new `library-factory.smoke.spec.ts`:
   * Factory shows its folders;
   * preview *Kick*;
   * drag *Bass* onto a track;
   * Factory refuses a drop;
   * *Copy to My library*, rename the copy, reload, and it's still there.
4. **Docs.** `library-and-presets.md` (Factory), `example-projects.md` (that the examples feed it), and
   `guide/examples.md` (a short "Factory sounds" section). The backlog gets the Factory presets content pass and the
   sidechain-ready sounds. This plan's notes are sorted.

## Behavior changes

Intended: the Library shows a Factory root; Factory sounds can be used and copied, not edited. My library, the
catalog in storage and its format don't change.

## Verification

* The usual gates and `npm run test:audio`.
* Measure `createFactoryCatalog`'s time in Chromium on the dev build. If it's over 150 ms, build it in an idle
  callback after the first Library render, with a "Loading Factory…" row meanwhile.
* **Listening pass (for the user):** each Factory instrument and effect auditioned once, after this phase lands. It
  doesn't block the next phase; the [runbook](RUNBOOK-library.md) collects it.

## Decisions to sign off

Signed off 2026-11-04: every row as proposed.

| Question | Proposed | Notes |
|---|---|---|
| Stable IDs | **Capture, then rename to `factory:` paths** | No change to capture. Node IDs are already stable. |
| Loading | **A lazy chunk on the first Library mount**; an idle callback if over 150 ms | |
| Descriptions | **A Factory-only side table**, not a catalog field | Keeps the catalog format unchanged. |
| Content | **The table above**: instruments without the duck, Low Light's Echo left out, 12 clips, 5 starters | Content can grow later without code changes beyond the table. |
| Presets | **None in the first cut** | A content pass, in the backlog. |
| Copy | **`copyLibraryEntries` into the open or dropped-on folder** | |

## Changes made while implementing

* **Inventory re-checked** at `cb124ef`; the six places the code had moved are in the inventory above.
* **Step 1:** ids are slugs of the names: a folder `factory:effects/returns`, an item `factory:effects/returns/room`, a
  revision `factory:rev/effects/returns/room`, a preset state `factory:state/effects/returns/room`. A table row can give
  a `key` for the last part, which is how the two *Hall*s are `hall-low-light` and `hall-glass-rain`; `withStableIds`
  throws when two items would share a path. Folders get their stable ids when made; items, revisions and states are
  renamed after capture, as the plan says.
* **Step 1:** *Clips / Low Light* takes the Stab's clip from Hook (scene 4), since it has none in Groove; the clips are
  named by scene and part (*Groove kick*, *Hook stab*, *Drop hats*), since the examples' clip names repeat (*Four on
  the floor*). Glass Rain's are *Fog chords* and *Storm chords*.
* **Step 1:** *Pluck* is captured with the Arp's note graph swapped for a plain one (a `plainNotes` source flag), so it
  is the voice alone; the arpeggiator is the *Sixteenth arp* note effect. *Organ stab* keeps its chord notes, as the
  table says.
* **Step 1:** *Haze and Hush* is one item, Glass Rain's master graph. *Low cut* and *Widener* (in *Effects / Tracks*) are
  written with the starters' DSL too, so `starters.ts` holds seven graphs, five of them in *Starters*. The starters live
  on the tracks of a small project (`createStarters`), so every row is captured the same way: by owner and graph.
* **Step 1:** the description table is `factoryNotes`, built from the content table's `note` column by id
  (`factoryIdOf`); the catalog stays as it is.
* **Step 1:** the Starter project is `createDemoProject`. Every item inserts there (effects onto a track, a new return
  or the master by their input, note effects onto a track's notes, clips into a new track) and the project saves and
  opens with no warnings. Instruments play a note held for two bars (Glass Rain's own test needs two bars for a rain
  that Randomize slowed down), before and after `randomizeParams` with seed 7.
* **Step 1: measured.** The catalog is 49 items, 14 folders and 37 revisions; its JSON is **524 900 bytes**. Building it
  takes 85–150 ms in Node (the first build of a process is the slower), and `validateLibraryCatalog` on it about 75 ms.
* **Step 1:** the `core` chunk group's test leaves out `src/core/examples/factory/` (a negative lookahead), so the
  Factory lands in a chunk of its own once step 2 imports it. Until then the loader is unused and tree-shaken: the
  build's chunks are as before (gzipped, before → after: `index` 112.92 → 112.17 kB, `core` 123.70 → 124.39,
  `LibraryPanel` 10.42, `library` 1.78).

* **Step 2:** the dynamic import is `loadFactoryModule` in `core/examples/index.ts` (the architecture test lets `app`
  import `@core` only); `app/factory-library.ts` loads it and builds the catalog once, timed as the
  `sfxlab:factory-catalog` performance measure. `PersonalLibrary.factory()` serves it, and the lazy wrapper does so
  without loading the library's own chunk. `loadFactory(load)` (state) puts it in the store once (`factory`,
  `factoryNotes`); a failed load lets the next call try again. The Library calls it on mount, Sounds for a Factory link.
* **Step 2: measured** in Chromium on the dev build, three cold loads: **80, 96 and 103 ms**, under the 150 ms threshold,
  so the catalog is built as the chunk arrives, with no idle callback. While the chunk loads, the root reads
  *Loading Factory…*.
* **Step 2:** `catalogOf(id)` and `fromOf(id)` (in `library-store.ts`) send a `factory:` id to the Factory's catalog:
  the actions, the drops, `graphFitsOwner`'s default, `libraryClipFitsSlot` and `subjectName` read items through them,
  and every insert and preview passes `fromOf`. A Factory item keeps *Preview*, *Insert new instrument track*, *Replace
  selected graph* (or a clip's *Insert into* and *Replace clip in*) and *Export as .sfxlib…*; a Factory folder *Open*
  and *Export*. The root has no menu.
* **Step 2:** *Export* of Factory items or folders reads the Factory beside storage: `prepareBundle(selection, name,
  extra?)` takes its catalog, whose ids can't collide with the personal ones.
* **Step 2:** the root sits between *My library* and *Trash*, collapsed at first, and is searched only while open, as
  the trash and *This project* are (so a search keeps My library's rows, and the existing specs theirs). Its glyph is
  🔒, its tooltip "Read-only: copy a sound to My library to change it". Its rows drag, and nothing drops on them.
* **Step 2:** the details say *Instrument · Factory* and show the item's line from `factoryNotes` above its facts; a
  folder is *Folder · Factory*; the root counts its items and folders and says what it is.
* **Step 2: the gap phase 5 found.** Sounds' *From the library* reads the catalog of the link's item: the Factory's for
  a `factory:` origin (loading it), so a Factory sound lists itself as *Library sound*; the details' "Used on" reads the
  item's own catalog the same way. *Save to library* on a preset of a Factory-linked sound saves a sound of its own,
  since the Factory is read-only: the save-back ignores Factory links, and its tooltip says so. The unit test is in
  `library-factory.test.ts`; the smoke case is in step 3's spec.
* **Step 2:** with a fourth root, the empty Library's *Save Bass to library* left the box at 280 × 200
  (`views-at-min-size`), so the button now comes before the hint. The library tree spec's search labels gain the
  closed root, "Factory, 49 items".
* **Step 2: chunks.** The Factory is its own lazy chunk, `factory` 16.91 kB (5.38 kB gzipped), not preloaded. Gzipped,
  against `cb124ef`: `index` 112.92 → 112.28 kB, `LibraryPanel` 10.42 → 10.94, `state` 29.97 → 30.18, `core` 123.70 →
  124.50, `library` 1.78 → 1.85; each under the 2 kB the plan allows. `vite build` takes about 0.35–0.41 s.
* **Step 2:** checked in the preview (dev build, Low Light) with the Library at 280 px in the sidebar: the root, *Drums*
  open, *Clap*'s details and menu, *Add as new track*, then Sounds on the new track (*From the library · Clap*) and the
  details' "Used on Clap". The empty Library at 280 × 200 and 280 × 420 in a throwaway spec's screenshots.
* **Step 3:** `copyLibraryEntries(from, to, ids, folderId)` copies a folder with its live folders and items, an item
  with its live presets, and a preset with its sound, so the copy is whole; the revisions they use get new ids, and so
  do the preset states. What was inside a copied folder stays inside its copy; the rest lands in `folderId`. Names
  stay (as an Alt-drag into another folder keeps them). The folder, item and revision caps are checked first.
* **Step 3:** "the open My library folder" is kept in the store as `mineFolder`: making a My library row (or a root)
  active sets it, and a Factory row keeps it, so `openFolder()` while a Factory row is active is the folder open before.
  Saves made then go there too.
* **Step 3:** *Copy to My library* sits in the `edit` group before *Export*, on Factory items and folders; a Factory
  folder's details have it as their main button. A Factory row dragged onto *My library* or one of its live folders is
  copied (`drop.factory-item-on-folder` and its kin, always a copy); the trash and the Factory take none. Both report
  "Copied Kick to My library" with *Show*, which makes the copy active and names it in place, as a save's *Show* does.
* **Step 3:** a Factory row's drop target is null, which `useDropTarget` marks `data-drop="refuse"` while a drag is over
  it: the smoke checks that, and that nothing changed.
* **Step 3:** the round trip is in `library-transfer.test.ts`: *Effects* and *Kick* copied into a folder, exported as an
  `.sfxlib`, staged and imported, give the same items and revision signatures, with no `factory:` id left.
* **Step 3:** `library-factory.smoke.spec.ts` has four cases: the folders and the root's place (and *Preview Kick*, and
  a menu without *Rename*, *Duplicate*, *Move to* or *Trash*); *Bass* dragged onto Lead, then Sounds' *From the library
  · Bass* (the phase 5 gap's smoke case); nothing dropping onto *Drums*; and *Copy to My library* by menu (renamed *My
  kick* through *Show*) and by a drag (*Sub*), both still there after a reload.
* **Step 3:** checked in the preview (dev build, Low Light, Library at 280 px in the sidebar): *Copy to My library* on
  the Factory's *Kick* (toast, *Show* naming it in place); after a reload, with the Library not yet shown, selecting the
  Factory-linked track made Sounds load the Factory and list *From the library · Clap*. The sidebar can't be widened
  past its maximum, so the wide layout (tree beside details) was checked in a throwaway spec's screenshot, docked in the
  panel.
