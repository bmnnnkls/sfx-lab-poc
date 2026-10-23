# Focused F1 implementation correctness review

Date: 2026-10-19. Reviewed branch: `codex/performance-and-library`.
Reviewed HEAD: `b68f6c64fc40138f9ac11c89b4e26e17fc5926d0`.
Range: `36f71d1dea37367d4f1a0f4a18f1d4c17a19e9ec..b68f6c6` (12 commits).

## Actionable findings, ordered by severity

### CR1 — [P2] A newly launched curve overwrites a manual override before the launch sample

**Confirmed regression in the bounded timeline (`672f640`).** At
[engine.ts:666](/Users/niklaus.baumann/git/local/sfx-lab-poc/src/core/engine/engine.ts:666), a curve first written partway through a planning horizon initializes its preceding cells from the lane's authored `baseValue`. The forward fill at
[engine.ts:385](/Users/niklaus.baumann/git/local/sfx-lab-poc/src/core/engine/engine.ts:385) therefore substitutes that base for the target's actual effective value before launch. Planning has already evaluated the later ownership transition; splitting audio at the deferred clip action does not repair these earlier curve cells.

A supported interaction reaches this state: override a playing clip's volume, disable its volume lane (the compatible override remains), then launch another clip with a volume lane at the next bar. Retaining the override after disabling the lane is deliberate in `project-sync.ts`: compatible overrides survive ordinary project edits. Launch clears it at the boundary in
[automation.ts:80](/Users/niklaus.baumann/git/local/sfx-lab-poc/src/core/engine/automation.ts:80), which must not affect earlier samples.

Independent DC-signal reproduction: 44.1 kHz, 120 BPM, held live note feeding a constant 0.5 signal, authored volume 0.2, override 0.7, new lane value 0.4. Start the next 128-frame render at absolute frame 88,192; the bar/launch is at frame 88,200, eight samples later.

| Samples in that render | Independently expected | Current 128-frame render | Current one-frame renders | Baseline 128-frame render |
|---|---:|---:|---:|---:|
| 0–7, before launch | `tanh(0.5 × 0.7)` = 0.33637554 | **0.09966800** (`tanh(0.5 × 0.2)`) | 0.33637553 | 0.33637553 |
| 8 onward, after launch | `tanh(0.5 × 0.4)` = 0.19737532 | 0.19737533 | 0.19737533 | 0.19737533 |

Both baseline partitions pass the expected values. The current block error (~0.236708) exceeds the existing 0.00002 tolerance; this is not the documented one-sample event-rounding allowance. It can produce a short gain discontinuity before a quantized launch. The source mechanism applies to deferred audio/mixer targets generally; the executed reproduction establishes mixer volume specifically.

**Recommended fix contract, for authorization:** seed each horizon's unwritten curve prefix with the target's effective value at horizon entry, preserving any manual override until its actual release. Do not use a future lane's restoration base as that prefix. Add expected-sample tests for a retained override followed by launch, including note-action subruns, dedicated return/master slots and multiple caller partitions. Existing mixed-curve tests start ownership at frame zero, and the new one-shot tests cover restoration after ownership; neither establishes this pre-ownership prefix behavior. Do not weaken tolerances or split all DSP back to samples to hide the error.

### CR2 — [P2] Startup preparation failure leaves the host permanently unable to retry

**Confirmed lifecycle limitation; the cached rejected promise predates this series.** C4 adds a preparation failure path and closes its context, but the existing memoization at
[audio-host.ts:33](/Users/niklaus.baumann/git/local/sfx-lab-poc/src/audio/audio-host.ts:33) retains the rejected boot promise. The new catch at
[audio-host.ts:82](/Users/niklaus.baumann/git/local/sfx-lab-poc/src/audio/audio-host.ts:82) does not clear it. Every later Play, audition or MIDI action reuses that rejection. The app keeps one host in its services; there is no host retry/reset operation.

An isolated host test delivered `preparation-error: transient` after the initial sample command and `prepare`, then queued Play and called `start()` again. Observed: exactly **one** context constructed; both starts reject with the same error; no connection/resume; Play remains queued. The initial transferred sample buffer has byte length zero and its command has been removed from the host queue at
[audio-host.ts:75](/Users/niklaus.baumann/git/local/sfx-lab-poc/src/audio/audio-host.ts:75). Consequently, simply clearing `starting` is insufficient: a new engine also needs a defined project/sample resynchronization strategy. This is loss of the abandoned engine mirror, not demonstrated loss of the saved project or its sample library.

