# Handoff: track effects, stereo, sends and returns

> **Status: all six steps are built** (see `ARCHITECTURE.md` for how, `docs/TASKS.md` "Effects follow-ups" for what is left). The text below is the original brief, kept as the record of what was decided; where the built design differs (a separate `Return in` / `Master in` source instead of reusing `Track in`, `Track out` as a stereo sink, `mix-order.ts` for the loop rules, two engine orders), `ARCHITECTURE.md` is right.

For the next session. Read this first, then `ARCHITECTURE.md` (how things are built) and `docs/TASKS.md` (what is
open). Nothing of the work below has been started; the repository is clean on branch `claude/admiring-ride-46010w`
(last commit: "Record the agreed send design, build order and the stereo step in docs/TASKS.md").

## The goal

A browser Ableton-Live-plus-Max/MSP-style POC ("SFX Lab"). Sound is made by instruments (patches of DSP nodes) and
audio clips, mixed to a mono-per-track bus. We want effects on tracks, send/return channels, a master effects chain,
and **stereo**, built with the same graph, module and persistence machinery that already exists. The user's taste, from
the whole project: deep modules with small interfaces, one mechanism instead of two, everything undoable, nothing
that can corrupt a saved file, and a real-browser check of every feature.

## Build order (decided with the user)

1. **Insert graph per track** (instrument and audio tracks): `Track in -> effects -> Track out`.
2. **Stereo** (moved up from last on purpose: returns are where reverbs live, so build them stereo once).
3. **Return tracks and the Send node.**
4. **Send knob row** on track headers.
5. **Master effects graph.**
6. **Track audio node** (sidechain / parallel chains).

Decisions already made (do not reopen without a reason):

* A **return track is the bus** (no bus names). One engine primitive, "add this much of this signal to return track X";
  both the header knob (post-fader, one per existing return, hidden on return tracks and when no returns exist) and the
  Send node (anywhere in the insert graph) use it, and they add together.
* **Track audio** is the audio mirror of the existing **Track notes**: a source that takes another track's sound, before
  or after its effects. Loops are refused with the same rule as notes taken from other tracks.
* **Master effects: yes**, same graph on the final mix.
* Mono-per-track is the current limit; stereo is step 2 and is a deliberate design task (see below).
* Effect **modules** need no new machinery: a module whose ports are of kind `signal` already works anywhere sound goes.

## Working conditions

```
npx tsc --noEmit        # strict, noUncheckedIndexedAccess, noUnusedLocals/Parameters, verbatimModuleSyntax
npx vitest run          # ~440 tests, all passing; run from the repo root
npm run build           # tsc + vite build
npx vite preview --port 4173   # after a build, for browser checks
```

* **Layering is enforced by `tests/architecture.test.ts`**: `core` (no browser, no third-party) <- `audio`, `storage`,
  `state` <- `ui` <- `app`. Inside `core`, other folders are reached only through their `index.ts` (no deep imports).
  If you need something from another core folder, export it from that folder's index. `core/patch` imports `core/notefx`
  and `core/dsp`; `notefx` must not import `patch` (it works on a structural `NoteGraphSpec` for that reason).
* Style: small files, immutable data, pure edit functions in `core`, no-op edits return the **same object** (so no empty
  undo steps), comments explain why. Tests sit beside the code. `console.log` is suppressed in vitest; write debug output
  to a file.
* Every new field in a saved file is optional with a safe default, so the format version (`persistence/format.ts`) has
  not needed a bump. If you must break a file, bump `CURRENT_VERSION`, add a migration and a new fixture.
* Commit with the attribution lines from your session instructions; do not open a pull request unless asked. Push to
  `claude/admiring-ride-46010w`.
* **Browser checks.** Scripts live in `docs/browser-checks/` (reference scripts, not part of `npm test`; see the README
  there). They drive real Chromium with Playwright against `vite preview`, including real audio through the
  AudioWorklet, using the output meter exposed as `[data-peak]`. Every feature so far shipped with one. Write one per step.

## Where things are (only what this work touches)

