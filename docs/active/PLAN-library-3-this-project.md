---
status: active
date: 2026-11-04
note: "Phase 3 of SPEC-library-ux.md: the This project root in the Library tree, live from the project, read-only, with save, copy, preview and show. Decisions signed off 2026-11-04."
---
# Library phase 3: *This project* in the Library

Phase 3 of [SPEC-library-ux.md](SPEC-library-ux.md) (§ 3, D8). Builds on phases [1](PLAN-library-1-tree.md) and
[2](PLAN-library-2-entry-points.md): the tree model, the library drops, the save actions and `externalRoutingIn`.
Inventory taken at `9b4f2cd`. Re-check it at the branch tip before step 1.

## Goal

The Library tree's first root is the open project, named after it (*Low Light*). It shows what the project holds as
rows you can save, copy, preview and drag:

```
◆ Low Light
  ▾ Bass                       an instrument, audio or return track, a group bus, the master
      ♪ Instrument   2 presets   presets under it
      ≈ Effects      ⚠           "Uses Track audio from Kick"
    ▸ Clips  8
  ▸ Samples  3
  ▸ Modules  6
```

* It's **live**: built from the project store, never stored. An edit, undo or load shows at once.
* It's **read-only** as a library: no rename, move or trash here. Those are edits of the project, made where they
  are made today.
* Each row's menu and drags: *Save to library*, *Copy to new track* (instruments), *Copy onto…* (drag onto another
  track, the master, a bus or a canvas), *Preview*, *Show* (selects the owner and shows its editor).
* A sound that **can't be saved** is shown with ⚠ and the reason, and refuses saving and copying.

Out of scope: editing the project from this root (rename, delete, reorder), modules as library items (backlog L2), and
the link to the library sound a track came from (phase 5).

## Inventory

* **Capture is pure and takes any catalog**: `captureLibraryAsset(catalog, project, scope, name, folderId)` and
  `captureLibraryClip`. Captured into `emptyLibrary()`, they make a throwaway catalog holding one item.
* **`PersonalLibrary.insert` and `.preview` read the stored catalog** (`app/library.ts`: `storage.read()` and then
  the item by ID). A throwaway catalog's item isn't there, so both need a way to take the catalog they work from.
  Factory (phase 6) needs the same thing.
* `ensureBytes` checks sample bytes through `samples.has(bytesKeyOf(info))`. Project samples are in the same
  `SampleStorage`, so a project sound's preview finds its bytes. Check this in step 2 with a sampled instrument.
* Existing subjects cover most rows: `track`, `group` and `master` (owner rows), `clip`, `sample`, `sound` (presets)
  and `module`. There is no subject for "this owner's instrument graph" as a thing.
* `revealView` and the selection store's `selectTrack`, `selectMaster` and `selectGroup` exist (pins use them for
  *Open*).

## Design

### Rows

`projectRows(project, expanded)` in `ui/library/library-tree.ts`, beside `libraryRows`:

| Row | Subject (menu) | Drag payload |
|---|---|---|
| Owner: each track in Tracks order, then returns, group buses and the master | `track`, `group`, `master`: their existing menus, with phase 1's *Save to library* | none (a drag would move the track, as in Tracks) |
| Graph: *Instrument*, *Effects*, *Notes*, only when it holds nodes | new `project-graph { owner, domain }` | `project-graph` |
| Preset under a graph: the project presets of that owner and domain | `sound` (existing) | `sound` (existing) |
| *Clips* group, then each session clip | `clip` (existing) | `clip` (existing) |
| *Samples*, then each sample | `sample` (existing) | `sample` (existing) |
| *Modules*, then each module definition | `module` (existing) | none until L2 |

* **Collapsed by default**, at the top of the tree. The expanded rows are kept per project ID in the library store,
  so switching projects doesn't carry one project's expansion to the next.
* **Search and the type filter** cover these rows: an *Instrument* row is an instrument, *Effects* an audio effect,
  *Notes* a note effect, clips their kind, samples samples. Modules match search only.
* **The ⚠ reason** comes from `externalRoutingIn` (phase 2), computed when the rows are built: a node-type scan per
  graph and its modules, nothing captured.
* **Cost**: rows are names and counts, rebuilt when the project changes (edits only, never the status tick). They're
  memoized on the project object, and nothing is captured until a drag lands or a menu entry runs.

