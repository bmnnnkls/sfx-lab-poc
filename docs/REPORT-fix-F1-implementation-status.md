# F1 implementation status and decision review

Date: 2026-10-19. Existing checkout: `codex/performance-and-library`.
Measurement baseline: `36f71d1dea37367d4f1a0f4a18f1d4c17a19e9ec`. The implementation has since been
committed locally in the review groups listed below; archived dirty-source identities remain historical evidence.

**The TypeScript implementation is in place and correctness verification passes. F1 is not closed:** one measured
first callback still misses the unchanged deadline, and a repeated small no-lane regression needs further diagnosis.
Implementation work was wrapped up at the user's request. C6 is a proposal for review, not an approved measurement change.
No further capacity experiment or profiling run was started. The user subsequently authorized local commits;
no push, merge or deployment was performed.

This report covers execution of [PLAN-fix-F1](PLAN-fix-F1.md), including the interrupted implementation work and the
latest resumed session. Planning documents, historical evidence, existing TASKS edits and unrelated work are retained.
The full examples, saved formats and TypeScript implementation remain intact. Muted/solo-excluded DSP suspension,
Rust/Wasm, F5 signature work and unrelated branch blockers remain outside this fix.

## Initial plan: implemented versus remaining

| Plan slice | Status | Result |
|---|---|---|
| 1. Fixtures and production measurement | Implemented | Deterministic operation counts, independently expected events/audio, production traces, exact source/build archives and baseline comparisons. |
| 2. F3 helper clock/lifecycle | Implemented; correctness verified | Actual engine rate and rendered samples, including stopped live notes; compatible configuration retains state without advancing time. Original installation scope preserved. |
| 3. Automation evaluation/deferred output | Implemented; verified | One effective evaluation per required sample; immediate note writes, deferred audio/mixer curves, reused ownership/metadata/storage and explicit restoration. |
| 4. Bounded note timeline/block audio | Implemented; verified | Audio blocks of at most 128 frames, split at actual actions/lifecycle horizons; no global one-frame audio path triggered by notes automation. |
| 5. Note storage/dispatch and capacity | Implemented; offline notes gates pass | Compiled adjacency, reusable outputs/idle events, cached scalar writes, exact components and constant ranges. One-track no-lane overhead remains under investigation. |
| 6. Final verification/evidence/status | Correctness complete; capacity acceptance incomplete | 1,742 unit tests, build/typecheck, 21 smoke and 13 real-output audio tests pass. All four sustained cases captured; one callback deadline failure remains. |

F2 integration retains gain-only send updates without topology rebuilds; membership changes still invalidate.
F3's approved semantic correction has focused multi-rate/lifecycle and integrated audio evidence. Neither result
closes the combined R1/F1 capacity gate or the branch's separate merge blockers.

## What changed

The engine plans sample-accurate note/control work inside safe audio horizons, records immutable note actions and
renders audio between actual actions. Audio start/stop/replacement and one-shot ends bound lookahead so ownership
restoration happens before the first tail sample. Mixed instrument, insert, mixer, stereo send, return and master
curves remain aligned through every subrun.

Notes are scheduled by complete note-tap connected components, including upstream sources and transitive readers.
Only components with moving note automation or installed clocked helpers require sample cadence. Proven constant
controls use the established interval processors, with ownership/launch/wrap boundaries respected. Generators and
echoes continue processing; no event cap, downsampling or tail skipping was introduced.

Startup now uses a reviewed readiness phase while the AudioContext is suspended. A separate throwaway engine primes
configured code paths. The actual engine only compiles pure topology/routing metadata: it does not render, schedule,
tick automation or advance helper/transport clocks during preparation. The host queues later commands until ready;
sample buffers transfer once. Compatible note-graph parameter edits retain compiled orders; rewires invalidate them.

The latest runtime change is the approved clock/status split. A compact tempo/playing/beat/audio-time anchor is sent
at the start of a clock-change quantum. Full track/readout/peak status is built once at its end, then at the existing
30 Hz cadence. Recording consumes both anchors; UI listeners receive full status. UI readouts may arrive one quantum
later, 2.667 ms at 48 kHz/128 frames. Clock snapshots do not traverse readouts or reset peaks.

## Latest verification

