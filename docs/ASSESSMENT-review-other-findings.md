# Independent assessment of review findings F2–F25

Date: 2026-10-18. Analysis only; no remedies implemented.

## Scope and evidence

Assessed the candidate claims in [the original review](REVIEW-performance-and-library.md), commit `8caa072`, against implementation ending at `c52a08c`. The saved checkout remained on `codex/performance-and-library`, HEAD `e3cf83d6a9100a9016bde6a4ca9b7b246f8f0ce3`. The changes from implementation end to handoff HEAD are documentation only. The original review is preserved. This document owns F2–F25; F1's performance benchmark and merge recommendation belong to the separate critical assessment. F2/F3 below were investigated independently, without reproducing that benchmark.

Inputs include [TASKS](TASKS.md), [PLAN](PLAN-performance-and-library.md), [SPEC](SPEC-performance-and-library.md), [ARCHITECTURE](../ARCHITECTURE.md), source paths and tests cited below. No checkout-local AGENTS.md was present; the supplied Context7 instructions governed documentation lookups. No existing shared source, test or configuration files were edited, staged or committed. Experiments originally ran in `/tmp/sfx-other-assessment`; at the user's request, the reproduction tests are now preserved in [docs/tmp/claims.test.ts](tmp/claims.test.ts), with a separate [runner configuration](tmp/claims.vitest.config.mts). Imports are repository-relative and diagnostic measurements print to the console rather than depending on a temporary output directory.

Run the preserved reproductions from the repository root with `npx vitest run --config docs/tmp/claims.vitest.config.mts`. They remain outside the normal unit/architecture suite. Their assertions capture the assessed implementation's **observed behavior, including defects**, rather than the desired behavior after fixes. Keep them until useful cases are promoted into the relevant regression suites; revisit assertions as findings are addressed. F2 uses private runtime instrumentation, F5 temporarily patches and restores collation, and F14 reports environment-dependent timings without a timing threshold. The standalone Chromium experiment described below is not part of this test file.

Evidence gathered here:

- **90 existing tests passed in 11 focused files**: `src/app/{midi-input,library}.test.ts`, `src/audio/recording-clock.test.ts`, `src/core/preset/preset.test.ts`, `src/core/library/library.test.ts`, `src/storage/{library-storage,library-transfer}.test.ts`, `src/core/persistence/automation.test.ts`, `src/core/engine/{automation,automation-audio}.test.ts`, and `src/core/patch/note-controls.test.ts`. Command: `node_modules/.bin/vitest run` followed by those paths. This is focused validation, not a new full-suite claim.
- **10 temporary reproduction tests passed** for F2, F3, F4, F5, F10, F11, F12's duplicate-ID clause, F13, F14 and F15. An initial F12 fixture incorrectly placed a mixer value in graph-only `controlValues`; correcting it to a valid graph target produced the result reported below. No product defect was inferred from that fixture error.
- A standalone **Chromium 156.0.8078.4** experiment accepted `createBuffer(2, 192, 192000)`. Decoding a generated 192 kHz PCM WAV through `OfflineAudioContext(1, 1, 48000)` returned 480 frames at 48 kHz for 10 ms of audio. This tests the disputed API/rate premise, not the complete preview UI. Chromium required execution outside the default sandbox after a Mach-port permission failure.
- Current documentation was fetched using Context7 `library` then `docs` for Web Audio, JavaScript collation and GitHub Actions. Primary specifications were also read directly. Context7 searches for Web MIDI returned unrelated matches; the official Web MIDI specification was used directly instead. No quota failure occurred.

The branch's prior 1,591 unit/architecture tests, typecheck, warning-free build, 17 smoke and 12 real-output checks remain historical delivery evidence. This assessment did not rerun that full set or the browser suites. Physical MIDI hardware remains untested. Snapshot XY corners remain deferred.

## Verdict matrix

Priority is independent of the review's labels: **P1** = address in the merge decision; **P2** = focused follow-up; **P3** = low-risk hardening/polish; **decision** = change only after agreeing a different contract. “Partial” explicitly excludes unsupported portions of a grouped claim.