| Concern | Files |
| --- | --- |
| Engine entry, block loop, track ordering, tap board | `src/core/engine/engine.ts` (`render`, `renderBlock`, `collectEvents`, `mixSegment`, `runOrder`) |
| A track on the audio thread | `engine/track-runtime.ts` (instrument), `engine/audio-track-runtime.ts` (samples), `engine/playable-track.ts` (interface: `schedule(from, to, board)`, `tapSources()`, `mixInto`) |
| Commands (UI -> engine) | `engine/commands.ts`; the project is diffed into commands by `sync/diff-project.ts` |
| Instrument (voices, shared stage) | `instrument/instrument.ts`, `compile.ts` (buffers, `processStage`), `stages.ts` |
| DSP nodes | `dsp/nodes/*.node.ts`, `dsp/registry.ts`, `dsp/types.ts` (`NodeDefinition`, `DspNode`, `ProcessContext`, `PortSpec.kind`) |
| Patch, ports, modules | `patch/types.ts`, `node-shape.ts` (`describeNode`, `moduleDomain`), `edit.ts` (`canConnect`, `connect`), `flatten.ts`, `group-module.ts`, `default-note-graph.ts` |
| Notes graph (the template to copy) | `notefx/graph.ts` (`NoteGraph`, `TapBoard`, `noteTapSources`), `project/note-taps.ts` (`tappableTracks`, `readsNotesFrom`), `persistence/sanitize-note-taps.ts` (`repairNoteTaps`) |
| Project model and edits | `project/types.ts`, `edit.ts` (`createTrack`, `removeTrack` clears track references), `module-edit.ts` (`PatchTarget`, `editPatchAt`, `reconcileModules`) |
| Saved files | `persistence/sanitize-project.ts`, `sanitize-patch.ts` (domain checks), `sanitize-modules.ts`, `project-file.test.ts` |
| UI | `ui/patcher/GraphEditor.tsx` (one editor for sound patch and note graph, takes a `domain`), `PatchCanvas.tsx`, `NodeView.tsx`, `TrackPicker.tsx`, `ui/editor-panel/EditorPanel.tsx` (tabs), `ui/session-view/*` (`TrackHeader.tsx`, `SessionView.tsx`), `state/project-store.ts` |

## What the code does today (the parts you must understand)

* **Audio path.** `Engine.render` runs 128-frame blocks (`MAX_BLOCK_FRAMES`), splitting a block at event frames
  (`renderBlock`/`mixSegment`). `TrackRuntime.mixInto` takes the **mono** signal of `Instrument.render(frames)`, multiplies
  by the track volume and adds it to **both** `left` and `right`. `AudioTrackRuntime.mixInto` adds sample audio to both
  buses. The engine finishes with `softClip` (tanh) and tracks a peak. There is no per-track signal chain after the
  instrument, no bus, no stereo.
* **Instrument.** The patch is split into a per-voice stage and a shared stage (delay, reverb, anything downstream of
  them), compiled by `compileStage` into preallocated `Float32Array(128)` buffers; `processStage` runs it. The patch's
  `output` node(s) define what is audible.
* **Typed ports.** `PortSpec.kind` is `'signal'` (absent means signal) or `'notes'`. `canConnect` only joins equal
  kinds; modules inherit the kind of their ports (`describeNode`). Node domains are `'audio'` and `'notes'`; a module
  has a domain from its contents (`moduleDomain`), `sanitizePatch` keeps domains from mixing. A third kind `'stereo'`
  slots in exactly here.
* **Cross-track reads (notes).** Each block every track writes what it produced to a shared `TapBoard`; *Track notes*
  nodes read it; `Engine.runOrder` runs a track after the tracks it reads from; `tappableTracks` keeps the editor from
  offering loops; `repairNoteTaps` repairs files; `removeTrack` clears references (also inside modules, via
  `clearTrackReferences` on `PatchNode.trackId`). **Sends and Track audio should copy this pattern wholesale.**
* **Graph editor.** `GraphEditor` edits a track's sound patch (`domain: 'audio'`), its note graph (`'notes'`) or the inside
  of a module. Targets are `PatchTarget` (`{ trackId, graph?: 'audio' | 'notes' } | { moduleId }`); store actions are
  `updatePatch`, `updateNoteGraph`, `updateModulePatch`, `groupNodes`, `addModuleUse`, `unlinkModule`.
* **Diffing.** `diffProject` flattens module uses (`flattenPatch`) before comparing, ignores canvas positions, and turns
  parameter-only changes of a sound patch into `track/setParam` so knobs never rebuild a voice. Note graphs are sent
  whole (`track/setNoteGraph`) because `NoteGraph.sync` keeps node state by id.

## Step 1: insert graph per track

* **Model.** `fx: Patch` on every instrument and audio track, default `Track in -> Track out` wired together (write
  `createDefaultFxGraph` next to `createDefaultNoteGraph`). New DSP nodes: `trackIn` (a source: copies the track's own
  signal) and `trackOut` (the sink; reusing `OUTPUT_NODE_TYPE` is fine). `ProcessContext` needs an optional `input` buffer
  for `trackIn`. The existing effect nodes (filter, delay, reverb, gain, lfo) and modules work as they are.
