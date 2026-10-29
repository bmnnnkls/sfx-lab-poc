---
status: partly-done
date: 2026-10-19
note: "Implemented; strict F1 acceptance not met and accepted as a demo limitation (docs/STATUS.md#accepted-limits)."
---
# Fix F1 notes automation performance

Date: 2026-10-18. Branch baseline: `36f71d1dea37367d4f1a0f4a18f1d4c17a19e9ec`.
Status: **Implementation and correctness verification complete; F1 acceptance remains open.** Work wrapped at the
user's request on 2026-10-19. See [implementation status and decision review](REPORT-fix-F1-implementation-status.md):
one retained first-callback failure, repeated no-lane overhead and unapproved C6 measurement proposal remain.

## Objective and scope

Remove the global one-frame audio rendering path triggered by notes-domain automation. Keep sample-accurate note/control behavior while rendering unrelated audio in blocks, and reduce note-scheduling overhead enough to meet the capacity gates below.

Implement this in the existing TypeScript engine. Include F3 helper timing because changing scheduling cadence without fixing its clock would change behavior again. Preserve the implemented F2 send-topology fix. Keep saved formats, the full example projects, existing tails and automation precision intact.

This is the execution plan for R1 in [the broader remediation plan](PLAN-review-remediation.md). It supersedes the implementation sequence in [the second-opinion proposal](PLAN-review-critical-F1-second-opinion.md), incorporating [the browser and Rust report](REPORT-browser-audio-capacity-and-rust-engine.md). The assessments remain evidence, and the broader plan still owns unrelated blockers and merge readiness.

Rust/Wasm, a native host, lighter default examples, new device promises, signature migration, general plugin hosting and deployment-policy changes are outside this fix.

## Evidence driving the design

- In the four-track constant-notes fixture, 128 output frames cause 128 render/master passes, 256 automation ticks, 512 track schedule calls, 896 Map constructions and 128 Float64Array constructions.
- Low Light Drop with an added constant notes lane took about 4,631 ms per audio second in the second-opinion run, versus 152 ms with a mixer lane.
- Suppressing audio mixing in a scratch engine still left about 1,570 ms per second of timeline processing. This invalid-audio diagnostic is not a cost decomposition or a performance prediction, but rules out assuming that unchanged note scheduling will be cheap enough after batching.
- Unmodified showcase scenes rendered in 74–134 ms per audio second in a separate offline run. Shrinking the examples is not a substitute for correcting F1.

Raw evidence: [F1 reproduction](../../measurements/f1-second-opinion/README.md) and [unmodified examples](../../measurements/browser-capacity/README.md). Production baseline and candidate traces now exist in the implementation record; cold-callback failures remain visible.

## Critical review checkpoints

The user requested review of critical decisions. Preparing this plan does not mark the following choices approved or authorize implementation by itself.

| Checkpoint | Concrete recommendation | Review consequence |
|---|---|---|
| C1 Playback semantics, before behavior changes | Advance installed dynamic note helpers by actual rendered samples at the engine rate, including stopped live-note processing. Restore normal block processing for unrelated DSP. Preserve existing helper installation scope and sample-accurate event ordering. | Projects relying on broken helper speed or incidental one-frame socket sampling may sound different. Document this correction; do not introduce a legacy mode or format migration without a separate decision. |
| C2 Performance acceptance, before final signoff | Use the existing M3 Pro and production Chromium path at 48 kHz as the initial measured reference, with the thresholds below and multi-rate correctness coverage. | This is a reference workload gate, not a universal browser/device guarantee. Confirm any additional mandatory browser/device targets; changes to thresholds require review. |
| C3 Design expansion, only if needed | First optimize storage and dispatch under a conservative sample-accurate note schedule. If that cannot meet the gates, present a measured proposal for exact selective scheduling. | Review the dependency/constant-range design before introducing it. Do not silently downsample, skip tails or weaken correctness to finish. |
| C4 Startup preparation, subsequently reviewed | Prime a separate throwaway engine while the audio context is suspended; add host/worklet readiness and compile pure topology caches without advancing the actual engine. | User approved after measured cold/deadline failures. Record startup delay and memory; retain every actual callback and unchanged capacity gates. |
| C5 Clock/status split, subsequently reviewed | Send a compact clock anchor at quantum start after clock changes, then full status at quantum end and the existing 30 Hz cadence. | User approved after a retained 2.804 ms first-callback miss. Preserve recording anchors; UI readouts may arrive one quantum later. No deadline exclusion or gate relaxation. |

