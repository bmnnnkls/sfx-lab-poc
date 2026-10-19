# F1/F3 implementation evidence

Baseline: `36f71d1dea37367d4f1a0f4a18f1d4c17a19e9ec`, existing `codex/performance-and-library` checkout.
The preceding chat's planning documents, evidence and TASKS changes were already uncommitted and are preserved.

**Wrap-up status (2026-10-19):** [implementation report and decision review](../../REPORT-fix-F1-implementation-status.md).
The TypeScript implementation passes 1,742 unit tests, build/typecheck, 21 smoke and 13 real-output audio checks.
Fresh offline pairs pass every required notes gate. The [final production campaign](startup/clock-final/README.md)
passes all engine gates and three of four callback scenarios, but retains one 3.265 ms constant-case first callback.
A repeated one-track no-lane regression also remains under investigation. **F1 is open.** C6 prototype-hook
measurement is proposed, not approved; the user requested wrap-up, so no full rerun was started.
Startup/design history remains in [the startup record](startup/README.md) and the earlier [quiet checkpoint](quiet-final/README.md).

## Reviewed decisions

- C1: user approved the proposed actual-sample/actual-rate helper correction, stopped live-note progression, normal unrelated DSP block cadence, original installation scope and sample event ordering. No compatibility mode or format change.
- C2: user approved this Apple M3 Pro and production Chromium at 48 kHz, with the plan's unchanged thresholds and multi-rate correctness coverage. No additional target was requested.
- C3: initial conservative diagnostics were held after the user reported other machine work. Two subsequent quiet
  conservative runs still missed the 2× mixer ratio (443/452 versus 117/119 ms/audio-second), and the user approved
  full connected-component exact scheduling. That version passed Low Light but missed the ratio on small fixtures;
  the user then separately approved provably constant note-control ranges, with ownership/boundary splits and
  sample cadence for moving controls/helpers. Both expansions preserve full upstream/downstream closure, action
  order, generated events, tails, precision and saved formats. No threshold or compatibility exception was approved.

- C4: user approved startup preparation with a separate throwaway engine and a readiness handshake, actual-engine
  clocks/voices/helpers untouched, measured delay/memory and further work on warm DSP peaks. No callback exclusion
  or threshold relaxation was approved. See the separate startup campaign for exact source and results.

- C5: user approved compact clock anchors before rendering and full status after rendering, preserving recording
  anchors while UI readouts may lag one quantum. No actual callback is excluded; unchanged gates still apply.

## Baseline

- `baseline-counts.txt`, `baseline-timing.txt`: unchanged engine source; standard repository benchmark. Offline only.
- `baseline-build.txt`: production build of unchanged baseline source.
- `worklet-clock-probe.txt`: real worklet reports `performance: undefined`, rate 48000.
- `baseline-probe/`: short instrument-validation trace, not acceptance.
- `baseline-worklet/`: 60 wall seconds of production Low Light plus constant notes lane; normal 30 Hz status traffic and twelve tempo/master commands. F1 overload limited audio progression to 6,434 quanta (17.157 audio seconds); do not call this 60 audio seconds of musical coverage. Engine p99 13.617 ms, max 30.280; all 6,434 engine and callback intervals exceeded 2.667 ms. Full raw trace retained as gzip.

Production bundle hash before trace shim: `83c9e071df674d425dd8f9e9a224f9a22ff8c2024cf5dcc5f6f8124805784b84` (`engine-processor-BB_S4z-M.js`). Engine and callback brackets use native `console.timeStamp` trace events, not Date resolution or Node timing. The harness temporarily prepends a measurement shim to the built bundle and restores original bytes in `finally`; it does not change application source or ship instrumentation. It emits no per-quantum messages. 1,000 adjacent timestamp pairs measure probe overhead: p99 0.001 ms, baseline max 0.161 ms (retained outlier). Tracing itself also adds load; adjacent pairs do not measure all tracing overhead.

## Intermediate measurements

- `intermediate-counts.txt`: one master pass, <=128 evaluations, zero new Maps/Float64Arrays in a warmed event-free constant-note block. Not final acceptance.
- `intermediate-timing.txt`: overlapped browser baseline/other work; deliberately retained, unsuitable for capacity signoff.
- `conservative-isolated-timing.txt`, `conservative-source.json`: conservative all-track sample scheduler after storage/dispatch work. Five interleaved trials, one process, no simultaneous test/browser workload. Low Light remains above both capacity gates, triggering C3. No threshold relaxation is approved.

## Reproduction

Use the existing benchmark commands in `scripts/review-benchmark/README.md`. Production trace harness requires a built app and a preview server on port 4173:

```sh
npm run build
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
CAPACITY_SECONDS=60 CAPACITY_OUTPUT=docs/measurements/f1-fix/candidate-worklet node --experimental-transform-types --disable-warning=ExperimentalWarning --import ./scripts/review-benchmark/loader.mjs scripts/review-benchmark/worklet-capacity.ts
```

