# Bounded remediation evidence — 2026-10-18

This is local verification of the authorized bounded slice, **not merge readiness**.
Base HEAD: `23f1ff43b1dd6a96a5f7423985864d61b9d56002`, branch
`codex/performance-and-library`. Changes remain uncommitted. The original dirty plan
and TASKS edits were preserved. `source-manifest.json` identifies the delivered
source, tests, scripts and build configuration by SHA-256; documentation is excluded.
No format/signature migration, scheduler/helper redesign, workflow edit, deployment,
branch switch or worktree was performed.

## Validation

| Check | Result | Evidence |
|---|---|---|
| Full unit + architecture | 129 files, 1604 tests passed | `unit-final.log` |
| Additional final owner/package assertion | Passed; verifies retained inert lanes and warnings through package import | `owner-package-final.log` |
| Typecheck | Passed | `typecheck-final.log` |
| Production build | Passed in both browser wrappers | build output in `smoke-final.log`, `audio-final.log` |
| Production Chromium smoke | 21 passed, including four added browser regressions/measurements | `smoke-final.log` |
| Real-output audio | 12 passed | `audio-final.log` |
| Focused snapshot/library/MIDI regression run | 28 passed | `focused-final.log` |

The final owner/package assertion was added after the full suite; it was run separately
with typecheck. Production source was unchanged across these checks. Browser suites
used the existing production build/preview path, one Chromium worker, zero retries.
The first sandbox smoke attempt could not bind `127.0.0.1:4173` (`EPERM`); the authorized
outside-sandbox invocation passed. No approval was rejected. No tolerance, capture
window, readiness requirement, test orchestration or deployment policy was weakened.
Audio/tempo tests still require complete finite captures and their existing 0.00002
comparison tolerance. Hardware MIDI and other browser/device combinations are untested.

Focused coverage lives with the affected suites: `send-invalidation.test.ts`, preset
and owner-diagnostic tests, `validation-scaling.test.ts`, storage tests, library service
and fake-port MIDI tests, and the automation/library/bundle browser smoke files.
Historical `docs/tmp/claims.test.ts` assertions remain unchanged outside normal suites;
they describe pre-fix behavior and must not be used as post-fix acceptance tests.

## Measurements

Machine: Apple M3 Pro, macOS (`darwin`, arm64), Node v24.21.0. Production browser:
Chromium 156.0.8078.4. See [reproduction commands](../../scripts/review-benchmark/README.md).
Raw `.jsonl` files are preserved console streams from the appendix harness, including
its final pretty-printed summary and queue probes; not every line is a JSON object.
`current-library.jsonl` is strict JSON Lines. No results were filtered for favorable trials.

- `baseline-counts.jsonl` and `baseline-timing-1.jsonl` were captured before production
  source edits in this execution. The benchmark used a scratch engine: 48 kHz,
  128-frame buffers, one-second warmup, five alternating-order one-second trials.
- `current-counts-{44100,48000,96000}.jsonl` include base/mixer/notes/disabled/empty and
  send/notes-plus-send workloads. Gain-only sends have **zero** `invalidateOrder`,
  `sorted` and `updateMixState` calls after warmup (absent counter fields mean zero).
  The unit regression also verifies first-use zero membership, removal, restoration,
  stereo gain and mute/solo. Existing engine send/return/stereo/tail suites still pass.
- R1 remains unresolved: notes lanes show **128 render blocks, 256 automation ticks,
  896 Map and 128 Float64Array constructions per 128 frames** in the four-track notes
  case at all three engine rates. No helper-time-base behavior was changed.
- `current-timing-1.jsonl` and `current-timing-2.jsonl` are independent processes. Browser
  verification and other tooling overlapped portions of these runs, especially run 2;
  these are descriptive capacity measurements under uncontrolled host contention,
  not clean causal speed comparisons or acceptance thresholds.

Median milliseconds per exact 48,000-frame render, base / mixer / notes:

| Workload | Pre-edit | Current run 1 | Current run 2 |
|---|---|---|---|
| 1 track | 3.48 / 27.23 / 166.55 | 3.53 / 27.39 / 160.04 | 3.62 / 27.76 / 172.83 |
| 4 tracks | 8.56 / 30.58 / 355.86 | 8.14 / 31.84 / 363.47 | 8.94 / 33.67 / 391.07 |
| 8 tracks | 15.41 / 38.47 / 669.15 | 15.37 / 39.01 / 668.15 | 16.19 / 40.33 / 730.46 |
| 16 tracks | 29.85 / 51.94 / 1331.25 | 30.08 / 52.96 / 1329.11 | 35.75 / 59.10 / 1542.55 |
| Low Light Drop, scene 7 | 122.75 / 143.47 / 4230.98 | 126.94 / 153.92 / 4432.84 | 171.89 / 228.65 / 5740.82 |

No F1 performance improvement is claimed: that implementation was excluded. Offline
averages do not establish live worklet capacity or callback deadlines.

`current-library.jsonl`: one warmup and five raw trials per legal chain/shared-revision
case. Median folder validation times were approximately 0.21 ms (128), 0.32 ms (512)
and 0.65 ms (1024). The prior assessment reported a single 562 ms observation at 1024;
that historical observation used a different measurement setup and is not a controlled
speedup denominator. Regression counters require zero linear `folders.find` calls,
and identical sounds sharing one revision require one graph instantiation for 65 items.
Strict record sanitation still runs for every sound; distinct values/owners are checked
independently. Existing duplicate/cycle/missing-reference, budget and transaction tests
remain required.

`browser-folder-review.json`: a production 1023-folder chain reached enabled bundle
review in 832.99 ms on the machine/browser above. This includes file upload, staging,
validation, review rendering and polling. It measured review/cancel, not import commit,
frame delay, long tasks or worklet underruns; benchmark traffic overlapped the smoke
run. This is a first responsiveness observation, not an isolated before/after browser
benchmark. A full chain is 1023 here so a later import could add its independent root
within the 1024-folder destination budget.

## Outstanding acceptance and escalation

R0 is partial: durable baseline/counter harness and corrected-behavior fixtures for the
bounded fixes exist; pre-remedy production-browser deadline/underrun evidence, named
supported browser/device matrix and the reserved helper timing fixtures remain pending.
R2 is verified against the current engine; post-R1 timing/scheduling integration remains
pending. R4's bounded fixes are verified now; post-R1/R3 final integration remains open.
F14's exact-sound reuse is conservative; it does not share graph instantiation for distinct
sounds or introduce workers/yielding. Measure those remaining cases before extending it.

Reserved work remains R1/F1/F3 scheduling, helper time-base and event/curve lifecycle;
R3/F5 deterministic signatures, legacy/version/migration/recovery design; F19 concurrent
lane-edit ownership; R5 clock-aware browser harness and deployment concurrency/policy.
G1/G2/G3 final core signoff and hardware MIDI are excluded and incomplete. No final
merge deferrals were accepted here. No newly discovered issue justified expanding into
those designs. Re-run the focused and full gates after the reserved work, against its
exact candidate, before any merge decision.
