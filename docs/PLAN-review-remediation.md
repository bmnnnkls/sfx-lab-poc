# Remediation plan: performance and library review

Date: 2026-10-18. Branch: `codex/performance-and-library`.
Status: **bounded remedies implemented and locally verified; R1/R3 and final acceptance remain open**.
Planning baseline: `23f1ff4` (consolidated review, assessments and diagnostic reproductions).

## Decision and acceptable state

**Hold merge pending F1/F2/F3 and F5 remediation and fresh verification.** The original
Critical label is not the basis of this decision: F1 is independently confirmed as a
High/P1 capacity regression, while missed browser deadlines remain unmeasured. The
coupled timing defects and unstable exchange signatures are sufficient to block merge.

An acceptable merge candidate must:

1. Preserve sample-accurate note/control ordering while rendering unrelated audio in
   blocks; eliminate gain-only routing rebuilds and make helper timing independent of
   engine sample rate and caller partition size.
2. Exchange saved assets deterministically across locales, with validated legacy import,
   atomic migration, retained originals and a recovery path for unsupported old data.
3. Pass the correctness, compatibility, structural-performance and real-worklet gates
   below on the final implementation. A unit-suite pass or an offline speedup alone is
   insufficient.
4. Record every remaining finding's disposition. The confirmed P2 items below can be
   separately reviewed follow-ups; this is a proposed risk acceptance, not an assertion
   that someone has already approved it. Close them before calling the full remediation
   complete. If no deferrals are accepted, complete them before merge as well.

The recommended delivery is **merge-safe core first**, followed by focused P2 fixes and
small hardening changes. No need to complete speculative DSP optimizations or change
intentional product contracts to reach an acceptable state.

## Evidence and scope

- [Original review](REVIEW-performance-and-library.md): candidate claims F1–F25;
  preserve it as historical evidence.
- [F1 assessment](ASSESSMENT-review-critical-F1.md): corrected trigger/cost model,
  structural counts, repeatable benchmark and scheduling alternatives.
- [F2–F25 assessment](ASSESSMENT-review-other-findings.md): qualified verdicts,
  reproduction results and compatibility constraints.
- [Diagnostic reproductions](tmp/claims.test.ts): observed pre-fix behavior, including
  defects. These are not desired-behavior regression tests.
- [Product specification](SPEC-performance-and-library.md), [original delivery plan](PLAN-performance-and-library.md)
  and [architecture](../ARCHITECTURE.md) remain the behavioral reference.

The source at this planning baseline is unchanged from implementation endpoint
`c52a08c`; subsequent changes are documentation and diagnostic fixtures. Targeted source
inspection confirms the global one-frame switch, duplicate automation evaluation and
hardcoded helper context are still present. This plan synthesizes the assessments; it
is not a new exhaustive review, security scan or benchmark run.

Historical evidence: 1,591 unit/architecture tests, typecheck/build, 17 smoke and 12
real-output checks passed during prior delivery. The assessments separately report 84
focused F1 tests and 90 focused other-finding tests. None verifies a future fix.

## Implementation sequence

Each slice should be independently reviewable. Keep the branch unmerged until all core
gates pass. Suggested responsibility names describe code ownership, not assigned people.

### R0 — Freeze regression fixtures and acceptance measurements

Owner: engine/verification. Dependency: none. Merge gate prerequisite.

- Promote useful diagnostic cases into the appropriate regression suites with expected
  corrected behavior. Preserve baseline observations separately; do not keep assertions
  requiring defects in the normal suite. Use red tests locally or land them with fixes
  so intermediate commits do not introduce a broken required gate.
- Turn the F1 appendix into a repository-relative repeatable benchmark and counter
  harness. Record commit, runtime, CPU, rate, warmup, repetitions and raw outputs.
- Establish production-browser baseline evidence on named hardware, browser and rates.
  Record the supported test matrix; at minimum exercise the existing Chromium production
  path, 44.1/48/96 kHz engine cases and the Low Light Drop workload at 48 kHz.
- Freeze helper semantics: stateful chains advance by actual elapsed samples at the
  engine rate, including installed helpers while another clip plays and stopped live
  notes. Existing broken Smooth output is not a golden reference.

Exit: durable failing-behavior fixtures, expected timing/ownership assertions, baseline
performance data and explicit measurement setup. Lack of browser instrumentation is
remaining work, not permission to substitute Node averages for callback timings.

### R1 — Separate the note timeline from audio rendering (F1 + F3)