| Check | Result and evidence |
|---|---|
| Unit/architecture | 135 files, 1,742 tests passed: [log](measurements/f1-fix/startup/clock-split-unit.txt). |
| Application typecheck/production build | Passed: [log](measurements/f1-fix/startup/clock-split-build.txt). Browser wrappers also rebuilt successfully. |
| Measurement TypeScript | Strict ESNext/bundler check passed: [log](measurements/f1-fix/startup/hook-measurement-typecheck.txt). Failed CLI/configuration attempts remain recorded. |
| Production smoke | 21 passed: [log](measurements/f1-fix/startup/clock-smoke.txt). |
| Production real-output audio | 13 passed: [log](measurements/f1-fix/startup/clock-audio-ready.txt). Complete capture windows and existing 0.00002 sample tolerance preserved. |
| Rates/partitions | Correctness fixtures cover 44.1/48/96 kHz, helpers/preparation additionally 8 kHz; caller chunks 1/97/128/173 and large renders. |
| Structural/F2 | Event-free notes block has one master pass; no idle per-graph/per-sample Map construction or one-element audio curves; no duplicate sample evaluation. Send membership/gain behavior remains covered. |

The first final audio attempt passed 12/13. Its held-note fixture exposed a raw worklet command function at
construction, bypassing AudioHost's startup queue. Injected notes could overtake the queued Stop and then be cleared.
The fixture now exposes that function only after the first real status, once queued startup commands have drained.
The full rerun passes, including held/sustained notes, transformed/generated events and panic. Runtime commands,
windows, tolerances and sound expectations were unchanged. The failed trace, screenshot and context are retained in
[held-readiness-failure](measurements/f1-fix/startup/held-readiness-failure/).

## Latest measured capacity

Reference: Apple M3 Pro, production Chromium 156.0.8078.4, 48 kHz, 128-frame quanta. These are named-workload results,
not a universal browser/device guarantee. Captures, tests, benchmarks and RSS polling ran serially.

Two fresh baseline/candidate pairs used separate processes and five interleaved trials per variant after warmup.
Times below are median milliseconds per audio-second; paired entries correspond to the two processes.

| Workload | Baseline notes | Candidate mixer | Candidate notes | Notes/mixer |
|---|---:|---:|---:|---:|
| 1 track | 159.46 / 155.14 | 11.24 / 10.86 | 13.30 / 12.93 | 1.18 / 1.19 |
| 4 tracks | 362.31 / 359.79 | 14.92 / 15.03 | 17.07 / 17.54 | 1.14 / 1.17 |
| 8 tracks | 663.93 / 699.38 | 24.94 / 24.05 | 33.40 / 23.43 | 1.34 / 0.97 |
| 16 tracks | 1,278.69 / 1,343.39 | 36.49 / 35.53 | 39.08 / 37.34 | 1.07 / 1.05 |
| Low Light Drop | 4,388.39 / 4,376.34 | 131.83 / 125.90 | 132.20 / 125.85 | 1.003 / 1.000 |

Every notes case passes both <500 ms/audio-second and ≤2× mixer gates. Raw files are
`measurements/f1-fix/startup/clock-{baseline,candidate}-{1,2}.txt`; baseline imports come from the verified original
archive, even though its metadata header runs from the current checkout.

The one-track **no-lane** case regressed from 3.252/3.334 to 4.133/4.320 ms/audio-second, +27.1%/+29.6%
(+0.881/+0.986 ms/audio-second). This repeated >10% signal remains unresolved. Earlier longer isolated trials were
mixed, so context sensitivity is documented but is not an explanation or clearance. Other final no-lane sizes did
not repeatedly exceed 10%; every final mixer case improved. No fresh profiling investigation was started after the
request to wrap up.

The full production campaign uses the original instance timing hook, including scanner/probe cost and every first
callback. The quantum budget is 2.667 ms; engine p99 must be below 1.333 ms.

| Scenario | Rendered audio seconds | Engine p99 / max ms | Whole callback p99 / max ms | Engine / callback misses |
|---|---:|---:|---:|---:|
| Constant notes | 64.731 | 1.161 / 2.459 | 1.192 / 3.265 | 0 / 1 |
| Continuously moving notes + interaction | 64.741 | 1.115 / 2.274 | 1.149 / 2.423 | 0 / 0 |
| Full Low Light arrangement | 119.739 | 1.010 / 2.329 | 1.051 / 2.643 | 0 / 0 |
| Full Glass Rain arrangement | 309.808 | 1.099 / 2.568 | 1.143 / 2.584 | 0 / 0 |

All engine gates pass; the constant case fails the whole-callback gate at the first callback. Its 3.265 ms wall time
contains 2.475 ms of thread CPU and 0.790 ms not executing on that thread, with no overlapping GC. This does not
identify the external cause or justify deleting the failure. There is no approved deadline exception.

