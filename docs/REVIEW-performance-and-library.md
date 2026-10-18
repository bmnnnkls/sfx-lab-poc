# Code Review Report: `codex/performance-and-library` → `main`

**Date:** 2026-10-18
**Review model:** GLM 5.3 Flash (`bit-ai/glm-5-3-flash-r`)
**Scope reviewed:** 254 files, +14,871 / −477 lines (merge candidate `codex/performance-and-library` into `main`)
**Verdict: merge with conditions** — one critical performance defect and three major issues should be fixed (or explicitly accepted) first.

---

## 1. General Assessment

This is a high-quality, unusually disciplined body of work. The branch delivers eight planned slices of a browser DAW prototype: portable verification infrastructure, a shared control-target model, MIDI performance input, automation lanes/slots/touch recording, presets/snapshots, a library catalog with IndexedDB storage, `.sfxlib` bundle exchange, and tempo-synced delay polish.

Strengths that stand out across all review tracks:

- **Verification culture.** Every slice ships with migration fixtures, bounded validation, and committed test evidence recorded in [PLAN-performance-and-library.md](PLAN-performance-and-library.md). Independently confirmed during this review: typecheck clean, **1,591 unit/architecture tests across 126 files pass**, production build succeeds **without chunk-size warnings**.
- **Genuinely good real-time engineering** where it counts: click-free stationary-tap delay retuning with 20 ms crossfades, a coherent note-identity system covering stealing/echo/arp/clip-edit cleanup, and one shared `Engine.render` path for both live and offline bounce (determinism by construction).
- **Security posture at trust boundaries is solid.** The ZIP importer preflights every central/local header before allocating, rejects zip-slip paths/bomb ratios/unsupported features, and IDB publish is one atomic transaction with tested rollback (quota, abort-after-success, stale tabs). Prototype pollution via crafted JSON was checked empirically — sanitizers rebuild objects field-by-field; no path reaches `Object.prototype`.
- **Transient state is properly firewalled** from authored project state — runtime tests prove zero history/autosave writes during gestures, overrides, and touch takes.

The weakness is **performance in the audio thread when notes-domain automation plays** (Critical F1): the block-based engine degenerates to per-sample processing for the *entire* graph, with O(tracks·clips·lanes) scans per sample. This is the merge blocker.

---

## 2. Verification Performed (this review)

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ clean |
| `npm test` (unit/architecture) | ✅ 1,591 / 1,591 across 126 files |
| `npm run build` (tsc + vite production) | ✅, no chunk warnings |
| Deep code review (4 parallel domain tracks, full-file reads) | ✅ completed |
| Playwright smoke/audio suites (17 smoke + 12 audio claims in plan) | ⚠️ **not re-run in this review** — plan claims they passed on 2026-10-18; recommended before merge |
| Manual hardware MIDI check | ❌ not performed (also not by the branch — the plan is honest about this) |

---

## 3. Summary of Work Done

| Slice | Content | Format bump |
|---|---|---|
| 0 | Reproducible builds, Playwright smoke/audio infrastructure, PR CI gate, Pages deploy scoping | — |
| 1 | `core/control`: serializable targets, nested instance paths, effective values, gesture transactions, transient overrides | v2 (controlValues) |
| 2a/2b | Held-note engine path (per-press IDs, sustain/panic, live+clip join); Web MIDI adapter, port lifecycle, MIDI learn (7-bit CC, pickup mode) | v3 (midiMappings) |
| 3a/3b/3c | Automation lanes + drawing editor, return/master automation slots, touch recording with audio-clock timestamping | v4 (lanes), v5 (slots) |
| 4 | Snapshot scopes, capture/CRUD, partial recall diagnostics, A/B morph, per-instance sample bindings | v6 (presets/revisions) |
| 5a/5b | Library catalog (folders/items/revisions/trash), IndexedDB v2, clip/sample cataloging, isolated preview engine | v7 (libraryOrigins) |
| 6 | `.sfxlib` ZIP bundle export/import, strict manifest v1, budgeted streaming DEFLATE, atomic publish | — (manifest v1) |
| 7 | Tempo-synced delay divisions, crossfaded taps, tail-budget fixes for offline export | v8 (division) |

Commit hygiene is good: 16 focused commits with descriptive messages, one documented salvage merge with a single textual conflict properly resolved.

---

## 4. Ratings

| Dimension | Rating | Comment |
|---|---|---|
| Correctness (DSP/notes/automation) | ★★★☆☆ | Foundations excellent; notes-lane per-sample path and `NoteControlGraph` time base are real defects |
| Correctness (persistence/library) | ★★★★☆ | Migrations v1→v8 clean; signature stability issue (F5) undermines cross-machine exchange |
| Architecture & design | ★★★★★ | Framework-free core, single render path, clear error diagnostics, consistent module boundaries |
| Testing | ★★★★☆ | 1,591 unit tests + rigorous live-vs-offline audio comparison; audio specs don't run in CI |
| Performance | ★★★☆☆ | Good in block mode; per-sample collapse under notes lanes is a real-time risk |
| Security | ★★★★½ | Thorough ZIP/JSON/IDB boundary work; only polish-level gaps |
| Documentation | ★★★★★ | PLAN/SPEC/ARCHITECTURE/BUNDLE docs are detailed and honest about limitations |
| Maintainability | ★★★★☆ | Some magic-number duplication and main-thread render churn; otherwise clean |
| **Merge readiness** | **★★★☆☆** | Fix F1–F4 first (or accept with a documented mitigation) |

