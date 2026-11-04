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