* **Runtime.** An `FxGraph` class (e.g. in `core/instrument/`, beside `compile.ts`) compiles a whole patch with
  `compileStage` (no voice split), has `process(input: Float32Array, frames): Float32Array`, and a `setParam`. Instrument
  tracks: `signal = instrument.render(frames)`, then `fx.process(signal)`, then volume. Audio tracks: render the clip
  audio into a scratch buffer instead of straight into the buses (`mixVoice` in `audio-track-runtime.ts` writes to L/R
  today; the 5 ms declick tail must keep working), then run the graph.
* **Commands and diff.** `track/add` carries `fx` for both kinds; a structure change sends the graph (`track/setFx`), a
  parameter-only change sends `track/setParam` (so a reverb tail or filter state survives a knob turn). `diffPatch` in
  `sync/diff-project.ts` already does exactly this for the instrument patch: generalise it over "which slot"
  (patch or fx). Node ids are unique across a track's graphs, so `setParam` can look in both.
* **Persistence.** Sanitize with the audio domain (`sanitizePatch`); a missing `fx` loads as the default graph (older
  files). Meaningless nodes in the wrong place (a `trackIn` in an instrument patch, a `note` node in an fx graph) are
  harmless and silent; do not over-engineer a ban.
* **UI.** A third tab, **Effects**, next to Notes, using `GraphEditor` (extend `domain` or add a `graph: 'patch' |
  'fx' | 'notes'` prop and `PatchTarget.graph`), palette = audio nodes plus `trackIn`/`trackOut`. Audio tracks get it
  too (their Instrument tab only explains they have no instrument). The note-effects badge on the track header says
  "fx N" today: rename it (e.g. "notes N") when sound effects get their own badge.
* **Done when:** unit tests (default graph passes audio through bit-for-bit; a filter in the graph attenuates; a module in
  the graph works; diff/persistence round trips; old file loads), an engine test (audio track with a filter, instrument
  with a delay tail), a browser check (add a reverb to a sample track, hear it; knob turn does not cut the tail).

## Step 2: stereo

The design is proposed, not final; settle it with a short prototype and tell the user what you chose.

* **Port kind `stereo`** beside `signal` and `notes`, typed through modules like `notes` already is.
* **Representation.** Buffers are `Float32Array(128)` per output port today (`compile.ts`). Options: (a) a stereo port
  is one `Float32Array(256)` laid out planar (left then right), so `newBuffer`, sums and seeding keep working, with
  stereo-aware summing; (b) a two-buffer struct everywhere. Prefer (a) unless nodes become awkward; hide the layout
  behind helpers (`leftOf(buffer, frames)`, `rightOf`).
* **Mono into stereo.** Allow `signal -> stereo` (implicitly duplicated), not the reverse; converting down is the explicit
  *Mono sum* node. `trackOut` becomes stereo; a mono signal reaching it is duplicated.
* **Stereo for every existing node without rewriting them:** `PatchNode.stereo?: boolean` (like `bypassed`): when set,
  `describeNode` reports its signal ports as `stereo`, and the compiler creates **two** instances of the DSP node (L and R)
  with the same parameters. Only nodes that opt in (`NodeDefinition.stereoCapable`) get the toggle: filter, gain, delay,
  reverb-as-two-mono is *not* what we want (see below), LFO-modulated pairs need the modulation signal shared.
