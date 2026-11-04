---
status: active
date: 2026-11-04
note: "Phase 1 of SPEC-library-ux.md: one Library tree with items and drag and drop, and the Save to library actions that replace the view's save row. Decisions signed off 2026-11-04; ready to build."
---
# Library phase 1: the tree, drag and drop, and saving from where things are

Phase 1 of [SPEC-library-ux.md](SPEC-library-ux.md) (decisions D1–D7 and D16 apply here). The inventory was taken on
`feat/library-improvements` at `5693980`.

## Goal

The Library view becomes a browser: one tree to find, audition and use things in, organised by dragging. After this
phase:

* **one tree** holds the folders and the items, and each instrument and effect shows its presets under it. Two roots
  for now: **My library** and **Trash**. *This project* comes in phase 3 and *Factory* in phase 6;
* **drag and drop** in the tree: an item or folder dropped on a folder moves there (Alt copies it), dropped on Trash
  it is trashed, and a trashed one dropped on a folder is restored there. A collapsed folder springs open under a
  resting drag;
* **saving happens where the thing is.** Tracks, groups with a bus, the master, session clips and samples gain *Save
  to library* (samples: *Add to library*) in their context menus. The new item is named after its source, goes into
  the folder open in the Library, and a toast confirms it with a *Show* button;
* **the view loses its controls:** no name field, save row, bundle row, *Move destination*, row checkboxes or *Trash*
  mode. The header is search, the type filter and ⋯. The details show one line of facts and one primary button;
* **bundle review is a dialog** in plain words; *Import* and *Export* are in menus;
* **previewing is quicker:** a ▶ on every item row, and Space on the focused row.

Out of scope here, in later phases of the spec:

* the *Library* menu-bar entry and the palette commands, and dropping tracks, clips, samples or presets from other
  views onto library folders (phase 2);
* the *This project* root (phase 3), the Sounds rework (phase 4), the library link (phase 5), Factory (phase 6);
* ⌘X / ⌘V moves, dragging several items at once, and virtualizing the rows (phase 7);
* any change to the catalog format, storage, `core/library` insertion, bundles' contents or preview.

## Inventory

### The view (`ui/library/`)

* `LibraryPanel.tsx` (158 lines) holds all its state in `useState`: the name field, query, kind, trash mode, save
  scope, sample choice, scene, bundle stage, partial flag, checked IDs, move target, status message and busy flag. It
  also holds the selected item. `run()` sequences async operations with an operation token, so a stale result can't
  overwrite a newer one, and a separate flag tracks whether the running operation is a preview. Hiding the view drops
  results and stops the preview; showing it re-reads the catalog. **Keep this token logic**: the smoke tests at
  `library.smoke.spec.ts:61` and `:126` guard it.
* `FolderTree.tsx` and `folder-tree.ts` make up a WAI-ARIA tree of folders only, with `folderRows`, `treeKey` (arrows,
  Home/End, Left/Right, `*`), `expandedFor`, in-place rename on rows, and an *All folders* toggle below 440 px. Unit
  tests are in `folder-tree.test.ts`.
* `LibraryView.tsx` lazy-loads the panel, which keeps production chunks under the warning limit
  (`library-and-presets.md`). That stays.
* `LibraryPanel.module.css`: three, two and one columns, at 640 and 440 px container widths.

### State and actions

* `state/library-store.ts` holds `catalog` and `openFolder`, which are what the menus need from the view.
* `state/actions/library.ts`:
  * the item actions: *Preview*, *Rename*, *Duplicate*, *Insert new instrument track*, *Replace selected graph* /
    *Add sample to project*, *Trash*, *Restore*;
  * the folder actions: *Open*, *Rename*, *New folder inside*, *Trash*, *Restore*;
  * the helpers `insertionScope`, `graphFitsOwner`, `libraryClipFitsSlot`, `insertLibraryClipAt` and `replaceGraph`.

  *Rename*, *Duplicate* (items) and *Trash* carry the `rename`, `duplicate` and `delete` verbs.
