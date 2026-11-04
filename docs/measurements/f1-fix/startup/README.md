# Reviewed startup preparation — history and wrap-up

Latest status: [implementation report and decision review](../../../archive/2026-10-perf-library/REPORT-fix-F1-implementation-status.md).
Work wrapped at user request; F1 remains open. The sections below retain historical checkpoints.

The user explicitly approved C4 after the [exact-scheduling checkpoint](../quiet-final/README.md) failed unchanged
cold and later worklet gates. Approved contract: a separate throwaway engine before audible playback, actual-engine
voices/helpers/transport untouched, host/worklet readiness, measured delay/memory and unchanged capacity gates.

## Lifecycle and state contract

AudioHost suspends its context before creating the worklet. It sends initial commands once, then `prepare`, and
queues later commands until ready. The processor applies normal commands to the actual engine without rendering
it. Preparation replays initial commands into a separate Engine, exercises configured instruments/scene, playing,
stopped/live, release and readout paths, then drops its temporary references. Priming renders one second, 128 frames,
and a quarter-second of release on that temporary engine only. Decoded sample arrays are shared for read access;
no sample bytes are transferred again or altered. No scratch status/audio is published.

The processor returns zero output without advancing the actual engine until prepared. On ready, the host flushes
later queued commands, connects and resumes. Duplicate ready requests do not prime twice. A preparation error stays
failed; the host rejects startup and closes the suspended context. Normal status audio-time anchors begin with the
first actual quantum. Preparation changes first-use startup latency, as reviewed; it does not advance the user's
sample timeline, consume pending notes, alter installation scope, reset actual tails or modify saved formats.

