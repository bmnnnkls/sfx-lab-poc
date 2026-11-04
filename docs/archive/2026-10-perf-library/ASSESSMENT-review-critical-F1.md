---
status: historical
date: 2026-10-18
---
# Independent assessment of review finding F1

Date: 2026-10-18. Scope: analysis only, on the existing `codex/performance-and-library` checkout.

**Verdict: confirmed performance defect, with corrections to the review's trigger, complexity and allocation claims. Independent severity: High / P1; recommend blocking merge until remedied or explicitly accepting a product limitation that prevents this path.** One valid enabled notes-domain lane in a playing **or queued** clip changes the entire engine's audio processing to one-frame segments. This is a large, reproducible regression, including on the shipped flagship example. A missed browser AudioWorklet deadline has **not** been demonstrated by this assessment. The review's universal “very likely” prediction and its Critical label are stronger than the available real-worklet evidence.

## Provenance and boundaries

- Assessed HEAD: `e3cf83d6a9100a9016bde6a4ca9b7b246f8f0ce3` (backlog reconciliation).
- Original candidate review: `8caa0720ad75a7cfe1fa8b1235c2cca84f95b433`, [REVIEW-performance-and-library.md](REVIEW-performance-and-library.md), preserved unchanged.
- Reviewed implementation endpoint: `c52a08cbbe3191661c543b421c8257b13869e3b7`. `git diff c52a08c HEAD -- src` was empty, so the runtime measured here is the reviewed implementation.
- Read repository instructions, [TASKS](../../BACKLOG.md), [PLAN](PLAN-performance-and-library.md), [SPEC](SPEC-performance-and-library.md), and architecture sections covering engine timing, graph stages, notes/ownership, mixing, stereo/returns/master, automation and tails. No repository `AGENTS.md` was found in this checkout; the supplied Context7 instructions apply. This was pure engine/DSP logic analysis and scratch scripting, not a library/API documentation question; no Context7 lookup was needed.
- No source, tests or configuration were edited; no remedies implemented, branch/worktree changes, staging, commits, pushes, PRs or merges. Experiments were temporary files under `/tmp/sfx-f1-assessment`; only this assessment is authored in the repository. F2–F25 belong to the separate assessment.
- Prior delivery evidence supplied in the handoff: 1,591 unit/architecture tests, typecheck, warning-free build, 17 smoke and 12 real-output checks passed. Those are historical implementation checks, not new results from this assessment. The original review did not rerun browser checks. Physical MIDI hardware remains untested; snapshot XY corners remain deferred.

## What actually enables the path

