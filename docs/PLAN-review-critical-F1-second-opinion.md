# Proposed plan for notes automation remediation

Date: 2026-10-18. Baseline: `36f71d1`. Status: **historical proposal; no implementation started**.

The implementation sequence is superseded by [Fix F1 notes automation performance](PLAN-fix-F1.md),
which incorporates the browser/Rust analysis and carries forward the critical review checkpoints.
Retain this proposal as the rationale accompanying the second opinion.

This plan implements the [second opinion](ASSESSMENT-review-critical-F1-second-opinion.md) as a focused expansion of R1 in the [existing remediation plan](PLAN-review-remediation.md). It covers F1 and its F3 timing dependency, with integration checks for the already implemented F2 fix. It does not authorize unrelated signature migrations, deployment changes or merge deferrals.

## Decisions for review

| Decision | Recommended choice | Consequence and alternative |
|---|---|---|
| D1 Architecture and scope | Separate sample-accurate note/control scheduling from block audio; include note-side storage/dispatch optimization in F1/F3. | Medium-to-large engine refactor. A cache-only patch is smaller but leaves the core defect. Disabling notes automation would require a separately approved product restriction and saved-lane diagnostics. |
| D2 Playback compatibility | Correct helper time to actual elapsed samples at the engine rate and restore normal block behavior for unrelated DSP; preserve sample-accurate event ordering. | Existing projects exploiting wrong helper speed or incidental one-frame socket updates may sound different. Document the correction without a saved-format change. A legacy playback mode would expand scope and requires a separate design. |
| D3 Acceptance target | Use the current M3 Pro and production Chromium at 48 kHz as the initial measured release gate, plus multi-rate/chunk correctness tests; retain the thresholds below. | Establishes a named reference configuration, not a claim for all browsers/devices. Additional required devices/browsers must be named before final acceptance. Any threshold relaxation requires review. |

Approval of these decisions authorizes implementation of this slice, not merging the branch. Routine internal refactoring and test fixture details do not need repeated approval. Return for review if meeting the gates requires a general event planner, altered automation precision, a new playback compatibility mode, persisted-format changes, reduced supported scope or acceptance exceptions.

## Slice 1 Establish the timing contract and baseline

Responsibility: engine scheduling and verification. No prerequisite after D1–D3 approval.

Promote the reproduced structural defect into desired-behavior regression tests, landing tests with the relevant fix rather than leaving the branch red. Reuse the existing benchmark. Record the exact source revision, workload and raw timing data for isolated before/after runs. Add production-worklet measurement support and capture a baseline before changing the engine; record its overhead and observe actual quantum sizes.

Define the sequence for each frame: commit due lifecycle/queue changes and release ownership, evaluate effective automation, apply note/helper parameters, advance helpers and note processors in dependency order, collect actions, then apply actions and render audio at their frame. Existing event rounding and same-frame ordering remain the starting contract. Tests must specify the exact first-sample and boundary convention rather than silently adopting loop implementation details.

Fixtures cover direct notes parameters, helper chains, queued launch, stop/retrigger/loop wrap, overrides and base restoration, simultaneous audio/mixer curves, and audio one-shot release. Add helper responses at 8/44.1/48/96 kHz with partitions 1/97/128/173, including stopped transport and installed-but-inactive helpers. Test reconfiguration without unintended extra clock advancement; document which structural changes legitimately reset state.

Exit: concrete timing assertions, reproducible baseline and instrumented browser setup. Present any unresolved behavior choice before implementing it.

## Slice 2 Separate evaluation from destination writes

Primary surfaces: `src/core/engine/automation.ts`, `engine.ts`, `track-runtime.ts`, and `src/core/instrument/note-control-graph.ts`.

Separate queue/ownership transitions from effective-value evaluation and destination application. Compile stable keys and metadata on configuration changes. Evaluate once per required sample; route note writes to scheduling and audio/mixer writes to reusable curves. Carry base restoration as a timed value, including release inside a block. Inactive automation may skip evaluation when demonstrably inert; “once” means no duplicate evaluation, not mandatory ticks without work.

Pass the actual engine rate and render timeline into helpers. Preserve normal wire ownership and chronological state through helper chains. Define buffer lifetimes before pooling: curve storage survives all consumers of its block, and note events remain immutable until all readers/actions have consumed them.

Exit: tests show no future audio-state writes, no duplicate ticks, correct helper elapsed time and identical expected note transformations for stateless cases. Do not delete the global one-frame switch until the replacement scheduling and curve path is ready.

## Slice 3 Render audio in runs along the note timeline

