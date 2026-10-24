# Handoff: the next round (arrangement follow-ups + granular sample editor)

> **Status: not started.** This is the brief for the next session. Read this first, then `ARCHITECTURE.md`
> ("The arrangement" and "The sample editor" describe what exists) and `docs/TASKS.md` ("Prototype follow-ups").
> Work on the branch **`prototype/track-view`** (tip `0a1a355`, working tree clean); merge back to `main` when the
> round is done. `main` deploys to GitHub Pages on every push, so only push to `main` when `npm test`,
> `npm run build` and `npm run test:smoke` all pass. Do not open a pull request unless asked.

## Where the last round ended

Two prototypes shipped on `prototype/track-view` (commit `0a1a355`):

* **The arrangement** — copies of session clips placed on a per-track timeline (`ArrangementClip`,
  `core/project/arrangement-clip.ts`), played by *deriving* the sounding regions from the transport position
  (`core/engine/arrangement-player.ts`), a `playbackMode: 'session' | 'arrangement'` per track, and an
  arrangement view beside the session grid (`ui/arrangement/`, Session | Arrangement toggle + Tab).
* **The sample editor, stage 1** — a zoomable waveform with selection in the Samples tab (`ui/samples/SampleEditor.tsx`),
  pure transforms in `core/sample/edit.ts`, and `SampleLibrary.deriveSample` (every edit derives a **new** hash-keyed
  library sample; the original stays).

All 1,493 unit tests, 10 browser smoke tests and the build are green.

## This round: two work packages

### A. Arrangement follow-ups

1. **Looping regions.** A region should be able to repeat its clip on the timeline: a `loop?: boolean` on
   `ArrangementClip` (default false; regions play once today — see `ARCHITECTURE.md`, "The arrangement"). The loop
   ends at the next region on that track, or at a region's own `endBeat`. The note events already come from
   `regionNoteEvents` (`core/engine/arrangement-player.ts`) — the pass math from `ClipLauncher.clipEvents`
   (`core/session/clip-launcher.ts`) is what to restore. Audio loops via `repitchPosition` with `origin` as the
   loop base; the stop event moves from `arrangementEnd` to the loop end.
2. **Moving a region across tracks.** Vertical dragging in `ArrangementRegion` (`ui/arrangement/ArrangementRegion.tsx`)
   onto another lane: the drop resolves the target from the lane element (`data-lane`) and updates `trackId`.
3. **Drag-and-drop from the session grid.** Drag a session slot onto a lane to place it (HTML5 drag or a
   pointer-based "pick up" from the slot's context menu: "Place on arrangement at…").
4. **Bouncing the arrangement.** A third `BounceScope` (`core/engine/bounce.ts`): render the timeline from beat 0
   to `arrangementEnd` of the last region, then the usual tail. The Bounce applies `arrangement/set` +
   `arrangement/play` to its own engine — check that the launch state machines are idle so only the timeline plays.
5. **Recording into the arrangement** (touch recording, slice 3c) can land on the timeline; only start this after 1–4.

### B. Sample editor stage 2: the granular sampler (G6-lite)

* **Node** (`core/dsp/nodes/granular.node.ts`): `usesSample: true` — nodes already read whole buffers at process
  time (`ProcessContext.samples`), so grains are short windowed copies scheduled inside the block loop. Params:
  *position* (takes a control, so an LFO or Perlin noise scans it), *density*, *grain size*, *pitch* (+ random
  spread), *spray* (position jitter), *direction* (forward / reverse / random), *pan spread*, *window shape*.
  Cap concurrent grains (32–64) to bound CPU — see `docs/IDEAS-nodes-and-controls.md` G6 and the feasibility note.
* **UI**: the granular controls live in the **sample editor** (stage 1's toolbar grows a *Granular* section with a
  live preview), and the node appears in the patcher's Add menu like any node (picker via `setSample`, see
  `ARCHITECTURE.md`, "Samples" — "Add a sample-playing node").
* **Tests** follow the existing node tests (`core/dsp/nodes/nodes.test.ts`): deterministic, block-level, no browser.

## Conventions (see `ARCHITECTURE.md`, "Conventions")

* Deep core modules with a small public surface; UI imports from `@core`/`@state`, never deep files. The
  architecture test (`tests/architecture.test.ts`) pins layering and index-only cross-module imports — a value
  import across core modules can also create a module cycle (this bit the arrangement player once: it lives in
  `core/engine`, not `core/session`, for that reason).
* Every behaviour change ships with tests; browser changes with smoke coverage (`tests/browser/*.smoke.spec.ts`,
  real worklet output via `expectSound`, no mocked engines). Radix context-menu items are `menuitem` roles.
* Update `ARCHITECTURE.md` when something ships and delete the finished item from `docs/TASKS.md`.

## Verification

```bash
npm ci && npm test        # unit + architecture
npm run build             # typecheck + production build
npx playwright install chromium   # once
npm run test:smoke        # browser checks against the production build
```