Owner: engine. Dependencies: R0. Highest-risk slice; split into reviewable commits.
Primary surfaces: `core/engine/{engine,automation,track-runtime}`, note-control graph,
notes graph scheduling and automation curve consumers.

1. Separate queue commitment, effective automation evaluation and destination writes.
   Evaluate each scheduled sample once, apply note parameters before that sample's
   input/generated notes, and collect audio/mixer values into reusable curves. Restore
   bases and ownership at exact release/launch/stop/delete boundaries.
2. Use the real sample rate and timeline for helper chains. Preserve chained state,
   wire ownership, tempo and stopped live-note behavior; multiplying one Smooth delta
   without defining the entire chain's progression is insufficient.
3. Retain up-to-128-frame outer audio blocks. Collect sample-indexed note actions in
   dependency order, then render runs split at actual note/audio lifecycle boundaries.
   Do not let looking ahead mutate audio state before its frame. Preserve stable
   same-frame off/on ordering and transitive note taps.
4. Slice curves correctly for every run. Schedule audio clip one-shot completion and
   lane release at their exact end, rather than discovering release after a later mix.
   Cover instrument/insert/send/return/master automation together.
5. Reuse bounded events, target keys, adjacency, ownership maps and curve buffers with
   explicit lifetimes. Cache eligibility only with invalidation for queue/launch/edit/
   stop changes. A first implementation may schedule all note graphs per sample, but
   must then satisfy the final allocation and throughput gates.

Do not downsample automation, silently disable saved lanes/helpers, skip tails or use
only incoming note events to advance generators. Restore documented block-rate socket
behavior for unrelated graphs deliberately; the current one-frame path can itself
change that behavior. Test corrected semantics rather than demand identical output
from every historically broken case.

Exit: gate G1 below and focused real-output parity pass. If conservative note scheduling
remains too expensive, optimize the affected dependency closure or exact constant
ranges within this slice before declaring F1 resolved. Avoid a speculative full planner
rewrite unless measurements require it.

### R2 — Separate send topology from gain (F2)

Owner: engine/routing. Dependency: R0; integrate and verify with R1.
Primary surfaces: engine send writes/order caches, track sends, channel-strip curves.

- Track destination membership separately from gain values. Existing constant/ramping
  send levels must not invalidate schedule/mix order or rebuild mute/solo state.
- Retain a configured lane destination at zero where appropriate, or explicitly update
  membership at the exact first-use boundary. New/deleted returns and dependencies
  still invalidate the relevant caches.
- Verify base restoration, lane deletion/release, zero crossings, mute/solo gates,
  return chains and tails with and without notes lanes.

Exit: structural counters show zero gain-only order rebuilds after warmup, correct
invalidation for actual topology changes, and unchanged expected stereo routing.
F1 batching alone does not close F2.

### R3 — Version deterministic signatures and migrate safely (F5)

Owner: persistence/library. Dependency: R0 fixtures; independent of R1/R2 code.
Primary surfaces: preset asset signatures, portable clip shapes, project/catalog
parsers, strict payload validation, package and bundle readers/writers.

- Use a shared deterministic **UTF-16 code-unit ordering**, not locale collation, for
  compatibility canonicalization. Keep sample choices outside structural identity.
- First document a signature/format version strategy covering project revisions,
  catalog revisions, portable clip shapes, `.sfxlab` and `.sfxlib`. Recommended approach:
  explicit canonicalization version plus enclosing format bumps wherever old readers
  would otherwise silently normalize or misinterpret new data. Inspect all readers
  before choosing version numbers; do not assume an extra field alone forces rejection.
- Support bounded legacy interpretation: validate parsed old signature structure against
  its payload before canonicalizing. Permit only understood ordering differences; do
  not turn off strict comparison or accept forged fields as legacy.
- Portable clip signatures have no source graph: validate their serialized shape and
  preserve the index-to-node meaning of lanes during conversion. Ambiguous cases must
  stop with a useful diagnostic and recovery/re-export instructions.
- Preserve opaque revision IDs, references, all preset states, sample dependencies and
  immutable payload meaning. Back up persisted catalog state before conversion and
  publish atomically; failure leaves the original usable. Do not deduplicate revisions
  merely because the new compatibility strings coincide.
- Provide legacy fixtures and document recovery through an old compatible reader for
  data that cannot be migrated safely. Preserve input files and downloadable backups;
  application rollback after writing new formats requires restoring a compatible
  backup, not simply reverting the code.