| ID | Verdict | Independent impact / priority |
|---|---|---|
| F2 | Confirmed, frequency qualified | Redundant routing work; one invalidation/segment normally, two/sample with notes lanes. P1 alongside F1. |
| F3 | Confirmed for Smooth/slew; Edge clause not normally reachable | Helper elapsed time/rate depends on scheduling; installed only for relevant automation tracks. P1 alongside F1. |
| F4 | Observed behavior, intentional Read ownership contract | Zero override persists until explicit re-enable/launch/stop; automatic release would change semantics. Decision/P3 UX. |
| F5 | Confirmed exchange defect; project-reload claim overstated | Locale-sensitive canonical strings reject some valid bundles; project parser recomputes asset signatures. P1 compatibility design. |
| F6 | Missing flushing confirmed; CPU-spike claim unverified | Potential platform-dependent subnormal cost. P3 profiling/hardening. |
| F7 | Allocation/scanning confirmed; stop “poison” rejected | Bounded 4096-anchor lookup; previous-run rejection is intentional and tested. P3. |
| F8 | Rejected as defect | Duplicate held identities are deliberately idempotent; adapters supply per-press IDs. No change required. |
| F9 | Plausible numerical risk, audible/event defect unresolved | Floating accumulation differs with partitions; one-sample output mismatch not reproduced. P3 investigation. |
| F10 | Confirmed snapshot omission; “silently” overstated | Group/unlink invalidates saved snapshot routes despite identity-preserving edit. P2. |
| F11 | Confirmed sanitation/diagnostic gap | Cross-owner lanes survive but cannot play; editor can misleadingly offer them as available. P2/P3. |
| F12 | Partial: slash acceptance safely guarded; duplicate-ID warning gap confirmed | No demonstrated wrong-node binding from slash; malformed duplicate owners are ambiguous. P3. |
| F13 | Rejected as compatibility defect | Samples intentionally excluded; preset sample state and library closure separately retained. P3 optional clarity. |
| F14 | Confirmed avoidable validation cost; seconds claim unproven | Legal 1024-folder chain took ~562 ms in Node; browser/slow-device seconds plausible, unmeasured. P2. |
| F15 | Confirmed adapter parity gap | Trusted in-memory edit can install unsupported catalog version; importer already validates. P3. |
| F16 | Partial: stale error confirmed, 192 kHz failure rejected | Old preview rejection can overwrite status; actual preview decodes at 48 kHz. P2 stale completion. |
| F17 | Rejected as automatic-cleanup defect; retention tradeoff real | Presets/revisions deliberately survive replacement; obsolete graph recall refuses safely. Decision/P3 diagnostics. |
| F18 | Confirmed overbroad suppression | Pending conflict suppresses unrelated eligible CC control input, not notes/sustain/panic. P2. |
| F19 | Empty-copy confirmed; concurrent-write loss conditional | Clipboard clears; stale whole-array writes can overwrite newer edits, UI interleaving not reproduced. P3 / conditional P2. |
| F20 | Conditional stuck-close risk; array churn confirmed | Nonsettling driver promise blocks reattach of that object; no hardware occurrence established. P3. |
| F21 | Duplication confirmed; closed-panel Escape is intentional | Refactor constants if useful; Escape must cancel learn outside settings. P3 / no behavioral fix. |
| F22 | UI state issues confirmed; data corruption rejected | Stale export selection errors, invalid scene safely rejected by core. P3. |
| F23 | Confirmed coverage fact, explicit workflow choice | CI runs production smoke, not audio project. P2 policy decision. |
| F24 | Cancellation window confirmed; consequences qualified | Newer run replaces older; successful newer run deploys. Cache/build clauses are preferences/contracts. P2 decision. |
| F25 | Timing sensitivity and broad hook confirmed; present failure unresolved | Improve clock-controlled tests and node selection without weakening audio assertions. P2/P3. |

## Individual validation and proportionate measures

### F2 — Send automation invalidates routing

**Evidence and trigger.** [Engine](../src/core/engine/engine.ts) `writeAutomation` calls `setSends`/`invalidateOrder` for mixer send values outside curve collection. `mixSegment` collects per-frame values, then repeats those calls once per send curve per segment. `invalidateOrder` clears both schedule/mix orders and marks mix state stale. `mixTracks` rebuilds dependency ordering and synchronizes the send/audio boards; `updateMixState` rebuilds mute/solo send gates. [TrackRuntime](../src/core/engine/track-runtime.ts) `setSends` allocates `Object.entries`, and `sendTargets` depends on destination keys.

Instrumented a fresh 48 kHz engine with a single constant send lane, an empty return, and a 128-frame render; no runtime code changed. With only that lane: **1 invalidation, 1 scheduleTracks call, 1 mixTracks call**. Adding a valid enabled notes-domain control lane: **256 invalidations, 128 scheduleTracks calls, 128 mixTracks calls**. Thus the review's per-sample statement depends on the notes-lane path. The duplicate invalidations do not imply two complete routing rebuilds per sample: caches are consumed at the intervening scheduling/mixing points.

**Impact/measure.** Confirmed wasted real-time work, amplified by F1. Treat F2 as a distinct topology-cache issue even if F1 restores block audio. Separate destination membership from gain updates; cache target sets, batch writes per segment, and invalidate only actual dependency/gate changes. A zero/nonzero change must still establish a newly used destination in time; retaining configured lane destinations at zero may be simpler than topology churn. Do not bypass send gates, return ordering or tails.

**Regression checks.** Count rebuilds for a constant/ramping existing send, a new destination, return removal and lane release with/without notes lanes. Verify same stereo audio through mute/solo and return chains. Existing `automation-audio.test.ts` tests Send-node buffer offsets, which is a different path from mixer-send routing; it is not an F2 performance regression test. P1, coordinated with F1 rather than a blanket merge blocker based solely on the old label.

### F3 — Dynamic note-helper time base

**Evidence and reachability.** [NoteControlGraph](../src/core/instrument/note-control-graph.ts) compiles at 48000 and processes a shared one-frame 48000 context per call. [TrackRuntime](../src/core/engine/track-runtime.ts) advances it once in `schedule`. [compileAutomation](../src/core/automation/evaluate.ts) includes a dynamic note graph only for instrument tracks with a notes-domain lane and a surviving compiled automation track. It can remain installed when a different clip is playing or transport is stopped; sample-sized scheduling is enabled by queued/playing enabled nonempty notes lanes, rather than merely by installation. Therefore a universal “all note graphs are wrong” interpretation is incorrect.

