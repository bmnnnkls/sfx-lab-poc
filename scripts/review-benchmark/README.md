# Review measurements

Run from the repository root with Node 24.21.0 (or a Node release supporting
`registerHooks` and `--experimental-transform-types`). Uses installed repository
code/dependencies; no global packages or machine-specific imports.

```sh
node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/review-benchmark/loader.mjs scripts/review-benchmark/bench.mjs --counts
node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/review-benchmark/loader.mjs scripts/review-benchmark/bench.mjs
node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/review-benchmark/loader.mjs scripts/review-benchmark/library.mjs
```

`BENCH_RATE=44100` / `48000` / `96000` select engine rates. Timing uses 48 kHz
by default, 128-frame buffers, one second warmup per variant, five interleaved
one-second trials, alternating order. At rates not divisible by 128, the inherited
render loop rounds up to a complete buffer: 44,100 requested frames become 44,160.
Use the counters at all rates; do not interpret rounded timings as exact one-second
throughput. The default 48,000-frame workload is exact.

`--counts` constructs scratch engines, warms 256 frames, wraps runtime methods
and temporarily counts Map/Float64Array constructions during one 128-frame render.
It restores the globals in `finally`. Do not run this instrumentation in production.
Send and notes-plus-send modes add a fifth, return track and ramp from zero.
Counter keys absent from the output have zero calls. Focused unit regressions in
`send-invalidation.test.ts` check topology membership changes and gain-only updates.

`library.mjs` measures legal folder chains (128/512/1024) and identical sounds
sharing a revision (17/65/257 total items). One warmup, five raw trials. No universal
millisecond threshold is asserted. `BUNDLE_MODULE` optionally selects a historical
bundle-validator module for diagnostic comparisons; it does not change imports or
signature algorithms in the application.

Raw results and setup notes are in `docs/measurements/`. Results include current
HEAD and dirty status; these runs used uncommitted changes. A source-file digest
manifest identifies the delivered source/test tree. Historical diagnostic assertions
remain under `docs/tmp`, excluded from normal suites. They deliberately describe
pre-fix defects and are not expected to pass against repaired code.

These are offline capacity/counter measurements, not worklet callback durations or
underrun evidence. The global notes-lane one-frame path and helper timing remain
reserved for R1. Do not reinterpret their continued poor counts as an F2 regression
or claim G1/G2/G3 acceptance from these runs.
