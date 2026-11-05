---
status: active
date: 2026-11-04
note: "Phase 7 of SPEC-library-ux.md: cut and paste moves, dragging several items at once, virtualization if measured slow, a first-run hint, and closing the round's docs. Decisions signed off 2026-11-04."
---
# Library phase 7: polish and closing

Phase 7 of [SPEC-library-ux.md](SPEC-library-ux.md). It comes after phases 1–6.

## Goal

* **⌘X and ⌘V move** library items and folders: cut marks the rows, and paste on a folder (or with a folder's row
  focused) moves them there. Esc clears the mark. The menus gain *Cut* and *Paste here*.
* **Several things drag at once:** dragging a selected row drags the whole selection, within the tree and onto
  folders. Onto a track, only a single item drops; with several, it refuses ("Drop one sound at a time").
* **Virtualized rows** if phase 1's measurement or a manual pass found the tree slow. Otherwise skip this, and record
  that it was skipped.
* **A first-run hint** in the Library's empty state and the first time an item is selected: "Drag onto a track, a
  slot or a graph to use it." It's dismissible, and dismissing it is remembered per browser.
* **The round is closed** in the docs.

## Design

* **The tree has four roots** since phases 3 and 6: *This project* (the open project's graphs, presets, clips and
  samples, with their own subjects), *My library*, the read-only *Factory* (`factory:` ids, its own catalog in the
  store) and *Trash*. The rules below say what each root's rows do.
* **Cut and paste.** A library clipboard in `state/actions/clipboards.ts`, separate from the project clipboards: cut
  or copied, and the entries as they would be dragged (`library-item`, `library-folder`, or one `project-graph`,
  `clip`, `sample` or `sound` of *This project*). `cut`, `copy` and `paste` verbs on `library-item` and
  `library-folder`, and `paste` on `library-root` (mine). A cut's paste runs `moveLibraryEntry` for each, in one catalog
  update, and empties the clipboard. Cut rows show dimmed until pasted or cleared (Esc). Factory and *This project*
  rows can't be cut; ⌘C on them and ⌘V into My library copies (`copyLibraryEntries` for the Factory, the save a drop
  makes for project rows). ⌘C on My library's rows copies too, as an Alt-drag does (beside itself: "… copy"). In the
  Library, a session clip's *Cut* doesn't apply and its *Copy* also fills the library clipboard; a project graph, preset
  or sample row gains *Copy* there.
* **Several at once.** A new payload kind, `library-items { ids }`, used when the dragged row is part of a selection of
  more than one. The drops for folders, *My library* and *Trash* accept it and apply the single-item rule to each, in
  one catalog update: My library's move (Alt copies), the Factory's copy in, and the trash takes My library's live
  ones. A preset whose sound is in the selection goes with it. If any one is refused, the whole drop refuses with the
  first reason. Onto a track, a slot, a graph or a header, several refuse ("Drop one sound at a time"). The selection
  holds library items only (*This project*'s rows and folders aren't selected), so a multi-drag never carries a project
  row. `workbench.md`'s "not yet" line loses "several things at once" for the library only.
* **Virtualization** (only if needed): a fixed row height and a windowed list over `libraryRows`, keeping
  `aria-setsize` and `aria-posinset` so screen readers count right, and the focused row rendered even when outside the
  window.

## Steps

1. Cut and paste, with unit tests for the clipboard and verbs, and smoke for ⌘X then ⌘V onto a folder.
2. Multi-drag, with drop unit tests and smoke for moving three items into a folder.
3. Virtualization, if needed, with the near-limit measurement redone and recorded. *(Skipped: 9–36 ms with all four roots open.)*
4. The first-run hint.
5. **Closing the round**:
   * `docs/STATUS.md` gets a line.
   * Backlog items closed by the round are deleted. New ones added: the Factory presets content pass, sidechain-ready
     sounds, sample choices in the property editor, and module-only items (L2, which is still open).
   * The plans and the spec move to `docs/archive/library-ux/`, with `status: done` and `shipped_in`.
   * `decisions/README.md` gets rows for the round's choices that aren't in architecture.
   * `dev/gotchas.md` gets the traps the phases recorded.

## Decisions to sign off

Signed off 2026-11-04: every row as proposed.