**Recommended decision:** define either a recoverable host reconstruction/resync path or an explicit reload-required failure state. Test a second user action after preparation failure and after initial command transfer. Keep the successful once-only transfer behavior. The current failure test verifies close/rejection only. This is not attributed as a new promise-caching regression in `d84a40e`; it is an existing recovery gap made relevant by the new handshake. No transient failure was induced in a real browser during this review.

The CR1/CR2 finding IDs below are separate from the remediation plan’s R1/R2 workstreams.

## Scope, provenance and checks

The actual branch, HEAD and working tree were inspected first. The tree was clean; no reset, checkout replacement, implementation edit, commit, push, merge or deployment was performed. The only repository artifact added by this review is this document. Scratch probes and an archived baseline source tree were created under `/tmp`. No other agents were spawned.

No applicable repository `AGENTS.md` was found. The user-supplied Context7 instructions apply. This was source/business-logic correctness review, not library-specific API work; no documentation lookup was required. Read the F1 plan, implementation-status report (decision table and local commit map), TASKS, original F1 assessment, relevant architecture and remediation contracts, evidence index, startup history/final campaign and the affected source/tests.

Reviewed the core in order: `a3f8065` storage/adjacency, `e141fc6` helper state/rate API, `672f640` bounded planning/components/constant ranges; then separately `a820cd7` clock/status and `d84a40e` preparation/readiness. F2 send routing was checked in integration. C6 was inspected only as preserved diagnostic context, not adopted.

Executed focused suite:

```sh
npm test -- src/core/engine src/core/notefx \
  src/core/instrument/note-control-graph.test.ts \
  src/audio/audio-host.test.ts src/audio/worklet/engine-processor.test.ts \
  src/audio/recording-clock.test.ts
```

**30 files / 436 tests passed** (5.35 seconds). This includes send-invalidation, note ownership, helper clocks, component/range scheduling, mixed stereo curves, one-shots, tails, bounce, tempo and worklet/host clock/readiness fixtures. A preceding narrower selection passed 14 files / 243 tests; its `routing.test.ts` selector matched no file. The broader run explicitly covers the actual routing tests (`send-invalidation`, sends, mixer and audio taps). These are correctness runs, not capacity measurements. A separate temporary host test passed assertions documenting CR2's undesirable behavior. CR1 was reproduced against both current source and a `git archive` extraction of the baseline, with independent sample expectations.

The reported earlier **1,742 unit tests, build/typecheck, 21 smoke and 13 real-output audio passes** remain historical implementation evidence. No build, full unit rerun, browser suite or capacity campaign was run for this document-only review.

## Core implementation assessment

