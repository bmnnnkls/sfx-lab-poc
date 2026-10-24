# Browser capacity report evidence

Captured 2026-10-18 on source commit `36f71d1dea37367d4f1a0f4a18f1d4c17a19e9ec`, Apple M3 Pro, macOS ARM64, Node v24.21.0. The worktree contained analysis/measurement documents; production source was unchanged.

Despite the directory name, these are **offline engine measurements**, not browser callback or underrun measurements. Their role is to distinguish unmodified project complexity from the additional F1 notes-lane regression.

`examples.mjs` renders scene 1 of the existing starter and every scene of both shipped examples. Each scene gets a fresh engine, two audio seconds of warmup and five successive one-second timed renders. At 48 kHz, each second is exactly 375 buffers of 128 frames. Output buffers are reused. Timing excludes engine construction, inventory, status generation and command/message transport. No other benchmark/test process was started by this task during the run; general host load was not controlled.

`examples.jsonl` preserves raw trials, scene medians, environment and source identity. Scene timing ranges in the report are ranges of medians. The short window does not cover full arrangements or long generative cycles. Active voices are a snapshot at the end, not maximum polyphony. Compiled DSP node records include all allocated voice stages plus global/shared/FX/master stages, including inactive slots; they exclude note processors and do not directly measure CPU load.

Reproduce from the repository root with installed dependencies:

```sh
node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/review-benchmark/loader.mjs docs/measurements/browser-capacity/examples.mjs
```

The [report](../../REPORT-browser-audio-capacity-and-rust-engine.md) also cites the earlier [F1 second-opinion measurements](../f1-second-opinion/README.md). No Rust/Wasm implementation, native host, new browser test or post-remediation performance result is claimed.