---

## 5. Findings & Recommendations

### Critical

**F1 — Notes-lane playback collapses the whole engine to per-sample processing**
`src/core/engine/engine.ts:225` — when any notes-domain lane plays, `render` switches to `frames = 1` for *everything*: all voice stages, insert FX, master graph, and delay lines run `process` per sample at 48 kHz (~128× per-call overhead). Worse, per sample it also: evaluates the `automation.noteLanes` getter (`src/core/engine/automation.ts:94`) which scans **all tracks × clips × lanes** (`engine.ts:225`, `:295`), allocates + sorts the event array (`:296`), runs the note-control DSP stage per sample, and in `mixSegment` (`:351-360`) clears automation across all tracks/voice stages and allocates two `Map`s per `tick` — called **twice** per sample (line 295 and line 359).
**Impact:** a modest project with one playing notes lane will very likely blow the worklet's real-time budget; cost scales with track/voice count.
**Recommendation:** keep audio in `MAX_BLOCK_FRAMES` blocks and drive note-graph params per-sample via the existing `ParamFeed`/`processAutomatedRun` pattern; cache `noteLanes`/`configured` per render call instead of re-scanning; hoist clears/tick setup out of the per-sample path. **Gate the merge on this.**

### Major

**F2 — Send automation triggers `invalidateOrder()` per sample**
`src/core/engine/engine.ts:375-380`, `:543-549` — every send-level write nulls `scheduleOrder`/`mixOrder`, forcing mix-order rebuild + `sends.sync` + `updateMixState` on the audio thread, twice per sample in notes-lane mode.
**Recommendation:** invalidate only when the send *target set* changes; batch `setSends` per block.

**F3 — `NoteControlGraph` runs stateful helpers at block rate with a hardcoded 48 kHz**
`src/core/instrument/note-control-graph.ts:5,11,26-33` + `src/core/engine/track-runtime.ts:170` — `smooth`/`slew`/`edge` advance internal state once per *call* (per block ≈ 375/s), so their effective time constants are 128× off, and silently change 128× when a notes lane starts/stops. At 44.1 kHz the coefficients are wrong even then.
**Recommendation:** pass elapsed frames and the engine's real sample rate into the helper stage, or restrict the dynamic graph to the same stateless/`inNotes` set the baked path uses.

**F4 — Momentary CC release pins a transient override at 0, silently disabling Read automation**
`src/app/midi-controls.ts:20-28` — on momentary release with a prior override, the code re-sets the override to 0 instead of releasing it. One tap of a MIDI pad mapped to an automated switch permanently shadows that automation until the user finds the small `↩` release button in `EffectiveValue`.
**Recommendation:** if the press itself created the override, `release(target)` on momentary release; if pinning is intended, surface "automation blocked" in the mapping status.

**F5 — `assetSignature` uses `localeCompare`, so signatures are not machine-stable**
`src/core/preset/assets.ts:43-47`, `src/core/library/clips.ts:11` — signatures are persisted and later compared byte-for-byte (bundle validation `src/core/persistence/validate-library.ts:17`, preset recall). `localeCompare` is ICU/locale-dependent, so a bundle exported on one machine can fail validation on another with a misleading "requires repair" error; a browser ICU update can break stored presets. (Divergent sort order verified empirically.)
**Recommendation:** replace with codepoint comparison, matching the already-correct `canonicalRecord`.

### Minor (fast follow-ups — grouped)

**Engine / DSP**

- **F6** Denormal protection missing in delay/comb feedback and filter state (`src/core/dsp/nodes/delay.node.ts:49`, `ping-pong.node.ts:54`, `comb.node.ts:56`, `filter.node.ts:110`) — periodic CPU spikes after tails decay; `src/core/engine/reverb-tank.ts` has the right flush pattern to copy.
- **F7** `RecordingClock.beat` is O(n) with two array copies per call (`src/audio/recording-clock.ts:16-21`); also any stop anchor poisons all earlier beat lookups, silently dropping back-dated touch samples — consider binary search + limiting the stop search to the previous run.
- **F8** `LiveNotes.noteOn` silently drops re-presses if an adapter reuses noteIds (`src/core/engine/live-notes.ts:30`) — convention is honored today, not enforced.
- **F9** `noteBeat` FP accumulation can differ by one sample between bounce chunk sizes vs worklet quanta (`src/core/engine/engine.ts:306`) — low risk; quantize to transport clock if bit-exact parity matters.