| Area | Assessment within reviewed scope |
|---|---|
| Idle storage and adjacency | No additional defect found. Graph output maps are reused, adjacency rebuilds on structural sync, and idle mapping/live arrays are shared only while empty. Scalar-write caching records the values actually sent to processors. Deferred event actions retain event objects rather than borrowing the reusable tap record. The compiled gather path retains the established first-input contract. |
| Helper sample precision and lifecycle | No supported-project helper defect found. Engine rate reaches helper compilation and context. Installed clocked helpers force sample scheduling even with inactive/queued/disabled lanes, overrides and stopped transport. Compatible configuration updates set parameters without processing; structural changes replace the runtime. Manual and automation notes writes reach installed helpers, and wire-owned stage parameters remain protected. Tests independently calculate chained smoothing responses at 8/44.1/48/96 kHz and check stopped-note pitch/identity. |
| Ownership and same-frame ordering | First-sample automation tick precedes component scheduling; moving components tick before each sample's helper/note work. Due actions sort by frame and scheduling rank, retaining processor event order within a track. Existing independent fixtures assert transformed offs, source/channel identities, echo children and same-frame arp-generated pitches. CR1 is an ownership-prefix failure on the audio side despite those event assertions passing. |
| Components and exact ranges | No additional defect found. Components use full undirected upstream/downstream closure, while their internal tracks retain dependency order. Separate sample/interval tap-board passes are safe because no component crosses them. Constant ranges require uniform points or a conservative interval proof; queued changes and wraps keep sample cadence when needed, overrides are considered after the first tick, and helpers always force sample work. Generators still run through interval processors; this is not event-only sleeping. Metadata invalidation follows topology/membership edits. |
| Audio horizons and one-shots | No additional defect found beyond CR1. Starts/stops/replacements apply before end discovery; newly launched repitched and unwarped one-shots bound lookahead. Zero-length ends commit before further planning. Independent delayed-tail tests establish restoration on the first post-end sample. Sample-position ends remain distinct from musical ends across tempo changes. |
| Deferred curve lifetimes and stereo | Curve arrays survive all horizon subruns and are sliced with `mixed - cursor`; reset happens only after consumption. Stereo Send-node and simultaneous patch/fx/mixer/send/return/master tests use explicit formulas at the existing tolerance. CR1 shows that correct lifetime/slicing does not establish correct initial curve contents. |
| F2 gain-only sends | No additional defect found. Membership includes zero-level destinations, so gain changes avoid topology rebuilds; actual destination changes invalidate. Existing counter tests pass both with and without notes automation, including restoration to zero, first-use membership, mute/solo gates, reverse return order and stereo output. |
| Base restoration and tails | Existing stop/removal/override/one-shot tests and source traces support the reviewed release paths. No blanket muted/idle DSP suspension was introduced; instruments, inserts, returns and master tails still render. CR1 concerns the prefix before ownership, not the tested post-release restoration. |

These conclusions are bounded by the inspected contracts and tests; passing cases do not establish universal correctness or eliminate CR1.

A rejected candidate is recorded for transparency: a direct `Engine` probe put a beat-synced `clock` helper in a notes graph and observed 120-BPM fallback at other tempos. However, `clock` explicitly has `inNotes: false`; the editor excludes it and saved-project sanitization rejects that domain. This is **not reported as a supported-project defect**, and does not authorize broadening helper installation or supported nodes. The earlier commentary identifying it as a residual timing defect was corrected after tracing the domain restrictions. Supported smoothing helpers use seconds/engine rate and do not require project tempo.

## Separate C4 startup/readiness review

C4 is causally motivated by retained cold callback failures; it is not proven necessary as the only possible design or sufficient for acceptance. The temporary engine replays initial commands and exercises configured instruments for one audio second plus stopped live notes and tails. Actual-engine preparation compiles order/component/routing metadata without scheduling, rendering, ticking automation or reading destructive status. The multi-rate worklet fixtures verify zero real renders during preparation, unchanged actual state/assets, first stopped live-note pitch/ownership, output parity and idempotent readiness. No additional actual-state mutation was found.

Successful queue ordering is coherent: the host stays unpublished/suspended while it transfers the initial queue, posts `prepare`, waits for ready, flushes later commands, connects, and resumes. Port ordering puts preparation after the transferred initial commands; later commands do not overtake those initial commands. The processor guard outputs silence before readiness. Samples are shared with the throwaway engine by read reference on the worklet side and transferred once across the host boundary. Compatible graph edits preserve pure caches; rewires invalidate them.

Explicit preparation errors are sticky and idempotent in the processor, and the host closes without resuming; CR2 identifies the missing host recovery decision. The handshake has no timeout/cancellation/disposal API. Treat lost readiness or context-lifecycle behavior outside the measured Chromium path as unresolved risks, not demonstrated failures. Command bursts during preparation are flushed after ready and can invalidate primed topology or introduce unprimed code paths; preparation is an optimization, not a guarantee that all future callbacks are warm. No new startup behavior was added during review.

Maintainability cost: a new protocol state machine, retained initial command references, a second compilation/render of project state, startup delay and temporary memory. These are reasonable explicit tradeoffs for the approved experiment, but require error/recovery ownership and cannot be justified by claiming the deadline issue is closed.

## Separate C5 clock/full-status review

No additional defect found in the inspected split. `Engine.clock()` reads only tempo/playing/beat, without peak reset or readout traversal. Transport and launch commands mark clock changes; the processor stamps the compact anchor before render and sends one full status afterward, then retains the 30 Hz cadence. Full status timestamps use the end of the rendered quantum. The host consumes both packet types into RecordingClock and forwards only full statuses to UI listeners. Unknown extension packets remain ignored.