* **Verbs already reach the tree.** `ActionMenu` records its subject on the trigger (`focus-subjects.ts`), so F2,
  Delete and ⌘D on a focused row run that row's action once rows are `ActionMenu` triggers, as they are today.
* `PersonalLibrary` (`state/library.tsx`) offers `saveAsset(scope, name, folderId)`, `saveClip`, `saveSample`,
  `update`, `insert`, `preview`, `stopPreview`, `stageBundle`, `importBundle`, `prepareBundle` and `exportBundle`. The
  save methods return the new catalog, not the new item, but `app/library.ts`'s `save` already computes the added
  items.
* `trashLibraryEntry` (`core/library/catalog.ts`) trashes or restores recursively. `saveLibraryFolder` and
  `saveLibraryItem` are the edits. There is no move edit: *Move item* saves the item with a new `folderId`, and **its
  presets stay where they were**, so existing catalogs can hold presets in a different folder from their sound.
* **Toasts can't carry a button.** `usePersistenceStore.notify(kind, message, details?)` has no action.

### Drag and drop (`state/actions/drops.ts`, `ui/shared/drag/`)

* `DragPayload` is a `clip`, `sample`, `sound`, `library-item`, `track` or `group`. `DropTarget` is a `slot`, `lane`,
  `track`, `master`, `canvas` or `group`. There is no library target and no folder payload.
* `useDragSource`, `useDropTarget` and `useEdgeTarget` set the feedback attributes (`data-drop`, `data-edge`) without
  re-rendering. `useSpringLoad` opens hidden views' tabs after `SPRING_LOAD_MS` (500 ms).
* The architecture test allows `dataTransfer`, `draggable` and `onDrag…` only in `ui/shared/drag/` and three named
  components, so spring-opening a folder needs a hook there.
* Library item rows are already drag sources, onto slots, tracks, the master, groups and canvases.

### Browser specs that use the view

| Spec | What it relies on |
|---|---|
| `library.smoke.spec.ts` (6 tests) | *Library name*, *New folder*, *Save asset + presets*, *Save selected clip*, the *Library items* list, *Insert new instrument track*, *Trash item + associated presets*, *Trash* / *Back to library*, *Restore item*, *Preview* / *Stop preview*, *Refresh*, *Include … in bundle*, the scene field, `getByRole('status')` |
| `bundle.smoke.spec.ts` (2) | *Import library bundle* file input, the *Bundle review* region, *Cancel bundle*, *Import into new folder*, *Review folder export*, *Download .sfxlib*, *Trash folder and contents*, folder tree rows |
| `context-menus.smoke.spec.ts` | saving via the toolbar, item *Trash* / *Restore* menus, *Trash* mode, *New folder inside* |
| `drag-and-drop.smoke.spec.ts` | saving via the toolbar, then dragging an item onto a track and a slot |
| `views-at-min-size.smoke.spec.ts` | the empty state's *Save asset + presets*, search, the item list |
| `automation.audio.spec.ts` | bundle import, save, *Replace selected graph*, *Trash item + associated presets* |

`library.smoke.spec.ts:96` (blocked upgrade) uses **Refresh** to retry after the user closes an older tab. Refresh
is therefore not redundant, as the spec assumed: it is the retry for that error (see Design, *Status*).

## Design

### Model: the tree's rows

`ui/library/library-tree.ts` replaces `folder-tree.ts`. It is pure and unit-tested:

```ts
type LibraryRow =
  | { kind: 'root'; root: 'mine' | 'trash'; level: 1; count: number; expanded: boolean }
  | { kind: 'folder'; id: string; level: number; parentId: string | null; count: number; hasChildren: boolean; expanded: boolean }
  | { kind: 'item'; id: string; level: number; folderId: string | null; presets: number; expanded: boolean }
  | { kind: 'preset'; id: string; level: number; assetId: string }

libraryRows(catalog, { expanded, query, kind }): LibraryRow[]
```

* **Order**: in each folder, folders first and then items, each sorted by name (`localeCompare` with `numeric: true`)
  and then by ID for stability. Presets go under their sound in the same order.