**Persistence / core**

- **F10** Graph group/unlink remaps lanes/values/mappings but **not** `project.snapshots` — pre-group snapshots recall with "missing" issues and silently skip values (`src/core/project/control-target-remap.ts:29`).
- **F11** Clip lanes are sanitized without an owner filter, so cross-owner lanes persist permanently but inertly (`src/core/persistence/sanitize-clip.ts:59`, `sanitize-audio-clip.ts:46`) — mirror the slots behavior.
- **F12** `/` in top-level node ids accepted (`src/core/control/resolve.ts:32`, `src/core/preset/samples.ts:22`); duplicate track ids in a file silently retarget saved control values without a warning (`src/core/persistence/sanitize-project.ts:45`).
- **F13** `assetSignature` omits `sampleIds` while revisions are keyed on signature (`src/core/preset/assets.ts:42-47`).

**Library / storage**

- **F14** Quadratic `.find()` scans inside budget-legal bounds can freeze the main thread for seconds on hostile bundle import (`src/core/library/bundle.ts:61,67,80`) — build lookup Maps once.
- **F15** Memory-fallback storage skips the version guard the IDB path enforces (`src/storage/library-storage.ts:11-17`).
- **F16** Stale preview can surface a spurious error that clobbers the newer preview's status; 192 kHz samples fail `createBuffer` (spec caps 96 kHz) with an obscure error (`src/app/library.ts:64-98`).
- **F17** Instrument *replace* leaves the old instrument's presets/revisions dangling (`src/core/library/assets.ts:115-124`).

**Runtime / UI**

- **F18** Pending MIDI learn conflict drops CC input for *all* mappings/devices (`src/app/midi-controls.ts:37`) — scope to the conflicting source.
- **F19** `⌘C` with empty selection wipes the automation clipboard (`src/ui/automation/AutomationEditor.tsx:52`); editor writes can race a concurrent automation write via render-closure lanes (`:31-32`).
- **F20** MIDI port stuck in `closing` forever if a driver's `close()` never settles (`src/app/midi-input.ts:53-57`); `inputs` array churns on every statechange causing re-renders.
- **F21** Magic numbers: 4-beat quantization re-derived in 3 places (`src/state/touch-store.ts:59,128`); `800` vs `TOUCH_RELEASE_MS` (`src/state/control-gesture.ts:27`); global Escape handler fires when settings panel is closed (`src/ui/midi/MidiSettings.tsx:17-23`).
- **F22** `LibraryPanel`: stale bundle checkboxes after catalog change; scene input can go negative (`src/ui/library/LibraryPanel.tsx:82,102`).

**Tooling / CI**

- **F23** **Audio specs never run in CI** (`test:smoke` = smoke project only) — the suite that catches engine-clock/timestamp regressions is manual-only. Add a scheduled/nightly audio run.
- **F24** `cancel-in-progress: true` on the main ref can cancel a run between artifact upload and Pages deploy, leaving main undeployed until the next push (`.github/workflows/deploy-pages.yml:15-17`) — use `cancel-in-progress: ${{ github.event_name == 'pull_request' }}`. Also: no Playwright browser cache; `webServer` isn't self-sufficient without a prior build.
- **F25** Test timing bounds in `tests/browser/tempo.audio.spec.ts:76` / `automation.audio.spec.ts:138` are load-sensitive; `tests/browser/audio-tap.ts:23` hijacks `__sendEngineCommand` on every worklet node creation.

### Things done especially well

- `DelayTap` stationary-read-head crossfade design (`src/core/dsp/nodes/delay-timing.ts`) — allocation-free, click-free, coalescing changes.
- Note-identity/scope system + transitive `cancelTrackNotes` — the most complete stuck-note prevention seen in a prototype.
- ZIP preflight + trust-boundary revalidation at commit, with rollback tested for quota/abort-after-success/stale tabs.
- Sanitizers reusing the UI's own invariants (`addNode`/`connect`) as a single source of truth.
- Audio test methodology: live worklet output compared sample-by-sample against an offline render of the same engine, with a tap that refuses to treat zero frames as silence.

---

## 6. Merge Recommendation

**Conditionally approve.** Suggested path:

1. **Before merge:** F1 (blocks the merge), F2–F5. F1–F3 are concentrated in `engine.ts`/`note-control-graph.ts`; F4 and F5 are small, isolated fixes. These fit naturally as a "slice 7.1 performance follow-up" in the existing plan discipline.
2. **Run before merging:** `npm run test:browser` (17 smoke + 12 audio) to confirm the branch's final claims — not re-run in this review.
3. **Fast follow-ups (next PR):** F6, F14, F18, F23, F24 — the denormal flush, import Map lookup, conflict scoping, and the two CI items give the most value for the least code.
4. **Merge strategy:** given 16 well-scoped commits, a merge commit (or rebase-merge) of the branch is fine; alternatively land as a squash with this report linked. No data-migration risk on merge itself: project format is at v8 with all migrations committed and tested.
