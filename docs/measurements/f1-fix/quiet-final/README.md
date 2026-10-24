# Quiet exact-scheduling checkpoint (before startup preparation)

User reported the competing projects/agents had finished. Benchmark/capacity processes ran serially, with the
explicit invalid overlap below retained. OS/background work is not assumed absent from that report or load averages.
This checkpoint **does not close F1**. C4 startup preparation was subsequently approved and is recorded separately
in [the startup campaign](../startup/README.md); do not attribute these numbers to that later source.

## Exact source and verification

`range-source/manifest.json` identifies 569 source/config files and built JS hashes. `source.tar.gz` preserves all
source, fixtures and scripts; `tracked-source.patch` contains the tracked code diff. Five range-capture bundle hashes
match that manifest (`range-source/measurement-identity-check.json`). HEAD alone is not candidate identity: changes
are uncommitted on `36f71d1dea37367d4f1a0f4a18f1d4c17a19e9ec`, `codex/performance-and-library`.

- Full unit/architecture suite: 134 files / 1,732 passed (`final-unit.txt`).
- Production build/typecheck: passed (`constant-range-build.txt`, `constant-range-typecheck.txt`).
- Production smoke: 21/21 passed (`final-smoke.txt`).
- Production real-output audio: 13/13 passed (`final-audio.txt`), including the notes/helper/filter fixture. Complete
  finite windows and the existing 0.00002 tolerance remain in use.
- Measurement scripts typechecked (`final-measurement-typecheck.txt`).
- `final-counts.txt`: constant notes/notes+send have one master pass, 128 ticks, interval track scheduling, no warmed
  Map/Float64Array construction and no gain-only routing invalidations. Genuine note actions can still split audio.
- Focused constant-range coverage: 116 passed (`constant-range-focused-2.txt`), including hidden step/return, wrap,
  full connected closure, generated children, ownership, helper clocks and mixed audio curves. The first focused
  attempt retained an outdated assertion expecting sample cadence for a constant lane; the closure fixture was made
  genuinely moving before the pass (`constant-range-focused.txt`).

## Offline capacity

48 kHz / 128 frames, Apple M3 Pro, Node v24.21.0; one audio-second warmup, five interleaved one-second trials per
variant. Serial order: archived baseline 1, candidate 1, archived baseline 2, candidate 2. Baseline imports come from
the unchanged 36f71d1 archive; cwd supplies current checkout git metadata only. Baseline hashes are independently
recorded in `../quiet-rerun/baseline-source.json`. Full raw variants/trials remain in `range-*-*.txt`.

| Workload | Notes ms/audio-sec, process 1 / 2 | Mixer ms/audio-sec, process 1 / 2 | Notes / mixer, process 1 / 2 |
|---|---:|---:|---:|
| simple1 | 12.326 / 12.893 | 10.388 / 10.744 | 1.187× / 1.200× |
| simple4 | 16.047 / 17.020 | 14.021 / 15.896 | 1.145× / 1.071× |
| simple8 | 24.953 / 25.537 | 21.569 / 22.061 | 1.157× / 1.158× |
| simple16 | 39.338 / 38.335 | 37.006 / 35.713 | 1.063× / 1.073× |
| LowLightDrop | 137.549 / 129.828 | 129.302 / 128.496 | 1.064× / 1.010× |

Every notes case passes <500 ms/audio-second and ≤2× mixer. Low Light's archived baseline notes took 4,311/4,402 ms
versus candidate 138/130 ms. No threshold, precision, tail, format or example reduction was accepted.

**No-lane investigation remains qualified.** The short interleaved one-track baseline/candidate medians were
3.394/3.974 and 3.239/4.327 ms/audio-second (>10% relative regressions). Other no-lane sizes and all mixer cases
avoid a repeated >10% regression. Longer isolated repeats (`plain-serial-*.json`: ten-second warmup, twenty ten-second
trials) produced baseline/candidate 3.374/3.148 and 3.332/3.921 ms/audio-second: mixed evidence, including one 17.7%
regression. Earlier longer diagnostics also varied. This establishes context sensitivity, not a proven JIT cause or
an unconditional no-lane regression pass. Preserve this risk; do not dismiss the adverse short benchmark. Initial
`plain-*.json` and `scaling.json` are characterization; a nearby script typecheck may have overlapped the initial
batch, so `plain-serial-*` are the clean follow-up. No throughput acceptance pair overlapped it.

## Production worklet capacity

Chromium 156.0.8078.4 production build, actual 48 kHz / 128 frames. Engine deadline 2.667 ms; p99 target 1.333 ms.
The full-window maxima and overruns below include startup. Native timestamp brackets cover Engine.render and the
whole callback; reports retain p50/p95/p99/max, GC overlap, overhead pairs, load and cold/warm distributions. All
five captures report no trace loss, nonfinite count zero and only 128-frame quanta. Raw traces remain compressed.

| Capture | Rendered audio sec | Engine p99 / max ms | Engine overruns | Callback p99 / max ms | Callback overruns |
|---|---:|---:|---:|---:|---:|
| [Discrete root + launch/stop/tempo/edits](range-moving-worklet/report.json) | 64.949 | 1.102 / 5.937 | 5 | 1.133 / 6.511 | 5 |
| [Continuous velocity + launch/stop/tempo/edits](range-continuous-worklet/report.json) | 64.960 | 1.236 / 8.831 | 1 | 1.300 / 9.489 | 1 |
| [Constant notes, steady Drop](range-constant-worklet/report.json) | 64.960 | 1.458 / 6.544 | 2 | 1.507 / 7.505 | 2 |
| [Full Low Light + edits/tails](range-low-arrangement/report.json) | 119.957 | 1.113 / 5.915 | 1 | 1.164 / 6.565 | 1 |
| [All Glass Rain scenes + edits/tails](range-glass-arrangement/report.json) | 309.984 | 1.054 / 5.895 | 2 | 1.098 / 5.999 | 3 |