Exit: old/new project, package, catalog and bundle round trips; cross-locale `ä/z`,
case/punctuation, nested-module and connection fixtures; compatible portable lane
insertion; preset recall; unchanged sample closure; forged/extra-field rejection;
atomic failure/rollback and explicit unsupported-version behavior. A comparator-only
patch cannot close F5.

### R4 — Focused correctness and responsiveness follow-ups

Owners: project/state, library/UI, MIDI. Dependencies: integrate after core changes;
F14 should build on R3's validation contracts. Each row is a separate reviewable change.

| Finding | Required change | Acceptance evidence |
|---|---|---|
| F10 | Remap snapshot routes during identity-preserving group/unlink, including shared definitions; keep immutable preset/revision semantics intact. | Root/nested/shared edits, unrelated owners, A/B compatibility, undo/redo, reload/package round trips. Already-stale routes retain diagnostics; recover through history/backups, never guessed names. |
| F11 | Carry owner context into clip sanitation and editor availability. Prefer retained inert lanes with explicit unsupported-owner diagnostics; preserve unavailable valid same-owner targets. | MIDI/audio clips and slots, duplicate owners, reload/packages and strict bundles; no cross-owner execution or automatic rebinding. |
| F14 | Index IDs, memoize ancestry/closure and avoid repeated shared-revision validation. Measure browser responsiveness before adding worker/yielding complexity. | Legal 1024-folder chain and shared revisions; operation-count scaling improves, duplicates/cycles/missing refs still reject, limits and stage/commit atomicity remain enforced. Record browser latency on named hardware. |
| F16 | Make cancellation/stale preview completion explicit and gate UI busy/message updates by operation ownership. | A canceled, B started, then A resolves/rejects; B status/audio remains owned by B. Current failures stay visible; close/unmount cleans up sources and contexts. No 192 kHz-specific workaround. |
| F18 | Suppress only the unresolved conflicting MIDI source tuple; preserve both sides of assignment ownership. | Unrelated device/channel/CC continues, held momentary release works, confirm/cancel does not unexpectedly move controls, notes/sustain/panic stay functional. |

Exit: all five confirmed issues fixed, or individual merge deferrals recorded with owner,
impact, workaround/limitation and target milestone. Deferral does not mark them resolved.

### R5 — Make verification enforce the decision (F23–F25)

Owner: verification/deployment. Dependency: R0; final run after R1–R4 as applicable.

- Recommended policy: make the real-output audio suite a required PR/main check, in
  addition to unit/architecture and smoke. Until that gate exists, require saved local
  audio results for the exact candidate commit. Scheduled-only coverage cannot enforce
  pre-merge correctness. Use isolated builds/ports, readiness and failure artifacts.
- Make tempo/Touch test orchestration depend on acknowledged render-frame/beat
  boundaries and retain a full post-edit capture window. Do not increase tolerances,
  accept missing frames or substitute silence for failed capture to obtain green CI.
- Restrict the test tap to the intended engine processor/context; exercise multiple
  nodes, disposal and recreated contexts. This is harness hardening, not evidence that
  current preview creates a second worklet.
- Recommended deployment policy: cancel obsolete PR verification; let an active main
  deployment finish and serialize subsequent deployments. Before publishing, ensure a
  queued artifact cannot overwrite a newer deployed revision. Keep branch/manual-event
  scoping, artifact identity and deployment permissions explicit. Verify the chosen
  concurrency behavior before editing the workflow; do not promise every pending push
  will deploy. Browser caching is optional, not a readiness requirement.

Exit: exact-candidate audio evidence is mandatory; workflow policy and failure recovery
are documented and exercised. If harness or deployment changes are deferred, record
that separately from the requirement to run the audio checks.

## Final acceptance gates

All thresholds below are **proposed project gates**, not measured post-fix results or
universal device guarantees. Adjust only through an explicit scope/measurement decision,
not after a failing run merely to make it pass.

### G1 — Correctness and structural cost

- For an event-free 128-frame render with a constant notes lane, unrelated audio/master
  processing stays block-sized rather than running 128 times. Real events may split
  runs. Automation is evaluated once per sample; no fresh Map per idle note graph per
  sample and no one-element audio curve per target per sample in steady playback.
- F2 gain-only updates cause no order rebuilds after warmup; destination changes still
  update dependencies before first use.
- Helper step/chain responses agree over equal elapsed time at 8/44.1/48/96 kHz and
  partitions 1/97/128/173. Exercise installed-but-inactive, queued, launched, stopped,
  overridden, disabled, empty and muted/no-sounding-note conditions.