* **Presets follow their sound.** A live preset whose sound is live shows under that sound, wherever its own
  `folderId` points. A preset whose sound is trashed or missing shows as a plain item in its own folder, labelled
  *Preset · sound unavailable*, as the details say today.
* **Trash** lists the trashed entries at their top-most trashed level: a trashed folder shows with its contents under
  it, and an item that was trashed alone shows on its own. This matches what `trashLibraryEntry(…, false)` restores.
* **Search and filter**: with a query or a kind, the rows are the matches plus the folders above them, all expanded,
  with nothing else. A preset matches on its own name or its sound's. Trash is searched only when its root is
  expanded.
* `treeKey` carries over and gains rows of every kind. Right expands an item with presets, and Left goes to the
  parent, whatever it is.

### State

`state/library-store.ts` gains:

* `active`: the row the details show and the tree focuses, an item, folder or root (`{ kind, id }`). It replaces the
  panel's `selected` and `openFolder`, and `openFolder` becomes a derived getter: the active folder, the folder of the
  active item, or null. New things save into that folder, so actions keep reading it.
* `selected: string[]`: the multi-selection (item IDs), for *Export selection…*.
* `previewing: string | null`: the item being previewed, so its row's ▶ shows ■.
* `reveal(itemId)`: expands the item's path and makes it active, and asks the layout to show the Library
  (`revealView('library')`, as pins do).
* `request: { kind: 'export', selection } | { kind: 'import' } | null`: set by the menu actions *Export as .sfxlib…*
  and *Import .sfxlib…*, and picked up by the view, which owns the dialog and the file input. This is the
  `graph-view-store` request pattern (`addRequest`, `pinRequest`).

### Core edits (`core/library/catalog.ts`)

* `moveLibraryEntry(catalog, id, folderId | null)` moves an item or a folder, and an item's live presets move with it.
  It refuses a folder into itself or a folder inside it, moving into a trashed folder, and moving a preset on its own.
  Moving a trashed entry also restores it (`trashLibraryEntry(…, false)` and then the move), so a drag out of Trash
  is one edit.
* `duplicateLibraryFolder(catalog, id, parentId)` makes a deep copy: new folder and item IDs, presets re-pointed at
  their copied sound, and revisions and sample references shared (they are immutable). It checks the 1024/4096 caps
  before copying anything.
* `libraryItemDuplicate` is factored out of the *Duplicate* action, which keeps its behavior, so a drag with Alt and
  the menu share it.

### Actions

New and changed, in `state/actions/`:

| Subject | Action | Notes |
|---|---|---|
| `track` (instrument) | *Save to library ▸ Instrument + notes / Audio effects / Note effects* | `choices`; *Note effects* disabled when the note graph is empty |
| `track` (audio, return), `group` (with a bus), `master` | *Save effects to library* | |
| `clip` | *Save to library* | session clips, MIDI and audio |
| `sample` | *Add to library* | |
| `library-item` | *Insert into ▸ Scene 1…n* and *Replace clip in ▸ Scene 1…n* (clips) | `choices`: replaces the scene field; disabled per scene with the reason |
| | *Move to ▸* | `choices`: *My library* and the live folders, as paths (`Drums / Kicks`), with no ID suffixes |
| | *Export as .sfxlib…* | sets the store's `request` |
| | *Restore* | unchanged |
| `library-folder` | *Duplicate* (verb `duplicate`), *Move to ▸*, *Export as .sfxlib…* | |
| `library-root` (new subject: `{ kind: 'library-root', root: 'mine' \| 'trash' }`) | mine: *New folder*, *Import .sfxlib…*, *Export all…*; trash: *Restore all* | `subjectName`: *My library*, *Trash* |

**How saving works.** Each save action calls `library.saveAsset` / `saveClip` / `saveSample` with a name taken from
the source: *Bass* for an instrument, *Bass effects*, *Bass notes*, *Master effects*, the clip's name, the sample's
name. It saves into `openFolder`. The action finds the new item as the one ID the catalog didn't have before. It
reports "Saved *Bass* to *Drums*" (or "to *My library*") through `notify`, with a **Show** action that calls
`reveal(itemId)` and starts renaming the item in place (`startRename`). Run from a Library button, it reports to the
status line instead, as `runAction`'s `report` does today.