The [Web Audio specification](https://webaudio.github.io/web-audio-api/) describes suspension stopping processing
and audio-clock progression. Context7 official-spec queries were used on 2026-10-18. Because the indexed text did
not settle every MessagePort detail, `../quiet-final/startup-probe.json` records an actual Chromium 156 probe:
messages/constructor run while suspended, process calls remain zero and currentTime remains zero. A running,
unconnected worklet **did** process, so disconnection alone is insufficient. This is named-browser evidence, not
an untested cross-browser claim.

## Verification so far

- Startup version: full 135-file / 1,738-test suite passed (`full-unit.txt`), before three read-only temporary-engine
  status calls were added. The later focused seven tests pass (`focused-with-status.txt`); final full verification
  follows stabilization.
- The processor fixtures assert no actual render during preparation, unchanged actual status and sample bytes,
  identical first output to an untouched reference at 8/48/96 kHz and chunks 1/97/128/173, expected first live pitch,
  source/channel/id, matching transformed off, duplicate readiness and permanent failure guard.
- Host fixtures assert suspension/queue/ready/connect/resume order, actual ArrayBuffer transfer exactly once, queued
  later commands and failure cleanup. First-use sample ownership is also covered by the production audio suite,
  which must be rerun on the final startup source.
- An instrumentation-only test failure came from spying on both a prototype and inherited instance method: the
  test counted temporary-engine renders as actual renders. Context-based assertions corrected it; failed raw output
  is retained compressed (`focused-with-failure.txt.gz`), and `focused-corrected.txt` passed. No runtime fix or
  tolerance change was needed for that failure.

## Initial production probe (diagnostic, not acceptance)

`first-probe/`: ten wall seconds of steady Low Light plus constant notes. Native preparation was 243.497 ms; the
node-to-ready message took about 255 ms. Before/after preparation, actual rendered frames, noteBeat, transportBeat
and AudioContext.currentTime all stayed zero. First actual engine/callback durations were 1.544/2.128 ms, versus
6.544/7.505 ms at the preceding checkpoint. Engine p99 was 1.146 ms. One later callback still took 2.949 ms; this
short diagnostic cannot pass a 60-second gate. It predates the three read-only temporary-engine status calls;
its own bundle/harness hashes identify that earlier diagnostic, not the final candidate.

The preparation bracket occurs while the audio clock is suspended. Its arithmetic duration exceeds a quantum;
it is startup latency, not a discarded actual-engine callback or an exclusion from playback deadline statistics.
Every actual engine/callback interval, including the first, remains in the acceptance window.

## Memory comparison / remaining work

`reference-directory.txt` points to a temporary reconstruction of the archived exact-scheduling checkpoint. Every
built JS hash matches its manifest (`reference-build-identity.json`). It is served on 4174; the prepared candidate
is served on 4173. `startup-memory.ts` measures the same full Low Light/Glass projects in separate serial browsers,
with two reference/candidate pairs. It samples whole-renderer RSS every 25 ms: DOM/runtime, actual and temporary
engines and allocator retention are included. Sampled maxima are lower bounds on true peak and are not live JS
heap measurements. Polling adds load, so these runs are not capacity or authoritative latency evidence.

Record final exact source/build, full verification, preparation latency/memory, and >=60-second plus full-arrangement
capacity before signoff. All failed maxima, p99 results and continuity limitations remain visible. F1/R1 are open;
C4 did not approve threshold changes, real-engine warmup, event caps, tail skipping, format changes or merge/push/deploy.


## Pure topology preparation follow-up

The first full prepared run (`constant/`, exact `candidate-source/` snapshot) rendered 64.715 audio seconds with
engine p99 1.246 ms / max 2.456 ms and zero engine overruns. Its first callback still took 2.731 ms, a retained
0.064 ms miss. `continuous/` completed on the same source. The remaining queue was deliberately interrupted during
Low Light to move pure topology/cache compilation into preparation; the incomplete arrangement is not acceptance.
Rebuilding restores the timing shim after interruption. Both completed reports and interrupted logs remain intact.

`Engine.prepareTopology()` only compiles scheduling/component/mixing orders, zero routing buffers and mute/solo
routing metadata. It does not schedule events, evaluate lanes, process helpers or render DSP. Later commands retain
ordinary invalidation. The processor invokes it while suspended after temporary-engine priming. First-note/output
and unchanged-status assertions cover this addition. This is configuration work within C4, not actual-engine warmup.


## C5 clock/status review — 2026-10-19

The completed pre-split campaign in `final/` retained a first-callback miss: constant notes rendered 64.736 audio
seconds, engine p99/max 1.200/2.474 ms, callback p99/max 1.232/2.804 ms (one miss). Native thread-clock diagnostics
show 2.200 ms CPU and 0.604 ms not executing on that thread; the wall deadline still failed. Continuous notes
(64.736 audio seconds) and the full Low Light arrangement (119.744) passed measured engine/callback gates. Glass
was not run on that checkpoint. A STOP marker preserved completed captures before further source changes.

A five-second diagnostic (`status-diagnostic/`) measured two first-quantum full status assemblies at 0.072/0.048 ms.
The user approved a compact tempo/playing/beat/audio-time anchor at quantum start, followed by full status at quantum
end and the existing 30 Hz cadence. Recording retains both anchor types; only full status reaches UI listeners.
Readouts may arrive one quantum later (2.667 ms at 48 kHz/128). There is no real-engine warmup, callback exclusion,
saved-format change or threshold relaxation. The full suite on this split passes 135 files / 1,742 tests
(`clock-split-unit.txt`), including immediate recording anchors and one full snapshot per clock-change quantum.
`clock-source/` identifies the frozen source and bundles for the new `clock-final/` campaign.

The host also restores its unknown-packet guard. Earlier C4 capacity runs sent measurement extension packets to UI
status listeners; those earlier results are retained with that limitation, rather than used as final-source signoff.
The new campaign includes the guard. A strict measurement-script check initially needed TypeScript 7's explicit
`--ignoreConfig` flag; the failed invocation is retained, with the corrected result recorded separately.

The final pre-split topology-memory pairs in `final-memory/` sampled renderer peak RSS (MiB): Low Light reference /
prepared 210.98/210.31 and 213.56/221.64; Glass 189.08/207.91 and 191.20/197.77. Deltas range from -0.67 to +18.83 MiB.
These variable sampled whole-renderer maxima include allocator retention and polling; they cannot establish a precise
live-heap cost. The page response hook returned no worklet bundle requests, so the served-build manifests, not that
empty response map, identify the compared builds. These pairs precede C5 and do not claim exact final-build identity.


## Final production verification and outstanding review

The C5 source passes all 1,742 unit/architecture tests, typecheck/production build and all 21 smoke tests.
The first audio run passed 12/13: the held-note fixture injected raw commands at worklet construction, bypassing
AudioHost's startup queue, so notes could overtake the queued Stop. The fixture now exposes its raw command function
only after the first real full status. All 13 complete-window audio tests pass on rerun (`clock-audio-ready.txt`),
including held/sustained notes and generated-event cancellation. The original failed log/trace/screenshot remain in
`held-readiness-failure/`. No capture window, tolerance, audio expectation or runtime command path was weakened.

The completed [C5 production campaign](clock-final/README.md) passes all engine p99/deadline gates and three of four
whole-callback scenarios, including both full arrangements. Constant notes still have a first-callback miss at
3.265 ms. F1/R1 remain open. `clock-identity-check.json` verifies all production files/bundles and each archived
harness/report hash; later changes are confined to the audio fixture readiness and an opt-in measurement diagnostic.

C6 measurement placement is pending user review. The existing hook installs an own `render` method on the actual
Engine, changing its object shape while the temporary priming Engine retains the prototype method. An opt-in
`CAPACITY_PROTOTYPE_HOOK=1` diagnostic instead wraps the prototype and filters to the actual Engine; preparation
renders are never counted as playback. Callback brackets, bounded full-window sample scans and all first callbacks
remain unchanged. Two serial ten-second A/B pairs (`hook-instance.*`, `hook-prototype.*`, snapshot `hook-source/`)
measured instance-hook callback maxima 2.554/2.775 ms and prototype-hook maxima 1.749/1.805 ms. First callbacks still
varied. This suggests an observer effect but does not prove causation, meet the duration gate or erase the C5 failure.
The proposed full rerun with prototype placement awaits review; the default hook remains unchanged.
One attempted A/B invocation failed before capture because its preview server was not running; the failed console
is retained in a `hook-instance.*` directory without a report, and is not included in the two complete pairs.

Measurement scripts pass strict TypeScript using ESNext/bundler resolution (`hook-measurement-typecheck.txt`).
The failed NodeNext-resolution invocation is retained; repository extensionless imports require bundler resolution.
No production source changed during or after the final capacity campaign.


## Wrap-up at user request — 2026-10-19

See [the final status/decision report](../../../archive/2026-10-perf-library/REPORT-fix-F1-implementation-status.md). C6 was not approved; no full
prototype-hook campaign or new profiling run was started. The latest four-process offline pairs
(`clock-baseline-1.txt`, `clock-candidate-1.txt`, `clock-baseline-2.txt`, `clock-candidate-2.txt`) pass all notes gates.
Low Light notes is 132.204/125.847 ms per audio-second, 1.003/1.000 times mixer. The one-track no-lane signal repeats:
3.252/3.334 baseline versus 4.133/4.320 candidate (+27.1/+29.6%). Investigation remains open, not dismissed as noise.

The already-running final RSS comparison completed before shutdown. In `clock-memory/`, Low Light reference/prepared
peak MiB are 211.69/227.12 and 212.36/226.52; Glass 192.38/206.44 and 191.48/207.33. Differences are +14.06–15.84 MiB.
`clock-memory/identity-check.json` verifies both served builds and the memory harness. Whole-renderer sampled-RSS
limitations described above still apply. Preview servers and all benchmark/capture sessions are stopped.
F1 remains open for the retained wall deadline failure and no-lane investigation. No gate exception or merge is approved.
