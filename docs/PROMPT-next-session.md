# Prompt for the next session: WAV export, tempo in the DSP, per-voice seeds

Paste everything below the line into a new session on this repository. It is self-contained; the facts in it were read from the code
when it was written (branch `claude/determined-turing-ypq9ix`, after PR #4 was opened).

---

Work in `/home/user/sfx-lab-poc` on the branch you are given. Build three small-to-medium items, **in this order: 3, then 2, then 1**
(the export in item 1 relies on the other two being right). Read `ARCHITECTURE.md` first (the sections on the engine, stages, control nodes,
"Sources of sound and chance" and the Logic nodes) and skim `docs/IDEAS-nodes-and-controls.md`. Core is framework-free and immutable; edits
are pure functions that return the same object when nothing changes; tests sit beside the code; comments say why; there is no format-version
bump unless a migration needs one (and there is no legacy data to migrate: ignore breaking changes to the project data, only the sample
project matters). `tests/architecture.test.ts` enforces the layering. Update `ARCHITECTURE.md`, the README and
`docs/browser-checks/README.md` as you go, and fix any note that the code contradicts.

**Rules for this session**
* **Do not run the whole browser suite**: it takes too long. Run `npm run typecheck` and `npm test` (all unit tests) for every item, and
  only the browser checks you add or that your change touches (`npm run build`, `npx vite preview --port 4173 --strictPort` in the
  background, then `node docs/browser-checks/<name>.mjs /tmp/shots`). A dead preview server makes every script fail with
  `ERR_CONNECTION_REFUSED`: start it as a background task and check it answers before running scripts.
* One commit per item, pushed to the branch you are on, ending with the attribution lines your session instructions give. Do **not**
  open a pull request unless asked. Stop and ask only if you are blocked.
* A browser check must not depend on timing luck: for sound use `docs/browser-checks/audio-tap.mjs` (read its header), never two analysers.

## Item 3: a seed per voice (do first, small)

**Problem.** The seeded sources (`dsp/nodes/noise.node.ts`, `geiger.node.ts`, `random.node.ts`, `perlin.node.ts`; RNG in `dsp/random.ts`)
start from the same `seed` in every voice, so a chord of N voices plays N identical noises that add coherently (louder, and phasey).
`NodeDefinition.create(sampleRate)` does not know which voice it is for.

**Do.** Give `create` a second argument, a small whole-number **salt** (the voice's slot in the pool; 0 for global, shared and insert-graph
nodes), set where nodes are compiled (`instrument/compile.ts` `compileStage`, called from `instrument.ts` per voice; look at
`voice-pool.ts` for the slot). Mix the salt into the seed of the four sources. Add an enum parameter `voices` (`differ` / `same`) to each,
so a patch can choose; defaults: **differ** for noise, geiger and random, **same** for perlin (its Retrig exists so every note wanders alike).
Keep determinism: the same project and the same notes must still render to identical samples every time (a voice slot depends only on
the note order).
**Tests:** two voices of a chord give different noise by default and identical noise with `same`; a render is identical twice; salt 0 equals
today's output for the existing seeds where `voices` is `same`; node-docs words for the new parameter (a test fails without them).

## Item 2: tempo in the DSP context (small)

**Problem.** `ProcessContext` (`dsp/types.ts`) has no tempo, so *Clock* (`dsp/nodes/math/logic.ts`) can only count in Hz or BPM and cannot
follow the project's tempo; the transport (`core/transport/transport.ts`) knows it (`setTempo`, `beatsPerSample`).

**Do.** Add `tempo?: number` (beats per minute, default 120 when absent, so the many tests that build a context by hand keep working) to
`ProcessContext`, filled wherever a stage is processed (`instrument/voice.ts`, `instrument/instrument.ts` global and shared stages,
`instrument/fx-graph.ts`). The engine must hand it down: `Engine.apply` on `transport/setTempo` tells every track, return track and the
master graph (add a `setTempo` to `PlayableTrack` and the runtimes), and a track added later starts with the current tempo. Then add a
**per-beat unit** to *Clock*: its `Per` enum gains `beat` (rate = cycles per beat, so 1 is once per beat and 4 is sixteenths), computed
from the context tempo each block, so changing the project tempo changes the clock without touching the node. Keep `Hz` and `BPM`.
**Optional if cheap:** a `sync` option on the LFO (`dsp/nodes/lfo.node.ts`) that reads its rate in cycles per beat. Do not add tempo to
other nodes in this item.
**Tests:** clock edges land on the beat at 90, 120 and 140 BPM; changing the tempo mid-run changes the next cycle; default 120 when the
context has no tempo; the engine passes a tempo change to a track that already exists and to one added afterwards (`engine/*.test.ts`
style); node words for the new option. Remove the "the DSP has no tempo" notes from `ARCHITECTURE.md` (Logic paragraph) and
`docs/IDEAS-nodes-and-controls.md`.

## Item 1: export to WAV (the main item)

**Goal.** Get a sound out of the lab: **File → Export audio (WAV)…** renders the project **offline** (not in real time) and downloads a
stereo WAV. The engine already runs without the browser (`core/engine/engine.ts`: `Engine.render(left, right)` pulls audio; its header says
it runs in Node tests and "an offline bounce"), so the render is a core function and the UI is a thin dialog.

**Core** (new, in `core/engine/`, e.g. `bounce.ts`, exported through the index, **no browser or Web Audio use**):
* `renderProject(project, samples, options)` builds an `Engine` at `options.sampleRate`, applies `diffProject(null, project)`
  (`core/sync`; it yields every command to build the engine from nothing, including `transport/setTempo` and the tracks) plus a
  `sample/add` for each sample the project uses (look at `app/project-sync.ts` and `app/sample-library.ts` for how the live engine gets
  sample data), launches what the scope says, renders in chunks, and returns `{ left, right, sampleRate }`.
* **Scope** to start with: *a clip* (one track's clip, looped for `bars` bars) and *a scene* (every track's clip in that scene row). Length is
  `bars` of the project's bars, then clips stop at the bar and the **tail** is rendered until the output stays below -80 dB for 0.25 s, at
  most `maxTail` seconds (default 10), so reverbs and delays are not cut. Clips loop forever, so *you* decide where the render ends: say
  how in the code comments and in `ARCHITECTURE.md`.
* Options: `sampleRate` (44100 or 48000), `bars`, `maxTail`, `normalize` (peak to -1 dBFS; off by default, and never boosts silence),
  `bitDepth` (16-bit PCM, or 32-bit float).
* **Determinism is the point**: the same project gives the same samples every time (seeded sources, per-voice salt from item 3). Two
  renders must be byte-identical.
* `core/sample/wav.ts` has `encodeWav(data, sampleRate)`, which is **mono 16-bit only**: extend it (or add a sibling) for stereo and for
  32-bit float, keeping the existing function working for the demo samples, and test the header (RIFF, fmt, data sizes, channel count,
  rate) and a round trip through the existing decoder if there is one.

**UI.** `ui/file-menu/FileMenu.tsx` has the File dropdown (`files.exportProject` is the pattern; `@storage` `downloadFile` saves a file).
Add *Export audio (WAV)…*, which opens a small dialog (reuse the app's dialog or toast patterns, see `ui/toasts`): scope (the selected
clip, or a scene), bars, tail, sample rate, bit depth, normalize, then *Export*. A render of a few seconds takes a moment on the main
thread: render in chunks and yield between them (a progress line is enough), and keep the dialog usable. Name the file after the project.
Keep `app/` glue thin: the core function does the work.

**Tests (unit):** a known project (a sine through the default patch, or a sampler of a known buffer) gives the expected length, peak and
pitch; stereo is real (pan hard left and the right channel is silent); the tail stops on silence and respects `maxTail`; normalize hits
-1 dBFS and leaves silence silent; two renders are identical; the tempo is applied (a 2-beat clip is 1 s at 120 BPM and 2 s at 60).
**Browser check** `docs/browser-checks/export.mjs` (new, short): open File → Export audio, press Export, catch the download with
`page.waitForEvent('download')`, check the bytes are a WAV (RIFF header, 2 channels, the chosen sample rate, a non-zero peak), and that
exporting twice gives identical bytes.

## When done

Update `docs/IDEAS-nodes-and-controls.md` (mark F2 built; drop the tempo and per-voice-seed follow-ups it lists), `docs/TASKS.md`
(remove what shipped), `ARCHITECTURE.md` and the README (a line on exporting). Report what you built, what you decided where this prompt
left it open, and anything you left out.