**Toast actions.** A notice gains an optional `action: { label: string; run(): void }`, kept in memory only. The
toast draws it as a button, and the toast stays until it times out or the action runs.

### Drops

`DragPayload` gains `library-folder` (and `library-root` never drags). `DropTarget` gains `library-folder` and
`library-root`.

| Payload | Folder | *My library* | *Trash* |
|---|---|---|---|
| Library item (live) | moves it there; Alt copies (*Duplicate* into that folder) | moves it to the top level; Alt copies | trashes it, with its presets |
| Library item (trashed) | restores it there | restores it to the top level | refuses |
| Library folder (live) | moves it inside, refusing itself and its descendants; Alt copies (`duplicateLibraryFolder`) | moves it to the top level; Alt copies | trashes it with its contents |
| Library folder (trashed) | restores it inside | restores it to the top level | refuses |
| Preset row | refuses: a preset goes where its sound goes | refuses | trashes it |
| Anything else | refuses | refuses | refuses |

Dropping on the folder an item is already in does nothing and is refused, so the cursor says so. Every drop has a menu
twin (*Move to ▸*, *Duplicate*, *Trash*, *Restore*), as the drag rule requires.

**Spring-open.** `useSpringOpen(onOpen)` in `ui/shared/drag/` expands a collapsed folder or item after a drag of ours
has rested on its row for `SPRING_LOAD_MS`. Leaving the row first cancels it.

### The view

```
┌ Library ──────────────────────────── ⋯ ┐
│ [ Search            ]  [All types ▾]   │
│ status line (only when there is one)   │
│ ▾ My library                       12  │
│   ▾ Drums                           4  │
│     ▾ ♪ Big kick         ▶             │
│         • Tight          ▶             │
│       ▦ Backbeat         ▶             │
│   ▸ Pads                            3  │
│   Trash                             2  │
│ ────────────────────────────────────── │
│ Big kick                   Instrument  │
│ 2 modules · 2 presets · no samples     │
│ [ Add as new track ]              [⋯]  │
└────────────────────────────────────────┘
```

* **`LibraryTree.tsx`** replaces `FolderTree.tsx`:
  * **Rows**: every row is an `ActionMenu` trigger, a drag source (except roots) and a drop target (folders and
    roots). Each shows a kind glyph and its name, a ▶/■ on items and presets (shown on hover, focus and while
    previewing), and counts on folders and roots.
  * **Tree semantics**: `aria-multiselectable`; the active row is the one Tab reaches.
  * **Selection**: click sets the active row and the selection, ⇧ extends it along the visible rows, ⌘ toggles a row.
  * **Keys**: Enter runs the primary action, Space previews or stops, and in-place rename and the arrow keys work as
    today.
* **Header**: *Search library*, the type filter with readable names (*Instruments*, *Audio effects*, *Note effects*,
  *Presets*, *MIDI clips*, *Audio clips*, *Samples*), and a ⋯ `PopupMenu`. The ⋯ menu holds *My library*'s root
  actions plus *Export selection…* (with 1 or more selected).
* **Status**: the status line shows only when it has text. On the blocked-upgrade error it carries a **Retry** button,
  which is today's *Refresh*. Nothing else re-reads the catalog by hand.