All eight Low Light and six Glass Rain scenes were traversed, with editing/status traffic and final tail requests.
No nonfinite samples or trace loss were observed. Peak/jump scans across full windows cannot prove musical
continuity; the separate audio comparisons provide finite-window correctness evidence. Physical-device underrun
telemetry was not available. Full p50/p95/p99/max distributions and raw traces are in the
[campaign record](measurements/f1-fix/startup/clock-final/README.md).

Suspended preparation took 237–242 ms for Low Light variants and 163 ms for Glass Rain; node-to-ready times were
249–254 ms and 172 ms respectively. Actual frames/note beat/transport beat/audio time stayed zero throughout.
Two final sampled whole-renderer RSS pairs showed Low Light peaks +15.44/+14.16 MiB and Glass peaks +14.06/+15.84 MiB
over the archived pre-startup reference. These 25 ms samples include DOM/runtime/allocator retention and are lower
bounds on true peak, not exact live-heap costs. RSS runs are separate from timing. See
[memory identity and reports](measurements/f1-fix/startup/clock-memory/identity-check.json).

Scaling probes also exist for 32 tracks, voice counts, 1/8/64 lanes, 2/2,048 points and inactive clips in the
[earlier exact-scheduling record](measurements/f1-fix/quiet-final/README.md). High-lane stress approached real time;
those probes characterize limits and do not promise support at every stress size.

## What was tried and did not establish acceptance

| Attempt | Finding / disposition |
|---|---|
| Block audio plus conservative all-track sample scheduling | Removed the structural audio defect but notes scheduling was still too expensive. An early isolated Low Light diagnostic was ~1,732 versus 151 ms/audio-second mixer; quiet reruns were 443/452 versus 117/119, still failing 2×. |
| Exact connected components alone | Quiet Low Light improved to 153/147 ms/audio-second, about 1.2× mixer, but small constant-note cases still failed 2×. This led to the separately reviewed constant-range proof. |
| Exact ranges without startup preparation | Offline notes gates passed; cold worklet renders still took 3.9–8.8 ms, constant p99 reached 1.458 ms, and Glass had later overruns. |
| Initial separate-engine preparation | Reduced cold cost substantially, but a 2.731 ms first callback still missed. Short passing probes were diagnostics, not acceptance. |
| Pure topology preparation and compatible-edit cache retention | Pre-split full constant run still missed at 2.804 ms; continuous and Low Light passed. That campaign stopped before Glass; completed captures were retained. |
| Compact clock/full-status split | Correctness passes; the full final campaign passes three callback scenarios but retains the 3.265 ms constant first-callback miss. Variance prevents attributing the larger miss to the split. |
| Alternate hook placement, short A/B only | Instance-hook callback maxima 2.554/2.775 ms; prototype-hook 1.749/1.805 ms. Cold first timings varied. Suggestive observer effect, unproven cause and insufficient duration for acceptance. C6 remains unapproved. |

Noisy and accidentally overlapping captures, interrupted arrangements, a test-spy false positive, the original
held-note fixture failure and failed measurement-tool invocations remain in the evidence tree with their limitations.
They are not silently replaced by successful runs. Older C4 probes also predate restoration of the host's unknown
packet guard; measurement extension messages could reach UI status listeners. The final campaign includes that guard.

## Decisions for review

| Decision | Authorization | Tradeoff and current assessment |
|---|---|---|
| C1 actual-rate/sample helper correction; normal unrelated DSP blocks | Explicitly approved | Corrects broken helper speed and incidental one-frame socket cadence. Existing projects relying on those defects may sound different. Tests/documentation capture the correction; no legacy mode or migration. |
| C2 M3 Pro/production Chromium 48 kHz; unchanged thresholds | Explicitly approved | Multi-rate correctness is broader than the measured device target. No extra browser/device target or threshold exception was approved. Keep final failures visible. |
| C3 exact component schedule | Explicitly approved after quiet conservative failure | Adds dependency metadata and invalidation complexity. Full upstream/downstream closure, event order, generators and tails are covered. Offline result justifies the expansion. |
| C3 exact constant ranges | Separately explicitly approved | Adds proof/boundary logic; moving controls/helpers retain sample cadence. Independent event/timeline tests and capacity results support keeping it. |
| C4 separate-engine startup preparation/readiness | Explicitly approved | Adds ~0.17–0.25 s startup delay and temporary sampled RSS cost. Actual state/output preservation is verified. Pure topology caches and compatible-edit retention are implementation choices within this design, not real-engine warmup. Startup complexity should remain part of review because the strict deadline gate is still open. |
| C5 compact clock/full-status split | Explicitly approved | Preserves recording anchors; UI readouts can lag one quantum. Removes a redundant full snapshot, but does not by itself establish a callback pass. |
| C6 prototype measurement hook | Proposed; **not approved** | Avoids an own-method/object-shape change on the measured Engine. Available only as an opt-in diagnostic; default measurement remains the existing hook. User requested wrap-up instead of approving. Do not adopt as acceptance evidence without review and full reruns. |

