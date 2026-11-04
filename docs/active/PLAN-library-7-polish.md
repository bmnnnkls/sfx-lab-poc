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

* **Cut and paste.** A library clipboard in `state/actions/clipboards.ts`, separate from the project clipboards: the
  cut IDs, and whether they are rows of My library. `cut` and `paste` verbs on `library-item` and `library-folder`, and
  `paste` on `library-root` (mine). Paste runs `moveLibraryEntry` for each, in one catalog update. Cut rows show dimmed
  until pasted or cleared. Factory and *This project* rows can't be cut; ⌘C on them and ⌘V into My library copies
  (`copyLibraryEntries`, or a save for project rows).
* **Several at once.** A new payload kind, `library-items { ids }`, used when the dragged row is part of a selection of
  more than one. The drops for folders, *My library* and *Trash* accept it and apply the single-item rule to each, in
  one catalog update. If any one is refused, the whole drop refuses with the first reason. `workbench.md`'s "not yet"
  line loses "several things at once" for the library only.
* **Virtualization** (only if needed): a fixed row height and a windowed list over `libraryRows`, keeping
  `aria-setsize` and `aria-posinset` so screen readers count right, and the focused row rendered even when outside the
  window.

## Steps

1. Cut and paste, with unit tests for the clipboard and verbs, and smoke for ⌘X then ⌘V onto a folder.
2. Multi-drag, with drop unit tests and smoke for moving three items into a folder.
3. Virtualization, if needed, with the near-limit measurement redone and recorded.
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
