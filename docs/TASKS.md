# Open tasks

Things we have decided are worth doing but have not started. Newest first. Move an item to `ARCHITECTURE.md`
(as documentation of what exists) when it ships, and delete it here.

## Other work, in the order I would do it

Not nodes (the next batch of nodes is in [`IDEAS-nodes-and-controls.md`](IDEAS-nodes-and-controls.md), "Next batch"). The first is
written up as a prompt for a new session in [`PROMPT-next-session.md`](PROMPT-next-session.md).

1. **Export to WAV** (idea F2): the missing half of an SFX lab, an offline render of the engine (it already runs without the browser) to a
   stereo WAV, with a tail, a sample rate and a normalize option. Deterministic, so the same project is the same file.
2. **MIDI input** (F4): a MIDI keyboard for notes (Web MIDI), CC mapped to control nodes with MIDI learn. Makes the panel playable. Needs
   a decision on where learned mappings live (on the node, like `panel`, is the likely answer).
3. **Presets and snapshots** (F3): save the states of the controls and morph between two with an XY pad; pairs with Randomize and Mutate
   (a snapshot is also "keep this roll").
4. **Drum machine design**: decide how a module holds or picks samples (a module use cannot carry a sampler's `sampleId` today), then build E5:
   N samplers gated by the incoming note (hz to MIDI, compare, multiply), per-pad level, pan and tune.
5. **Test and tooling hygiene**: the whole browser suite takes too long; split it into a fast smoke set and a full run, and stop checks
   hard-coding lists the app already knows (they broke three times as nodes were added; the unit tests already read the registry).
6. **Smaller follow-ups found on the way**: per-*parameter* locks for Randomize; indicators live inside a module's own editor; a bigger
   example-module library (E8) and a way to save a module as an example of your own.

## Ideas for the next nodes, controls and effects

A pool of candidate work (live controls inside cards, indicators, analysis nodes, noise including Perlin, granular and glitch
effects, spectral processing, example modules, workflow), rated by value and cost so we can pick: [`IDEAS-nodes-and-controls.md`](IDEAS-nodes-and-controls.md).

## Control nodes, property editor, quick-add, node pictures, math nodes

Status: **built (steps 1 to 8).** What exists is described in `ARCHITECTURE.md`; the plan and what was left out ("Not done") are in
[`HANDOFF-control-nodes.md`](HANDOFF-control-nodes.md). It took over most of the front-panel follow-ups below.

## Front panel follow-ups

The front panel is built (see `ARCHITECTURE.md`, "Front panel"; the original brief is `HANDOFF-front-panel.md`). Ideas that did
not make it in:

* A **combined per-track panel** (instrument + effects on one board).
* **Free positioning** of controls (today an ordered flow with sizes).
* The controls of a module **nested inside** a used module shown on the outer panel (today only the controls directly inside it are).
* The **Mixer adopting** the same widgets (`ui/controls`) for its faders, pan and sends.
* **MIDI learn** and **automation** (recording a control's movements), a **dB** fader law.
* Meters or a scope on the panel, a panel in the session-view header, a selector control for enum parameters.

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

Status: **all six steps built** (insert graph, stereo, return tracks and the Send node, send knobs, master graph, Track audio: see `ARCHITECTURE.md`). Follow-ups below.

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

1. ~~Insert graph per track (`Track in -> effects -> Track out`, instrument and audio tracks).~~ Done (see `ARCHITECTURE.md`).
2. ~~**Stereo** (moved up: returns are where reverbs live, so build them stereo once).~~ Done (see `ARCHITECTURE.md`); chorus and other stereo modulation effects are still open.
3. ~~Return tracks and the Send node (engine primitive, ordering, loop rules, persistence).~~ Done (see `ARCHITECTURE.md`).
4. ~~The send knob row on track headers.~~ Done (see `ARCHITECTURE.md`).
5. ~~Master effects graph.~~ Done (see `ARCHITECTURE.md`).
6. ~~*Track audio* node.~~ Done (see `ARCHITECTURE.md`); the envelope follower for sidechains is still open (below).

## Effects follow-ups

* **Envelope follower** (a node that turns a signal's level into a smooth control signal), which with *Track audio* gives
  sidechain ducking. Not built: raw audio into a CV is amplitude modulation, not a duck.
* Chorus, flanger and other stereo modulation effects; a limiter or compressor for the master (today the output soft clip is
  the only limiter).
* Mixer leftovers: a dB-shaped fader (the stored volume is linear), a pan/mute/solo control in the session-view header
  (they are in the Mixer tab only), a peak-hold or numeric readout on the meters.
* A mono *Reverb* cannot be wired to a stereo source (a return's input, the master): use *Stereo reverb* or put the *Mono sum*
  node first. Offering the L R switch on the mono reverb would be cheap if two copies were acceptable.

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
