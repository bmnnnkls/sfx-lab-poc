# Open tasks

Things we have decided are worth doing but have not started. Newest first. Move an item to `ARCHITECTURE.md`
(as documentation of what exists) when it ships, and delete it here.

## Reusable modules (sub-patches with inputs and outputs)

Status: **steps 1 and 2 are built** (modules in the project: group, use by reference, edit in place, interface panel,
unlink, nesting, persistence; see `ARCHITECTURE.md`). Steps 3 and 4 are open.

### Decisions so far

* **Edits propagate.** A module is one definition with many uses; changing it changes every use. A use can be
  deliberately **cloned** ("unlink"), which turns it into an independent copy.
* **Both effect chains and full instruments** (e.g. "wobble filter" = LFO + filter; "bass voice" = oscillators +
  envelope + filter).
* **Personal library, optionally embedded.** Modules can live in a personal library separate from any project,
  and a project can *optionally* embed the modules it uses so the file is self-contained. Import and export work in
  every direction: library to project, project to library, and to/from files.
* **MIDI effects are in scope** (arpeggiator, chord, transpose, scale lock, humanize, …). See below.

### Sketch (not decided)

* A module is a saved `Patch` plus named, typed **ports** and **exposed parameters** (author picks which inner
  params appear as knobs). Edit in place with breadcrumb navigation.
* "Group selection into module": unconnected inner ports become the module's ports.
* Runtime: **flatten** modules into the host graph before voices are built, so the engine sees ordinary nodes and the
  voice/shared stage split keeps working (a module containing a reverb makes everything downstream shared).
* Nesting allowed; cycles forbidden. Sampler references must survive being used inside a module (samples travel with
  packages).
* Persistence: project stores `modules` (embedded definitions) and uses reference them by id; the personal library
  is a separate storage area (IndexedDB) with import/export as `.sfxlab` packages or JSON. On load, a use whose
  definition is missing from both the project and the library must degrade visibly (placeholder node), never crash.
  Needs a format-version bump and a migration, with a new fixture.
* Undo: editing a module definition is one step; the UI should say how many uses it affects.

### MIDI effects

Signal ports cannot carry them: voices are allocated *before* a patch runs, and the patch only sees one voice's
`frequency`/`gate`. Note-level processing has to sit **between the clip launcher and the instrument**, as a per-track
chain that transforms the `NoteEvent` stream (`noteOn` / `noteOff` / `allOff`, pinned to beats).

* Ports become **typed**: `signal` (audio-rate buffer, today) and `notes` (event stream). A module may contain either
  kind; a note module goes in a track's note chain, a signal module in the patch.
* Effects work on beat ranges `[from, to)` like the launcher, so they stay sample-accurate and tempo-correct.
  Stateful ones (arpeggiator holds the chord, emits steps on the grid) keep state between ranges and must release
  everything on stop/launch changes, as `ClipLauncher` does for held notes.
* Pure transforms first (transpose, scale lock, chord, velocity curve), then stateful (arpeggiator, note delay /
  echo), then a note-level patcher if hand-building them is wanted.
* **UI decided:** a **Notes tab** next to the Instrument tab holds the chain (left to right, all parameters visible),
  plus a small "fx" badge on the header of any track that has a chain; clicking it opens the Notes tab. (Mock-up compared
  this with a strip on every track header; the strip crowds four-track layouts and has no room for parameters.)

### Suggested order

1. ~~Group selection into a module with exposed knobs and flattening.~~ Done.
2. ~~Module library inside the project, uses by reference, "unlink".~~ Done.
3. Personal library and import/export, for both kinds of module (audio patches and MIDI effect chains). **Open.**
4. ~~Per-track MIDI effect chain~~ and ~~MIDI effect modules (saved, reusable, propagating chains)~~ Done (see
   `ARCHITECTURE.md`). They are a separate library from audio modules, so no typed ports were needed. **Still open:**
   a note-level patcher for building *new* kinds of effect from parts (that is where typed `notes` ports would come in).

Smaller follow-ups for MIDI effects: more effects (humanize, note length, random pitch, strum), arpeggiator latch, a
bypass-all toggle, auditioning notes through the chain, effects on audio-clip-free tracks only (audio tracks have no notes).

Smaller follow-ups: drag several selected nodes together; delete/duplicate selection with the keyboard; a way to
update or replace a module's definition from a file; show where a module is used from the module list.

## Note graph (non-linear MIDI effects)

Status: **designed, not started.** Replaces the linear MIDI effect chain with a graph, so a note stream can be split,
processed differently on each branch, merged again, and mixed with notes from other tracks.

* **Why not linear:** linear was a simplification, not a requirement. Everything the chain does (beat-range
  processors, state across ranges, flattening of modules) works on a graph too.
* **Model:** a per-track graph of nodes and connections with typed ports (`notes`), the same shape as an audio patch.
  An output may feed any number of inputs (that is the split/clone); an input takes several sources and merges them.
  No cycles (checked like the patch; feedback could come later through an explicit delay node).
* **Nodes:** *Clip notes* (this track's clip player), *Track notes* (another track: tap its clip notes, or the output
  of its own graph), *Out* (to the instrument), every existing effect as a node, *Range split* (notes inside / outside
  a pitch or velocity range on two outputs), *Merge* is implicit in an input, but needs care (below).
* **Merging two streams that play the same pitch:** the instrument matches note-offs by pitch, so two overlapping
  notes of one pitch would cut each other short. A merge keeps a count per pitch: a note-off is passed on only when
  the last overlapping note ends.
* **Evaluation:** each beat range `[from, to)` runs the graph in dependency order, one range at a time, exactly like
  the chain does now. Tracks that feed other tracks run first; a track cannot (directly or not) feed itself.
* **Unification:** linear chains become graphs (`in -> effects -> out`), so old files migrate on load. MIDI effect
  modules become modules with ports, and can share the machinery of audio modules (typed ports are what tell the two
  apart). UI reuses the patcher canvas.
* **Open questions:** whether the source track keeps sounding when another track taps it (proposal: yes, nothing
  changes for it); whether tapping offers both "clip notes" and "after its effects" (proposal: both).

## Browser (end-to-end) tests in the repo

Status: **not started.** Our browser checks are ad-hoc Playwright scripts outside the repo, re-run by hand, so they
rot (two already broke on UI changes).

* Add `e2e/` with `@playwright/test` and an `npm run e2e` script that builds and serves the app.
* Port the checks that still pass: audio clips, trim/fades, LFO/reverb import, samples, piano roll, menus.
* Keep selectors in one helpers file so a UI change needs one fix.
* Replace the old `persist` and `poly` scripts with a single fresh save-and-reload test.
* Costs: a new dev dependency (Playwright) and a CI step with a browser.
