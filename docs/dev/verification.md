# Verification

What the checks cover and how CI and the production build are set up. Commands are in [setup](setup.md).

`npm test` runs unit tests and `tests/architecture.test.ts`; `npm run build` typechecks application and browser-test
code and bundles production assets. Use `npm ci` to reproduce the lockfile on Node 22.12+ (including platform-specific
optional native packages); see [gotchas](gotchas.md#environment) if a native binary fails to load.

`playwright.config.ts` defines separate Chromium smoke and audio projects under `tests/browser/`. `npm run test:smoke`,
`npm run test:audio` and `npm run test:browser` build and serve the production app on a dedicated port 4173. They use
Playwright's managed browser, fresh per-test storage, no retries, assertions with bounded waits, page/console error
checks and retained failure screenshots/traces. There is one spec file per feature area (`*.smoke.spec.ts` for the
UI, `*.audio.spec.ts` for real worklet output); `tests/browser/fixtures.ts` holds the shared helpers and view titles,
and `viewRoot(page, title)` scopes a locator to one view. The audio project uses a sample-window tap derived from the
legacy checks (`audio-tap.ts`) to measure real output through the worklet; it rejects an inactive tap. Legacy
scenarios not yet migrated are listed in [browser-checks](../browser-checks/README.md) ([BACKLOG](../BACKLOG.md) T1).

A change that must leave a DSP node's output as it was is checked against a hash taken from the old code: render many
cases (every mode, odd speeds, release, retrigger), hash the floats, check the old file out to read the hash, and keep
it in the test (`sampler.node.test.ts`). Browser tests that need a position the UI doesn't print (the cursor's frame)
put a marker there and read the saved project (`wave-marks.smoke.spec.ts`).

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
worklet is a separate chunk (sizes in [baselines](../reference/baselines.md#bundle)). Total JavaScript transfer is essentially unchanged: the benefit is independent
dependency caching and smaller individual chunks, not lazy loading. The default chunk-size warning limit is unchanged.