| Question | Proposed | Notes |
|---|---|---|
| Library clipboard | **Separate from the project clipboards** | Cutting a folder mustn't replace a copied clip. |
| Multi-drag onto the project | **Refused with several items** | Several sounds onto one track has no clear meaning. |
| Virtualization | **Only if measured slow** (phase 1's 100 ms) | |
| First-run hint | **Once per browser, dismissible** | |

## Changes made while implementing

* **Plan re-checked** at `7a00065`. The Design section assumed phases 1 and 2 only; it now names the four roots and
  what each root's rows do on a cut, a copy and a multi-drag, as the round's rules say (Factory and *This project* rows
  copy, never move).
* **Step 1:** the clipboard holds the entries as drag payloads (`LibraryClipEntry`), not IDs and a flag, so a project
  row's paste runs the save its drop runs (`dropFor`), and the Factory's and My library's go through one rule.
* **Step 1:** that rule is `libraryLanding(entries, place, mode)` in `state/actions/library-landing.ts`, the
  single-item drop rule applied to each entry, refusing all if any is refused; `landLibraryEntries` runs it in one
  `library.update` (the Factory's copies in the same update, through `copyToMine`'s new `also`). Step 2's multi-drop
  reuses it. Paste reports "Moved Kick to Pads", "Copied 3 things to My library", "Restored Kick to Pads".
* **Step 1:** a cut or copy of an item takes the selection when the item is in it (the ones that can go: a preset
  stays out of a cut, as it goes where its sound goes); a folder goes alone, since folders aren't selected.
* **Step 1:** the library lists gain *Cut*, *Copy* and *Paste here* in the `clipboard` group, merged in group order
  in `actions/index.ts` (`merged`), since `library.ts` can't import the drops. A Factory row has *Copy* beside *Copy to
  My library*: the first is the clipboard's, the second copies at once.
* **Step 1:** *This project* in the Library: `clip.cut` doesn't apply where `origin` is the Library; `clip.copy` there
  also fills the library clipboard; `project-graph.copy`, and `sound.copy` and `sample.copy` (Library only, so Sounds
  and Samples keep ⌘C as it was), put the row on it.
* **Step 1:** a cut row is `data-cut`, with "Cut" as its description, its glyph and name at 45 % opacity. Esc in the
  tree clears a cut (and is taken, so nothing else sees it).
* **Step 1:** checked in the preview (dev build, Low Light): a cut row at 280 px in the sidebar, the item menu's *Cut*
  and *Copy*, Esc; and docked wide in the panel (a throwaway spec's screenshot), the cut *Kick* dimmed and *My
  library*'s *Paste here* disabled, since the move would land where it is.
* **Step 1: chunks**, gzipped, against `7a00065`: `state` 30.18 → 32.17 kB, `index` 112.28 → 112.32; the build is
  warning-free.
* **Step 2:** `LibraryItemsPayload` (`{ kind: 'library-items', ids }`) is a `DragPayload` but not a subject: nothing
  has a menu on it, so `define` types payloads by `PayloadOf` rather than `SubjectOf`. A row drags it when it is a
  selected item of a selection of more than one (`group` on the tree's row), Factory and My library items alike.
* **Step 2:** `drop.library-items-on-folder` and `-on-root` (mine and trash) run step 1's `libraryLanding` and
  `landLibraryEntries`: accepted by the move rule (a copy's rule takes anything a move's does), Alt copies, the cursor
  says copy when every item is the Factory's. A trashed item is restored where it lands with Alt held too, as one
  item's drag does (`libraryLanding`'s copy mode now restores it rather than refusing). Reports "Moved 3 things to
  Kit", "Copied 2 things to My library", "Moved 2 things to the trash".
* **Step 2:** onto a slot, a track, the master, a group or a canvas, `drop.library-items-on-…` accepts nothing and
  refuses with "Drop one sound at a time" (the target's `data-drop-reason` and title). A lane takes no library item,
  so it has none.
* **Step 2:** no view changed (a drag's payload and the drop table); the smoke drags three items onto *Kit*, and onto
  Lead's header, where the reason shows. Chunks, gzipped: `state` 32.17 → 32.35 kB, `LibraryPanel` 11.14 → 11.18.
* **Step 3: skipped, as measured.** The near-limit case (1024 folders, 4096 items, production build in Chromium) now
  measures twice: as phase 1 did, and with *This project* and the Factory open too (83 rows, four roots searched
  together). Three runs, every search, re-render and folder opening took 9–36 ms (phase 1: 14–36), under the 100 ms
  threshold, so the tree isn't virtualized. The numbers are in `docs/measurements/library-tree-near-limit.json`.
* **Step 4:** the hint is `ui/library/UseHint.tsx`, an `<aside>` named *Hint* with "Drag onto a track, a slot or a graph
  to use it." and × (*Dismiss hint*, tooltip "Don't show this again"). It shows in the empty Library under its text, and
  under the details of any live item, My library's or the Factory's, until dismissed. Dismissing it is kept in
  `localStorage` under `sfxlab:library-use-hint-dismissed` with guarded access (a page that can't store keeps it
  dismissed until reload), read through `useSyncExternalStore` so every copy goes at once. It's the view's, since
  `state` doesn't touch `localStorage`.
* **Step 4:** checked at 280 px in the sidebar and docked wide in the panel (dev preview and a throwaway spec's
  screenshots); at 280 × 200 *Save Bass to library* stays in sight and the hint scrolls below the text. Chunks,
  gzipped: `LibraryPanel` 11.18 → 11.46 kB; the build is warning-free. The smoke case is in
  `library-tree.smoke.spec.ts`.