**The unchanged worklet gate fails.** Constant-scene p99 exceeds 1.333 ms. Every capture includes deadline misses;
several have later misses as well as startup. Neither warm-only distributions nor CPU-time diagnostics replace wall
deadlines. `thread-clock-outliers.json` adds native thread clocks: e.g. the root fixture's 5.050 ms wall interval used
2.484 ms on-thread, whereas Glass Rain's 5.895 ms wall interval used 5.760 ms on-thread. Some misses include time not
executing; others are real CPU cost. The data does not identify all external causes. The first-render diagnostic
(`range-cold-diagnostic/`) retains method and V8 compile events; nested compilation durations must not be summed as
exclusive CPU cost. Its added instrumentation is not an acceptance run.

Arrangement reports record requested beats and longest patterns. Low Light traversed all eight 16-beat scenes;
Glass Rain traversed all six 64-beat scenes within 310 wall seconds. Each allows quantization guards and requests an
empty final scene during the last ten wall seconds, with effect tails still processed. No scene or example was shrunk.
Finite/peak/jump scanning is bounded and adds callback cost; it **does not prove absence of musical discontinuities**.
Real-output reference suites supply separate finite-window evidence, not a claim of full-arrangement waveform
parity or physical device underrun telemetry. Discontinuity signoff remains open with deadline acceptance.

## Scaling characterization

`scaling.json` / `scaling-console.txt`: one process, five .25-audio-second finite windows after .25-second warmup;
configuration cost is separate. Output-view dispatch is included, finite scanning is outside timing. This matrix is
not the named Low Light acceptance benchmark or a support guarantee. Selected medians (ms/audio-second):

- 32 tracks, 4 allocated/1 active voices per track, 1 lanes × 2 points, 0 inactive clips/track: 87.36.
- 4 tracks, 4 allocated/0 active voices per track, 1 lanes × 2 points, 0 inactive clips/track: 31.30.
- 4 tracks, 4 allocated/1 active voices per track, 1 lanes × 2 points, 0 inactive clips/track: 35.70.
- 4 tracks, 4 allocated/4 active voices per track, 1 lanes × 2 points, 0 inactive clips/track: 46.05.
- 4 tracks, 16 allocated/0 active voices per track, 1 lanes × 2 points, 0 inactive clips/track: 30.53.
- 4 tracks, 16 allocated/1 active voices per track, 1 lanes × 2 points, 0 inactive clips/track: 35.10.
- 4 tracks, 16 allocated/16 active voices per track, 1 lanes × 2 points, 0 inactive clips/track: 86.85.
- 4 tracks, 4 allocated/1 active voices per track, 1 lanes × 2 points, 0 inactive clips/track: 35.36.
- 4 tracks, 4 allocated/1 active voices per track, 1 lanes × 2048 points, 0 inactive clips/track: 34.64.
- 4 tracks, 4 allocated/1 active voices per track, 8 lanes × 2 points, 0 inactive clips/track: 116.18.
- 4 tracks, 4 allocated/1 active voices per track, 8 lanes × 2048 points, 0 inactive clips/track: 120.41.
- 4 tracks, 4 allocated/1 active voices per track, 64 lanes × 2 points, 0 inactive clips/track: 842.06.
- 4 tracks, 4 allocated/1 active voices per track, 64 lanes × 2048 points, 0 inactive clips/track: 972.68.
- 4 tracks, 4 allocated/1 active voices per track, 1 lanes × 2 points, 0 inactive clips/track: 34.17.
- 4 tracks, 4 allocated/1 active voices per track, 1 lanes × 2 points, 64 inactive clips/track: 67.07.
- 4 tracks, 4 allocated/1 active voices per track, 1 lanes × 2 points, 512 inactive clips/track: 41.38.

The high-lane case approaches/exceeds real-time cost; inactive-clip measurements are nonmonotonic. These single-process
stress results characterize limits and variability, not guarantees or evidence that more clips make playback cheaper.

## Preserved earlier/invalid runs

`baseline-process-*`/`candidate-process-*` and initial moving/arrangement captures measure component-only scheduling,
archived in `../quiet-rerun/c3-source/`. Low Light passed but small constant cases missed 2×, prompting the separately
approved constant-range expansion. Their values are not final range-candidate measurements.

`steady-overlap-invalid/` and interrupted `low-arrangement/` are invalid: an arrangement capture was accidentally
started before the steady process exited, immediately stopped, and both retained. The bundle was hash-verified
restored before continuing serially. `low-arrangement-valid/` is a complete earlier component-only run, including a
later deadline miss; it is not range-candidate evidence. Historical failed/noisy runs are never substituted for passes.

C1, C2, component C3, constant-range C3 and subsequent startup C4 were explicitly reviewed. The startup design was
approved after this checkpoint's failed worklet results: separate temporary-engine priming before audible playback,
with actual-engine state/clocks untouched and a readiness handshake. See the separate exact-source startup record.
F1/R1 remain open; no threshold relaxation, merge deferral, commit, merge, push or deployment is authorized.