[Smooth](../src/core/dsp/nodes/math/smooth.node.ts) is allowed in notes graphs and uses `rate / sampleRate` in slew mode and an exponential time constant otherwise. In a temporary `control -> smooth(mode=slew, rate=1) -> transpose` graph, primed at zero then set to one, **375 calls advanced to 0.0078125; 48000 calls advanced to 1**. These represent one wall-clock second at 128-frame versus one-frame scheduling at 48 kHz. Normal scheduling also depends on caller chunk boundaries, so 128× is an illustrative ratio, not a universal constant. Even one-frame scheduling at 44.1 kHz advances only 44100/48000 of a second per actual second under this clock.

**Excluded clause.** [Edge](../src/core/dsp/nodes/math/logic.ts) explicitly has `inNotes: false`; [sanitizePatch](../src/core/persistence/sanitize-patch.ts) excludes it from normal persisted note graphs. The helper's `global` filter alone would admit a directly constructed invalid graph, but that does not establish a supported-project Edge defect. The baked path is also a one-frame constant resolver, not a faithful elapsed-time simulation. Simply copying its `inNotes` filter would **not remove Smooth**, which has `inNotes: true`.

**Measure/checks.** P1 correctness dependency of any F1 scheduling redesign. Define helper evaluation over actual elapsed frames, engine sample rate and tempo, and preserve automation/event boundary timing. For stateful chains, merely substituting a larger delta in one node is insufficient unless their chained semantics are defined. Test step responses at 8/44.1/48/96 kHz, equal elapsed time with 1/97/128/173-frame partitions, lane launch/stop/queued transitions and stopped live notes. Existing note-control/automation tests establish constants, wiring ownership and discrete note timing, not these time constants. Restricting helpers to stateless nodes is an alternative product limitation requiring saved-graph compatibility diagnostics; silently dropping existing Smooth nodes is not a neutral fix.

### F4 — Momentary release and Read override lifetime

**Validation.** [midi-controls](../src/app/midi-controls.ts) cleanup `release` does set an owned held momentary override to zero. Ordinary CC release follows `gesture.change(0)` and has the same result under Read. A temporary reproduction set a valid momentary switch's playback value to one, sent CC127 then CC0, and found a zero override after release. [control-gesture](../src/state/control-gesture.ts) explicitly redirects edits of an automated/already overridden target to overrides; `end()` finishes Touch but does not release ordinary Read overrides.

**Verdict.** This follows SPEC “Playback and precedence”: manual touch holds ownership until **Re-enable automation, next clip launch or stop**. Touch arm is different: its completed take releases to Read. A momentary's output following the press/release threshold does not by itself specify that Read ownership must end on release. Existing fake-port tests verify base-value momentary cleanup; they do not contradict this Read rule. The review's “permanently” and “only a small button” claims are inaccurate: launch/stop and the editor's explicit Re-enable automation action also recover it.

**Measure/checks.** No automatic-release bug fix is justified under the present contract. If users expect momentary takeover only while held, agree that exception explicitly and track the override's creating source, not just whether an override currently exists. Test pre-existing overrides, multiple devices on one target, disconnect/removal, manual intervention while held, Read versus armed Touch, launch and stop. Better mapping feedback for active override ownership is optional P3 UX; it must not silently change established latch behavior.

### F5 — Locale-sensitive persisted signatures

