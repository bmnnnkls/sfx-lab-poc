---
status: historical
date: 2026-10-18
---
# Second opinion on notes automation performance

Date: 2026-10-18. Branch: `codex/performance-and-library`. Assessed commit: `36f71d1dea37367d4f1a0f4a18f1d4c17a19e9ec`.

**F1 remains a confirmed High/P1 merge blocker. I agree with the first assessment's diagnosis and severity, but would strengthen its implementation recommendation: reducing note-scheduling overhead belongs in the first fix, alongside batching audio.** A fresh diagnostic shows that the existing scheduling path remains slower than real time on Low Light even with audio mixing suppressed. Separating the two timelines is necessary; retaining the current all-track per-sample scheduler is only a correctness milestone, not a credible completion criterion.

The [proposed implementation plan](PLAN-review-critical-F1-second-opinion.md) identifies three decisions for user review. No remediation or product-policy decision is approved by this assessment.

## What remains true on the current branch

The [first assessment](ASSESSMENT-review-critical-F1.md) examined `e3cf83d`. The current branch includes bounded review fixes in `36f71d1`. Comparing the engine paths shows that send topology invalidation has changed, while the F1 render switch, automation evaluator, track note scheduling and hardcoded helper timing remain. The [existing remediation plan](PLAN-review-remediation.md) correctly leaves R1/F1/F3 open. Its broader R3/F5 and final acceptance work remain separate blockers; resolving F1 will not alone make this branch merge-ready.