Primary surfaces: engine render loop, playable-track scheduling, audio-track lifecycle and automation curve consumers.

Use outer blocks of at most 128 frames. Collect sample-indexed note actions in dependency order. Render audio in runs separated by actual note actions or audio lifecycle boundaries; a changing note parameter without an audio action must not split all audio graphs. Apply all same-frame actions in established order before rendering that frame.

Keep the planning horizon bounded. Determine upcoming audio start/stop/one-shot boundaries from current state and scheduled actions, or end planning at a boundary and resume after applying it. Evaluate automation releases at that boundary. Do not advance the real audio cursor or execute future instrument actions during planning.

Pass correct curve slices/offsets into every subrun, including send sinks, inserts, returns and master. Preserve the continuous note clock while transport is stopped. Maintain release/effect tails and F2's gain-only cache behavior.

Exit: a constant-lane event-free block has one whole-mix/master pass, while expected notes, mixed automation, one-shots and tails remain correct. This is an intermediate milestone; the existing scheduler is too costly to treat this alone as completion.

## Slice 4 Remove measured note scheduling overhead

Primary surfaces: `src/core/notefx/graph.ts`, track scheduling, automation scratch and event collection.

Compile input adjacency instead of filtering graph connections for every process call. Reuse per-graph output containers and idle-event storage, avoid duplicate scalar writes and avoid constructing empty action/curve collections on each sample. Retain source/channel identities, generated notes, ownership cleanup and transitive tap readers. Do not pool mutable events into deferred actions without a safe lifetime.

Measure Low Light and the synthetic workloads after these changes. If conservative scheduling still misses the agreed capacity targets, present a concrete proposal for scheduling only the affected dependency closure or exact constant ranges. Include upstream/downstream tap dependencies, internal generator wakeups, helper state, overrides, launches and graph-edit invalidation. No guessed control-rate downsampling.

Exit: structural allocation goals and throughput gates pass together with correctness. Schedule all-track-per-sample processing only as an interim implementation, never as an unmeasured final assumption.

## Slice 5 Validate the candidate and report residual risk

Run focused regression checks during implementation, then the full unit/architecture suite, typecheck, production build, smoke and real-output audio suites once the candidate stabilizes. Repeat affected checks after subsequent changes. Record exact candidate identity and raw measurements.

| Gate | Required evidence |
|---|---|
| Structure | Event-free constant notes lane: one whole-mix/master pass per 128 frames; no duplicated sample evaluation; no fresh Map per idle note graph/sample or one-element audio curve per lane/sample. Gain-only sends still cause no routing rebuilds after warmup. |
| Timing and ownership | Before/at/after queue, loop, stop and one-shot boundaries; expected pitch/timing independent of renderer parity; echoes/arpeggiators, transitive readers, held-note identity, sustain, panic and topology edits. |
| Automation and tails | Notes plus instrument/insert/mixer/send/return/master curves; overrides/restoration; tempo changes; stereo and long release/delay tails; helper chains and stopped live input. |
| Partition correctness | Fresh engines at 44.1/48/96 kHz, chunks 1/97/128/173/large, clip/scene bounces and production worklet. Preserve complete finite captures, existing 0.00002 amplitude tolerance and documented one-sample odd-chunk event allowance. Use explicit corrected expectations for D2 behavior changes. |
| Offline capacity | Two independent processes, five interleaved trials after warmup, same named device/runtime. Low Light notes target: below 500 ms/audio-second and within 2 times mixer baseline. Investigate repeated no-lane/mixer median regressions above 10%. |
| Worklet capacity | At least 60 seconds per representative scenario, including constant/moving notes automation and launches/stops/tempo changes. Capture actual quantum size and engine-render p50/p95/p99/max. Target p99 below half the quantum interval and no observed over-budget engine calls or output discontinuities; report capture/instrumentation overhead and GC/underrun evidence where observable. |

The 48 kHz, 128-frame p99 target is 1.333 ms. A timed engine call is not the complete browser audio-thread workload; report competing graph load and capture continuity as well. A clean finite observation window is evidence, not a hard-real-time guarantee.

Use broader track/polyphony/lane/point matrices to establish the capacity envelope, not as a promise that every combination is supported. Keep deterministic structural assertions in normal tests and device-dependent timing gates in recorded benchmark runs.

Exit: a reviewable implementation diff, updated architecture notes describing D2, reproducible measurements and remaining limitations. Report F1/F3 closure separately from the broader branch's R3/F5 and other outstanding acceptance work. User review remains necessary for merge readiness and any proposed deferral.