Routine code organization, scratch-buffer implementation and test fixture details can proceed within the approved contracts. A persisted-format change, new compatibility mode, precision reduction, supported-scope reduction or proposed merge deferral returns for review.

## Runtime design

### Two cursors with one timing contract

Keep an outer audio block of at most `MAX_BLOCK_FRAMES`. Within it, a planning cursor evaluates notes and automation, while an audio cursor consumes the resulting actions and curves. Planning may move ahead of audio only inside a known-safe horizon.

For each required sample interval `[frame, frame + 1)`:

1. Commit due queue/lifecycle changes and release affected automation ownership.
2. Evaluate each effective automation target once, respecting overrides and wire ownership.
3. Apply note/helper values, advance helper state and process note graphs in dependency order.
4. Record immutable note actions with frame offsets; record audio/mixer values in curves.
5. At the audio cursor, apply due actions in the established same-frame order, then render until the next actual action or lifecycle boundary.

Transport follows its existing playing/stopped contract; the continuous note clock still advances for live notes while stopped. Do not replace the transport with a new integer-clock architecture in this fix. Freeze existing rounding conventions in tests, including the documented one-sample odd-chunk event allowance.

A note parameter changing without an audio action must not split every audio graph. A real note-on/off or clip lifecycle action may legitimately split a mix run. A queued notes lane must be handled at its launch boundary without forcing unrelated audio into one-frame calls before launch.

### Bound planning at audio lifecycle changes

Use the earliest of the outer block end, a scheduled audio clip start/stop/replacement, or a known one-shot end as the planning horizon. Render through that horizon, apply its transition, then resume planning from the resulting state. For newly started clips, determine their end from the newly applied state before planning further.

This preserves the existing distinction between musical ends for repitched clips and sample-position ends for unwarped clips. Base restoration must occur before the first tail sample after release. Do not pre-evaluate an entire block across an undiscovered one-shot end, or compensate by ticking automation twice.

### Separate writes and define storage lifetimes

Replace the current all-or-nothing `collecting` behavior with explicit destinations: note-runtime writes affect scheduling now; audio/mixer writes remain deferred until their frame. Looking ahead must not trigger voices, change current audio parameters or publish future status.

Compile target keys and note input adjacency on configuration/topology changes. Reuse ownership/evaluation maps, per-graph output storage, events and block-sized curves where their lifetimes allow. Carry restoration values explicitly; inactive targets must not inherit stale curve cells.

Curves remain valid through every subrun that consumes them. Note events remain valid through downstream tap readers and deferred actions. Reuse only after consumption. Bound curve storage by configured targets and block size. Preserve legitimate event bursts; do not introduce a silent event cap or drop note-offs when storage grows. If a new overload policy is needed, bring it to review.

## Implementation slices

Each slice is a reviewable unit. Keep focused tests with its implementation; do not commit permanently failing expectations. Slice boundaries describe delivery order, not a requirement to keep an intermediate renderer as a supported second engine.

### 1 Establish regression fixtures and measurement support

Primary surfaces: `src/core/engine/automation-perf.test.ts`, existing automation/ownership tests, `scripts/review-benchmark/`, and browser verification support.