The decisive condition remains in [Engine.render](../../../src/core/engine/engine.ts#L224): an eligible notes lane while transport plays selects one-frame outer blocks. [EngineAutomation.noteLanes](../../../src/core/engine/automation.ts#L94) considers both playing and queued clips. Thus a queued lane can impose the cost before launch. Stored inactive clips alone do not activate it. Constant lanes, silence and muted tracks do not prevent it.

[renderBlock](../../../src/core/engine/engine.ts#L293) evaluates automation before scheduling notes. [mixSegment](../../../src/core/engine/engine.ts#L330) evaluates it again while collecting curves, then invokes every track and master at the selected segment size. The repeated work includes unrelated instruments, inserts, returns and tails. The preview and final output scan remain outside the outer loop.

The first assessment's corrections to the original review are sound:

- The eligibility getter scans configured owners and their playing/queued candidates, not every stored clip.
- Each automation tick constructs one next-state Map; curve collection contributes another Map per positive segment.
- Process-call multiplication does not mean every DSP operation or total CPU becomes exactly 128 times larger.
- Current evidence supports a severe capacity regression, not a measured universal worklet deadline failure or a security-critical defect.
- Caching eligibility and removing allocation alone cannot remove the global audio dispatch problem. `ParamFeed` cannot by itself give event-based note processors a sample-indexed parameter contract.

## Fresh verification

All measurements below used the clean assessed source tree, Apple M3 Pro, macOS ARM64, Node v24.21.0, 48 kHz and 128-frame output buffers. They are offline measurements. The existing repository benchmark was rerun rather than treating the previous report's numbers as new evidence. Raw output and the additional diagnostic source are in [the evidence directory](../../measurements/f1-second-opinion/README.md).

### Structural reproduction

Four simple instrument tracks, one active voice each, after warmup; counts cover one event-free 128-frame render.

| Operation | No lane | Mixer lane | Constant notes lane |
|---|---:|---:|---:|
| Whole render blocks / master calls | 1 | 1 | 128 |
| Automation ticks | 0 | 128 | 256 |
| Total track schedule calls | 4 | 4 | 512 |
| Total track mix calls | 4 | 4 | 512 |
| Map constructions | 4 | 133 | 896 |
| Float64Array constructions | 0 | 1 | 128 |

Disabled and empty notes lanes retained normal block processing. The queue probe reproduced `noteLanes === true` with no playing clip and a notes clip still queued. Send and notes-plus-send probes showed no gain-only order invalidation after warmup, supporting the distinction between fixed F2 behavior and unresolved F1. These constructor counts do not measure optimized heap allocation or GC pauses.

### Throughput reproduction

Five interleaved one-second trials per variant, after one second of warmup, in one fresh process. Values are median milliseconds per second of audio. The short focused test run overlapped the beginning of this benchmark; host contention was not controlled. Treat the size and direction of the regression as evidence, not small differences from prior runs.

| Workload | No lane | Mixer lane | Notes lane |
|---|---:|---:|---:|
| 1 simple track | 3.14 | 25.92 | 146.42 |
| 4 simple tracks | 8.85 | 32.92 | 386.02 |
| 8 simple tracks | 15.96 | 40.57 | 685.23 |
| 16 simple tracks | 30.20 | 53.70 | 1304.99 |
| Low Light Drop | 127.93 | 152.04 | 4631.17 |

Low Light adds one constant notes lane to Stab in the shipped Drop scene, as in the first assessment; this is not a claim that the unmodified shipped example is already slow. The notes case is approximately 30.5 times its mixer comparison. This independently reproduces the severe regression on the current commit. One process suffices to corroborate the diagnosis; release acceptance should still use the planned repeated isolated runs.

### Additional scheduling diagnostic

In a separate process, construct the same Low Light notes case, render one second normally, replace that scratch engine's `mixSegment` method with a no-op, warm for another second, then time five one-second renders. Median: **1569.997 ms**, range **1504.279–1586.903 ms**.

This removes audio mixing, its automation curve pass and its clearing work, but leaves the outer one-frame loop, pre-scheduling automation tick, all-track scheduling, note processing and action execution. It deliberately produces invalid/silent audio and changes voice evolution; its timing is neither an exact cost decomposition nor a lower bound for a redesigned engine. It does establish that the unchanged scheduling machinery can consume more than a real-time budget even without the expensive audio passes. No benchmark or test process from this assessment overlapped this diagnostic.

This is the main addition to the first opinion. Its option A is the right architectural direction, but the conservative all-note-graphs-per-sample phase must be explicitly temporary. The final fix needs reusable note graph storage, compiled input adjacency and/or exact selective scheduling. Measurements should determine how far to go; a new general event planner is not yet justified.

### Correctness checks

Eight existing suites passed, **87/87 tests**: engine automation, automation performance, audio automation, automation slots, held notes, note graph, tempo and send invalidation. The performance-named test asserts audible/finite mixer automation; it does not enforce notes-lane call counts or latency. Passing tests therefore do not contradict F1.

No new browser deadline trace, full-suite run or production build is claimed. Source inspection and offline reproduction suffice for this assessment; production worklet evidence remains mandatory before declaring the eventual fix ready.

## Where the proposed fix needs tighter contracts

### Looking ahead must not change current audio

The current evaluator combines queue commitment, override release, lane evaluation, base restoration and writes. [writeAutomation](../../../src/core/engine/engine.ts#L525) either writes immediately or collects every destination into curves. Neither mode alone supports the proposed split: notes parameters must affect scheduling immediately, while future instrument/mixer values must remain deferred until their frame.

Use one effective-value evaluation per required sample, with explicit destination routing. Note writes go to the note runtime before that sample's events. Audio/mixer writes become curves or timed changes. Collect note actions without executing instrument note-ons/offs ahead of the audio cursor. Preserve source identities and stable same-frame ordering. Published status must describe completed rendering, not a partially planned future.

Audio one-shot release is a particular trap. Today [mixSegment](../../../src/core/engine/engine.ts#L340) discovers its end from the audio runtime and finishes its automation queue. A scheduler that evaluates an entire future block first would collect values beyond that end unless it also knows the lifecycle boundary. Plan only to a known boundary and resume there, or represent lifecycle state explicitly in planning. Do not solve this by performing a second automation pass.

### F3 is a semantic dependency

[NoteControlGraph](../../../src/core/instrument/note-control-graph.ts#L4) compiles at 48 kHz and processes one frame per scheduling call. [Smooth](../../../src/core/dsp/nodes/math/smooth.node.ts) derives its slew and exponential coefficients from that rate. Batching or selecting note schedules without addressing this changes helper progression again.

The proposed contract is actual elapsed render samples at the engine sample rate, including stopped live-note processing. An installed helper must not change speed because an unrelated lane starts or because the caller divides a render differently. Chained helpers need chronological sample semantics; multiplying one node's delta does not establish equivalent behavior for a chain. Helper reconfiguration currently also calls `process` on the previous helper: account for that path when preventing extra, unclocked state advancement and defining reset continuity.

Correcting this may audibly change existing projects that relied on the defect. Restoring block calls also restores the usual first-value sampling cadence of unrelated non-varying parameter sockets. Approve these behavior corrections explicitly; the broken renderer is not a universal audio golden reference. Keep explicit expected-event and helper-response assertions alongside live/offline parity checks.

### Optimize at a measured boundary

Retain sample precision where controls or generators require it. Cache topology and target metadata, reuse per-graph outputs and automation scratch, and avoid rebuilding empty structures for every track/sample. Stateful note effects and transitive track readers prevent a simplistic rule such as “only process tracks with incoming notes.” Outputs from pooled storage must remain valid until downstream readers and scheduled actions finish using them.

Start with storage/dispatch improvements under the existing semantics. If they cannot meet capacity targets after audio batching, selectively schedule the dependency closure or exact constant ranges. That expansion should return for design review because it changes scheduling complexity and invalidation obligations substantially.

## Recommendation

Approve a focused F1/F3 engine change, preserving the existing F2 fix and saved formats. First establish the timeline and helper contracts, then implement bounded scheduling plus block audio, and reduce note-side overhead before calling the work complete. Retain the first assessment's performance targets as proposed targets, subject to a named browser/device acceptance decision. Do not downsample controls, disable saved lanes or truncate tails to meet them.

The task has produced analysis, a proposed plan and measurement artifacts only. Existing assessments and the broader remediation plan remain unchanged.