- Assert expected note timing/pitch/ownership independently of parity: generated arp/
  echo notes, cross-track readers, equal-pitch source/channel overlap, sustain, panic,
  steals, topology edits, note-off identity after parameter changes and stopped input.
- Cover launch/loop/stop/one-shot boundaries, return/master slots and simultaneous
  curves, Touch/Read restoration, 40/120/240 BPM and mid-playback changes. Preserve
  release/effect tails, stereo sends and tempo-delay transitions.
- Compare both channels across live worklet, fresh offline engines, clip/scene bounce
  and uneven chunks. Keep the existing `0.00002` amplitude tolerance, complete nonempty
  finite capture windows and documented one-sample odd-chunk timing allowance.
  Matching two equally incorrect engines is not sufficient evidence.

### G2 — Capacity and real-time evidence

- Repeat F1's 1/4/8/16-track and Low Light Drop benchmarks in two independent processes,
  five interleaved trials per variant after warmup, with raw timings retained. Compare
  no-lane, mixer-only and notes cases on the same device/runtime/rate.
- On the assessment's M3 Pro environment, target Low Light constant-notes rendering
  within 2× its mixer baseline and below 500 ms/audio-second. Its historical notes
  median was about 4,300 ms/audio-second. For no-lane/mixer cases, investigate a median
  regression above 10% across repeated runs; do not conceal noise with a single trial.
- Profile actual production worklet callbacks for at least 60 seconds per representative
  scenario, including launches/stops/tempo edits. Report actual quantum size, p50/p95/
  p99/max engine-render duration, instrumentation overhead, allocation/GC observations
  where available, and capture continuity/underruns where observable.
- Target p99 below half the quantum interval (1.333 ms for 128 frames at 48 kHz), with
  no observed over-budget engine callbacks or output discontinuities in that window.
  Diagnose outliers. Node-derived callback averages are not browser measurements, and
  passing an observation window does not establish hard-real-time guarantees.
- Stress scaling separately: 1/4/8/16/32 tracks, inactive/active voices, 1/8/64 lanes,
  2/2048 points, inactive stored clips, note-reader chains and nonautomated tails.
  Record the measured capacity envelope; these sizes are probes, not a promise that
  every combination runs in real time.

### G3 — Saved-data safety and release evidence

- Complete R3's compatibility matrix and rollback tests; preserve sample/blob closure,
  revision identity, strict validation budgets and atomic storage. No automatic pruning.
- Run `npm test`, `npm run typecheck`, `npm run build`, `npm run test:smoke` and
  `npm run test:audio` on the final candidate. Build must remain warning-free. Existing
  browser wrappers build their own output; avoid concurrent runs sharing artifacts.
- Attach results to the candidate commit: environment, commands, counts, artifacts,
  compatibility fixtures, benchmark data, browser measurements and unresolved risks.
- Physical MIDI remains unverified. Assign a hardware check for permission, device
  selection, routing, sustain, disconnect/reconnect, conflict handling and timing/feel.
  It is required before claiming hardware validation; a merge may retain that explicit
  limitation if accepted. Do not let simulated ports imply a physical-device pass.
- Keep snapshot XY explicitly deferred; it is outside review remediation.

## Remaining finding dispositions

Together with R1–R5, this table accounts for every F1–F25 ID. Investigation items become
fixes only after evidence or an explicit product-contract decision.

| Finding | Disposition and bounded follow-up |
|---|---|
| F4 | Retain Read override lifetime until re-enable/launch/stop. Optional ownership feedback; momentary auto-release needs a separate contract decision and source-ownership tests. |
| F6 | Profile long quiet tails before claiming denormal CPU problems. If warranted, share a documented tiny-state flush threshold and verify low-level output/tail retention. |
| F7 | Optional allocation-free bounded anchor search; preserve prior-run rejection and stopped-run semantics. Test tempo/run boundaries before replacing lookup. |
| F8 | No fix: held identities are deliberately idempotent; adapters provide fresh press IDs. Retain source-isolation tests. |
| F9 | Seek a deterministic long-run/chunk/tempo boundary counterexample. If confirmed, design an integer frame clock with tempo origins; never tie stopped live notes solely to transport. |
| F12 | Add duplicate-owner repair warnings and ambiguous-reference diagnostics. Slash collisions already fail safely; no blanket ID rewrite/migration is justified. |
| F13 | No signature fix: samples intentionally vary within structural compatibility. Optional regression proving both presets' sample closure through exchange. |
| F15 | Add the memory adapter's next-version guard before publishing metadata/bytes; test atomic rejection and parity with IndexedDB. Small P3 change. |
| F17 | Retain old presets/revisions and their dependencies. Improve incompatibility/capacity diagnostics; cleanup must be explicit and preserve undo/other owners/export. |
| F19 | Fix empty-selection keyboard Copy/Cut as a no-op. Separately reproduce stale whole-array lane writes during Touch/recall and a drag; if reproduced, promote to P2 and use identity-based updater edits with defined same-lane conflict handling and one undo step per gesture. |
| F20 | Optional input-list equality check and stalled-close diagnostics. A timeout must not reopen the same port while its old close can still complete. Require unresolved/late/rejected-close and replacement-object tests before lifecycle changes. |
| F21 | Name/share quantization and gesture constants only where policies match. Keep Escape canceling learn/conflict while settings are closed. No behavioral fix. |
| F22 | Reconcile export selection with nontrashed catalog IDs, show hidden selection and clear controls; disable invalid scene insertion. Core range checks remain authoritative. |

