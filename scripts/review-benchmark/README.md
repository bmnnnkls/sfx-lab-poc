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
remain under `docs/archive/2026-10-perf-library/diagnostics`, excluded from normal suites. They deliberately describe
pre-fix defects and are not expected to pass against repaired code.

These are offline capacity/counter measurements, not worklet callback durations or
underrun evidence. The historical global one-frame path is addressed by the current conservative R1 candidate; its final capacity
acceptance remains open. Do not reinterpret historical counts as current results, an F2 regression or G1/G2/G3 acceptance.

## F1 implementation measurements

`source-identity.ts` saves hashes, the tracked source diff and a complete source/config archive (including untracked
fixtures) alongside build hashes. Run before a verification/capture series and verify source hashes afterward:

```sh
node --experimental-transform-types --disable-warning=ExperimentalWarning scripts/review-benchmark/source-identity.ts
```

`worklet-capacity.ts` runs against a separately started production preview on port 4173. It temporarily prepends a
trace-only shim to the built worklet and restores it in `finally`; never run concurrent builds/captures. The real
Chromium worklet lacks `performance`, so native trace timestamps bracket engine render and the complete callback.
1,000 empty timestamp pairs characterize part of the instrumentation cost. Whole-callback measurements include
bounded sample scanning; no per-quantum messages/logging are sent. Raw traces are compressed, reports include actual
rate/quanta, finite/peak/jump scans, trace-loss flag and host load averages. Peak/jump scans alone cannot prove
absence of musical discontinuities; retain finite-window real-output comparisons and diagnose trace outliers.

```sh
CAPACITY_SECONDS=60 CAPACITY_SCENARIO=low-moving-notes CAPACITY_OUTPUT=docs/measurements/f1-fix/candidate-worklet node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/review-benchmark/loader.mjs scripts/review-benchmark/worklet-capacity.ts
```

Scenarios `low`, `low-notes`, `low-moving-notes`, `low-continuous-notes` and `glass` retain complete examples.
The notes variants add diagnostic lanes: a constant root, a discrete root change, or a continuous velocity-node sweep
inserted before the stab's output. The stored examples are unchanged. `CAPACITY_ACTIVITY=interactive` sends tempo,
control/graph updates and quantized stop/launch commands; `steady` sends no edits; `arrangement` traverses every scene,
allowing its longest pattern plus quantization guards, sends graph/master edits every five seconds and requests an
empty final scene for ten seconds of tails. Use at least 120 seconds for Low Light and 310 for all six Glass Rain scenes.
Reports record requested scene beats; inspect them before claiming full musical coverage.

`CAPACITY_DIAGNOSTICS=1` adds V8 compilation categories and first-render method brackets. Treat those as diagnostics,
not acceptance timings. `trace-outliers.ts <capture-directory>` adds native thread-clock comparisons to wall overruns;
these may identify time not executing on the audio thread but never erase a failed wall deadline.
`f1-scaling.ts` probes 32 tracks, active/allocated voices, 1/8/64 lanes, 2/2048 points and inactive clips; set
`SCALING_OUTPUT` to save JSON. `plain-overhead.ts` isolates a repeated short no-lane benchmark regression with longer
warmup/trials; `ENGINE_SOURCE_ROOT` selects the archived baseline and `DIAGNOSTIC_OUTPUT` saves its JSON.
These stress/diagnostic runs do not replace the plan's unchanged five-trial acceptance benchmark.

`capacity-campaign.ts` serially captures constant (65 s), continuous (65 s), full Low Light (120 s) and full Glass Rain
(310 s). Set `CAPACITY_CAMPAIGN_OUTPUT` to a fresh directory; a `STOP` file there stops between complete captures.
Each child restores the worklet shim before the next begins. Do not build, run tests or poll memory during captures.
Reports include separate suspended preparation latency/actual-clock audits, first actual callback, compact clock
anchor counts and full-status traffic. Preparation never excludes an actual playback callback from timing.

`startup-memory.ts` uses `MEMORY_URL` (production preview) and `MEMORY_SCENARIO=low|glass` for separate sampled
renderer-RSS comparisons. Pass an output JSON path as its first argument. Polling perturbs load; never treat it as capacity timing.
Identify served builds using source manifests: page response hooks may not expose worklet bundle requests.

Headless Chromium exercises the production worklet path; no physical device underrun telemetry is claimed. The first
baseline used an earlier harness with only tempo/master traffic and timing brackets; later captures retain harness
hashes and their own overhead distributions. Run all throughput/capacity work serially after other projects finish,
preserve failed/noisy runs and all outliers, and report both wall and rendered-audio durations. A load average alone
is not proof of quiescence. See `docs/measurements/f1-fix/README.md` for exact source, results and outstanding gates.


`CAPACITY_PROTOTYPE_HOOK=1` is an opt-in C6 diagnostic: install the render timing hook on the prototype and filter
it to the actual Engine, preserving its instance shape. The default remains the instance hook. Short A/B reports
suggest an observer effect but do not establish causation or acceptance; C6 was not approved before wrap-up. Do not
substitute these diagnostics for the retained failed full campaign. See `docs/REPORT-fix-F1-implementation-status.md`.
