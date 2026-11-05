# Verification

What the checks cover and how CI and the production build are set up. Commands are in [setup](setup.md).

`npm test` runs unit tests and `tests/architecture.test.ts`; `npm run build` typechecks application and browser-test
code and bundles production assets. Use `npm ci` to reproduce the lockfile on Node 22.12+ (including platform-specific
optional native packages); see [gotchas](gotchas.md#environment) if a native binary fails to load.

The browser tests under `tests/browser/` are Chromium Playwright projects: five smoke groups and the audio specs. `npm run
test:smoke`, `npm run test:audio` and `npm run test:browser` build and serve the production app on port 4173 (`PW_PORT`
picks another, so a second checkout can run at the same time). They use Playwright's managed browser, fresh per-test
storage, no retries, assertions with bounded waits, page/console error checks and retained failure screenshots/traces.
There is one spec file per feature area (`*.smoke.spec.ts` for the UI, `*.audio.spec.ts` for real worklet output);
`tests/browser/support/fixtures.ts` holds the shared helpers and view titles, and `viewRoot(page, title)` scopes a locator
to one view. The audio project uses a sample-window tap derived from the legacy checks (`support/audio-tap.ts`) to
measure real output through the worklet; it rejects an inactive tap. Legacy scenarios not yet migrated are listed in
[browser-checks](../browser-checks/README.md) ([BACKLOG](../BACKLOG.md) T1).

Each smoke group is a folder and a project (`smoke-<group>`), listed in `tests/browser/groups.ts`;
`tests/architecture.test.ts` fails if a spec sits anywhere else, where no project would run it. Spec files run on two
workers at once, the tests inside a file in order. Audio specs run on one worker, because their output checks are
load-sensitive, and `test:browser` runs them after the smoke groups, so the two never overlap.

| Group | What it covers | Run it for changes in |
|---|---|---|
| `pulse` | Startup, saving and opening projects, commands and keys, graph navigation, linked selection, tempo, MIDI | Always, before every commit |
| `workbench` | Docking and layout, every view at its minimum size, context menus, pinned panels, drag and drop between views | `ui/layout`, `ui/commands`, `ui/file-menu`, `ui/shared`, `ui/controls`, `ui/panel`, `ui/pinned`, any `.css` |
| `timeline` | The arrangement and its marks, automation, the Tracks tree, group buses | `ui/arrangement`, the clip editors, `ui/automation`, `ui/tracks`, `ui/mixer`, `core/automation`, clips and groups in `core/project` |
| `samples` | The wave editor, its marks, panes and spectrogram | `ui/wave-editor`, `ui/samples`, `state/wave-*`, `core/sample`, `core/spectrum`, `audio/spectrum*` |
| `library` | The Library tree, *This project*, Sounds and presets, bundles | `ui/library`, `ui/presets`, `core/library`, `core/preset`, `storage/library-*`, `app/library*` |

When to run what:

* **While working on a feature**: its group (`npm run test:smoke:group -- smoke-samples`) and `npm run test:watch`.
* **Before a commit**: `pulse` and the groups of the paths the commit changes.
* **At the end of a plan step, and before merging**: every smoke group (`npm run test:smoke`), and the audio specs
  when `core/engine`, `core/dsp`, `core/instrument` or `audio/` changed. Changes to `core/engine`, `core/dsp`,
  `core/persistence`, `storage`, `app`, the project store, `support/`, the configs or the lockfile run every group even
  before a commit.
* **CI** runs every smoke group on pull requests and `main`.
* **Not at the same time**: two browser-test runs in one checkout, or unit tests beside a smoke run
  ([gotchas](gotchas.md#browser-tests)). A known flaky spec (BACKLOG V6, V7) is rerun alone before it counts as a failure; no
  retries.

A change that must leave a DSP node's output as it was is checked against a hash taken from the old code: render many
cases (every mode, odd speeds, release, retrigger), hash the floats, check the old file out to read the hash, and keep
it in the test (`sampler.node.test.ts`). Browser tests that need a position the UI doesn't print (the cursor's frame)
put a marker there and read the saved project (`wave-marks.smoke.spec.ts`). A measuring script that drives the
stores itself on the dev server's page stubs the app's entry (`page.route` on `/src/main.tsx`, a regex since Vite adds
`?t=`), so the app's own services don't answer the same stores (`scripts/measure-second-pane.cjs`). What a canvas
shows is checked by its pixels: `wave-spectrum.smoke.spec.ts` writes a file with a tone in one half, and compares the
brightness of the lane's canvas at the tone's row and at an empty one, in each half. Code that runs in a worker is a
plain function the worker calls (`replyTo`), so unit tests and the main-thread fallback run the same code, and
a service under test takes a fake worker that answers on the next task. Code that must give the same floats from a
slice as from the whole audio (`applyBandEdit`) is compared bit for bit (`Buffer.equals` on the floats' bytes) at
several offsets, the sample's start and end among them.

Sample-accurate timing is tested at a tempo where the edge under test falls between samples (97 BPM at 48 kHz: a
beat is 29690.72 frames), and at several render sizes (1, 97, 128, 4096), so a rounding that happens to be exact at
120 BPM can't hide (`arrangement-loop.test.ts`). A check that a guard matters is run once with the guard taken out: the
test must fail. The arrangement loop's audio spec compares what the worklet plays, captured on the render thread, with
an offline `Engine` given the same commands, after the jump's 5 ms tail (`arrangement-loop.audio.spec.ts`); at 240 BPM
a bar is a second, so the passes start on whole samples at any context rate.

Unit tests sit beside the code. Two repository-wide tests guard structure: `tests/architecture.test.ts` (the layering
in [overview](../architecture/overview.md#layers) and the package allow-list) and `tests/status-subscriptions.test.ts`
(no `ui` component selects the whole transport status). Format migrations are tested against the committed fixtures
in `core/persistence/fixtures/`, and old projects' bounce hashes in `core/engine/old-projects.test.ts`
([baselines](../reference/baselines.md#bit-for-bit-references)).

The Pages workflow runs unit/architecture, build/typecheck and smoke checks on PRs and main. PRs get read-only
permissions. Only main builds the deployment with its repository base path and publishes, after checks succeed.

Production bundling uses Vite 8's `build.rolldownOptions.output.codeSplitting.groups`: React, React DOM and Scheduler
form a `react` chunk; Radix and Floating UI form `ui-vendor`. Package-boundary patterns support both path separators.
These eagerly loaded dependencies have independent content hashes and Vite emits module-preload links; the audio
worklet and the spectrum worker are separate chunks (sizes in [baselines](../reference/baselines.md#bundle)). Total JavaScript transfer is essentially unchanged: the benefit is independent
dependency caching and smaller individual chunks, not lazy loading. The default chunk-size warning limit is unchanged.