P3 work can follow the P2 milestone; do not bundle speculative clock, ID or DSP redesigns
into the core scheduler repair. A reproduced data-loss or timing case reopens the merge
risk decision even if its original review ID was low priority.

## Completion tracking

- [ ] R0 baseline/fixtures and measurement setup recorded.
- [ ] R1 F1/F3 timing and scheduling remediation verified.
- [ ] R2 F2 topology/gain separation verified.
- [ ] R3 F5 versioning, migration and recovery verified.
- [ ] R4 F10/F11/F14/F16/F18 fixed or individually deferred for merge.
- [ ] R5 exact-candidate audio gate enforced; harness/deployment decisions recorded.
- [ ] G1/G2/G3 evidence attached to final candidate; hardware limitation explicit.
- [ ] Merge decision records remaining findings, responsible people and target milestones.
- [ ] Deferred P2 fixes completed before marking the remediation effort complete.

Rollback: engine/UI slices can be reverted as coherent changes, followed by re-running
relevant gates; reverting R1 restores the known merge-blocking defect. Migration rollback
must preserve/restore compatible saved data. Never treat a source-code revert as recovery
for an already-converted catalog. Preserve the original review and assessments, append
actual implementation evidence here, and update TASKS as each item closes.


## Bounded execution record — 2026-10-18

Executed in the existing checkout on `codex/performance-and-library`, based on `23f1ff4`, with the original
uncommitted plan/TASKS preserved. No branch switch, worktree, model change, subagent, merge, push or deployment.
Source and test changes remain uncommitted for review. [Measurements and validation](measurements/README.md)
record the tested source digest, raw runs, environment, limitations and reproduction commands.

- [x] R0 durable repository-relative benchmark/counters and focused corrected-behavior fixtures for this slice.
- [x] R2/F2 existing-send gains separated from destination membership; warm gain-only writes cause zero order/mix-state
  rebuilds. New zero destinations invalidate before mixing; removal invalidates; stereo ramp and mute/solo regressions pass.
- [x] F10 snapshot values remap through root/nested/shared group/unlink, with unrelated/stale values retained;
  preset/revision objects remain immutable. Recall/morph, history, reload and package regressions pass.
- [x] F11 owner context reaches MIDI/audio clip and slot sanitation. Foreign-owner lanes remain recoverable with
  explicit warnings and unavailable editor diagnostics, and compile inertly. Strict bundles refuse embedded
  project-owner clip automation; portable owner-relative lanes retain their existing validation.
- [x] F14 authorized format-neutral slice: record/module/sample indexes, memoized ancestry and identical-sound
  validation reuse. Legal 1024-folder chain, shared revision counts, duplicate/cycle/missing refs, strict repair
  rejection and existing budget/atomicity tests pass. Distinct sounds still instantiate independently.
- [x] F16 explicit canceled preview outcome and owning-operation guards for panel status/busy/catalog updates.
  Deferred read success/error and browser A-cancel/B-start/A-complete cases pass; current errors remain visible.
- [x] F18 conflict suppression scoped to its MIDI source tuple. Device/channel/CC independence, unrelated held
  momentary release, confirm/cancel, note/sustain/panic continuity pass with fake ports.
- [x] P3 F12 duplicate-owner repair/ambiguous-reference warning; F15 atomic memory version guard and IndexedDB parity;
  F19 empty keyboard Copy/Cut no-op; F22 stale checked/selected IDs, hidden selection/clear and invalid scene actions.
