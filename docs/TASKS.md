# Open tasks

Things we have decided are worth doing but have not started. Newest first. Move an item to `ARCHITECTURE.md`
(as documentation of what exists) when it ships, and delete it here.

## Reusable modules (sub-patches with inputs and outputs)

Status: **design agreed in outline, not started.** Discussed after trim/fades and LFO/reverb.

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
* Open question: show the note chain as a strip on the track header, or as a second patcher view.

### Suggested order

1. Group selection into a module (copy-on-use) with exposed knobs and flattening.
2. Module library inside the project, uses by reference, "unlink".
3. Personal library and import/export.
4. Typed ports and the per-track MIDI effect chain.

## Browser (end-to-end) tests in the repo

Status: **not started.** Our browser checks are ad-hoc Playwright scripts outside the repo, re-run by hand, so they
rot (two already broke on UI changes).

* Add `e2e/` with `@playwright/test` and an `npm run e2e` script that builds and serves the app.
* Port the checks that still pass: audio clips, trim/fades, LFO/reverb import, samples, piano roll, menus.
* Keep selectors in one helpers file so a UI change needs one fix.
* Replace the old `persist` and `poly` scripts with a single fresh save-and-reload test.
* Costs: a new dev dependency (Playwright) and a CI step with a browser.
