# Second opinion evidence

Captured 2026-10-18 against clean production source at `36f71d1dea37367d4f1a0f4a18f1d4c17a19e9ec`. macOS ARM64, Apple M3 Pro, Node v24.21.0, 48 kHz, 128-frame buffers. Analysis and measurements only.

- `counts.txt`: fresh existing benchmark structural probe and queue status.
- `timing.txt`: fresh existing benchmark, one second warmup and five interleaved one-second trials. The focused unit run overlapped the beginning; do not infer small causal timing differences from previous reports.
- `scheduling-diagnostic.txt`: separate diagnostic process after the above benchmark and tests completed. Audio mixing and curve collection deliberately suppressed; this is not valid rendered audio or a proposed fix.
- `scheduling-diagnostic.mjs`: the diagnostic's source, with imports changed from scratch absolute paths to repository-relative paths. It retains setup/helpers from the existing benchmark; only its final diagnostic block executes.

Run from the repository root:

```sh
node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/review-benchmark/loader.mjs scripts/review-benchmark/bench.mjs --counts
node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/review-benchmark/loader.mjs scripts/review-benchmark/bench.mjs
node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/review-benchmark/loader.mjs docs/measurements/f1-second-opinion/scheduling-diagnostic.mjs
```

Outputs are preserved console streams, not strict JSON Lines. Raw timing trials are retained. The diagnostic first warms Low Light normally, suppresses `mixSegment` on that scratch engine, warms another second and measures five renders. It retains scheduling and action execution but changes voice evolution, so its result is not an exact additive decomposition of the real renderer's cost.

Focused verification: 8 files, 87 tests passed using:

```sh
npm test -- src/core/engine/automation.test.ts src/core/engine/automation-perf.test.ts src/core/engine/automation-audio.test.ts src/core/engine/automation-slots.test.ts src/core/engine/held-notes.test.ts src/core/engine/note-graph.test.ts src/core/engine/tempo.test.ts src/core/engine/send-invalidation.test.ts
```

Interpretation and limitations are in the [second opinion](../../archive/2026-10-perf-library/ASSESSMENT-review-critical-F1-second-opinion.md). No browser deadline measurement or post-fix performance result was produced.