- [x] Full unit/architecture, typecheck/build, 21 production smoke and 12 real-output audio checks on this source slice.

The original R0/R2/R4 parent checkboxes remain open deliberately: full pre-remedy browser callback baselines,
helper time-base fixtures/semantics, post-R1 routing/scheduler integration and post-R3 exchange integration are pending.
No owner has accepted a merge deferral by this execution record. Current tests do not complete G1/G2/G3.
The measured notes-lane cost remains a merge blocker, not a newly introduced issue: 128 render blocks and 256
automation ticks per 128 frames; see raw counter/timing outputs. Browser folder review latency is an end-to-end
measurement, not an audio-callback deadline result. No hardware MIDI or browser/device matrix signoff was performed.

Reserved escalation remains R1/F1/F3 timing/scheduling/helper lifecycle, R3/F5 signature/version/legacy/migration/recovery,
F19 concurrent lane-edit ownership and R5 clock-aware harness/deployment policy. None was implemented or weakened.
No additional speculative redesign or rejected finding was promoted. Continue with the reserved stronger-reasoning
work, then rerun integration and final acceptance against its exact candidate. No overall merge-readiness claim.

## R1 implementation checkpoint — 2026-10-18

The [F1 execution plan](PLAN-fix-F1.md) now has a TypeScript implementation: bounded sample planning
with block audio; one effective automation pass with deferred audio curves; actual-rate/sample helper progression
and compatible-update continuity; compiled note adjacency and reused storage. Structural fixtures enforce one
master pass in an event-free 128-frame notes block, no idle graph Map allocation, and no duplicate sample evaluation.
F2 notes/send integration remains covered without altering topology/gain separation.

C1, C2 and the C3 component schedule were reviewed and approved. The component implementation retains sample
cadence for connected notes-automation/helper tracks and interval processing elsewhere. The separately approved exact constant-range
expansion passes every required offline case in two processes. Cold and some later worklet callbacks still fail the
unchanged wall deadline gate; full verification/sustained evidence is being recorded. Do not mark R1/F1 closed or relax G1–G3. F3's clock/lifecycle correction has focused
correctness evidence, with final integrated signoff still open. [Raw evidence/status](measurements/f1-fix/README.md)
records source identity, measurements and verification, including failed/overlapping runs and their disposition.
R3/F5, unrelated blockers, saved formats and mute/DSP-suspension work remain separate. No merge is authorized.


C4 was subsequently approved after the quiet exact-scheduling checkpoint failed worklet gates. A suspended-context
readiness phase primes a separate Engine and compiles only pure topology caches on the actual Engine. Actual clocks,
helpers, pending notes and assets remain unchanged; compatible note-graph edits retain cached orders. Four-rate state/
output fixtures and all 1,740 unit tests pass. Final offline processes pass all notes cases (Low Light 131/133 ms per
audio-second); first-use delay/RSS and sustained callback gates are in the separate [startup record](measurements/f1-fix/startup/README.md).
Do not close R1/F1 or substitute the short passing probe for full acceptance. No threshold change or merge is approved.


C5 was explicitly approved after the retained 2.804 ms first-callback miss: compact clock anchor at quantum start,
full readout/track status at quantum end and existing 30 Hz cadence. Recording consumes both; UI listeners only full
status, with at most one-quantum readout delay. The split passes all 1,742 unit tests. The new exact-source campaign
retains a constant-case first-callback failure rather than treating this design approval as acceptance. Final
sustained/browser checks and diagnosis remain in progress; G1–G3 are unchanged.


## R1 wrap-up — 2026-10-19

The user requested a status report, persisted learnings and decision review; see
[the implementation report](REPORT-fix-F1-implementation-status.md). Production correctness verification passes:
1,742 unit tests, build/typecheck, 21 smoke, 13 audio. Two new offline pairs pass all required notes cases.
Full C5 worklet captures pass engine p99/deadline gates and both complete arrangements, but constant notes retains
one 3.265 ms first-callback miss. One-track no-lane medians repeat a +27/+30% regression and remain unresolved.
C6 prototype-hook placement is an opt-in diagnostic proposal, not approved acceptance methodology; no full rerun
was started. C1–C5 approvals, tradeoffs, failed attempts and exact-source evidence are preserved in the report.
R1/F1 and G1–G3 signoff remain open. F2 integration and F3 correctness are verified within this slice; F5 and all
unrelated blockers remain separate. No thresholds, formats, examples, tails or merge policy were relaxed.
