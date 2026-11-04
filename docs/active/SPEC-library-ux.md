---
status: active
date: 2026-11-04
note: "Proposal for discussion: Library and Sounds analysis, one tree with items and drag and drop, a This project root, Sounds as the presets of the selection, a read-only Factory library from the examples. All decisions (D1–D16) signed off 2026-11-04; next is a plan for phase 1."
---

# Library and Sounds UX, and a Factory library

The Library view (`ui/library/LibraryPanel.tsx`) and the Sounds view (`ui/presets/PresetsPanel.tsx`) both work, and the
core under them (catalog, presets, insertion, bundles) is solid. Both views, though, put every capability on screen as a
button, and the two don't know about each other, although they handle the same kind of thing: a sound and its presets.

This spec analyses both. It then proposes:

* **one Library tree** holding folders *and* items, with drag and drop;
* four roots in that tree: **This project**, **My library**, **Factory** and **Trash**;
* **Sounds** reworked to show the presets of whatever is selected, wherever they live;
* entry points where the user already is: a *Library* menu, context menus, and dragging things in.

## 1. Analysis

### 1.1 The Library view today

At its default size (primary sidebar, 300 px, so the one-column layout) with an empty library, the view shows **19
controls before the first item**:

| Row | Controls | What they are for |
|---|---|---|
| Search | *Search all folders*, *All types* ▾, *Trash*, *Refresh*, status line | browsing |
| Save | *Library name* field ("My sound"), *New folder*, scope ▾ (*Instrument + notes* / *Audio effects* / *Note effects*), *Save asset + presets*, *Save selected clip*, *Choose sample* ▾, *Catalog sample* | creating |
| Bundle | *0 selected · 0 hidden*, *Clear selection*, *Review selected items export*, *Review folder export*, *Import .sfxlib* file input | exchanging |
| Folders | *All folders*, the tree, *Move destination* ▾ | organising |
| Items | a checkbox per row, the item | browsing |

Selecting an item adds 11 more buttons and four paragraphs: *Preview*, *Stop preview*, *Insert new instrument track*,
*Replace selected graph*, a scene number with two clip buttons, *Rename item*, *Move item*, *Duplicate item*, *Trash
item + associated presets*. Opening a folder adds *Rename folder*, *Trash folder and contents* and *Move folder*. In the
screenshot that started this spec, the only item sits about 70 % of the way down the view.

Problems:

1. **Creating comes before browsing.** Most visits are to find something and put it in the project, yet the first two
   rows are about saving.
2. **Saving happens in the wrong place.** To save the Bass you select it somewhere else, come here, and pick a scope from
   a ▾ that doesn't say which track it will read. No track, clip, sample, group or master menu has *Save to library*
   (`state/actions/track.ts`, `clip.ts`, `sample.ts`, `master.ts`, `group.ts`).
3. **One name field does four jobs.** "My sound" names the next asset, clip or sample, the next folder (*New folder*
   uses it) and an exported bundle. Selecting an item overwrites it with that item's name.
4. **Folders and items are apart.** The tree shows folders only; their items are in a second list, so one level is
   visible at a time and the tree can't show where an item is.
5. **Moving is a remote control.** You pick from *Move destination* ▾ (which lists folders with ID suffixes,
   `Drums · a1b2c3`), then press *Move item* or *Move folder*. Nothing can be dragged onto a folder, and no menu has
   *Move to ▸*.
6. **Exporting takes over browsing for good.** Every row carries an export checkbox, and the view always shows the
   selected and hidden counts.
7. **Some actions appear twice and others not at all.** The folder buttons repeat the folder's menu, and the details
   repeat the item's. The item menu has no clip insertion, *Move* or *Export*, and the root row *All / root* has no menu
   (`subject={null}`).
8. **Trash is a mode, not a place.** *Trash* swaps the whole view, and trashed folders show as "Restore folder X"
   buttons.
9. **Implementation shows through.** *Refresh* is redundant: the view re-reads the catalog every time it is shown.
   Raw kinds (`midi-clip`) appear as labels and filter values, sample IDs in the details, and the bundle review says
   "logical ID conflicts", "immutable revisions", "expanded bytes", "parent folder_…".