Run captures serially. The harness owns a temporary build shim, so do not rebuild or run another capture concurrently. `CAPACITY_SCENARIO=low-moving-notes` selects a moving lane; `glass` selects full Glass Rain. Reports distinguish engine/callback brackets and retain maxima/outliers. Source/build identity, actual quantum, output continuity and sustained musical coverage still require final candidate evidence.

F1/F3 remain open. F2 integration is under verification. F5 and the branch's other blockers remain separate. No merge, push or deployment is authorized.

## Historical conservative verification

- Conservative unit/architecture run: 131 files, 1,650 tests passed (`conservative-unit.txt`).
- Later full run: 130 files/1,649 tests passed; the worklet-shell test timed out during module import at its existing five-second limit (`candidate-unit.txt`). Smoke/browser work overlapped this run, and the user reports other machine loads. Retain the failure and rerun without changing the timeout; do not count it as a pass.
- Additional storage work after conservative timing: event identities are created only when an on/off is due; idle live/mapping storage and tap entries are reused; note adjacency and target metadata are compiled; equal note scalar writes are suppressed. These are storage/dispatch changes under the conservative schedule, not C3. They are not covered by the earlier capacity numbers.

## Historical stabilized conservative checkpoint

Source: `candidate-source/manifest.json` gives exact SHA-256 hashes for production sources, test/measurement sources,
configs and built JS; `source.tar.gz` retains the complete tree and `tracked-source.patch` the tracked code diff.
The commit alone is **not** the candidate identity: implementation remains uncommitted on `36f71d1`.
The archive includes the original historical benchmark and the extended TypeScript capture harness. `baseline-worklet/shim.js`
reproduces the timing-only shim used by the baseline; that baseline predates the extended harness, output scan and graph traffic.

| Verification | Result / evidence |
|---|---|
| Full unit and architecture suite after runtime changes and mixed-domain fixtures | 133 files, 1,722 tests passed (`final-unit-with-mixed.txt`) |
| Additional stopped-live helper cases | 20 focused tests passed, including four subsequently added live identity/transformed-off cases (`helper-live.txt`) |
| Typecheck | Passed (`final-typecheck.txt`) |
| Production build and smoke | Passed, 21/21 (`final-smoke.txt`) |
| Production real-output audio | Passed, 13/13 (`final-audio.txt`); includes new helper/notes + filter fixture, full finite windows and unchanged 0.00002 tolerance |
| Measurement TypeScript scripts | Typechecked (`measurement-scripts-typecheck.txt`); extended trace harness runtime/overhead validation still pending |
| Structural benchmark | `final-counts.txt`: notes and notes+send each have one master pass per event-free quantum, 128 ticks, no new Map/Float64Array constructors; no warm gain-only routing invalidations |
| Mixed-domain timing | 45 combinations across 44.1/48/96 kHz, 40/120/240 BPM and 1/97/128/173/large chunks (`mixed-timeline-corrected.txt`); explicit expected stereo values for patch/fx/volume/pan/send/return/master automation across note-action splits |
| Generated events / transitive readers | Exact expected pitch, beat, source/channel/id and route-child ownership; all 27 timeline cases pass after boundary correction (`timeline-generated-corrected.txt`) |

Earlier failed/diagnostic runs remain intact. `timeline-generated.txt` exposed a genuine floating-point boundary
ordering defect: an arp step could run just before its same-frame automation. Clip and generator/event queues now
share automation's 1e-10 beat tolerance; the correction preserves beat clocks/rounding and does not relax audio tolerance.
`mixed-timeline.txt` used an invalid one-voice expectation with multiple continuing DC voices; the corrected fixture
explicitly uses one voice and retains the independent expected stereo calculation. `audio-harness-title-error.txt`
records a duplicate test title, corrected before the suite passed. The worklet-shell import timeout from the overlapping
run passed unchanged on rerun (`timeline-and-shell.txt`) and in both subsequent full-suite runs.

## Final campaign and outstanding gates

See [quiet-final](quiet-final/README.md) for the current source snapshot, serial two-process offline measurements,
production traces, full verification and scaling/no-lane diagnostics. `quiet-rerun/` retains the earlier component
and conservative captures, source snapshots and load observations. Do not combine their timings as one candidate.

The final implementation commits first-sample automation ownership/value changes before interval scheduling. It
proves normalized controls constant over each lifecycle-bounded horizon using endpoints and intermediate points,
with a compiled uniform-lane shortcut. Nonuniform loop wraps and queued ownership transitions conservatively use
sample cadence, as do all components containing installed clocked helpers. Moving controls retain per-sample
scheduling. First-sample writes never use a future value, and no discarded render of the real engine was added.

F1 remains **open** while worklet deadline/continuity gates fail or lack evidence. F3's rate, stopped/live,
configuration, chain and ownership correctness is implemented and tested; R1's integrated capacity acceptance
remains open. F2 integration is covered. Full examples, formats, mute policy, F5 and unrelated blockers remain
separate. No commit, merge, push or deployment is authorized.