* **New nodes that create or need stereo:** *Pan* (mono to stereo, constant-power law), *Width* (mid/side), a real
  **stereo reverb** (Freeverb with the right channel's delay lengths offset by +23 samples at 44.1 kHz), *Ping-pong
  delay*, *Mono sum*.
* **Engine.** Instruments stay mono (voices summed); stereo starts in the insert graph. `mixInto` adds the track's left
  and right buffers separately; `AudioTrackRuntime` too (samples are decoded mono, so they are duplicated unless a graph
  pans them). Check `softClip` and the peak meter are per channel (they already are).
* **Tests:** pan law keeps total power; stereo reverb output is decorrelated (left and right differ) yet mono-compatible;
  a stereo-lifted filter equals two mono ones; a mono signal into a stereo input appears in both channels; port kinds
  survive module grouping and a file round trip; nothing existing changes (the default graphs and old projects render
  identically, which `engine.test.ts` already pins).

## Step 3: return tracks and the Send node

* **Model.** A third track kind `'return'`: no clips, a volume, an fx graph that starts from `trackIn` (= the summed sends
  into it). Creating one is in the session `+` menu (`createReturnTrack`); the session view shows returns apart from the
  clip grid. `isReturnTrack` guard next to the other two in `project/track-kind.ts`. Most `Track` consumers switch on
  `kind`: let TypeScript find them.
* **Send node** (sound domain, a sink): parameter `amount`, and `PatchNode.trackId` = the return track, picked with a
  `TrackPicker`-style control that lists return tracks (give `NodeShape.usesTrack` a value saying which kind of track
  it picks, instead of a boolean). The signal goes to the return, not on to the next node.
* **Engine.** A per-block `AudioBoard` keyed by return track id (stereo buffers, zeroed each segment, like `TapBoard`).
  The Send node writes to it through an optional `sends` sink on `ProcessContext`; a return's `trackIn` reads its slot.
  Senders must run before returns: extend `Engine.runOrder` so dependencies are the union of note taps and audio
  sends. The block is split into segments (`mixSegment`), so the board lives per segment.
* **Rules.** `tappableTracks` (or a sibling) must also exclude loops through sends; a return may send to a later return
  but never in a loop. `repairNoteTaps` becomes a general "track references" repair covering notes taps and sends;
  `removeTrack` already clears `trackId` references everywhere (also inside modules): add a test for sends.
* **Done when:** unit tests (ordering, loop refusal, removal clears, persistence), an engine test (two tracks sending
  to one reverb return, in either add order), and a browser check (send a track to a reverb return, hear the tail, remove
  the return and nothing crashes).

## Step 4: send knob row

`Track.sends: Record<returnTrackId, number>` (0..1). In the engine the knob is the same primitive as the Send node, taken
post-fader. Header UI: a compact row of knobs, one per existing return, shown only when returns exist and never on return
tracks. Edits merge per knob for undo (`mergeKey`). Removing a return drops its entries. Persistence sanitizes unknown ids
and clamps. Tooltip text must say "post-fader" (the node can sit anywhere, so it can be pre-fader).

## Step 5: master effects graph

`Project.master: { fx: Patch }` (optional, default `Track in -> Track out`), run in the engine after all tracks are mixed
and before `softClip`, stereo. Shown as a "Master" strip in the session view with its own Effects editor (the same
`GraphEditor`). Nothing sends *to* the master; it just processes the final mix.

## Step 6: Track audio node

A source node that takes another track's signal, before or after its insert graph (`tap` parameter, like *Track notes*).
It needs the signal of every track available on a board for the block, and the same ordering and loop rules. It makes
sidechain-style tricks possible once a node exists that follows a level (an envelope follower; add it here if the user
wants the trick, not before).

## Things that bit us (so they do not bite you)

* **Events on a block edge.** An event at a beat that lands exactly on a 128-sample block boundary can fall one sample
  early or late depending on where blocks start (float rounding in `Transport`). In tests compare renders chunked in
  whole multiples of 128 exactly; do not demand bit-identity for odd chunk sizes. The note graph itself is exactly
  independent of how time is cut (tested).
* **Same-pitch notes** cut each other short because the instrument matches note-offs by pitch: `Merger` handles it.
* **Frequency measurement in tests:** use a sine patch (`createDefaultPatch`, set the oscillator to sine, filter cutoff
  to 20000, delay mix 0) and a Goertzel filter; see `engine/note-graph.test.ts`.
* **Browser tests:** reset state with `localStorage.clear()` and `indexedDB.deleteDatabase('sfxlab')`; start Chromium with
  `--autoplay-policy=no-user-gesture-required`; wait for tails (about 9 s) before asserting silence; a node's header
  intercepts clicks on overlapping nodes (new nodes now spawn in a free grid slot); `getByRole('button', { name })`
  needs `exact: true` where names are prefixes of each other.
* **Untrusted files.** Anything read from a file goes through `sanitize*`: validate ids, clamp, drop and warn, never throw.
  Add a round-trip test and a "garbage in" test for each new field.
* **Do not create a second mechanism** where one will do (the user pushed for this repeatedly: patch modules and note
  graphs share one machinery; sends and the knob share one primitive).

## Docs to update as you finish each step

`ARCHITECTURE.md` (a section per feature, and its "Known POC limits"), `README.md` (one sentence of what the user can do),
`docs/TASKS.md` (move the finished item out of "open"). Keep the user informed in plain language of what they can now do
and what is still open.

## Other open items (not part of this work)

* Personal module library with embed / import / export for both kinds of module (`docs/TASKS.md`).
* Browser checks in the repo as a real e2e suite (`docs/browser-checks` is the seed for it).
* Smaller follow-ups are listed in `docs/TASKS.md` ("Note graph follow-ups" and the module follow-ups).