Independent clock tests check piecewise beat extrapolation across a tempo change, stopped anchors and lack of premature status publication; worklet tests count one full snapshot per change quantum. UI peak/readout/launcher visibility can lag one quantum as approved. This removes a redundant full-status traversal but does not remove all status allocation from the callback. No necessity or performance sufficiency is inferred from passing clock tests. Physical MIDI recording feel and broader browser coverage remain outside this review.

## Explicit C1–C5 decision review

| Decision | Review judgment and practical consequence |
|---|---|
| C1 — actual samples/rate, stopped helpers and normal DSP blocks | Retain the approved correction. Its rate/chained-state/live-note contracts have independent expectations, with no additional supported helper defect found here. Audible changes for projects relying on broken helper speed or incidental one-frame socket sampling remain deliberate and documented. No legacy mode or format change is needed or authorized. CR1 still prevents declaring the whole new timeline correct. |
| C2 — named device/browser and unchanged gates | Retain unchanged. Multi-rate correctness is not multi-device performance acceptance. The retained callback failure and repeated no-lane regression keep F1 open. Approval of the target does not accept either result. |
| C3 — exact connected components and constant ranges | The quiet conservative failures justify the scoped expansion; source and expected-event tests support its conservative proof boundaries. Retain the design for review, with CR1 addressed before correctness signoff. Complexity sits in dependency/invalidation and ownership-prefix contracts; avoid extending it into heuristic downsampling or generator sleeping. |
| C4 — separate engine/readiness | Evidence supports retaining it as an approved startup tradeoff pending acceptance and the CR2 recovery decision. Report ~0.17–0.25 s startup latency and sampled RSS increases; it is not a free or complete deadline fix. Do not expand priming or advance the actual engine to cover the remaining miss. |
| C5 — compact anchor/full status | Retain within the approved one-quantum UI-delay tradeoff. Recording-anchor semantics and snapshot count pass focused checks. No claim that it alone improves worst-case callback time is supported by the retained campaign. |

C6 remains **unapproved**, opt-in and disabled by default. Its short hook-placement A/B is not a causation proof or acceptance replacement. No C6 rerun or adoption was performed.

## Acceptance and measurement limitations remain open

The [final production campaign](measurements/f1-fix/startup/clock-final/README.md) retains the constant-case **3.265 ms first whole callback** against the unchanged **2.667 ms** quantum budget. Constant engine p99/max are 1.161/2.459 ms; moving notes and both complete arrangements pass their measured engine/callback gates. The 2.475 ms thread CPU plus 0.790 ms off-thread decomposition does not identify a cause, excuse wall time or permit excluding the first callback.

The two fresh offline pairs pass all required notes gates, but repeat the one-track no-lane **+27.1%/+29.6%** regression (+0.881/+0.986 ms/audio-second). Small absolute cost, context sensitivity and passing notes ratios do not settle its cause. CR1 is a correctness defect independent of these throughput/deadline results.

Preparation/readiness measured about 163–242 ms suspended and 172–254 ms node-to-ready. The sampled renderer RSS increase was roughly 14–16 MiB in final pairs; 25 ms whole-renderer samples are lower bounds on peak and include runtime/DOM/allocator effects, not exact temporary live heap. Keep these separate from capacity timing. Full finite/jump scans and passing audio windows do not establish physical-device underrun absence or universal musical continuity. All adverse evidence, earlier failures, source archives and thresholds remain untouched.

## Recommended next actions for user review

1. Authorize a bounded CR1 fix with independent pre-launch effective-value assertions and targeted regression checks. Preserve normal DSP blocks, sample precision, saved formats and existing tolerances.
2. Decide CR2 recovery semantics before implementing a retry: reconstruct/resynchronize project and sample assets, or expose a clear reload-required failure. Do not just clear the rejected promise after buffers have transferred.
3. Review C1–C5 judgments and C6 separately. If further measurement is authorized, preserve the failed campaign and diagnose the retained callback miss and no-lane regression under unchanged gates. This review starts no campaign or optimization.
4. After any authorized runtime changes, rerun affected correctness/browser checks and record exact-source evidence before acceptance. Keep F1/R1 open; F5, Rust/Wasm, muted/solo DSP suspension and unrelated branch blockers remain separate. No push, merge or deployment is authorized.