* **Details** (`LibraryDetails.tsx`), for the active row:
  * an item: its name, kind and one line of facts (*2 modules · 2 presets · 1 sample*), the sample list, the primary
    button, and ⋯ for the item's menu;
  * a folder: its name, its counts and ⋯;
  * a root: its counts, and for Trash a hint that items are kept until restored;
  * nothing: on an empty library, one line ("Right-click a track, clip or sample and choose *Save to library*, or
    drop an `.sfxlib` here"). Its button saves the selected track's instrument, which is the same action.

  The explanations from today's details become tooltips on the primary button.

  | Active item | Primary button |
  |---|---|
  | Instrument, or a preset of one | *Add as new track* |
  | Audio effect, note effect, or a preset of one | *Replace effects on Bass*, *Replace notes on Bass* (the selected owner), disabled with the reason when it doesn't fit |
  | MIDI or audio clip | *Insert into scene n of Bass*: the first empty slot of a track of its kind; disabled with the reason when there is none |
  | Sample | *Add to project* |
  | Trashed anything | *Restore* |
* **Bundle dialog** (`BundleDialog.tsx`), modal, named *Bundle review*. It reads, for example, "Import *Drum kit*: 12
  items, 3 folders, 2 samples (4.1 MB). It goes into a new folder called *Drum kit*; importing it again makes another
  copy." Then the missing-samples warning, if any. The *Details* disclosure holds the items, revisions and samples as
  today. The buttons are *Cancel*, and *Import* or *Download .sfxlib*; the partial-export checkbox appears only with
  missing samples. The file input stays in the view, hidden and still labelled *Import library bundle*. A request or
  a dropped `.sfxlib` file opens it.
* **Layout**: two layouts instead of three: tree beside details at 640 px or more, and tree over details below. The
  *All folders* toggle goes away, since the tree is the list and collapsing does that job.
* **What goes**: the name field, the save row, the bundle row, *Move destination*, the checkboxes, *Trash* mode,
  *Back to library*, *Refresh* outside the error state, the duplicated folder and item buttons, the scene field and
  the four paragraphs.

### Browser tests

Specs import nothing from `src/`. Saving in specs goes through the track's or clip's context menu, through a helper
`saveToLibrary(page, subjectLocator, choice?)` in `fixtures.ts`.

* **`library.smoke.spec.ts`**, rewritten on the new controls with the same six cases. The scene case becomes: the
  clip's *Insert into ▸* lists every scene, disables the occupied ones with a reason, and the primary button is
  disabled with "No empty slot" when every slot is taken. The blocked-upgrade case uses *Retry*.
* **New `library-tree.smoke.spec.ts`**:
  * save Lead's instrument from its menu: the toast says "Saved Lead to My library", and *Show* reveals the Library
    with *Lead* active and its name being renamed;
  * two presets show under their sound; Right and Left expand and collapse it;
  * drag the sound onto a folder: it and its presets move, and the folder's count goes up;
  * Alt-drag makes a copy;
  * a folder dragged into its own child refuses (`data-drop="refuse"`);
  * a collapsed folder springs open under a resting drag;
  * drag onto *Trash* trashes it, and dragging it back onto a folder restores it there;
  * search shows the matches with their folder paths, and clearing it brings the tree back;
  * Space previews the focused item, and its ▶ shows ■;
  * Enter on an instrument adds a track, and one undo removes it;
  * F2 renames and Delete trashes the focused row (the verbs).
* **`bundle.smoke.spec.ts`**: *Bundle review* becomes a dialog. The flows stay: folder export from the folder's
  menu, import from ⋯, cancel, duplicate import into a fresh folder, and the near-limit latency case.
* **`context-menus.smoke.spec.ts`**: *Save to library* on an instrument track (three choices), an audio track, a
  return, a bus, a folder group (absent), the master, a clip and a sample; the root's menu; *Move to ▸* paths.
* **`drag-and-drop.smoke.spec.ts`, `views-at-min-size.smoke.spec.ts`, `automation.audio.spec.ts`**: save through the
  helper, and use the new labels. Library at 280 × 200, empty and with a tree, must not scroll sideways.

## Steps

Each step is one commit, and leaves `npm test`, `npm run typecheck` and `npm run test:smoke` green. Steps 1–4 don't
touch the view, so the old controls keep working until step 5 replaces them.

1. **Core edits and the row model.** `moveLibraryEntry`, `duplicateLibraryFolder` and the shared item duplicate, in
   `core/library/catalog.ts`; `library-tree.ts` with `libraryRows` and `treeKey`, replacing `folder-tree.ts`. Unit
   tests:
   * moving an item takes its presets;
   * a folder can't go into itself or a descendant;
   * moving out of Trash restores;
   * a deep copy shares revisions and samples and re-points presets;
   * the caps are checked before anything is written;
   * rows: order, presets under their sound, orphaned presets, Trash's top-most level, search with paths, every key
     on every row kind.
2. **Saving from where things are.** The save actions on `track`, `group`, `master`, `clip` and `sample`; the
   new-item lookup; toast actions in `persistence-store` and the toast view; the store's `reveal`. Unit tests:
   `describeActions` for each owner kind (instrument, audio, return, bus, folder group, master), the names they save
   under, the target folder (the open one, or root), and that a refused capture (`trackAudio`) throws its reason.
   Smoke: the context-menu additions.
3. **Library subjects and actions.** The `library-root` subject and its actions; the new item and folder actions;
   `active`, `selected`, `previewing` and `request` in the store. Unit tests: `describeActions` for live and trashed
   items, folders and both roots; *Insert into ▸* disables occupied scenes; *Move to ▸* paths and exclusions.
4. **Drops.** The payload and targets, and the drops table above, in `drops.ts`; `useSpringOpen` in
   `ui/shared/drag/`. Unit tests in `drops.test.ts`, one per cell, refusals included. The architecture test stays as
   it is.
5. **The view.** `LibraryTree`, the header and ⋯, `LibraryDetails`, `BundleDialog`, the status line with *Retry*, the
   empty state, the two layouts, and the old controls removed. The operation-token logic moves as is. The
   architecture test's `dataTransfer` rule adds the Library view for OS files (`Files` only), as for `SamplesPanel`. Smoke: the
   rewritten `library`, `bundle`, `context-menus`, `drag-and-drop` and `views-at-min-size` specs, the new
   `library-tree` spec, and `automation.audio.spec.ts`.
6. **Docs.**
   * `architecture/library-and-presets.md`: the view's paragraph and the catalog edits.
   * `architecture/workbench.md`:
     * *Views at any size*: two layouts, no *All folders*;
     * *Actions and context menus*: the `library-root` subject and the new entries;
     * *Drag and drop*: the payload, the targets, the table row and spring-open;
     * *Menus*: toast actions.
   * `docs/guide/`: a short Library section if the tour mentions it.
   * The spec's phasing notes what moved into phase 1.
   * This plan's "Changes made while implementing", and the notes sorted as `dev/doc-workflow.md` says.

## Behavior changes

Intended:

* The Library view shows a tree of folders, items and presets, with a header, a status line only when needed, and
  compact details. The old toolbar rows, checkboxes and *Trash* mode are gone.
* Items and folders move, copy, trash and restore by dragging inside the tree, and by *Move to ▸*.
* Tracks, buses, the master, clips and samples have *Save to library* / *Add to library*. The new item is named after
  its source and saved into the open folder; a toast offers *Show*.
* Moving a sound moves its presets with it. Presets that an older catalog kept in another folder show under their
  sound, and move with it from then on.
* Bundle review is a modal dialog, opened from menus or by dropping an `.sfxlib` on the view.
* Toasts can carry one button.

The catalog, the project format, insertion, preview and bundles' contents are unchanged. Anything else a reviewer
notices is a bug in this phase.

## Verification

* `npm test`, `npm run typecheck` and `npm run test:smoke` pass at every step. Smoke tests need local ports, which the
  sandbox refuses, so they run outside it. `npm run test:audio` runs once at step 5, for `automation.audio.spec.ts`.
* The production build stays warning-free, with the Library still in its own chunk.
* Manual pass on the dev build:
  * a library of about 40 items in 3 levels of folders, built by saving from Low Light's tracks and clips;
  * drag in every direction, with Alt, onto Trash and back;
  * search and the type filter;
  * Space previews while the session plays;
  * the empty state;
  * the sidebar at 280 px and the view docked in the panel at 900 px;
  * a `.sfxlib` exported, then imported in a fresh profile.
* A near-limit catalog (1024 folders, 4096 items) opens, expands a folder and searches without a visible stall in
  Chromium. Record the time to first render of the fully collapsed tree and of one search. If either is over 100 ms,
  virtualization moves from phase 7 into this phase.

## Decisions to sign off

Signed off 2026-11-04: every row as proposed.

| Question | Proposed | Notes |
|---|---|---|
| Save actions in phase 1 | **Yes:** the context-menu saves move here from phase 2 | Removing the save row with no other way to save would leave a gap between phases. The menu bar and dragging into folders stay in phase 2. |
| Order in a folder | **Folders first, then items, by name** (numeric-aware) | The catalog has no order of its own; insertion order is what shows today. |
| Where presets show | **Under their sound, whatever their `folderId`**; moving a sound moves them | Today's *Move item* leaves presets behind. Showing them under the sound makes that invisible, and moving them along stops it from happening again. |
| Moving a preset alone | **Refused**; *Trash* still works on it | A preset with no sound beside it is the "unavailable" case. |
| Alt-drag of a folder | **Deep copy**, sharing revisions and samples | D2 says Alt copies; a folder had no copy before. |
| Refresh | **Kept only as *Retry*** on the blocked-upgrade error | The spec called it redundant; the blocked-upgrade test shows it is the retry. |
| Toast actions | **One optional button per notice, in memory only** | *Show* needs it (D4). Undo-in-toast and the like can use it later. |
| Export selection | **⋯ → *Export selection…*** with one or more items selected; folders export from their own menu | Replaces the checkboxes (D5). |
| Dropping an `.sfxlib` file on the view | **Opens the import review** | It costs one file target (the Samples rule already allows OS files in one view; this adds the Library to that rule). |
| Threshold for virtualization | **100 ms** for the collapsed near-limit tree or a search | Measured, not assumed. |

## Changes made while implementing

* **Inventory re-checked** at `5166380`: no source or test changed since `5693980`, so the plan stood as written.
* **Step 1:** `folder-tree.ts` stays beside `library-tree.ts` until step 5, since the old `FolderTree` still draws the
  view until then; step 5 deletes both.
* **Step 1:** rows carry a `key` (`mine`, `trash`, `f:<folder>`, `i:<item>`), a `parent` key, a `name` and their
  `root`, so `treeKey` and the view work on one kind of key. Folder counts are the items directly in the folder; a
  root's count is every item row under it. Presets under their sound aren't counted.
* **Step 1:** a copy is named "… copy" only when it lands beside its original (*Duplicate*); an Alt-drag into another
  folder keeps the name, as Finder does. Copies' presets go into the copy's folder.
* **Step 1:** `duplicateLibraryFolder` copies live contents only, and a preset follows its sound: one whose sound is
  copied comes along wherever it was kept, one whose sound stays outside stays. An orphaned preset in the folder is
  copied as the plain item it shows as.
* **Step 1:** moving a trashed entry moves it first and then restores it, so the restore walks the destination's
  path and leaves the old parents in the trash. A trashed sound takes all its presets, since restoring it restores
  them all.
* **Step 2:** an asynchronous action can resolve with `{ message, action }` (`ActionReport`) as well as a string;
  `settle` hands the button to `report`, which the toasts draw and a status line leaves out. A toast with a button
  stays 10 s instead of 5 s, so the button can be reached.
* **Step 2:** the instrument's entry and the effects-only entry are two actions (`track.save-to-library` with
  choices, `track.save-effects-to-library`), so neither draws an empty submenu. Group, master, clip and sample
  entries sit in the `edit` group, after the entries that were there.
* **Step 2:** `library-store` gained `active` and `reveal` here, since *Show* needs them; step 3 adds the rest. Until
  step 5, `reveal` also opens the item's folder, so the old view lists it. A save into an open folder that is gone or
  trashed goes to the top level.
* **Step 2:** `saveToLibrary(page, subject, choice?)` is in `fixtures.ts` from this step, and the context-menus spec
  checks the submenu, the disabled *Note effects*, four saves and *Show*.