10. **Details are prose.** Four explanatory paragraphs are always on screen.
11. **Clips ask for a scene number,** though dropping onto a slot works (`drop.library-item-on-slot`).
12. **Previewing is slow.** It takes two buttons in the details. There is no ▶ on a row and no key for it.
13. **Drag and drop out works, but nothing says so.** Items drop onto tracks, the master, groups, canvases and empty
    slots (`state/actions/drops.ts`), the best way in, and the view never mentions it.

### 1.2 The Sounds view today

Sounds (secondary sidebar) holds a project's **snapshots** (control values of one owner and scope, including *Whole
track + mixer*) and its **presets** (control values and sample choices tied to an `AssetRevision`, the graph's
structure). It also has an A/B morph and the per-use sample choices.

1. **It isn't about the selection.** The toolbar is scoped to the selected track, but the lists show every snapshot and
   preset in the project, each labelled `Name · Owner / Scope`. With a dozen tracks this is a long list where most rows
   don't apply.
2. **Five buttons on every row** (*Recall X*, *Update*, *Rename*, *Duplicate*, *Delete*) repeat the row's menu.
3. **The button and the menu do different things.** A preset's *Recall* button recalls onto the scope chosen in the
   toolbar; its menu entry recalls onto the preset's own owner. This is documented in `workbench.md`, but nothing on
   screen tells you.
4. **The same pattern as the Library:** a name field ("Sound 1") and a scope ▾ that repeat the Library's own.
5. **Words the user doesn't have.** Nothing explains "snapshot" versus "preset". "Embedded presets" and "Revision
   1a2b3c4d" are internal terms.
6. **Morphing needs two selects of every snapshot** in the project. Picking two from different owners only fails once
   you move the slider.
7. **Sample choices show node ID paths** (`n_osc / sampler`). The same choices are already editable in the root
   property sample pickers.
8. **The project and the library don't connect.** This is the main gap:
   * Inserting a library sound copies **all** its presets into the project (`insertLibraryAsset`). A preset added to
     the library item later never reaches that track.
   * A preset saved in the project can't go back to the library item it came from. The only route is saving the whole
     sound again, as a new item.
   * Library presets can't be recalled onto a track that already has that sound. Applying one means *Replace selected
     graph*, which gives the graph new node IDs and leaves automation and MIDI mappings pointing at nodes that are
     gone.

   **The root cause is in the core.** `copyAsset` (`core/library/assets.ts`) gives every node, module and port a fresh
   random ID and doesn't keep the mapping. `assetSignature` includes node IDs. So a project graph never matches its
   library origin again, and `LibraryOrigin` records only *which* item a sound came from.

### 1.3 What is good and stays