The recommendation is to retain the implemented correctness fixes and measured scheduling gains for code review,
while leaving F1 open. Do not reinterpret any approval as a compatibility exception, threshold relaxation, tail
policy change or permission to merge. C6 concerns measurement validity and must be reviewed separately from changing
production behavior.

## Remaining work, in order

1. Review the implementation and the decision table, particularly C1's audible correction, C4's startup cost and
   whether to authorize C6. No C6 acceptance rerun has been started.
2. Diagnose the retained first-callback miss. If C6 is approved, run the complete ≥60-second and full-arrangement
   matrix with unchanged brackets/scans/first-callback inclusion, retaining both old and new evidence. If it fails,
   investigate actual startup work before proposing another behavior change.
3. Investigate the repeated one-track no-lane regression. Earlier longer diagnostics did not settle its cause;
   do not close it based on small absolute cost or assumed machine noise.
4. Revalidate affected correctness/build/browser checks after any production change, then record exact-source final
   acceptance. Only close F1/R1 when all required gates pass. Keep F5 and other merge blockers separate.

## Persisted evidence and practical learnings

- [Main evidence index](measurements/f1-fix/README.md), [startup history](measurements/f1-fix/startup/README.md),
  [final campaign](measurements/f1-fix/startup/clock-final/README.md) and raw logs preserve every stage and limitation.
- `clock-source/` archives the final campaign's exact source/configuration and original harness. `hook-source/`
  additionally captures the readiness fixture and opt-in A/B diagnostic. Production bundles match across both;
  [identity verification](measurements/f1-fix/startup/clock-identity-check.json) records the two nonproduction changes.
- `startup/wrap-source/` saves the final source/configuration archive and tracked patch. Its
  [wrap-up identity check](measurements/f1-fix/startup/wrap-identity-check.json) has zero source or bundle mismatches.
- Serial capture discipline matters: finish and restore each trace shim before another capture/build/test. Use a
  between-capture STOP marker instead of interrupting a batch when possible. Never poll memory during capacity work.
- Suspension, not disconnection alone, prevents processing during readiness. The actual Chromium probe confirmed
  message handling while suspended with no process calls or clock advance. Keep the processor's pre-ready guard.
- Separate correctness from throughput and deadline evidence. An offline speedup, a short probe, a p99 pass or
  off-thread time does not waive a single failed wall deadline. Likewise, trace finite/jump scans are not a musical
  discontinuity proof or physical-device underrun measurement.
- Instrumentation can affect receiver shape/JIT behavior; current A/B evidence warrants review, not an automatic
  explanation. Raw test commands also need readiness when they bypass the host's queue.

The plan, architecture, TASKS and remediation records link this status. All work remains local and reviewable.


## Local commit groups — 2026-10-19

The user authorized committing this work after the implementation wrap-up. The sequence separates the lower-level
changes and the coupled timing fix from startup behavior, evidence and the optional measurement experiment.
The final documentation commit updates the plan, architecture, TASKS and reports together.

| Commit | Review scope |
|---|---|
| `4d8474b` | Document F1 scheduling assessment and browser capacity baseline |
| `a3f8065` | Reuse idle note graph storage and compile input adjacency |
| `e141fc6` | Use the engine sample rate and preserve dynamic helper state |
| `672f640` | Render block audio around an exact bounded note timeline |
| `a820cd7` | Split sample-accurate clock anchors from full UI status |
| `b2cce3c` | Add reproducible F1 throughput and worklet capacity tools |
| `d84a40e` | Prepare a throwaway engine before resuming audible playback |
| `e1c5dce` | Add serial startup readiness, memory and capacity probes |
| `e65668b` | Preserve F1 baseline and exact-scheduling capacity evidence |
| `9b6ed9d` | Preserve startup and final production verification evidence |
| `52b370d` | Isolate the opt-in prototype timing-hook experiment |

Each code group was typechecked against its own staged tree. Focused staged-tree suites passed 50 storage tests,
43 helper/graph tests, 232 timeline/routing tests and two standalone clock tests. The startup group then passed the
full 135-file / 1,742-test unit/architecture suite. Measurement utilities passed their own strict TypeScript checks.
[Packaging verification](measurements/f1-fix/commit-packaging/verification.json) records those checks and confirms
that source, fixtures and raw evidence bytes were preserved. No new performance campaign was run to package commits.
Committing the opt-in C6 diagnostic does not approve it as acceptance methodology or close either outstanding F1 issue.