- Add deterministic structural assertions for no-lane, mixer-only and constant notes-lane renders. Cover queued/playing/disabled/empty/overridden lanes and silent/muted owners.
- Add expected-event fixtures for same-frame automation and note transformations, transitive taps and generated events. Retain ownership identities in assertions rather than checking only output pitch.
- Define C1 helper step/chain fixtures and exact first-sample expectations before changing its implementation.
- Add an opt-in measurement path around engine render and the complete worklet callback. Use bounded recording/aggregation and account for measurement overhead; avoid per-quantum console or message traffic. Verify timer/trace availability in the actual worklet before selecting the mechanism.
- Capture the current production baseline, including status and graph-edit traffic. If direct timing is unavailable, record the limitation and propose an equivalent trace method rather than substituting Node averages.

Exit: reproducible before data, timing contract fixtures and reliable production capture. This work does not require deciding a whole-engine Rust migration.

### 2 Correct helper time and lifecycle

Primary surfaces: `src/core/instrument/note-control-graph.ts`, `src/core/engine/track-runtime.ts`, and focused helper tests.

- Pass the actual engine sample rate and elapsed render timeline into helper processing.
- Preserve chronological sample behavior through chained stateful helpers and helper-fed parameters.
- Advance installed helpers consistently when their lane is inactive, queued, disabled or overridden, and while transport is stopped. Do not broaden helper installation to unrelated graphs as part of this fix.
- Remove unintended state advancement caused by configuration-only calls. Preserve state for compatible updates; specify and test legitimate resets for structural changes.

Exit: equivalent elapsed-time responses at 8/44.1/48/96 kHz with caller chunks 1/97/128/173, correct wire ownership and expected note results. Keep C1's audible corrections explicit in fixtures and documentation.

### 3 Refactor automation evaluation and deferred output

Primary surfaces: `src/core/engine/automation.ts`, `engine.ts`, `track-runtime.ts`, and graph/mixer curve consumers.

- Separate queue/ownership transitions, effective-value evaluation and destination application.
- Evaluate active sample work once; retain an inert fast path when nothing needs evaluation.
- Precompute target metadata and reuse scratch storage with explicit reset boundaries.
- Route note/helper parameters immediately to scheduling, and instrument/insert/mixer/send/return/master values to deferred curves.
- Represent overrides, relaunch resets, lane deletion and base restoration at their correct frames.

Exit: no duplicate ticks, no future audio-state mutation, and correct curve values before/at/after ownership transitions. Keep the old outer one-frame switch until the replacement scheduling path is ready; removing it alone would regress note timing.

### 4 Integrate the bounded note timeline with block audio

Primary surfaces: `engine.ts`, `playable-track.ts`, `track-runtime.ts`, `audio-track-runtime.ts`, and automation curve indexing.

- Collect sample-indexed note actions in dependency order without executing future audio actions.
- Implement the lifecycle-bounded horizon described above. Prevent a zero-length horizon from causing a non-progressing loop.
- Render unrelated audio in runs between actions; pass correct curve offsets/slices to all consumers, including stereo send sinks.
- Commit completed state consistently for status, transport, offline bounce and subsequent commands.
- Remove the global notes-lane one-frame audio switch once the new path passes its timing fixtures.

Exit: one whole-mix/master call for an event-free constant-notes 128-frame fixture, preserved one-shot release and tails, and working mixed-domain automation. This milestone alone does not close F1.

### 5 Reduce note-side overhead and measure

Primary surfaces: `src/core/notefx/graph.ts`, track scheduling and automation/event scratch.

- Compile note-input adjacency instead of filtering connections per node/sample.
- Reuse idle graph outputs and avoid fresh empty arrays/maps/action closures where no event requires them.
- Suppress redundant scalar writes while preserving stateful advancement and ownership changes.
- Preserve both upstream sources and downstream readers in any dependency reasoning; generators can emit without a new input note.
- Measure the full engine after storage/dispatch changes. If capacity still fails, use C3 to review an exact selective schedule rather than expanding into a general planner without evidence.

Exit: structural and timing gates pass together. An unchanged all-track per-sample note schedule is acceptable only if measured to meet the final gates after these improvements.

### 6 Verify and record completion

