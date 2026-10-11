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
* **MIDI effects are in scope** (arpeggiator, chord, transpose, scale lock, …): built as the note graph.

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

Built as the **note graph** (typed `notes` ports on the same module machinery); see `ARCHITECTURE.md`. Audio and note
modules share one library, so the personal library below covers both.

### Suggested order

1. ~~Group selection into a module with exposed knobs and flattening.~~ Done.
2. ~~Module library inside the project, uses by reference, "unlink".~~ Done.
3. Personal library and import/export, for both kinds of module (audio patches and MIDI effect chains). **Open.**
4. ~~Per-track MIDI effects~~ Done as a **note graph** with typed ports, split / merge and notes from other tracks;
   modules are one library for both kinds (see `ARCHITECTURE.md`).

Smaller follow-ups for MIDI effects: more effects (humanize, note length, random pitch, strum), arpeggiator latch, a
bypass-all toggle, auditioning notes through the chain, effects on audio-clip-free tracks only (audio tracks have no notes).

Smaller follow-ups: drag several selected nodes together; delete/duplicate selection with the keyboard; a way to
update or replace a module's definition from a file; show where a module is used from the module list.

## Effects on tracks, sends and returns (sound in, sound out)

Status: **designed, not started.**

* **What exists:** effect nodes (filter, delay, reverb, LFO, gain) and modules with audio ports already work *inside an
  instrument's patch*. What is missing is somewhere to put an effect on a track's *output*, and audio tracks (samples)
  cannot be processed at all.
* **Insert graph per track:** every track (instrument and audio) gets a second sound graph after its own sound:
  `Track in -> effects -> Track out`, edited with the same editor and the same modules as everything else.
  Default is the two wired together (nothing changes).
* **Sends and returns:** a *Send* node (to a named bus, with an amount) can sit anywhere in a track's insert graph; a
  new **return track** (no clips) starts with a *Bus* node reading that bus, then effects, then out. Several tracks can
  send to one reverb. Order of evaluation follows the same rule as notes taken from other tracks: senders first, loops
  refused (a one-block delay could make feedback legal later).
* **Master:** the same graph on the final mix (limiter, glue reverb), as a special return.
* **Modules:** an effect module is simply a module whose ports are `signal`; it can go in an instrument, an insert
  graph or a return. No new module machinery.
### Decisions (from the discussion)

* **Sends:** both a per-track **send knob** and **Send / Track audio nodes**, as one mechanism: a return track *is* the
  bus (no bus names); the engine has one primitive, "add this much of this signal to return track X", which the knob
  (post-fader, one per existing return, shown only when returns exist) and the Send node (anywhere in the insert graph,
  so before or after other effects) both use, and they add together. *Track audio* is a source that takes another
  track's sound (before or after its effects), the mirror of *Track notes*, giving sidechains and parallel chains.
  Loops are refused with the same rule as notes taken from other tracks.
* **Master effects:** yes, the same graph on the final mix.

### Build order

Full handoff for whoever builds this: [`HANDOFF-track-effects-and-stereo.md`](HANDOFF-track-effects-and-stereo.md).

1. Insert graph per track (`Track in -> effects -> Track out`, instrument and audio tracks).
2. **Stereo** (moved up: returns are where reverbs live, so build them stereo once).
3. Return tracks and the Send node (engine primitive, ordering, loop rules, persistence).
4. The send knob row on track headers.
5. Master effects graph.
6. *Track audio* node.

### Stereo (step 2)

Today the engine is mono per track and the two output channels carry the same signal, so sends and returns are only half
as useful (no pan, no wide reverbs). Proposed design, to be settled when we get there:

* A third port kind, `stereo` (a left/right pair), next to `signal` and `notes`; only like kinds connect, and modules
  inherit the kind of their ports, as they already do for `notes`.
* Instruments stay mono (voices are summed to one signal); stereo begins in the insert graph. *Pan* (mono to stereo),
  *Width*, a stereo reverb (decorrelated left and right delay lengths) and a ping-pong delay are the nodes that create
  or need it.
* Any existing mono effect (filter, gain, delay, LFO-modulated things) is usable in stereo by running two copies of it
  with the same parameters, one per channel, so there is no second set of filters to write. A mono-to-stereo or
  stereo-to-mono conversion is explicit (*Pan*, *Mono sum*); *Track out* accepts either and duplicates a mono signal.
* Sends and returns carry stereo; a mono send is duplicated to both channels. Audio-track samples stay mono until
  they are panned.

## Note graph follow-ups

The note graph is built (see `ARCHITECTURE.md`). Ideas that did not make it in:

* Move several selected nodes together (applies to the sound patch too), keyboard delete / duplicate for a selection.
* More nodes: humanize, note length, random pitch, strum, a *delay* node that makes feedback loops legal.
* Auditioning notes in the piano roll through the track's graph.
* Show other tracks' notes in the preview, and a view of all tracks' graphs at once.
* A "send notes only" switch so a track can feed others without sounding itself (today: leave it without an instrument
  sound or turn its volume down).

## Browser (end-to-end) tests in the repo

Status: **not started.** Our browser checks are ad-hoc Playwright scripts outside the repo, re-run by hand, so they
rot (two already broke on UI changes).

* Add `e2e/` with `@playwright/test` and an `npm run e2e` script that builds and serves the app.
* Port the checks that still pass: audio clips, trim/fades, LFO/reverb import, samples, piano roll, menus.
* Keep selectors in one helpers file so a UI change needs one fix.
* Replace the old `persist` and `poly` scripts with a single fresh save-and-reload test.
* Costs: a new dev dependency (Playwright) and a CI step with a browser.