**Confirmed core, narrower consequences.** [assetSignature](../src/core/preset/assets.ts) sorts nodes, config keys, connections and modules using default `localeCompare`; [portable clip graphShape](../src/core/library/clips.ts) also uses it for connection order. A temporary experiment on the same legal two-control-node asset, IDs `ä` and `z`, produced different complete signatures using English versus Swedish collation. That demonstrates a real identity instability for accepted IDs, not a claim that every UUID-only normal project will fail. ECMA-402 specifies locale-sensitive, implementation-dependent collation; no cross-host stable canonical order is promised. [Official collation specification](https://tc39.es/ecma402/#sec-collator-comparestrings).

[validateLibraryPayloads](../src/core/persistence/validate-library.ts) strictly compares persisted records with reconstructed records. [sanitizePresetFields](../src/core/persistence/sanitize-presets.ts) recomputes revision signatures. A valid bundle made under a differing collation can therefore fail “requires repair.” Portable lane signatures can instead cause compatible insertion to omit lanes. However an ordinary project reload already recomputes asset signatures for both subsequent comparison inputs, so the claim that an ICU update necessarily breaks stored **project asset presets** is overstated. Portable clip signatures are a separate persisted compatibility surface.

**P1 measure with compatibility work.** Define a deterministic **UTF-16 code-unit order** (the `<`/`>` comparator already used by `canonicalRecord`), not an unspecified “codepoint” replacement. Do not land a comparator-only change: old valid `.sfxlib` v1 records may fail strict comparison even on the same machine after ordering changes.

Design versioned signature interpretation and explicit migration for project revisions, catalog revisions, `.sfxlab` packages and `.sfxlib` exchange. Preserve opaque revision IDs, preset references and sample closure; a changed compatibility string does not authorize deduplicating away immutable revisions. Validate the legacy string's bounded structural content against the payload before normalizing; do not waive arbitrary strict-record mismatches as legacy. Portable clip signatures contain a serialized shape but no source graph: migrate only after validating that shape and preserving node-index/order meaning. Keep original files/catalog backups and make migration atomic; unsupported legacy cases need actionable diagnostics and a recovery/re-export path, not data deletion. Select a format/version strategy explicitly so old readers reject unsupported formats rather than silently repair them.

**Checks.** Cross-locale fixtures (`ä/z`, punctuation/case, nested modules, connections), old and new bundle/project/package round trips, strict rejection of forged signatures/extra fields, preset recall after reload, portable clip insertion and unchanged sample dependencies. Do not infer safety from `canonicalRecord`: it orders object keys, not the already encoded signature string.

### F6 — Denormal protection

[Delay](../src/core/dsp/nodes/delay.node.ts), [Ping-pong](../src/core/dsp/nodes/ping-pong.node.ts), [Comb](../src/core/dsp/nodes/comb.node.ts) and [Filter](../src/core/dsp/nodes/filter.node.ts) do lack explicit tiny-state flushing. The review's suggested reference path is wrong; the existing flush helper is in [dsp/nodes/reverb-tank.ts](../src/core/dsp/nodes/reverb-tank.ts), threshold `1e-20`. Recursive tails can reach tiny magnitudes. That establishes a missing defensive pattern, **not observed periodic CPU spikes**. Float32 ring contents and JavaScript's double arithmetic have different subnormal ranges, and the actual cost depends on runtime/CPU handling. No affected-platform timing experiment was performed.

P3: measure long impulse-then-silence tails on target browsers first. If warranted, flush recursive storage using a shared documented inaudible threshold, with finite-output, tail-length and low-level signal checks. Preserve stop/release tails and delay-crossfade history; do not substitute broad idle-graph skipping or alter bounce's explicit tail budget. Existing delay timing/tempo tests are timing/audio checks, not denormal CPU evidence.

### F7 — RecordingClock lookup and stopped runs

[RecordingClock](../src/audio/recording-clock.ts) copies/reverses the anchor array, finds an anchor, then `indexOf`/slices/scans later entries. O(n) time and up to two copies are confirmed; anchors cap at **4096**, with sparse additions only for tempo/transport/discontinuity changes, not every status packet.

The later-stop rejection is **intentional**. [Its test](../src/audio/recording-clock.test.ts) explicitly requires a delayed event from a previous run to become unavailable after Stop/restart, while preserving delayed lookups across tempo changes within the current run. Stop finishes Touch before dispatch; owner/run lifecycle prevents old native callbacks acquiring a new destination. Calling this “poison” proposes removing an ownership safeguard without showing lost valid current-run samples.

P3: binary-search anchors and maintain a current-run boundary/index to remove allocations, preserving the same eligibility rule. Test delayed releases within one run, before/after tempo edits, Stop, restart and the 4096 cap. Relaxing historical rejection requires an explicit run token and destination validation, not merely restricting a search window.

### F8 — Reused live note IDs

[LiveNotes](../src/core/engine/live-notes.ts) documents uniqueness per press and ignores a duplicate **currently held** identity. [noteKey](../src/core/session/note-identity.ts) keys source/channel/id/path, not pitch once identity exists. After release removes the identity, reuse is accepted. Sustain can intentionally keep it held after physical release; a new press then needs a fresh ID.

[held-notes.test.ts](../src/core/engine/held-notes.test.ts) expressly tests duplicate-identity suppression. [The MIDI adapter](../src/app/midi-input.ts) supplies serial per-press IDs and FIFO physical releases. Rejecting duplicates is the enforcement of the command contract, not an unenforced convention. Replacing a held identity on repeated input could release a real held voice and damage source isolation. No fix required. Optional development-only diagnostics and an adapter contract test are proportionate if another adapter is added; avoid audio-thread logging/allocation.

### F9 — Continuous note-clock floating accumulation

[Engine](../src/core/engine/engine.ts) advances `noteBeat` by `frames * beatsPerSample`; this clock intentionally runs while stopped, unlike transport. Floating addition is partition-dependent, and `collectEvents` rounds beat offsets to frame positions. This supports the possibility of a boundary tie moving with chunking. It does **not prove a one-sample event/audio mismatch** for supported projects. No such output counterexample was established here.

Existing automation tests compare uneven partitions and live/offline output, and held-note tests cover uneven idle intervals before playback. They are useful coverage, not proof for all durations/tempos. P3: seek a deterministic boundary case across long runs, tempo changes, stopped live notes and generated notes. If confirmed, prefer an integer frame clock with explicit tempo segments/beat origins. Quantizing to transport alone would break stopped live-note timing. Preserve exact event ordering and current audio tolerances; do not demand bit equality where the contract uses an amplitude tolerance, or loosen that tolerance to mask an event shift.

### F10 — Snapshots omitted from group/unlink route remapping

[mapControlRoutesAt](../src/core/project/control-target-remap.ts) maps control values, sample bindings, clip/slot lanes and MIDI mappings but never snapshot values. A temporary project with one root control, a saved snapshot and `groupNodesAsModule(..., ['k'])` reproduced `recallSnapshot` returning **“Node is missing.”** [Existing preset tests](../src/core/preset/preset.test.ts) test sample-binding grouping/unlinking, not snapshot-value preservation. The review's omission claim is confirmed; “silently” is too broad because recall returns explicit issues and the UI reports recall results.

P2: apply the same precise route rewrite to project snapshots affected by the identity-preserving edit, including edits to shared definitions. Keep scope/owner guards and do not guess by label or flattened position. **Do not blindly rewrite immutable project presets or revision payloads**: those have structural compatibility contracts; grouping changes that structure. If preserving preset recall across grouping is desired, create an explicitly transformed revision/preset pair or offer a save-new-version workflow with old state retained.

New grouping needs no blanket retargeting migration. Existing already-stale snapshots cannot safely be reconstructed without the original route/edit history; Undo or a pre-edit project copy is the recovery path. Tests should cover root/nested/shared-definition group and unlink, unrelated scopes, reload/package export, history undo/redo, partial diagnostics and A/B target-set compatibility. Never erase unavailable saved values during repair.

### F11 — Cross-owner clip lanes persist inertly

[sanitizeClip](../src/core/persistence/sanitize-clip.ts) and [sanitizeAudioClip](../src/core/persistence/sanitize-audio-clip.ts) call `sanitizeAutomation` without an owner filter; dedicated slot sanitation checks its owner. A temporary MIDI clip targeting master volume survived project serialization/parsing with its lane intact, while `compileAutomation` produced no playable lane. Its owner equality check prevents cross-track execution.

Confirmed sanitation/diagnostic inconsistency, not a cross-track write vulnerability. The editor resolves target existence independently of lane ownership, so a well-formed but wrong-owner target may look available yet do nothing. This differs from retaining a valid same-owner target whose node is temporarily missing. SPEC explicitly disallows cross-owner lanes.

P2/P3: pass owner context to clip parsing, and either reject/warn or retain with an explicit unsupported-owner diagnostic. Do not blindly rebind it to the containing track: a duplicate-ID repair may be involved. A migration should preserve recoverable originals and distinguish structural invalidity from temporarily unavailable supported references. Tests: MIDI/audio clips, slots, duplicate tracks, legitimate unavailable same-owner targets, reload, package and strict bundle validation. Keep runtime filtering as defense in depth.

### F12 — Slash IDs and duplicate track IDs are separate issues

**Slash acceptance:** [control resolution](../src/core/control/resolve.ts) and [sample resolution](../src/core/preset/samples.ts) forbid slash-containing path components for nested routes, but permit a root ID containing slash. Both then require exactly one matching flattened node. A standalone slash ID can be addressed unambiguously; a root/nested flatten collision is rejected rather than selecting an arbitrary node. Acceptance alone is **not evidence of misrouting**. Normal generated IDs avoid slash. A malformed collision may make legitimate targets unavailable; hardening the flatten namespace is optional, not a proven silent-binding bug.

**Duplicate owners:** [sanitizeProject](../src/core/persistence/sanitize-project.ts) keeps the first track ID and assigns a fresh ID to later duplicates without a specific warning. A temporary serialized project with two `a` tracks and a valid graph `controlValues` target for `a` parsed with **no warnings**; the second owner changed and the reference stayed on the first. “Retarget” is imprecise: the input was already ambiguous, and the parser cannot determine which duplicate was intended. This is a confirmed malformed-file repair/diagnostic gap, not evidence of normal generated-file corruption.

P3: warn about duplicate owner repairs and report references whose intent cannot be recovered. Do not automatically move all references to the second track. If reserving/escaping slash universally, design a project/module/target migration covering wires, nested interfaces, samples, lanes, MIDI mappings, snapshots, immutable presets/revisions, library assets and packages. Prefer collision-free internal representations over silently renaming loaded IDs. Test root slash without collision, deliberate nested collision and duplicate-owner projects with all reference classes. Preserve originals/Undo for recovery.

### F13 — Sample IDs excluded from structural signatures

This exclusion is explicitly required by SPEC's shipped preset defaults: sound values and samples may vary within a compatible revision. [saveProjectPreset](../src/core/preset/assets.ts) deduplicates structural revisions but saves **all current per-use sample choices**, including null, in each preset. A temporary A/B sample experiment confirmed one reused revision with an older payload closure while the second preset retained sample B. Existing preset tests expressly require one revision for differing sample selections and successful recalls.

That old payload dependency list is not the sole project dependency source: [project sample dependency collection](../src/core/project/sample-use.ts) includes saved preset bindings, and [captureLibraryAsset](../src/core/library/assets.ts) builds a fresh payload then unions current-state and all compatible associated presets' sample choices. Existing library tests exercise complete sample closure, reload and independent package export. There is no demonstrated missing-sample export defect from signature omission.

No signature change warranted. Including sample IDs would make switching a sample spuriously incompatible and multiply revisions, contrary to the contract. P3 optional: clarify the distinction between structural compatibility and a particular immutable payload's captured dependencies; add a regression changing only a bound sample after an initial preset, then catalog/export/import both presets. Any broader revision-dedup redesign must preserve preset references and complete dependency closure rather than hash the sample list into compatibility.

### F14 — Bounded bundle validation can still block the main thread

[validateLibraryCatalog](../src/core/library/bundle.ts) repeatedly searches folders during each ancestor walk, modules during graph traversal and samples/items/revisions during closure checks. Budgets limit records and expansion, but do not make repeated lookup costs small. Folder ancestry is worse than a simple pairwise scan: for each folder it walks a chain and each step performs a linear `find`.

A temporary valid catalog containing only a chain of folders, no samples/items/revisions, passed all validation at **128 folders: 3.6 ms; 512: 81 ms; 1024: 562 ms** in the local Node runtime. This is a single diagnostic measurement, not a browser benchmark or a worst-case bound. It confirms substantial synchronous blocking within legal budgets, without proving the review's literal “seconds” on this machine. A hostile actor needs the user to import/review a bundle; it is not an unsolicited remote audio-thread attack.

P2: pre-index IDs and memoize validated ancestry/closure; preserve duplicate/cycle/missing-reference and strict-field checks. Maps alone remove linear lookup but not repeated walks/instantiation of identical revisions. Consider yieldable/worker staging after measurement if large valid assets remain slow. Validate at both stage and commit as required; optimization must not weaken ZIP/object/module budgets or atomic publication. Existing `library-transfer.test.ts` covers budgets/rollback, not latency. Add legal near-limit chain/shared-revision cases and operation-count scaling checks; use environment-specific performance monitoring rather than a brittle universal millisecond test.

### F15 — Memory adapter lacks version guard

[createMemoryLibraryStorage](../src/storage/library-storage.ts) accepts the result of a synchronous edit without checking `version`; the IndexedDB adapter checks both the stored and next version. A temporary update returning `{ ...catalog, version: 2 }` succeeded and remained readable in memory. Confirmed behavioral parity gap.

Reach is limited: this adapter starts with an empty v1 catalog and accepts trusted edit functions; it does not load an arbitrary persisted future catalog. Bundle parsing/commit has its own version validation, so this is not an established import bypass. P3: check the next version before publishing either metadata or blobs, using shared error wording. Test both adapters reject unsupported edits atomically while retaining prior catalog/bytes. Existing transfer tests cover memory byte-conflict rollback and completeness; add parity coverage without replacing conservative retention.

### F16 — Stale preview errors; claimed rate ceiling

**Confirmed stale completion:** [preview](../src/app/library.ts) uses a generation token around rendering/start and avoids stopping a newer context in the catch path. But its catch **always rethrows**, including after cancellation. [LibraryPanel](../src/ui/library/LibraryPanel.tsx) `run` catches that stale rejection and updates the shared message/busy state without an operation token. An old storage/decode error after starting another preview can therefore overwrite newer status. Stale successful completions can also set the generic success message. This is status ownership, not evidence that stale audio starts: the generation checks prevent that.

P2: make cancellation/stale completion an explicit outcome and apply status updates only for the owning operation. Keep errors from the current preview visible and preserve cleanup of all contexts/sources. Add deferred-read/decode tests: A canceled, B starts, then A succeeds/rejects; verify B status/audio ownership, close-before-start and unmount cleanup. Prior browser preview cancellation coverage did not test late status errors.

**Rejected rate claim:** [decodeAudio](../src/audio/decode-audio.ts) decodes every file through a **48 kHz OfflineAudioContext**, so direct sample preview uses decoded 48 kHz data, regardless of 192 kHz metadata/input. Asset bounces default to 48 kHz too. The standalone Chromium experiment above independently confirmed that path's resampling and even accepted a direct 192 kHz AudioBuffer.

The [2021 Web Audio Recommendation](https://www.w3.org/TR/2021/REC-webaudio-20210617/#dom-baseaudiocontext-createbuffer) guarantees support **at least** across 8–96 kHz; it does not impose a universal maximum of 96 kHz. The [current 1.1 editor draft](https://webaudio.github.io/web-audio-api/#supported-sample-rates) specifies 3–768 kHz. Draft requirements are not proof of shipping support on every browser. Neither document supports the review's blanket cap; no 192 kHz-specific remedy is needed here. Friendly handling of actual allocation/decode failures remains optional UX hardening.

### F17 — Old presets/revisions survive graph replacement

[insertLibraryAsset](../src/core/library/assets.ts) replaces the selected graph(s), removes affected active control/sample overrides and appends new remapped revisions/presets. Existing presets and their immutable revisions remain paired. The old presets may fail structural recall into that owner, but their revision references are **not dangling**. [recallProjectPreset](../src/core/preset/assets.ts) refuses a graph-signature mismatch; it never blindly applies old IDs to a new graph. Their data can still be useful for another compatible owner, historical recovery or Undo.

This is consistent with SPEC's retained unavailable-reference diagnostics, immutable independent copies and conservative dependency retention. Automatic deletion would destroy saved sound state and could discard sample dependencies. Retention does consume the 128-preset/64-revision limits after repeated replacements; that is a real documented-capacity tradeoff, not sufficient justification for implicit pruning.

Decision/P3: show incompatible/old-owner presets clearly, optionally offer an explicit reviewed cleanup/export/archive action, and provide useful limit diagnostics. Existing preset/library tests cover incompatible recall, independent insertion, reload and sample closure. Any cleanup needs tests for another compatible owner, history undo/redo, packages and sample/blob retention. No migration or automatic GC recommended from this finding alone.

### F18 — Pending learn conflict suppresses unrelated CCs

[midi-controls](../src/app/midi-controls.ts) returns immediately on any `store.conflict`, before source lookup. Thus device B's unrelated mapped eligible CC stops updating while device A awaits a reassignment decision. This is broader than the spec's requirement to withhold the conflicting assignment. [midi-input](../src/app/midi-input.ts) handles note events, sustain CC64 and CC120–127 source cleanup outside this path, so “all MIDI input is dropped” would be false.

Confirmed P2 performance-workflow defect. Scope suppression to the conflicting source tuple `(deviceId, channel, cc)` and preserve the rule that a confirming learn message does not change the sound. Do not allow either side of the unresolved source assignment to move unexpectedly. Existing fake-port conflict tests exercise confirm/cancel, not unaffected simultaneous sources. Add device/channel/CC independence, held momentary release during conflict, cancel/confirm and sustain/panic continuity.

### F19 — Clipboard and concurrent lane edits

**Clipboard:** [AutomationEditor](../src/ui/automation/AutomationEditor.tsx) keyboard handlers invoke `copy` even with no selection. `points=[]` leads to `clipboard=[]`; `Math.min(...[])` is Infinity but no invalid points are created because the mapping is empty. The toolbar disables Copy/Cut for empty selections; keyboard handling does not. Confirmed small UX inconsistency, P3: no-op on empty selection and test copy -> deselect -> Cmd/Ctrl-C -> paste.

**Writes:** `change` constructs a complete next lane array from render-time `lanes`. [editOwnerAutomation/editClipAutomation](../src/state/automation-store.ts) fetch the latest project but replace the automation array with the supplied one. A stale caller can overwrite a newly committed Touch/recall lane; fetching the latest project is not sufficient to merge those arrays. However ordinary JS callbacks do not execute simultaneously, and UI interleaving must actually leave a handler/drag origin stale. No deterministic end-to-end UI loss case was reproduced, so a universal “editor races every write” claim is unproven.

Conditional P2 if reproduced: use updater-style edits against current owner/clip/lane identity, plus a revision/conflict rule for an active drag whose origin must remain stable. Merge unrelated lanes safely; define same-lane Touch versus editor ownership rather than silently combining incompatible gestures. Tests should interleave Touch completion/preset recall with drawing/blur/drag, preserve unrelated points/lanes and retain one undo transaction per gesture. Do not globally serialize all playback readouts with authored edits.

### F20 — Nonsettling port close and state-array churn

[midi-input](../src/app/midi-input.ts) clears notes and detaches callbacks immediately, then retains the specific `MIDIInput` in `closing` until `close().finally` runs. A promise that never settles would block reattachment of **that object**, including rapid disable/re-enable. A new port object is not in that Set. [The fake-port test](../src/app/midi-input.test.ts) intentionally verifies waiting for close before reattachment, preventing a late close from shutting a newly attached input. The [Web MIDI close algorithm](https://www.w3.org/TR/webmidi/#dom-midiport-close) defines asynchronous resource release/settlement, without an application-level timeout. A hung-driver occurrence was not established; hardware is untested.

P3 resilience: expose a stalled-input diagnostic/retry lifecycle if needed. A timeout must not simply drop `closing` and reopen the same object while the old close can still complete; preserve epoch/object ownership and cleanup. Use unresolved, late-resolving, rejected-close and replacement-object fake ports before hardware testing.

`refresh` also unconditionally constructs a fresh `inputs` array and calls `setState` on each access statechange. Consumers subscribed to that array/whole MIDI state can rerender; this is real churn, but statechanges are lifecycle events, not per-CC traffic. Optional equality-before-publish optimization is P3, not a demonstrated performance blocker.

### F21 — Constants and Escape behavior

[touch-store](../src/state/touch-store.ts) duplicates four-beat quantized-boundary calculations at launch-acknowledgement checks and take closure; the engine's launch queues also use four beats. [control-gesture](../src/state/control-gesture.ts) uses literal 800 for undo burst grouping while the Touch inactivity timer imports `TOUCH_RELEASE_MS=800`. Matching values are consistent today. They represent potentially distinct policies, so either share a named agreed constant or name both intentionally; duplication alone is no current functional defect. P3 maintenance.

[MidiSettings](../src/ui/midi/MidiSettings.tsx) registers Escape for the lifetime of the component, including when its overlay is closed. This is **required for the learn flow**: the learn/conflict notice renders outside the overlay and panel right-click can start learning without opening settings. SPEC explicitly promises Escape cancels. The handler neither prevents default nor stops propagation. Gating it solely on `open` would regress cancellation. No behavior fix recommended; tests should cover closed-overlay learn/conflict cancellation and coexistence with other Escape handlers. Quantization refactors should retain exact-boundary/queued-ack behavior and Touch run ownership.

### F22 — Stale bundle selection and scene input

[LibraryPanel](../src/ui/library/LibraryPanel.tsx) keeps `checked` IDs independently of catalog/trash state; `setCatalog` does not prune them, and navigation/filtering can hide checked rows. Hidden selection can be intentional, but a trashed/deleted checked item leaves the export button enabled and the operation fails. [selectLibraryBundle](../src/core/library/bundle.ts) explicitly rejects unavailable selected/dependent items, so the failure cannot silently export a different item. P3: reconcile checked IDs against current nontrashed items, display total hidden selection and offer clear-selection behavior; test refresh/trash/restore/import/navigation.

The scene input permits `Number(value)-1` below zero despite HTML `min=1`. [insertLibraryClip](../src/core/library/clips.ts) independently requires an integer scene in `[0, sceneCount)`, before any project mutation. Invalid text/empty/negative/out-of-range values therefore produce a useful error path, not negative array insertion/data corruption. P3: clamp or disable insert on invalid input, reconcile shrinking sceneCount, preserve explicit occupied-slot replacement. No core range relaxation needed.

### F23 — CI audio coverage

[Workflow](../.github/workflows/deploy-pages.yml) runs `npm test`, installs Chromium and runs `npm run test:smoke`. [package.json](../package.json) selects only `--project=smoke`; [Playwright config](../playwright.config.ts) separates `*.smoke.spec.ts` and `*.audio.spec.ts`. Thus the committed workflow never selects the dedicated real-output audio suite. Some smoke cases still exercise the real worklet; “CI does not run audio at all” is too broad. PLAN slice 0 explicitly chose production smoke as the PR/main gate.

Confirmed P2 coverage gap/decision, not a runtime defect or broken promise that full audio was already mandatory CI. Following timing/ownership fixes, run the relevant real-output checks locally and decide on a PR gate versus scheduled/manual audio workflow. A nightly run improves detection lag but does not block a bad PR. Use isolated builds/ports, explicit readiness, retained failure artifacts, complete nonempty finite capture windows and current tolerances. Do not weaken sample comparisons just to fit a shared CI runner. No schedule/workflow was created by this analysis.

### F24 — Deployment cancellation and tooling clauses

**Cancellation:** workflow concurrency group includes workflow/ref and sets `cancel-in-progress: true`. Two main pushes share a group; the newer run can cancel the older between upload and deploy. [GitHub's official deployment documentation](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments) confirms running workflows in the group can be canceled. If the newer run succeeds, it deploys; if it fails or is canceled, the old published site can remain. It is inaccurate to imply cancellation alone guarantees no deployment until another push: workflow_dispatch and rerunning a valid run are also available recovery mechanisms.

P2 policy: choose latest-commit-only deployment or preserve the latest already-verified deployment while newer verification runs. Conditional cancellation for PRs is a reasonable choice if completing the active main deploy matters. It does not automatically guarantee every pending main run deploys: pending concurrency behavior must also be considered. Job-level deployment serialization can separate verification from publishing, but avoid stale deploys finishing after newer commits. Verify branch/PR/manual-event scoping, artifact identity, environment permissions and cancellation at each stage; no remote deployment experiment performed here.

**Browser cache:** no Playwright browser cache is configured. This is an installation-time/cost preference, not correctness. Measure before adding version/OS-keyed cache complexity; existing npm cache is separate.

**Build:** `webServer.command` starts `vite preview`, which requires built output. Every documented npm browser command already builds first. Direct `playwright test` without a build is outside that wrapper contract; this is not a broken supported command. Optional make direct invocation self-contained or document its prerequisite. Preserve the special Pages `BASE_PATH` build, which differs from the browser-test root build.

### F25 — Timing bounds and generic audio tap

**Timing:** [tempo audio tests](../tests/browser/tempo.audio.spec.ts) wait for captured frame thresholds, dispatch tempo changes from the main thread and require the second edit before frame 96000 in a 144000-frame comparison. A stalled main thread can miss that scheduling window while audio continues. The test stamps actual boundaries and compares output at those boundaries, which is sound; its dispatch deadline is load-sensitive. [automation audio tests](../tests/browser/automation.audio.spec.ts) use a 1300 ms mouse-held interval for a Touch take, so long scheduling stalls can change its musical duration. The later output comparison is frame-count-based with finite/full-window assertions, not merely a wall-clock sleep. No flake was reproduced in this assessment.

P2/P3: schedule test changes against acknowledged render-frame/beat boundaries or use bounded clock-aware orchestration, ensure at least the intended nonzero Touch span, and preserve a full post-edit tail window. Longer polling alone may not fix missing the edit deadline. Never relax the `0.00002` audio tolerance, accept missing frames or treat zero frames as silence to hide scheduling failures.

**Tap:** [audio-tap](../tests/browser/audio-tap.ts) overwrites `window.__sendEngineCommand` and `window.__audioTap` for every wrapped AudioWorkletNode; the latest node wins. A second engine/capture node could redirect commands or reset the readout. Current production library preview uses Bounce plus AudioBufferSource, not another AudioWorkletNode, and dedicated capture tests retain the original constructor for their tap nodes. A current failing scenario was not demonstrated. P3: select the engine processor name/context explicitly and retain per-node cleanup/readiness. Test two nodes, recreated audio contexts and disposal. Keep nonempty-window checks and real engine command ownership; this is test-harness hardening, not a production global-hook defect.

## Recommended order and acceptance gates

1. Combine F1's separate evidence with **F2/F3** to choose the audio scheduling change. F2 is measurable cache churn and F3 is a correctness issue whose semantics must survive that change. Do not copy the review's proposed batching without checking event boundaries, queues, wire ownership, source identity, stopped live notes and release/effect tails.
2. Resolve **F5's signature version/migration/recovery plan** before changing persisted canonicalization. Validate old and new projects, embedded presets, catalog items, portable clip lanes, project packages and library bundles. Treat this as compatibility work, not a one-line comparator cleanup.
3. Focused follow-ups: **F10** snapshot route preservation; **F16** status ownership; **F18** conflict isolation; **F14** lookup/ancestry cost. Address F11 sanitation/diagnostics with explicit preservation of recoverable unavailable references. None warrants automatic deletion or broad retargeting.
4. Decide **F23–F25** verification/deployment policy separately from runtime defects. F4, F7's stopped-run rule, F8, F13, F17 and closed-overlay Escape do not justify the review's suggested behavioral fixes under current contracts.
5. For authorized future fixes, run focused regressions plus appropriate unit/type/build and real-output browser gates. Preserve complete finite capture windows, nonzero readiness and amplitude tolerances. Physical MIDI checks remain a separate unperformed requirement; snapshot XY remains deferred.

All 24 IDs have been assessed. The strongest confirmed production issues here are F2, F3, F5, F10, F14, F16's stale status path and F18; several additional items are smaller validation/UI/adapter gaps. No actual denormal CPU spike, one-sample clock counterexample, driver hang, UI concurrent-write loss or timing-test flake was established. Those uncertainties are not converted into accepted defects or blanket platform limits.