Run focused checks during each slice. On the stabilized candidate, run the full unit/architecture suite, typecheck, production build, smoke and real-output audio suites through the existing package scripts. Browser wrappers already build; avoid concurrent wrappers competing for their preview port. Repeat checks only where subsequent changes warrant it.

Save raw measurements and exact source identity under `docs/measurements/f1-fix/`. Update `ARCHITECTURE.md`, the broader remediation record and `TASKS.md` with actual results, outstanding limitations and C1 behavior corrections. Keep historical evidence intact.

## Acceptance gates

| Gate | Required result |
|---|---|
| Structural cost | Event-free constant notes lane: one whole-mix/master pass per 128 frames, at most one required automation evaluation per sample, no fresh Map per idle note graph/sample and no one-element audio curve per target/sample in steady playback. Genuine events may split runs. |
| Routing integration | F2 gain-only send updates cause no order rebuilds after warmup; actual destination membership changes still invalidate correctly. |
| Timing and ownership | Launch/retrigger/stop/loop/one-shot boundaries; lane removal/edit and override restoration; helper-fed and direct controls; live/clip source/channel overlaps, sustain, panic, stealing, transformed offs, echo/arp children and transitive readers. Assert expected results independently of renderer parity. |
| Audio continuity | Mixed instrument/insert/mixer/send/return/master automation, stereo, tempo changes at 40/120/240 BPM, release tails and long/quiet delayed echoes. Muting does not authorize dropping needed state or tails. |
| Rate and partition correctness | 44.1/48/96 kHz engines, helper tests additionally at 8 kHz, caller chunks 1/97/128/173/large, offline scene/clip bounce and production worklet. Preserve complete finite capture windows and existing 0.00002 audio tolerance; use corrected expected behavior for C1 cases. |
| Offline capacity | Two independent processes; five interleaved trials per variant after warmup. Reproduce 1/4/8/16-track cases and Low Light Drop with no lane, mixer lane and constant notes lane. On the named M3 Pro: notes case below 500 ms/audio-second **and** within 2 times its mixer baseline. Investigate repeated no-lane/mixer regressions above 10%; do not dismiss them without evidence. |
| Worklet capacity | At least 60 seconds per representative scenario, including moving notes automation and launch/stop/tempo activity. Record actual rate/quantum and engine plus whole-callback p50/p95/p99/max. Engine p99 below half the quantum interval; no observed over-budget engine or measured whole-callback durations, or output discontinuities. At 128/48 kHz, half the quantum is 1.333 ms. Diagnose instrumentation/load outliers rather than deleting them. |
| Sustained behavior | Full showcase arrangements and extended Glass Rain generation with editing/status traffic, startup/cold versus warm playback and tails. Document elapsed test duration and workload; the 60-second check is a minimum diagnostic, not full musical coverage or a hard-real-time guarantee. |

Separately probe 32 tracks, increased active/inactive voices, 1/8/64 lanes, 2/2048 points and many inactive clips to characterize scaling. These stress sizes are measurements, not universal support promises. Absolute timing gates belong in named-device evidence, while deterministic operation counts belong in regular tests.

## Completion and rollback

- [x] C1 semantic contract reviewed and recorded (user approved in implementation chat).
- [x] Regression fixtures and production baseline captured.
- [x] Helper clock/lifecycle corrected; multi-rate/partition and configuration fixtures pass.
- [x] Single automation evaluation and deferred writes implemented.
- [x] Bounded note timeline and block audio integrated; structural and one-shot/tail fixtures pass.
- [x] Note-side storage/dispatch optimized; component and constant-range C3 expansions reviewed and implemented.
- [x] C4 startup preparation reviewed and implemented; actual-clock/ownership fixtures pass at 8/44.1/48/96 kHz.
- [x] C5 compact clock/full-status split reviewed and implemented; recording and snapshot-count fixtures pass.
- [ ] C2 target matrix and all acceptance evidence recorded.
- [x] Full unit/architecture, typecheck/build, smoke and audio verification passes on the final production source (capacity acceptance remains separate).
- [x] Architecture, task status and remediation evidence updated; wrap-up report preserves open gates and decision status.