### The `project-graph` subject and its actions

`state/actions/project-graph.ts`:

| Action | Applies | Does |
|---|---|---|
| *Save to library* | not externally routed | the owner's save for that domain (phase 1's action) |
| *Copy to new track* | instruments | captures into a throwaway catalog, then `insertLibraryAsset` with `mode: 'new-track'`; one undo step; named "Bass copy" |
| *Preview* | not externally routed | captures into a throwaway catalog, then previews it |
| *Show* | always | selects the owner, and shows the Instrument, Effects or Notes view |

`subjectName`: *Bass instrument*, *Master effects*.

### Drops

| Payload | Library folder or *My library* | Track, master, bus, canvas |
|---|---|---|
| `project-graph` | saves it there | copies it onto that owner's graph of the same domain, when it fits (`graphFitsOwner` on a throwaway item); refuses its own owner |

The `clip`, `sample` and `sound` payloads already drop onto library folders (phase 2) and keep their project drops.

### The library service takes a source catalog

`PersonalLibrary.insert(item, destination, scene?, replaceClip?, from?)` and `preview(item, from?)`. `from` is a
catalog to read instead of storage, and `ensureBytes` checks bytes against it the same way. `state` wraps the
throwaway capture in one helper, `projectGraphItem(project, owner, domain)`, which returns `{ catalog, item }`.
Factory (phase 6) passes its catalog the same way.

### Copy onto another owner keeps independence

The copy goes through `insertLibraryAsset`, so the target gets fresh node IDs, its own modules, and the source's
presets (the capture includes compatible presets). It's the same independence as a library insert. The new
`libraryOrigins` record names no library item; it gets `itemId: 'project:<owner>:<domain>'`, informational only, as
origins are.

## Steps

1. **Rows.** `projectRows`, the root in the tree, search and filter, persisted expansion, ⚠ reasons. Unit tests on
   the starter and both examples: rows and counts, empty graphs left out, Low Light's ⚠ rows (Bass, Stab, Arp, Drone
   effects and the Echo return; Glass Rain's Arp notes), and search.
2. **Subject, actions and the source catalog.** The `project-graph` subject, its actions, `projectGraphItem`, and
   `from` on `insert` and `preview`. Unit tests: `describeActions` for each domain and for a routed one; *Copy to new
   track* is one undo step with presets; preview resolves a sampled instrument's bytes.
3. **Drops.** The `project-graph` payload and the drop row. Unit tests per cell. Smoke, in a new
   `library-project.smoke.spec.ts` on Low Light:
   * the root shows the tracks;
   * Bass's *Effects* row shows ⚠ and refuses a drop on *My library*;
   * drag Kick's *Instrument* onto a folder, and it's saved;
   * drag Hat's *Instrument* onto Clap's session header: Clap sounds like the hat (its instrument graph equals Hat's
     structure), and one undo restores it;
   * *Show* on a clip row selects the clip;
   * undoing an edit updates the rows.
4. **Docs.** `library-and-presets.md` (the root, the source catalog), `workbench.md` (the subject, the drop row). This
   plan's notes are sorted.

## Behavior changes

Intended: the Library tree has a project root; a sound can be copied from one track to another by dragging or *Copy
to new track*; library insert and preview can read a catalog other than storage. Nothing else.

## Verification

* The usual gates. Manual:
  * Low Light, with the root expanded while the session plays;
  * an edit storm (dragging a knob) doesn't re-render the tree: check with React DevTools' highlight;
  * copy the stab onto a new track and play both.

## Decisions to sign off

Signed off 2026-11-04: every row as proposed.

| Question | Proposed | Notes |
|---|---|---|
| Where the root sits | **First, collapsed by default** | It's the most common source, but it's long. |
| Owner rows | **Their existing menus, not draggable** | Dragging a track already means "move it" in Tracks. |
| Graph rows | **A new `project-graph` subject and payload** | No existing subject names "this owner's instrument". |
| Copy onto another owner | **Yes, by drag and *Copy to new track***, through `insertLibraryAsset` | Same independence as a library insert. |
| Modules | **Listed, not savable** until backlog L2 | |
| Origin of a copy | **`itemId: 'project:<owner>:<domain>'`**, informational | Origins are never used for playback. |
