# Setup and commands

```bash
npm ci             # install the locked dependencies (Node 22.12+)
npm run dev        # http://localhost:5173, opens on the Low Light example (?starter for the plain starter)
npm test           # unit tests + tests/architecture.test.ts (layering) + tests/status-subscriptions.test.ts
npm run typecheck  # tsc --noEmit
npm run build      # typecheck + production build
```

Browser checks build the production app and serve it on port 4173 themselves (`PW_PORT=4174` picks another):

```bash
npx playwright install chromium               # once after install and after Playwright upgrades
npm run test:smoke                            # every smoke group: fast UI checks
npm run test:smoke:group -- smoke-samples     # one group: pulse, workbench, timeline, samples or library
npm run test:audio                            # the audio specs: real worklet output
npm run test:browser                          # both: the smoke groups (two workers), then audio (one)
```

Which group to run when is in [verification](verification.md).

On Linux, install the browser's system dependencies with `npx playwright install --with-deps chromium`. Failures keep
screenshots and traces in `test-results/` and an HTML report in `playwright-report/`.

Profiling the UI's per-frame work: `scripts/profile-status.cjs` (setups and usage in its header). The F1 capacity
and review benchmarks are in [`scripts/review-benchmark/`](../../scripts/review-benchmark/README.md).

The historical diagnostic reproductions (2026-10-18) for review findings F2–F25 are not part of any suite. They describe
pre-fix defects and are not expected to pass:

```bash
npx vitest run --config docs/archive/2026-10-perf-library/diagnostics/claims.vitest.config.mts
```

## Deploying to GitHub Pages

Pull requests and pushes to `main` run the unit and architecture tests, the typecheck, a production build and the
Chromium smoke suite. PRs have read-only repository permissions and never deploy. Pushes to `main` deploy through
`.github/workflows/deploy-pages.yml`, only after those checks pass.

One-time setup: in the repository's **Settings → Pages**, set **Source: GitHub Actions**. Then allow `main` under
**Settings → Environments → github-pages → Deployment branches**; otherwise the deploy job fails with "not allowed to
deploy ... due to environment protection rules". The site is then at `https://<user>.github.io/sfx-lab-poc/`.

What each suite covers, and CI, are in [verification.md](verification.md). Things that have bitten before are in
[gotchas.md](gotchas.md).