Use coherent, reviewable changes so engine remediation can be reverted without a data migration. A revert restores the known F1 defect and reopens its merge blocker; it is not an acceptable release workaround. Do not ship a second legacy scheduling mode merely to simplify rollback.

F1 is complete only when the structural defect, note-side capacity and correctness gates all pass. Close F3 with its own clock/lifecycle evidence and revalidate F2 integration. F5 and other branch-level work remain separate; this plan neither approves a merge nor accepts their deferral.

## Implementation checkpoint — 2026-10-18

C1 and C2 were explicitly approved in the implementation chat. C2's thresholds are unchanged. The conservative
all-note-track sample planner now renders unrelated audio in runs; automation has one evaluation pass, reusable
curves/ownership maps and immediate note writes. Helper chains use the actual engine rate/render samples, preserve
state on compatible configuration edits and no longer advance on configuration-only calls. Note adjacency, output
maps, idle event storage, target metadata and due-event ownership construction reduce storage/dispatch overhead.

The conservative schedule still missed the 2× ratio after quiet reruns. The user approved full note-tap component
scheduling, then separately approved an exact constant-range expansion after the quiet component candidate passed
Low Light but still missed the ratio on small fixtures. The implementation commits first-sample ownership/values
before interval processing and proves constant normalized controls over the whole planning horizon, including
intermediate points. Moving ranges, wraps that are not uniformly constant, queued ownership transitions and installed
clocked helpers retain sample cadence. Helpers and complete connected components keep their established event order.
No downsampling, event cap, tail skipping, format change or threshold exception was approved.

The exact evidence and final acceptance status are in [the implementation record](../../measurements/f1-fix/README.md).

F1 is not closed. F3 correctness is implemented with focused evidence; final integrated acceptance remains pending.
F2 gain-only topology behavior remains under regression coverage. Full examples, saved formats, mute policy, F5,
Rust/Wasm and unrelated work are unchanged. No merge/push/deploy is authorized.


## Startup preparation checkpoint

The user approved C4 after exact scheduling passed all offline cases but still missed cold and later worklet gates.
The host now suspends through a readiness handshake; a separate engine primes playing/stopped/live/release/readout
paths. The actual engine only compiles pure topology/routing metadata, never schedules/processes/renders during
preparation. Compatible note-graph scalar edits retain compiled orders; true rewires still invalidate. The latest
135-file / 1,740-test suite passes, including exact first-note/output/asset and clock preservation across four rates.
A ten-second diagnostic reduced first callback to 1.833 ms with no overruns, but is not 60-second acceptance.
Final offline processes pass every case (Low Light 131/133 ms/audio-second). Full sustained worklet and production
browser verification are recorded separately in [the startup evidence](../../measurements/f1-fix/startup/README.md).
F1 remains open while those unchanged gates are unresolved; neither C4 nor this checkpoint approves an exception.


## Wrap-up checkpoint — 2026-10-19

C5's approved compact clock/full-status split is implemented. All 1,742 unit tests, 21 production smoke and 13
real-output audio checks pass. Fresh offline pairs pass all notes gates; Low Light notes is 132/126 ms per audio-second.
All four sustained cases were captured on the exact C5 source. Engine gates pass; the constant-case callback still
misses at 3.265 ms. Both full arrangements pass measured callback gates. A repeated one-track no-lane regression
(+27/+30%, approximately +0.9–1.0 ms/audio-second) also remains unresolved. See the
[complete report](REPORT-fix-F1-implementation-status.md) for raw sources, tests, tradeoffs, failed attempts and remaining work.

C6 prototype-hook measurement remains unapproved. The user requested wrap-up instead of approving another full
campaign. No further experiment was started; all captures and preview servers have finished/stopped. F1/R1 remain
open without threshold or compatibility exceptions. This checkpoint does not authorize merge/push/deploy.