The decisive expression is [engine.ts:225](../../../src/core/engine/engine.ts#L225):

```ts
this.transport.playing && this.automation.noteLanes ? 1 : MAX_BLOCK_FRAMES
```

`MAX_BLOCK_FRAMES` is 128. [EngineAutomation.noteLanes, automation.ts:94](../../../src/core/engine/automation.ts#L94) checks runtime automation queues. It materializes an array of configured owners, then checks at most the playing and queued clip per visited owner. An eligible lane must be enabled, have points, and target a graph in domain `notes`. It short-circuits on the first match.

| State | One-frame whole-engine path? |
|---|---|
| Notes lane exists only in an unlaunched stored clip; other clip/no clip plays | No |
| Valid notes lane configured, transport stopped | No; transport guard short-circuits |
| Transport playing; notes clip queued for the next bar | **Yes, before its actual launch** |
| Notes clip playing; no notes currently sounding | **Yes** |
| Lane holds a constant value, targets a disconnected but available parameter, or is shadowed by an override | **Yes**; eligibility does not inspect changing values, audibility or effective ownership |
| Track muted or not heard under solo | **Yes**; audibility does not gate eligibility or render scheduling |
| Only disabled/empty notes lanes | No, though configured automation can still tick every sample |
| Missing/incompatible/wire-owned/cross-owner lane through normal project compilation | No contribution from that lane; compilation omits it |
| Playing notes clip queues stop or replacement without notes lanes | Yes until the playing notes clip actually releases at the quantized boundary; the next outer iteration can return to blocks |
| Transport stop | Resets queues/automation and returns to blocks; release/effect tails still render |

Compilation is separate from this render-time decision. [evaluate.ts:21–36](../../../src/core/automation/evaluate.ts#L21) resolves owner/availability/wire ownership, creates playback lanes and retains configured tracks with lane-bearing clips (dedicated slots have a separate retention rule). Disabled/empty available lanes can remain compiled. Installing `NoteControlGraph` is broader still: the presence of an authored notes target in **any** instrument clip can provide the helper graph during configure, even if that clip is inactive. Helper installation is not itself the one-frame trigger. This distinction matters to F3, whose independent assessment is out of scope here.

A scratch probe confirmed configured-but-idle `noteLanes === false` after Stop/Play. Queueing the notes clip at a non-bar beat changed it to `true`, while status still reported `playingClipId: null, queued: 'c0'` both before and after the next 128 frames.

## Source trace and corrected cost model

1. [engine.ts:223–227](../../../src/core/engine/engine.ts#L223) makes every outer block one frame when eligible. The preview and final soft clip/peak scan remain outside this loop; the phrase “entire engine per sample” needs that qualification.
2. [engine.ts:294–308](../../../src/core/engine/engine.ts#L294) checks `noteLanes` again, ticks **all** automation before note scheduling, collects events, mixes and advances clocks. In steady notes mode the getter therefore runs twice per output sample.
3. [engine.ts:311–330](../../../src/core/engine/engine.ts#L311) allocates the scheduled-event array, walks every scheduling track, builds action/frame records for events and invokes `.sort`, even when the event array is empty. Empty-array sort does not imply meaningful comparison work; dense event bursts add sorting work.
4. [track-runtime.ts:169–180](../../../src/core/engine/track-runtime.ts#L169) processes installed note controls, collects/merges/sorts clip and live events, runs the note graph and creates action closures. This runs for every instrument track, not only the automated owner. [notefx/graph.ts:135](../../../src/core/notefx/graph.ts#L135) constructs an output `Map` per note-graph process; its gather operation filters connections for each effect input. Unrelated idle note graphs therefore add real scheduling/allocation work.
5. [engine.ts:351–390](../../../src/core/engine/engine.ts#L351) clears master, every track's graph automation and every channel strip, then evaluates automation again in its sample loop. Each positive mix segment allocates a collecting-curves `Map`; each active target allocates a `Float64Array(frames)` and curve record. In notes mode these are usually one-element curves. [Instrument.clearAutomation, instrument.ts:86](../../../src/core/instrument/instrument.ts#L86) also walks **all allocated voice slots**, including inactive ones.
6. [automation.ts:69–91](../../../src/core/engine/automation.ts#L69) allocates **one** `next` Map per `tick`, scans configured owners and the lanes of their playing clip, evaluates lanes with binary search over points, constructs target keys/entries, restores released targets and writes active/override values. The collector adds another Map per segment; it is incorrect to say there are two fresh Maps inside every tick.
7. [engine.ts:392–395](../../../src/core/engine/engine.ts#L392), [track-runtime.ts:226](../../../src/core/engine/track-runtime.ts#L226), and the audio/return runtimes mix all tracks and the master at this segment size. Global/shared stages still run when voices are idle; active voices and effect tails run normally, now in one-frame calls. Delay sample advancement is not multiplied by 128, but per-call setup is. [FxGraph.process:58–61](../../../src/core/instrument/fx-graph.ts#L58) even clears its full fixed stereo output buffer on every call, independent of `frames`.

**The review's `tracks × clips × lanes` render-time scan claim is inaccurate.** Let `A` be configured automation owners, `Lpq` lanes visited in their playing/queued candidates, `Lp` all lanes in playing clips, `P` points per lane, `T` runtime tracks, `V` allocated voice slots and `N/E` note-graph nodes/connections. The getter is approximately `O(A + Lpq)` in the worst traversal, with eager `O(A)` owner-array materialization even on an early match. It does not scan every stored clip. A tick costs owner traversal plus roughly `O(Lp log P)` evaluation, target-key/ownership work and active-map iteration. Notes mode adds global per-sample scheduling/clearing and graph dispatch, with `T`, `V`, graph size, active polyphony and effect complexity all contributing. Note-graph connection filtering can itself approach `N × E` per scheduling pass. This is not a claim that total CPU or every DSP operation becomes exactly 128 times larger.

At 48 kHz in steady event-free notes playback:

- 48,000 render blocks, event-array sort invocations and positive whole-mix passes per audio second.
- 96,000 `noteLanes` getter calls and 96,000 automation ticks per audio second.
- At least 144,000 fresh engine-level Maps per second from two `next` Maps plus one collector Map per sample, before note-graph Maps and any automated DSP-stage structures.
- For one active lane, 48,000 one-element `Float64Array` curves per second in the mix collector. This is an allocation count, not a measured heap-size or GC-pause estimate.

Ordinary configured automation already calls `tick` once per sample inside otherwise block-sized mixes, including scans of configured idle owners. Its allocation/scanning cost predates the **additional** notes-mode collapse. The `configured` getter itself is only a Map-size test; caching it alone will not materially solve F1.

A correctness constraint follows from the collateral block-size change: ordinary `ParamFeed` sockets sample a source's first value per process call unless marked varying ([compile.ts:224–238](../../../src/core/instrument/compile.ts#L224)). Whole-engine one-frame calls can therefore change unrelated moving-socket update cadence as well as CPU cost. This is a source-based implication, not a measured audio-difference result. A remedy should restore documented block behavior for unrelated graphs deliberately; do not assume constant notes automation is an audio-identical golden reference for every existing patch.

F2 interaction only: a concurrent send lane can invalidate routing orders from both pre-scheduling writes and collected curve application ([engine.ts:375–380](../../../src/core/engine/engine.ts#L375), [engine.ts:543–549](../../../src/core/engine/engine.ts#L543)), increasing F1's cost. The measurements below add no send automation, so they do not depend on F2. F3 interaction only: changing note-helper call cadence changes stateful-helper behavior; scheduler refactoring must coordinate that time-base contract. Neither finding is independently adjudicated here.

## Reproducible measurements

Environment: macOS ARM64, Apple M3 Pro, Node `v24.21.0`, direct repository TypeScript loaded with Node's transform-types support and a temporary extension/index resolver. Engine rate 48,000 Hz; render buffers 128 frames. No browser, production bundle, worklet thread, audio device or hardware MIDI was involved. Native TypeScript `private` members are ordinary properties after transformation; instrumentation wraps them only in scratch instances.

### Structural counts

Four synthetic instrument tracks, four allocated voice slots each, one held oscillator voice per track, simple Clip → Transpose → Out note graphs, normal inserts/master. After 256 warm frames, instrument one 128-frame render with no note events inside it. Global `Map` and `Float64Array` subclasses count constructor calls **only during this probe**, not timing runs. Counts are observed language-level constructions, not a claim about optimized physical heap allocation or garbage collection.

| Calls/constructions per 128 frames | No lanes | One mixer lane | One notes lane | Disabled notes lane | Empty notes lane |
|---|---:|---:|---:|---:|---:|
| `renderBlock` / `collectEvents` / master process | 1 | 1 | 128 | 1 | 1 |
| `noteLanes` getter | 2 | 2 | 256 | 2 | 2 |
| `automation.tick` | 0 | 128 | 256 | 128 | 128 |
| All tracks' `schedule` calls | 4 | 4 | 512 | 4 | 4 |
| All tracks' `clearAutomation` calls | 4 | 4 | 512 | 4 | 4 |
| All tracks' `mixInto` calls | 4 | 4 | 512 | 4 | 4 |
| `new Map` constructions, entire render | 4 | 133 | 896 | 133 | 133 |
| `new Float64Array` constructions | 0 | 1 | 128 | 0 | 0 |

The 896 Maps here reconcile exactly: 128 × (four note-graph Maps + two automation Maps + one collector Map). More complex graphs/automated audio processors can construct additional structures. Notes eligibility is not present in the no-lane case, but both getter call sites still execute while transport plays.

### Offline throughput

Each scenario has three independent engines: no lane, one constant mixer-volume lane at its authored value, and one constant notes lane at its authored value. All engine commands come through `diffProject`; no eligibility flags or runtime code are forced. Warm each engine with one second; then interleave five one-second timed renders per variant, reversing variant order on alternate trials. Repeat the full experiment in a second Node process. Buffer allocation per timed render call is included; engine/project construction and imports are excluded. Status confirms the notes lane is active.

Synthetic projects have 1/4/8/16 tracks, four allocated voices per track and one active sine oscillator per track; the constant notes lane targets Transpose semitones at zero. Low Light uses its shipped Drop scene (zero-based scene 6), **16 tracks: 13 instruments + 3 returns, 50 allocated voice slots**, existing patches/routing/effects, and one constant lane on Stab's Scale lock `root`, normalized `9/11` (A). The mixer comparison targets the same owner's volume. The lane is attached to its nonempty clips; no moving automation, extra effects or send lanes are added.

Values are median **milliseconds to render one second of audio**:

| Project | No lane, run 1 / 2 | Mixer lane, run 1 / 2 | Notes lane, run 1 / 2 | Notes ÷ mixer, run 1 / 2 |
|---|---:|---:|---:|---:|
| 1 simple track | 3.31 / 3.26 | 26.38 / 27.37 | 153.79 / 160.28 | 5.83× / 5.86× |
| 4 simple tracks | 8.47 / 8.66 | 31.58 / 33.22 | 366.27 / 377.98 | 11.60× / 11.38× |
| 8 simple tracks | 15.29 / 15.40 | 37.73 / 37.32 | 669.82 / 659.97 | 17.75× / 17.69× |
| 16 simple tracks | 29.93 / 30.47 | 54.18 / 53.06 | 1319.49 / 1290.42 | 24.35× / 24.32× |
| Low Light Drop | 123.19 / 126.41 | 150.18 / 152.50 | 4318.51 / 4345.49 | 28.76× / 28.50× |

These results demonstrate severe offline throughput loss and scaling beyond the single automated track. They do **not** demonstrate that every modest project misses deadlines: the one-track notes case remains substantially faster than real time here. Conversely, Low Light and the 16-track synthetic case are slower than real time even offline on this machine. Low Light's run-1 notes trials ranged 4176.63–4377.19 ms per audio second; it was not a single timing outlier.

A supplemental short polyphony probe used four tracks and one notes lane, 0.25-second warmup and three 0.25-second renders scaled to milliseconds/audio-second. With one active voice per track, medians for 1/4/16 allocated slots were 424.8/466.7/459.6 ms; with 16 slots and **eight active voices per track**, median was 1000.3 ms. This overlapped another scratch timing process and is noisy; it supports active-polyphony sensitivity, not a precise allocated-slot slope. The inactive-slot clearing cost is established by source, not isolated quantitatively by this probe.

### What these timings do and do not establish

A nominal 128-frame quantum at 48 kHz spans 2.667 ms. Dividing run-1 notes throughput by 375 gives a **derived average** of 0.41/0.98/1.79/3.52/11.52 ms per quantum for the five scenarios. These are neither measured individual callback durations nor worklet deadline traces. Node JIT/runtime, browser compilation, scheduling, GC, device buffering, browser load and other audio nodes differ. There was no browser underrun counter, callback percentile trace or audible-dropout capture. No missed audio deadline is claimed as demonstrated.

The strong throughput regression, repeated allocation/dispatch mechanism and supported flagship workload justify a High-priority merge blocker independently of that missing browser proof. This is a runtime capacity problem, not evidence of a security vulnerability, data corruption or universal engine failure. The original plan acknowledges extra note-scheduling CPU cost, but the implementation also segments unrelated **audio** graphs; its comment that audio/mixer curves keep block processing does not hold when a notes lane is eligible.

### Checks executed here

`npm test --` with the following seven existing files passed **84/84 tests** (7 files, 1.84 seconds): `automation.test.ts`, `automation-perf.test.ts`, `automation-audio.test.ts`, `automation-slots.test.ts`, `held-notes.test.ts`, `note-graph.test.ts`, `tempo.test.ts`, all under `src/core/engine/`. An additional `src/core/instrument/automation-run.test.ts` selector matched no file; it added no coverage. The existing performance-named test checks finite/audible mixer-lane rendering, not deadlines or note-lane dispatch. The upstream-control notes test verifies values before note events but not dense performance. Passing these correctness tests does not refute F1.

No full-suite, build/typecheck or browser rerun was necessary to verify an analysis-only document, and none is claimed here. The historical 17/12 browser results remain historical, not validation of a future remedy.

## Remediation options and tradeoffs

### A. Separate sample-accurate note scheduling from block audio rendering — recommended

Retain up-to-128-frame audio blocks. Within each block, walk the note/control timeline at sample resolution where required, apply notes parameters **before** processing that sample's note graph, and collect scheduled actions with frame offsets. Then mix audio in runs split only at actual audio/note-action boundaries. Feed audio/mixer automation as curves, with correct offsets into each run, using the existing DSP curve machinery where appropriate.

A first conservative version may still schedule **all note graphs** per sample while batching audio; a later version can specialize the affected note dependency closure. Preserve cross-track tap order and downstream readers at every scheduled sample. Reuse event/curve buffers and scratch ownership maps; tick/commit automation once per sample, routing note writes to the note runtime and audio writes to curves. Restore released targets at the exact boundary. Predict/schedule audio one-shot lane release from its exact musical/sample end rather than depending on a later mix call to discover it.

Cost: medium-to-large engine refactor, likely across engine automation, track scheduling, note control and curve indexing; no saved-format change inherently required. Risks: off-by-one launches/loop boundaries, early application of future parameters, incorrect subsegment curve offsets, tap/order regressions and dangling note ownership. Conservative note scheduling still allocates too much in complex graphs until separately optimized. Do not claim this is sufficient until benchmarked.

**Why `ParamFeed` alone is insufficient:** `processAutomatedRun` operates on audio DSP `CompiledRun`s; note effects are event processors that currently read scalar parameters for a beat range. `TrackRuntime.setAutomationCurve(..., 'notes')` takes only `values[0]`. Merely attaching a curve, or removing `? 1`, would freeze a ramp across the range and change same-frame note transformations and generator timing. A note-side time-indexed/segmented evaluation contract is required. Existing `processAutomatedRun` also creates scratch objects; reuse it carefully rather than treating it as allocation-free.

### B. Split scheduling/audio runs only at effective note-control changes and generator boundaries

Compile a timeline of launch/stop/loop boundaries, snapped or held note-parameter changes, relevant input-note events and generator wakeups. Schedule each note graph over ranges where its effective parameters are constant. Keep audio blocks and curve processing; continuous/stateful helper cases need an explicit exact fallback confined to note scheduling.

Cost: larger planner/compiler work than the first conservative A step. Potential benefit: constant lanes like the measured case and stepped targets become very cheap; unchanging overrides can avoid redundant note writes. Risks: continuous ramps through helper math, smoothing/edge state, arpeggiator rate/gate changes and internally generated echo/arp events invalidate naïve “only update on input note” strategies. Stepped controls can change between authored points after normalization/snapping. A guessed control-rate downsample is a product-semantic change and cannot silently replace sample-accurate playback. Useful as a second optimization after A establishes a correct timeline.

### C. Reduce allocations/scans in the current architecture — bounded interim improvement

Cache eligible-owner/lane metadata and target keys on configure/launch/stop/edit; reuse maps, curves and event buffers, precompile note-graph input adjacency, avoid redundant scalar writes and preserve routing order when only send levels change (coordinate with F2). A conservative playing-plus-queued eligibility snapshot for an outer quantum can avoid repeated getter scans, provided launches and releases remain correct; blindly caching until configure would become stale.

Cost: smaller localized changes and easier review; should benefit ordinary automation too. Risks: stale eligibility/ownership, retaining deleted targets and clearing/reusing data before consumers finish. **Insufficient as the sole F1 remedy**: the whole audio graph still receives 48,000 tiny process calls/sec. Removing the getter's spread or caching `configured` cannot erase the measured global dispatch cost.

Disabling notes automation could prevent the trigger as an explicitly accepted product restriction, but silently ignoring saved lanes would violate delivered behavior and live/offline expectations. It is not the recommended remediation.

## Recommended staged implementation and acceptance gate

No stage below is implemented by this assessment.

1. **Freeze contracts and baselines.** Add deterministic structural counters for no-lane, mixer-only, queued/playing/disabled/empty/overridden notes lanes, silent/muted tracks and note-reader chains. Preserve the current sample scheduler as a reference for stateless note transformations. Agree the F3 sample-rate/state advancement contract before using stateful-helper output as a golden reference. Record the scratch performance workloads and current production-browser baseline on named supported hardware.
2. **Make automation evaluation reusable.** Precompile keys/eligibility/adjacency; split queue commitment, effective lane evaluation and write routing. Reuse bounded scratch buffers with explicit lifetimes. Evaluate each sample once, preserving queue/override/base restoration. Add counts proving duplicate ticks are gone. Do not substitute a stale per-render lane value for changing per-sample values.
3. **Implement A conservatively.** Build a sample-indexed note event timeline, retain dependency order and complete ownership, and batch audio. Handle curve slicing, audio clip starts/stops/one-shot ends, master and return slots at exact frames. Keep rendering release and effect tails on silence/mute/Stop. Then measure; if sample-note scheduling still exceeds budget, compile scheduling data/reuse storage before claiming resolution.
4. **Optimize selective scheduling only with evidence.** Use eligible-owner dependency closure or B's constant-range strategy where exact. Coordinate F2 routing invalidation and F3 helper time base without assuming their candidate fixes. Document any deliberate correction of existing helper semantics and test it independently.
5. **Validate and decide merge.** Run full unit/architecture suite, typecheck and warning-free build, all smoke and real-output browser checks, plus the dedicated notes-lane stress/latency checks below. Compare before/after on the same device/browser/rate. Save measured results; merge acceptance must not rest on an offline speedup alone.

Required regression/performance checks:

- **Timing and eligibility:** playing vs configured vs queued before the next bar; no-note portions, constant ramps/holds, snapped numeric and discrete controls, helper-wire chains and nested module paths; edits/removal while playing; actual launch/retrigger/stop and loop wrap; 40/120/240 BPM and changes mid-playback. Check frames immediately before/at/after transitions at 44.1/48/96 kHz. Use existing tolerances only where justified: preserve the documented one-sample odd-chunk event rounding allowance, not a new timing relaxation.
- **Ownership and note semantics:** equal-pitch clip/live/source/channel overlaps, sustain, identity-aware offs, stealing, scopes, panic/disconnect, echoes/arpeggiator children, topology cleanup, cross-track taps including transitive readers. Apply changing transpose/chord/velocity/rate/gate parameters before the appropriate generated/input events. Ensure range-split and transformed note-offs release their original owned outputs after parameter changes.
- **Active automation:** notes plus instrument/insert/mixer/send/return/master curves together; correct curve offsets across event-split mixes, independent slot lengths, overrides/re-enable and base restore at launch/stop/delete/one-shot completion. Keep transient playback outside history/autosave and preserve Touch's clock/destination ownership.
- **Tails and stereo:** stopped/silent/muted tracks keep necessary global/shared/insert/return/master processing; envelope release and low-level/long dormant delay echoes survive. Cover stereo and mono inserts, taps, post-fader sends, Ping-pong feedback, tempo retunes and master processing. No blanket idle-track skipping or tail truncation to meet a benchmark.
- **Parity:** fresh engines with 1/97/128/173/large offline chunks, clip and scene bounces, and actual production worklet output. Compare both channels against the authored offline result and expected note events. Keep **0.00002** audio amplitude tolerance, capture readiness, required complete sample count and all-finite-window checks unchanged. A matched pair of equally wrong live/offline renders is insufficient; retain explicit expected timing/pitch/ownership assertions.
- **Structural performance:** an event-free 128-frame block with one constant notes lane must no longer cause 128 whole-mix/master passes; unrelated nonautomated DSP should get block calls. Actual note/audio event boundaries can legitimately split runs. Count ticks and allocations separately from timings; no fresh Map per idle note graph/sample or one-element audio curve per target/sample in the final steady path. Test 1/4/8/16/32 tracks, low/high active polyphony, many inactive slots, many inactive stored clips, 1/8/64 active lanes and 2/2048 points, including nonautomated tails and audio/return tracks. These matrix sizes are test workloads, not a promise that every dense configuration meets real time.
- **Offline performance:** reproduce the five table workloads; require a clear notes-lane speedup and no material no-lane/mixer-only regression. Suggested project gate on the same named M3 Pro environment: Low Light's constant-notes case within 2× its mixer baseline and below 500 ms/audio-second, with multiple runs and raw timings. This is a proposed engineering headroom target, not a measured post-fix result or a cross-device guarantee.
- **Real-time evidence:** instrument the production worklet on named supported hardware/browsers/rates for sustained playback, launches/stops and tempo edits; record actual quantum sizes, callback duration p50/p95/p99/max, allocation/GC observations and capture continuity/underruns where observable. Proposed headroom target: p99 engine-render duration below half the quantum interval (1.333 ms for 128/48k), with no observed over-budget engine callbacks or output discontinuities over at least 60 seconds on the representative workload. Record capture/status overhead and concurrent graph load too. Passing that observation window is evidence, not a universal hard-real-time guarantee. Investigate outliers rather than weakening readiness, finite-window or audio tolerances.

## Reproduction appendix

The scripts below are the actual primary benchmark/probe harness. They only construct scratch engines and read repository code. Save the first as `/tmp/sfx-f1-assessment/loader.mjs` and the second as `/tmp/sfx-f1-assessment/bench.mjs` (adjust absolute checkout imports if reproducing elsewhere). Use the assessed commit and installed dependency tree; the benchmark itself needs no additional packages.

```sh
mkdir -p /tmp/sfx-f1-assessment
node --experimental-transform-types --disable-warning=ExperimentalWarning \
  --import /tmp/sfx-f1-assessment/loader.mjs /tmp/sfx-f1-assessment/bench.mjs --counts
node --experimental-transform-types --disable-warning=ExperimentalWarning \
  --import /tmp/sfx-f1-assessment/loader.mjs /tmp/sfx-f1-assessment/bench.mjs
```

Loader:

```js
import { registerHooks } from 'node:module';
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
registerHooks({ resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('.') || specifier.startsWith('/')) && context.parentURL) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    for (const candidate of [base + '.ts', base + '/index.ts']) {
      if (existsSync(candidate) && statSync(candidate).isFile()) return nextResolve(pathToFileURL(candidate).href, context);
    }
  }
  return nextResolve(specifier, context);
}});
```

Benchmark and structural probe:

```js
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import { Engine } from '/Users/niklaus.baumann/git/local/sfx-lab-poc/src/core/engine/engine.ts';
import { exampleProjects } from '/Users/niklaus.baumann/git/local/sfx-lab-poc/src/core/examples/index.ts';
import { diffProject } from '/Users/niklaus.baumann/git/local/sfx-lab-poc/src/core/sync/index.ts';
import { createEmptyProject, createClip, createNote } from '/Users/niklaus.baumann/git/local/sfx-lab-poc/src/core/project/index.ts';
import { noteGraphFrom } from '/Users/niklaus.baumann/git/local/sfx-lab-poc/src/core/patch/index.ts';
const RATE=48000, QUANTUM=128;
function synthetic(n) {
 const p=createEmptyProject(), base=p.tracks[0];
 const patch=noteGraphFrom([{id:'note',type:'note'},{id:'osc',type:'oscillator'},{id:'out',type:'output'}],['note.frequency>osc.freq','osc.out>out.in']);
 const noteGraph=noteGraphFrom([{id:'in',type:'clipNotes'},{id:'tr',type:'transpose',params:{semitones:0}},{id:'out',type:'noteOut'}],['in.out>tr.in','tr.out>out.in']);
 return {...p,tracks:Array.from({length:n},(_,i)=>({...base,id:`t${i}`,voices:4,patch,noteGraph,clips:[{...createClip('held',100,[createNote(60,0,100,0.5)]),id:`c${i}`}]}))};
}
function variant(p,mode,kind='simple') {
 const id=kind==='low'?'stab':'t0', track=p.tracks.find(t=>t.id===id);
 const target=mode==='mixer'?{kind:'mixer',owner:{kind:'track',trackId:id},control:'volume'}:{kind:'graph',owner:{kind:'track',trackId:id},domain:'notes',path:[],nodeId:kind==='low'?'ng_key':'tr',nodeType:kind==='low'?'scaleLock':'transpose',paramId:kind==='low'?'root':'semitones'};
 const value=mode==='mixer'?track.volume:kind==='low'?9/11:0.5;
 const lane={id:'bench',enabled:mode!=='disabled',target,points:mode==='empty'?[]:[{id:'p',beat:0,value,interpolation:'hold'}]};
 if(mode==='base')return p;
 return {...p,tracks:p.tracks.map(t=>t.id!==id?t:{...t,clips:t.clips.map(c=>c&&({...c,automation:[lane]}))})};
}
function setup(p,scene=0){const e=new Engine(RATE);diffProject(null,p).forEach(c=>e.apply(c));e.apply({type:'scene/launch',scene});return e;}
function render(e,frames){const l=new Float32Array(QUANTUM),r=new Float32Array(QUANTUM); for(let f=0;f<frames;f+=QUANTUM)e.render(l,r);}
function counts(mode){const e=setup(variant(synthetic(4),mode)); render(e,256); const c={};
 const wrap=(o,key,label)=>{const orig=o[key];o[key]=function(...args){c[label]=(c[label]??0)+1;return orig.apply(this,args)}};
 for(const key of ['renderBlock','collectEvents','processMaster'])wrap(e,key,key);
 wrap(e.automation,'tick','tick');const getter=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e.automation),'noteLanes').get;Object.defineProperty(e.automation,'noteLanes',{get(){c.noteLanes=(c.noteLanes??0)+1;return getter.call(this)}});
 for(const t of e.tracks.values())for(const key of ['schedule','clearAutomation','mixInto'])wrap(t,key,key);
 const NativeMap=globalThis.Map,NativeF64=globalThis.Float64Array;
 globalThis.Map=class extends NativeMap {constructor(...args){super(...args);c.maps=(c.maps??0)+1}};
 globalThis.Float64Array=class extends NativeF64 {constructor(...args){super(...args);c.f64=(c.f64??0)+1}};
 try{render(e,128)}finally{globalThis.Map=NativeMap;globalThis.Float64Array=NativeF64}
 return c;
}
if(process.argv.includes('--counts')){
 console.log(JSON.stringify({node:process.version,cpu:os.cpus()[0]?.model,baseline:counts('base'),mixer:counts('mixer'),notes:counts('notes'),disabled:counts('disabled'),empty:counts('empty')},null,2));
 // Active/queued rather than arbitrary stored clips.
 const e=setup(variant(synthetic(1),'notes'));render(e,128);e.apply({type:'transport/stop'});e.apply({type:'transport/play'});console.log('configured idle noteLanes',e.automation.noteLanes);render(e,128); e.apply({type:'clip/launch',trackId:'t0',clipId:'c0'});console.log('queued prelaunch',e.automation.noteLanes,e.status().tracks.t0);render(e,128);console.log('queued remains',e.status().tracks.t0);
}else{
 const results=[];
 for(const [label,p,scene] of [['simple1',synthetic(1),0],['simple4',synthetic(4),0],['simple8',synthetic(8),0],['simple16',synthetic(16),0],['LowLightDrop',exampleProjects[0].create(),6]]){
  const engines=Object.fromEntries(['base','mixer','notes'].map(mode=>[mode,setup(variant(p,mode,label==='LowLightDrop'?'low':'simple'),scene)]));
  for(const e of Object.values(engines))render(e,RATE);
  const times={base:[],mixer:[],notes:[]};
  for(let trial=0;trial<5;trial++)for(const mode of (trial%2?['notes','mixer','base']:['base','mixer','notes'])){const t=performance.now();render(engines[mode],RATE);times[mode].push(performance.now()-t)}
  const median=a=>[...a].sort((a,b)=>a-b)[2];
  results.push({label,tracks:p.tracks.length,voices:p.tracks.reduce((s,t)=>s+(t.voices??0),0),ms:times,median:Object.fromEntries(Object.entries(times).map(([k,v])=>[k,median(v)])),automation:engines.notes.status().automation});
  console.log(JSON.stringify(results.at(-1)));
 }
 console.log(JSON.stringify({node:process.version,cpu:os.cpus()[0]?.model,rate:RATE,quantum:QUANTUM,warmSeconds:1,trials:5,results},null,2));
}
```

The warm/timing loop uses exactly 48,000 frames, divisible by 128. The supplemental 0.25-second voice probe's loop rounds 12,000 requested frames up to 12,032; its scaled timings therefore include 0.267% extra audio and must not be interpreted as exact throughput. Original scratch outputs were `/tmp/sfx-f1-assessment/counts.json`, `timing-run1.json`, `timing-run2.json` and `voice-timing.json`; the durable counts/medians and complete primary reproduction are preserved above.