## Reproduction appendix

Save the following as `/tmp/f1-review-realistic.mjs` and run from this checkout:

```sh
node --experimental-transform-types --disable-warning=ExperimentalWarning \
  --import ./scripts/review-benchmark/loader.mjs /tmp/f1-review-realistic.mjs
```

The signal formula above is the oracle; one-frame and archived-baseline comparisons are additional evidence, not the oracle itself.

```js
import {Engine,createEmptyProject,createClip,noteGraphFrom,diffProject} from '/Users/niklaus.baumann/git/local/sfx-lab-poc/src/core/index.ts';
const p=createEmptyProject(),t=p.tracks[0],target={kind:'mixer',owner:{kind:'track',trackId:t.id},control:'volume'};
const make=id=>({...createClip(id,4,[]),id,automation:[{id:'l-'+id,enabled:true,target,points:[{id:'p',beat:0,value:.4,interpolation:'hold'}]}]});
const a=make('a'),b=make('b'),patch=noteGraphFrom([{id:'v',type:'control',params:{value:.5}},{id:'out',type:'output'}],['v.out>out.in']);
const project={...p,tracks:[{...t,volume:.2,patch,clips:[a,b]}]};
for(const chunk of [128,1]){
 const e=new Engine(44100);diffProject(null,project).forEach(c=>e.apply(c));
 e.apply({type:'clip/launch',trackId:t.id,clipId:'a'});e.apply({type:'track/noteOn',trackId:t.id,note:{sourceId:'review',channel:0,noteId:'held'},pitch:60,velocity:1});
 e.render(new Float32Array(88192),new Float32Array(88192));
 e.apply({type:'automation/overrides',values:[{target,value:.7}]});
 const disabled={...project,tracks:[{...project.tracks[0],clips:[{...a,automation:a.automation.map(l=>({...l,enabled:false}))},b]}]};
 diffProject(project,disabled).forEach(c=>e.apply(c));
 e.apply({type:'clip/launch',trackId:t.id,clipId:'b'});
 const result=[];for(let i=0;i<128;i+=chunk){const l=new Float32Array(chunk);e.render(l,new Float32Array(chunk));result.push(...l)}
 console.log(JSON.stringify({chunk,first12:result.slice(0,12),expectedBefore:Math.tanh(.35),expectedAfter:Math.tanh(.2)}));
}
```

For the baseline comparison, extract only tracked source with `git archive 36f71d1 src` into a fresh `/tmp/f1-review-baseline` directory and replace the script's import with `/tmp/f1-review-baseline/src/core/index.ts`. Both baseline partitions produced the expected values listed above. The checkout was not changed to perform this comparison.

CR2's temporary test uses the same fake AudioContext/AudioWorkletNode approach as the existing host tests. Its decisive sequence and observed assertions are:

```ts
// Initial queued sample/add is posted with its transfer list, then prepare.
const first = host.start()
// Attach a rejection handler before delivering the failure.
const rejected = expect(first).rejects.toThrow('transient')
await vi.waitFor(() => expect(sent.some(m => m.kind === 'prepare')).toBe(true))
node.port.onmessage({ data: { kind: 'preparation-error', message: 'transient' } })
await rejected
host.send({ type: 'transport/play' })
await expect(host.start()).rejects.toThrow('transient')
expect(contexts).toBe(1) // no reconstruction attempted
expect(data.byteLength).toBe(0) // initial transfer already consumed
expect(sent.filter(m => m.kind === 'command')).toHaveLength(1) // Play not delivered
expect(host.isRunning).toBe(false)
```

The complete scratch test passed those observed-behavior assertions. They document the recovery gap; they are not proposed acceptance assertions for a future fix.

## Resolution addendum — 2026-10-24

The demo candidate fixes CR1 by seeding late-starting automation curves from horizon-entry overrides, with independent
sample expectations across mixer/graph/send/return/master targets and render partitions. CR2 is resolved through an
explicit terminal-failure contract: persistent save/export-and-reload guidance, handled startup failures and no further
queued commands. Engine reconstruction remains out of scope. The original reproductions above remain historical
observed behavior, not assertions of the repaired code. See [the demo release record](measurements/demo-release/README.md)
for exact source identity, migration work, verification and the accepted performance limitations.