The WAI-ARIA tree and its keys, in-place rename, the actions in `state/actions/library.ts` and `sound.ts`, all the
drops, spring-loaded tabs (a drag resting on a hidden view's tab opens it), recoverable trash, the bundle review step,
isolated preview, Read and Touch recall, morph gestures, and all of `core/library` and `core/preset`.

## 2. The Library: one tree, four roots

### 2.1 Layout

```
┌ Library ─────────────────────────────── ⋯ ┐
│ [ Search                ]  [All types ▾]  │  ⋯ = New folder, Import .sfxlib…,
│                                           │      Export selection…
│ ▾ ◆ Low Light  (this project)             │
│   ▸ Kick                                  │  a track: Instrument, Effects,
│   ▾ Bass                                  │  Notes, Clips (§ 3)
│       ♪ Instrument          2 presets     │
│       ≈ Effects             ⚠ Track audio │
│     ▸ Clips                         8     │
│ ▾ My library                         12   │
│   ▾ Drums                             4   │
│     ▾ ♪ Big kick                          │  an instrument expands to its presets
│         • Tight                           │
│         • Boomy                           │
│       ▦ Backbeat           MIDI clip      │
│   ▸ Pads                              3   │
│ ▸ 🔒 Factory                         38   │
│   🗑 Trash                            2   │
│ ───────────────────────────────────────── │
│ Big kick                  instrument  [▶] │  details: one line of facts,
│ 2 modules · 2 presets · no samples        │  one primary button, ⋯ = the menu
│ [ Add as new track ]                [⋯]   │
└───────────────────────────────────────────┘
```

* **One tree** holds folders and items. Instruments and effects expand to show their presets as child rows, so the
  separate item list goes. The wide layout puts the details beside the tree; the narrow one puts them under it. That
  replaces today's three-, two- and one-column layouts with two.
* **Rows**: a kind glyph and a readable kind (*Instrument*, *Audio effect*, *Note effect*, *Preset*, *MIDI clip*,
  *Audio clip*, *Sample*), item counts on folders, and a ▶ on hover or focus for preview. Standard selection: click,
  ⇧ for a range, ⌘ to toggle. The selection count shows only when more than one item is selected.
* **Search** filters the tree to the matches and the folders above them, and expands those folders. The type filter
  does the same.
* **Header**: search, type filter, and ⋯ for what's left. No name field, no save buttons, no *Refresh*.
* **Details**: name, kind, one line of facts, and **one primary button** for the item and the selection. Everything
  else is in ⋯, which is the item's context menu:

  | Item | Primary button |
  |---|---|
  | Instrument, or its preset | *Add as new track* (*Replace on Bass* is in ⋯) |
  | Audio effect | *Replace effects on Bass*: the selected owner if it fits, else disabled with the reason ("For return tracks") |
  | Note effect | *Replace notes on Bass* |
  | Preset of the selected track's own sound (§ 4.3) | *Recall on Bass* |
  | MIDI or audio clip | *Insert into first empty slot of Bass* (or drag; *Insert into ▸ Scene n* in ⋯) |
  | Sample | *Add to project* |

  The explanations become tooltips, or appear once in the empty state.
* **Bundle review becomes a dialog** (like `ExportAudioDialog`), in plain words: "12 items, 3 folders, 2 samples (4.1 MB).
  Imports into a new folder called *Drum kit*." The technical list goes in a *Details* disclosure, and *Partial export*
  stays an explicit checkbox.

### 2.2 Drag and drop in the tree

| Drag | Drop on | Does |
|---|---|---|
| My library items or folders | a folder or the *My library* row | move; with Alt, copy (*Duplicate*) |
| My library items or folders | *Trash* | trash (with their presets, as today) |
| Trash items or folders | a folder | restore into that folder |
| Factory items or folders | a My library folder | copy (always a copy) |
| *This project* rows (§ 3) | a My library folder | save to the library there |
| a track, clip or sample from Tracks, Session, Arrangement or Samples | a My library folder | save to the library there |
| a preset row from Sounds | a My library folder, or the instrument it belongs to | save as a library preset (§ 4.3) |
| anything | Factory, *This project* | refused (no-drop cursor) |

* A collapsed folder springs open after resting on it for 500 ms (`SPRING_LOAD_MS`, as tabs do). Dropping on a folder
  highlights the row. A folder can't go into itself or a folder inside it. Because a drag can rest on the *Library* tab
  to open it, dragging a track from the Tracks view to the Library works even while the Library is hidden.
* Dragging out to the project is unchanged (tracks, master, groups, canvases, slots).
* **New in `drops.ts`**: a `library-folder` drop target, also standing for the four roots, and drops for the
  `library-item`, `clip`, `sample`, `sound`, `track` and `group` payloads onto it. Dragging a whole folder needs a
  `library-folder` payload. Dragging several items needs a payload that carries several IDs. Both are new: the drag
  infrastructure carries one subject today (`workbench.md`: "several things at once" is not done yet).

### 2.3 Keyboard

The tree keeps its keys and adds: Space to preview, Enter for the primary action, F2 to rename, Delete to trash, ⌘X
and ⌘V to move (cut, then paste into the focused folder), and ⌘D to duplicate. The verbs (`delete`, `rename`,
`duplicate`, `cut`, `paste`) already go through `runVerb`, so this means giving library subjects actions with those
verbs. The menus cover everything for touch.

### 2.4 Scale

The catalog caps at 1024 folders and 4096 items. The tree renders only expanded rows, and search expands only the paths
to its matches. If a fully expanded large library is slow, virtualize the rows (measure first).

## 3. *This project* in the Library

A root named after the open project shows what it holds as library-like rows. It's built live from the project store;
nothing is stored, and the rows are read-only (no rename, move or trash).

```
◆ Low Light (this project)
  ▾ Kick                     ← each instrument, audio or return track, group bus, the master
      ♪ Instrument   2 presets
      ≈ Effects
      ⇢ Notes
    ▸ Clips  8               ← its session clips
  ▸ Samples  3               ← project.samples
  ▸ Modules  6               ← project.modules: shown, savable once L2 lands
```

* **Grouped by track,** since "Effects" alone means nothing. Only graphs that hold something are listed (a track with
  an empty note graph shows no *Notes*).
* **Actions** (menu and drag):
  * *Save to library*: drag it onto a folder, or it goes into the open one.
  * *Copy to new track* (instruments).
  * *Copy onto…*: drag it onto another track, the master or a canvas.
  * *Preview*, in the isolated engine.
  * *Show*, which selects the track and opens its editor.

  Copy and preview work by capturing into a throwaway catalog with the existing pure `captureLibraryAsset` /
  `captureLibraryClip`, then using `insertLibraryAsset` or the preview path. Nothing new is needed in the core.
* **Sounds that can't be saved** say why, with the row disabled: "Uses *Track audio* from Kick" or "Uses *Track notes*
  from Pad". `assets.ts` refuses `send`, `trackAudio` and `trackNotes`. In Low Light this hits the effects of Bass, Stab,
  Arp, Drone and the Echo return (*Kick duck*); in Glass Rain, the Arp's note effects.
* **Cost**: the rows are just names and counts from the project. Capture happens only on a drag, preview or save.
* This doesn't replace the Tracks view. Tracks orders, groups, mutes and routes; this root is only about moving sounds,
  clips and samples between the project and the library.

## 4. Sounds: the presets of what is selected

### 4.1 Layout

```
┌ Sounds ──────────────────────────────────┐
│ Bass   [Instrument | Effects | Notes | Track] │  follows the selection; the tab
│                                          │  follows the editor last shown
│ In this project                          │
│   ● Deep           preset     A          │  click = recall (one undo step)
│     Bright         preset         B      │  A / B = morph ends (from the menu)
│     Verse          snapshot              │
│ From the library · Big bass              │  presets of the library sound this
│     Wide           preset                │  track came from (§ 4.3)
│     Dirty          preset                │
│ [ + Save preset ]  [ + Snapshot ]        │  named "Bass 3", renamed in place
│ ──────────────────────────────────────── │
│ Morph  Deep ━━━━━━●━━━━━━ Bright         │  only with A and B set
│ ▸ Sample choices (2)                     │  readable names, collapsed
└──────────────────────────────────────────┘
```

* **Scoped to the selection.** The lists show only what can be recalled onto the selected owner and graph: presets for
  which `canRecallPresetOn` holds, and snapshots of that owner and scope. A *Show all in project* toggle in ⋯ brings
  back today's list.
* **Rows are recall targets.** Click recalls onto the selection (Read and Touch rules unchanged). Everything else is in
  the row's menu: *Update*, *Rename*, *Duplicate*, *Set as A*, *Set as B*, *Save to library*, *Delete*. The button
  and the menu now agree: both recall onto the selection, the only owner the view shows.
* **Saving**: *+ Save preset* and *+ Snapshot* name the new sound after the owner ("Bass 3") and start renaming it in
  place. No name field and no scope ▾: the tab is the scope.
* **Words**: a short line in the empty state explains the two kinds ("A preset remembers the sound and works with this
  instrument wherever it goes; a snapshot remembers knob positions in this project, for morphing and recalling"). No
  revision IDs.
* **Morph** takes its ends from rows, so it only offers what fits.
* **Sample choices** collapse, with node titles instead of IDs. They could move to the Instrument's property editor
  later, since its root pickers edit the same bindings.

### 4.2 How Sounds and the Library fit together

They show the **same thing in two places**: an instrument and its presets.

* The Library shows any sound's presets under it in the tree, for every source: project, mine, factory.
* Sounds shows the presets of the **selected** sound, from the project and from the library item it came from.
* A preset moves between them by drag (Sounds → library folder or instrument), by the row menu (*Save to library*), and
  back by click (recall from the library onto the track).

### 4.3 The link this needs in the core (C1)

To recall a library preset onto an existing track, and to save a project preset back into the library item it came
from, the project has to remember **how the IDs were mapped** when the sound was inserted:

* At insertion, `copyAsset` returns its node, module and port mapping. The project stores it with the inserted
  revision, as optional fields on `LibraryOrigin`. **No format bump** (D11 as corrected; details in phase 5's plan):
  the usual sanitizer bounds and a fixture, and an older build only loses the link.
  * *Alternative*: derive the new IDs deterministically from a per-insertion salt stored in the origin, so the map can
    be recomputed and needn't be stored. It's smaller on disk but harder to reason about. Recommend the stored map.
* A link is **live** while the track's graph still has the inserted revision's signature. Rewiring breaks it, and the
  library section in Sounds then shows "This sound has changed since it came from the library", with no recall.
  Changing knob values doesn't break it.
* With a live link:
  * **Recall from the library** translates the preset's targets through the map. It's a normal one-step recall, with
    no graph replacement, so automation and MIDI mappings stay.
  * **Save to library** translates back and adds the preset to the original item.
* Without a link (a sound built in the project, or a project from before the bump), *Save to library* saves the sound
  and its presets as a new library item, as today.
* Factory items get the same link. Inserting a Factory sound and later recalling another of its Factory presets works
  the same way.

## 5. Entry points outside the two views

### 5.1 A *Library* menu next to File / View / MIDI

Built from commands like File and View (`ui/commands/menus.ts`), so every entry is in the palette too:

```
Library
  Save instrument of Bass to library
  Save effects of Bass to library
  Save note effects of Bass to library
  Save clip "Backbeat" to library
  ───
  New folder
  Import .sfxlib…
  Export library…
  ───
  Show library
```

The save entries name what they'll read, and are disabled with the reason when nothing fits. Saving goes into the
folder open in the Library (*My library*'s root if the open folder is in Factory, This project or Trash). It confirms
with a toast, "Saved *Bass* to *Drums* · Show", and *Show* reveals the new item with its name ready for renaming.

### 5.2 Context menus

| Subject | New entries |
|---|---|
| Instrument track | *Save to library ▸ Instrument + notes / Audio effects / Note effects* |
| Audio or return track, group bus, master | *Save effects to library* |
| Session clip | *Save to library* |
| Sample (Samples view) | *Add to library* |
| Preset (Sounds) | *Save to library* |
| Library item | + *Insert into ▸ Scene 1…n* (clips), *Move to ▸*, *Export as .sfxlib…*, *Copy to My library* (Factory) |
| Library folder | + *Move to ▸*, *Export as .sfxlib…*; Factory folders: *Copy to My library* only |
| *My library* root | *New folder*, *Import .sfxlib…*, *Export all…* |
| *This project* rows | *Save to library*, *Copy to new track*, *Preview*, *Show* |

All of these are actions in `state/actions/` that call the existing `library.saveAsset`, `saveClip` and `saveSample`.
The menu bar, the context menus and the drops run the same actions.

## 6. The Factory library

A read-only library of ready-made sounds that ships with the app and is built **from code**, as the example projects
are.

* **Where it lives.** `core/examples/factory.ts` builds a `LibraryCatalog`: it creates the example projects and runs
  the pure `captureLibraryAsset` / `captureLibraryClip` on their tracks, plus a few sounds written with the example DSL
  (`patchOf`, `moduleOf`). IDs are fixed and prefixed with `factory:`, so the JSON is the same on every build (tested,
  like the examples). It is **not stored**. The Library store holds it next to the personal catalog, and it's built
  lazily the first time the Library opens, in its own chunk (see backlog P4). Insertion already takes a catalog and
  an item, so using a Factory sound is the same code path.
* **Read-only.** *Copy to My library* makes an editable copy. A new app version updates Factory without touching what
  the user owns. Seeding the personal catalog on first run was considered and rejected: it can't be updated, it mixes
  with the user's own items, and trashing it loses it.

| Folder | From Low Light | From Glass Rain | Notes |
|---|---|---|---|
| Drums | Kick, Clap, Hat, Open hat, Shaker, Knocks, Crash | Heart | all synthesized, no samples |
| Bass | Bass | Sub | Bass without its *Kick duck* effects |
| Keys and synths | Stab (organ, with its chord note graph), Arp (pluck) | Pad | |
| Generative | | Bells, Drops, Ticks | self-playing voices: one held note is enough |
| Textures and FX | Drone (without the duck), Riser, Dust | Rain, Wind | |
| Effects: tracks | Auto-pan wander | Wander | `trackIn` |
| Effects: returns | Room, Echo (dotted eighth, *Throw*), Hall | Hall, Echo | `returnIn`: return tracks only, and the row says so |
| Effects: master | DJ filter, Cut and level | Haze, Hush and level | `masterIn` |
| Note effects | Minor seventh in A minor, Sixteenth arp | | |
| Clips | drum, bass and chord patterns per scene | Pad chords | MIDI clips |
| Starters (new) | | | basic subtractive synth, FM bell, noise sweep, sine sub, synced delay, low cut, widener |

Limits found in the code:

* **External routing is refused** (`send`, `trackAudio`, `trackNotes`). So the *Kick duck* effects and Glass Rain's
  Arp note graph can't ship. A sidechain-ready item needs its own design.
* **There are no module-only items** (backlog L2). *Soft clip*, *Organ*, *Mallet*, *Chance*, *Scale note* and *Noise
  hit* ship inside the instruments that use them until L2 lands; a *Modules* folder can come then.
* **Return and master effects fit only their own input,** so their rows and drop targets say so.
* **Presets for Factory sounds** (*Kick · Tight / Boomy*) are content work: optional for the first cut, and worth more
  once C1 makes them recallable onto an existing track.
* **Tests**: deterministic JSON. Every item inserts into the Starter with no warnings. Every instrument renders finite,
  audible, un-blown-up audio (reusing the examples' render and Randomize tests). Every effect fits the input it claims.
  A copy survives reload and a `.sfxlib` round trip. A browser check previews a Factory item and drags it onto a track.

## 7. Phasing

Each phase has its own plan (`PLAN-library-1-tree.md` … `PLAN-library-7-polish.md`), and [RUNBOOK-library.md](RUNBOOK-library.md)
says how they are built. Phase 1 took the context-menu saves from phase 2. Phase 5's plan stores the link without a format
bump, which corrected D11 (signed off).

| Phase | Work | Depends on |
|---|---|---|
| 1 | **Tree and drag and drop**: one tree with items and presets, drag to move, copy and trash, the `library-folder` drop target, header and ⋯, Trash in the tree, compact details with a primary button, bundle review dialog, readable kinds | — |
| 2 | **Entry points**: *Library* menu, *Save to library* in context menus, dragging tracks, clips, samples and presets into folders, the root menu | 1 for the folder drops; the menus can go in parallel |
| 3 | **This project root** | 1 |
| 4 | **Sounds rework**: scoped to the selection, rows as recall targets, morph from rows, saving without a name field | — (parallel to 1) |
| 5 | **Library link (C1)**: the stored ID map (no format bump), library presets in Sounds, *Save to library* into the origin item | 4 |
| 6 | **Factory library** | 1; better after 5 |
| 7 | **Polish**: keys (Space, Enter, F2, ⌘X/⌘V), multi-item drag, virtualization if measured slow | 1 |

Phases 1 and 4 rewrite the browser checks and the `library.smoke.spec.ts` and Sounds selectors (by label: *Save asset +
presets*, *Move destination*, *Include … in bundle*, *Recall preset …*), so they get rewritten alongside.

## 8. Decisions

| # | Question | Proposed | Status |
|---|---|---|---|
| D1 | Items in the folder tree? | Yes: one tree of folders and items, presets under their sound | **decided** |
| D2 | Moving | Drag and drop onto folders (Alt copies), plus *Move to ▸* in menus | **decided** |
| D3 | Where does saving live? | Context menus, the *Library* menu and dragging in; no save controls in the view | **decided** |
| D4 | Does saving ask for a name and folder first? | No: named after the source, into the open folder, toast with *Show*, rename in place | **decided** |
| D5 | Multi-select for export | Standard tree selection; no permanent checkboxes | **decided** |
| D6 | Trash | A row in the tree, not a mode | **decided** |
| D7 | Bundle review | A dialog in plain words; details in a disclosure | **decided** |
| D8 | *This project* root | Yes, grouped by track, read-only, live from the project | **decided** |
| D9 | Sounds scope | Only what fits the selection; *Show all in project* in ⋯ | **decided** |
| D10 | Snapshot and preset | Keep both kinds, one list, a kind label and one line of explanation | **decided** |
| D11 | Library link (C1) | Store the ID map at insertion as optional fields, **no format bump** (corrected 2026-11-04 from "format 14", see phase 5's plan); a link breaks on rewiring, not on knob changes | **decided** |
| D12 | Factory storage | Built from code, read-only, not stored; *Copy to My library* to edit | **decided** |
| D13 | Factory name | *Factory* (alternatives: *Examples*, *Built-in*, *SFX Lab*) | **decided** |
| D14 | Kick-duck sounds | Ship them without the duck; sidechain-ready items later | **decided** |
| D15 | Starters folder | Yes: a handful of new plain sounds alongside the recycled ones | **decided** |
| D16 | Menu bar placement | *Library* between *View* and *MIDI* | **decided** |
