---
status: active
date: 2026-11-06
note: "Analysis and a proposed PI for review; nothing scheduled. The rules it relies on are the ADR drafts in decisions/adr/."
---
# Engine gaps: analysis, fixes, and an engine-improvements PI

Written 2026-11-06 on `main` (`84a25b3`, after `feat/midi-recording` merged). This follows the
[flagship report](REPORT-flagship-synth.md). That report found that the gaps that matter most are in the engine, not
in the node set. This document:

* lists every engine gap found;
* rates the possible fixes;
* proposes a **program increment (PI)** that closes them before flagship nodes are built on top.

The ground rules are the ADR drafts in [decisions/adr/](../decisions/adr/README.md): breaking changes are accepted
(ADR-0002), with one format bump and the examples rebuilt.

**Summary.**
* **The engine is fast where it is simple, and that is enough for a flagship.** A rendered voice costs about 11 µs per
  block.
* **It falls short in five places:**
  1. **Parameters.** Modulation replaces, is stepped per block, and its per-sample fallback costs 3.6× a whole voice.
  2. **Voices.** They are mono, with no modes, no unison, no glide, and a hard steal.
  3. **The graph's life cycle.** Graphs are compiled on the audio thread; edits cut notes; there is no dormancy.
  4. **The node contract.** Parameters are scalars, there is no reset, tail, latency or stereo-native processing, and
     the hot paths allocate.
  5. **DSP infrastructure and tooling.** There is no anti-aliasing kit, no quality tests and no CPU harness.
* **The PI has seven iterations.** The first two leave the sound unchanged and the third changes only parameter ramps, so the refactor can be
  checked against today's hashes. The breaking ones follow, then a hardening iteration with the format bump and the rebuilt examples.

---

## 1. Method and evidence

**Code read:**
* `instrument/` (compile, stages, voice, voice pool, instrument, fx graph, automation run);
* `engine/` (engine render loop, track runtime, segments, scheduling);
* `audio/worklet/engine-processor.ts`;
* `dsp/` (types, params, the sound nodes);
* `sync/diff-project.ts`;
* `persistence/` (migrations, fixtures);
* `examples/` (the code DSL, Factory);
* `engine/old-projects.test.ts`.

**Measured** (Node via vitest, 48 kHz, 128-frame blocks, Apple Silicon, load average 3.9–4.9; scripts in the session
scratchpad, not the repo):

| Measurement | Result |
|---|---|
| 3 saws + 24 dB filter + 2 envelopes + LFO, 16 voices | 0.170 ms/block (6% of 2.667 ms); 10.6 µs per voice |
| 7-saw unison + two 24 dB filters, 16 voices | 0.307 ms/block (12%) |
| The same 3-saw patch, 8 voices, **one automation curve on the filter cutoff** | 0.320 ms/block against 0.089 without: **3.6× the whole voice cost** for one automated parameter |
| Building an `Instrument` (what `track/setPatch` does in the worklet): 3-saw ×16 voices / 7-saw ×16 / 7-saw ×32 | 0.59 / 0.71 / 1.28 ms (warm JIT) |
| Building Low Light's largest instrument (Kick, 31 nodes flattened) ×16 voices | 1.26 ms |

A build of a flagship-sized patch (60–100 nodes, 32 voices) extrapolates to **3–5 ms in one go**, on the audio
thread, inside one quantum's 2.67 ms. That is an overrun on every structural edit.

---

## 2. How the engine works today

```
main thread                         audio thread (AudioWorkletProcessor.port.onmessage, then process())
───────────                         ─────────────────────────────────────────────────────────────────────
Project edit → diffProject ──cmd──► Engine.apply:  track/setPatch → new Instrument(patch, voices)   ← compile ×voices
               (flattens modules)                  track/setParam → setParam on every voice copy
                                                   automation curves → per node, per segment
                                    Engine.render (128 frames) → renderBlock
                                      ├─ schedule notes for every track (note graph, launcher, arrangement)
                                      ├─ split the block at EVERY event of ANY track into segments
                                      └─ per segment: every track → Instrument.render
                                           global stage (controls) → each active voice: voice stage → mono sum
                                           → shared stage (effects) → mono out → FxGraph (stereo) → strip → buses → master
```

* **Stages.** *Voice* nodes are copied per voice. *Shared* nodes (and everything downstream of one) run once on the
  sum. *Global* nodes (controls and the math on them) run once per block.
* **Signals.** Every signal is a 128-sample `Float32Array`. Parameters are scalars, set by `setParam`. A wired socket
  is read once per block; an automation curve forces the node to be re-run sample by sample.

---

## 3. The gaps

**Ratings:**
* **Complexity** C1–C5. C1 is a local change. C5 is a cross-cutting redesign with subtle correctness risk.
* **Effort** for one developer working with an agent:
  * **S** ≤ 2 days;
  * **M** 3–5 days;
  * **L** 1–2 weeks;
  * **XL** 2–4 weeks.
* **Flagship impact:**
  * **●●●** blocks the flagship;
  * **●●** degrades it;
  * **●** nice to have.

### Overview

| ID | Area | Gap | Impact | Fix (recommended) | C | Effort | ADR |
|---|---|---|---|---|---|---|---|
| EG1 | Parameters | Modulation replaces the parameter; no depth, polarity or curve | ●●● | Bindings + additive routes in the engine | C4 | L | 0004 |
| EG2 | Parameters | Sockets stepped once per block (zipper) | ●●● | Per-block linear ramps; audio-rate parameters get buffers | C2 | S | 0004, 0005 |
| EG3 | Parameters | Per-sample path re-runs a node per sample and allocates (3.6× measured) | ●●● | Parameter buffers fed by automation | C3 | M | 0005 |
| EG4 | Parameters | No smoothing of base changes (knobs, presets, morphs, CCs) | ●● | Engine-side smoothing per parameter, 10 ms default | C2 | S | 0004 |
| EG5 | Parameters | Pitch in Hz; ad-hoc CV inputs in three units | ●● | Pitch as a MIDI note number; routes replace CV inputs | C3 | M | 0003 |
| EG6 | Parameters | Expression updated per block, unsmoothed, per track | ●● | Ramp and smooth; per-voice slots (MPE-ready) | C2 | S | 0007 |
| EG7 | Voices | Instruments and stage boundaries are mono; signals are mono or stereo only | ●●● | N-channel buffers with a layout; instruments output mono or stereo; four nodes allowed in instruments | C3 | M | 0006 |
| EG8 | Voices | No mono, legato, priority or glide | ●●● | Voice modes + glide in the pool and voice | C3 | M | 0007 |
| EG9 | Voices | No unison | ●●● | Lanes inside a voice; fast path in oscillators | C4 | L | 0007 |
| EG10 | Voices | Hard steal, state inherited, 16 max, allocation on steal | ●● | Steal with a 3 ms fade in a spare voice; `reset()`; 32 max | C2 | M | 0007 |
| EG11 | Voices | No note number, release velocity, per-voice random, lane, age | ●● | Note node outputs; seed by note-on counter | C2 | S | 0007, 0012 |
| EG12 | Life cycle | Graphs compiled on the audio thread (1.3 ms measured, 3–5 ms for flagship sizes) | ●●● | A plan from the main thread; sliced instantiation | C4 | L | 0010 |
| EG13 | Life cycle | Structural edits cut held notes and effect tails | ●●● | Swap by node identity, carry state, crossfade | C4 | L | 0010 |
| EG14 | Life cycle | Every node always runs; bypass is structural; presets can't switch engines | ●●● | An `active` switch with a socket on every node and module use (off or bypass), fades, dormancy backward, forward and per voice, routing nodes | C3 | L | 0008 |
| EG15 | Life cycle | No feedback in graphs | ● | Primitives, plus an explicit one-block pair | C2 | M | 0009 |
| EG16 | Life cycle | Stage inferred only from type and wiring; no override | ● | A per-node `stage` hint for nodes that may be either | C1 | S | 0005 |
| EG17 | Node API | Scalar parameters by string id; no reset, tail, latency or stereo-native mode | ●●● | Node API v2 (ParamFrame, indices, declarations) | C3 | XL | 0005 |
| EG18 | Performance | Closures and allocations per block (stage loop, scheduling, segments) | ●● | A compiled plan executor; pooled events; allocation test | C2 | M | 0005 |
| EG19 | Performance | Any event in any track splits the whole mix into segments | ●● | Per-track sample offsets for note events | C3 | M | — |
| EG20 | Performance | Idle effects and muted tracks run (P2) | ●● | Declared-tail sleep for effects (in the PI); muted-track suspension (stretch) | C3 | M | 0008 |
| EG21 | Robustness | NaN and denormal handling ad hoc | ●● | Sanitize at stage boundaries; guards in feedback nodes | C1 | S | 0003, 0005 |
| EG22 | DSP | No anti-aliasing kit; naive oscillators | ●●● | BLEP, mipmaps, ADAA, halfband helpers; upgrade the core nodes | C3 | L | 0011, 0014 |
| EG23 | DSP | No latency reporting | ● | `latencySamples` in the contract; compensation later | C2 | S | 0005 |
| EG24 | DSP | No tail reporting (the bounce special-cases delays) | ● | `tailSeconds` in the contract | C1 | S | 0005 |
| EG25 | DSP | No node-owned data assets (wavetables, modal tables, IRs) | ●● | Procedural tables in `create()` now; user tables through the sample bank later | C2 | S (design) | — |
| EG26 | Tooling | No DSP quality tests or golden renders | ●● | Aliasing, tuning and level tests; golden renders of reference patches | C2 | M | 0011 |
| EG27 | Tooling | No per-node or per-preset CPU harness; no allocation probe | ●● | Node bench harness + worklet trace + allocation probe | C2 | M | 0013, 0015 |
| EG28 | Tooling and UI | No telemetry of effective (modulated) values | ●● | Effective values of the selected graph at status rate | C2 | M | 0004 |
| EG29 | Policy | Bit-exact promise blocks every DSP change | ●●● | ADR-0002: structure preserved, sound re-baselined | C1 | S | 0002 |

### Details

#### Parameters and modulation

**EG1 — Modulation replaces the parameter.**
* *Evidence:* "A wire replaces the value… To add on top of a stored value use an *Add* node"
  ([control nodes](../architecture/control-nodes-and-panels.md)); `ParamFeed` sums sources into the value
  (`instrument/compile.ts`).
* *Impact:* "knob + LFO + wheel" costs three helper nodes per parameter. There are no depth handles and nothing to
  draw on a knob. Macros with many targets need *Map range* chains.

| Option | C | Effort | Notes |
|---|---|---|---|
| a. A *Mod* node (attenuverter + add), ramped sockets | C2 | M | Keeps "replace"; a node per modulated parameter; nothing on knobs |
| b. Engine-level bindings + additive routes in normalized knob space, with `via` | C4 | L | One model for panels, macros, automation; drawable |
| c. A separate mod-matrix slot table | C3 | L | Familiar; duplicates the graph |

**Recommended: b** (ADR-0004). The UI half (depth handles, the route list, rings) is extra: **M–L**, needing a spec.

**EG2 — Block-rate stepping.**
* *Evidence:* `processStage` applies a feed's first sample once per block. An LFO feeding a socket is not "varying"
  (only automation marks buffers varying), so it steps every 128 samples.
* *Verified* (a separate check, 2026-11-06):
  * The chorus recipe in [SPEC-effects-round-2](SPEC-effects-round-2.md) (`LFO → Map range → delay.param:time`) gets
    exactly one `setParam` per block, in an insert graph and in an instrument.
  * The per-sample path runs only with an automation curve upstream, and only in an insert graph. Across the
    voice→shared boundary it never runs.
  * The delay also retargets through a 20 ms crossfade of two fixed read heads. Even per-sample updates give a stepped
    comb rather than a swept delay, so a real chorus or flanger needs its own node with a per-sample interpolated read
    (flagship N7).
  * The spec's "Verified" claim is wrong and needs correcting.
* *Options:* (a) a per-block linear ramp from the last value to the new one: C2, S. (b) everything per sample: C3, M,
  costly.
* **Recommended: a**, with parameters declared `audio` getting real buffers (ADR-0005).

**EG3 — The per-sample fallback is expensive.**
* *Evidence:* `processAutomatedRun` calls `dsp.process` with `frames = 1`, once per sample. Per call it creates a
  `Float32Array`, a `Map` and a context object with closures. **Measured: 3.6× the voice's cost for one automated
  cutoff.**
* *Options:* (a) optimize the re-run, pooling the allocations: C2, S; still a per-sample call. (b) parameter buffers
  (EG17) with automation writing into them, and the re-run deleted: C3, M.
* **Recommended: b.**

**EG4 — No smoothing.**
* *Evidence:* `setParam` takes effect at the next block, with no ramp (`gain.node.ts`). Knob turns, preset recall,
  morphs and MIDI CC jump.
* *Options:* (a) per-node smoothing (each node does it): C2, M, inconsistent. (b) engine smoothing per parameter, with
  a declared `smoothMs`: C2, S on top of EG2.
* **Recommended: b.**

**EG5 — Pitch in Hz; three CV dialects.**
* *Evidence:* the `oscillator.pitch` input is semitones × *Pitch CV*. The filter `cutoff` input is octaves × *CV amt*.
  Key tracking uses a ratio to middle C in Hz. The note's pitch travels as Hz.
* *Fix:* the ADR-0003 conventions. Add `Note.pitch` (a note number), have nodes read `pitch`, and convert the CV
  inputs to routes (EG1). The migration rewires `frequency → freq` to `pitch → pitch`. C3, M.

**EG6 — Expression per block, per track.**
* *Evidence:* "These values change once per block; a patch that steps audibly… puts a *Smooth* node after them"
  ([graphs and nodes](../architecture/graphs-and-nodes.md)). `TrackExpression` is one per track.
* *Fix:* ramp and smooth bend, pressure and CCs like parameters (EG2, EG4), and keep per-voice slots that are filled
  from the track until MPE (ADR-0007). C2, S.

#### Voices

**EG7 — Mono instruments.**
* *Evidence:* "Instruments are mono; stereo starts in the insert graph" ([mixing](../architecture/mixing-and-routing.md)).
  `Instrument.render` returns a mono buffer; boundaries are mono; 10 nodes are `insertOnly`.
* *Options:*
  * (a) stereo where the signal is stereo, mono by default: C3, M.
  * (b) always stereo: C2, M; costs 2× on every mono patch.
  * (c) like (a), but buffers carry **N channels (≤ 16) and a layout** (mono, stereo, quad, 5.1, 7.1, 7.1.4,
    ambisonics, discrete), and nodes declare `mono`, `lift` or `layout`: C3, M. About the same work as (a), since the
    lifting is generalized rather than added.
* **Recommended: c** (ADR-0006). It keeps spatial sound possible without a second contract change.
  * Instruments still output mono or stereo.
  * The project's `outputLayout` sets the master and the device's output channels; each track, return and group bus
    has a `layout`; the channel strip's panner converts where layouts meet.
  * All of these are modelled in the PI, with only mono and stereo selectable. Spatial panners, encoders and binaural
    rendering are deferred.
  * Sampler stereo is part of it.

**EG8 — No voice modes or glide.**
* *Evidence:* [limits](../reference/limits.md) ("no unison, glide or legato modes"); `VoicePool` only allocates and steals.
* *Fix:* a held-note stack per instrument; `mono` and `legato` with priority `last`, `low` or `high`; glide as a voice
  pitch slew (time or rate; always or legato only). C3, M.

**EG9 — No unison.**
* *Options:*
  * (a) stack notes: C2, M. Confuses polyphony and stealing.
  * (b) lanes inside a voice, running the voice stage per lane: C4, L.
  * (c) unison only inside oscillators: C3, M. No per-lane filter or shaper.
* **Recommended: b, with c as the fast path** in the VA and wavetable oscillators (ADR-0007). The "unison scope" (which
  part of the stage runs per lane) needs a short design spike.

**EG10 — Hard stealing.**
* *Evidence:*
  * `VoicePool.allocate` sorts a copy of the voices (`[...voices].sort`) on every steal.
  * The stolen voice keeps its node state (the envelope retriggers from its level; filters keep their memory).
  * The maximum is 16.
* *Fix:* steal the quietest released voice first, protect the lowest and highest held notes, fade the stolen voice
  over 3 ms in a spare slot, call `reset()` on reuse (EG17), and raise the maximum to 32 with no allocation. C2, M.

**EG11 — Too little per-voice information.**
* *Evidence:* `NoteState` holds frequency, velocity, gate, trigger, pressure and bend; the voice salt is the slot.
* *Fix:* add Note node outputs `pitch`, `note`, `release`, `random`, `lane`, `age` and `slide`, and seed per-note
  randomness by the note-on counter (ADR-0012). C2, S.

#### Graph life cycle

**EG12 — Compilation on the audio thread.**
* *Evidence:* `EngineProcessor`'s `port.onmessage` calls `engine.apply` on the render thread
  (`audio/worklet/engine-processor.ts:18`). `TrackRuntime.setPatch` builds a new `Instrument`, which compiles every
  voice (`engine/track-runtime.ts:155`). Measured 0.6–1.3 ms warm; flagship sizes extrapolate to 3–5 ms.
* *Options:*

  | Option | C | Effort | Notes |
  |---|---|---|---|
  | a. Make compile cheaper | C2 | M | Still one-shot; still cuts notes (EG13) |
  | b. Plan on the main thread + sliced instantiation in the worklet + lazy voices | C4 | L | Bounded work per quantum |
  | c. Compile in a worker | — | — | Impossible: instances can't be transferred into a worklet |

* **Recommended: b** (ADR-0010).

**EG13 — Edits cut notes and tails.**
* *Evidence:* `setPatch` and `setVoices` replace the instrument; `setFx` replaces the insert graph
  (`engine/track-runtime.ts:133`). Sounding notes stop, and a reverb's tail stops dead.
* *Fix:* keep instances whose node id and type are unchanged (with their state); build only what changed; re-attach
  held notes; crossfade the old output into the new one over 10 ms. C4, L. Shares the machinery with EG12.

**EG14 — No dormancy.**
* *Evidence:* every node of a stage runs every block. Bypass is structural, and presets never replace graphs
  ([library and presets](../architecture/library-and-presets.md)).
* *Options:*
  * (a) detect silence at runtime: C3, M; unreliable for generators.
  * (b) an `active` value per node (off or bypass), plan-time dormancy, and switching nodes that make unused branches dormant:
    C3, L.
  * (c) presets that change structure: C5, XL; breaks the library's model.
* **Recommended: b** (ADR-0008, revised after research into Max, Pd, Faust, SuperCollider, VCV, CLAP/VST3, Bitwig and
  Ableton):
  * One **`active`** switch per node and module use, with a socket (anything can drive it), and a `whenInactive`
    setting: **off** (silence, no computation, state frozen) or **bypass** (declared routes, latency-matched).
  * Every switch fades over 5 ms, and a node resets when it wakes after its tail.
  * The engine skips **backward** (nothing active listens) and **forward** (nothing arrives, not a generator, tail
    elapsed), with a mask **per voice**, so velocity layers and key splits switch per voice.
  * Routing nodes say which branch is meant: *Audio selector* (N→1), *Audio router* (1→N), *Crossfader* and *Audio
    switch*. Unlike Max's `selector~` or Faust's `select2`, they make the unused parts dormant.
  * A power control (on, off, bypass) in the node header; dormant nodes are shown distinctly.
  * **Module uses switch the same way.** A definition declares bypass routes (one in and one out are routed by
    default); bypass is latency-matched along the inner path; outputs without a route go silent (audio), to 0
    (modulation routes) or hold (bindings). Flattening keeps each use as a scope with boundary points, so the plan can
    switch a whole sub-module. Nested uses keep their own switches, and an outer bypass wins. Note modules release
    their notes.

**EG15 — No graph feedback.** Cycles are refused (BACKLOG G5). Fix per ADR-0009: tight loops live inside primitives,
and an explicit *Feedback send/return* pair has one block of delay. C2, M. **Optional** in this PI.

**EG16 — Stage inference only.** "A node's stage is decided by its type and wiring; there is no per-node override"
([limits](../reference/limits.md)). Add a `stage` hint for nodes that can be either (a delay per voice for a flam, a
shared filter). C1, S. **Optional.**

#### Node API and performance

**EG17 — The node contract.**
* *Evidence:* `DspNode` has `setParam(id: string, value)` and `process(context, inputs, outputs)`. `Params.get` looks
  values up by string. There is no `reset`, tail, latency or stereo-native processing (`stereoCapable` lifts two mono
  copies).
* *Options:*
  * (a) add `setParamBuffer` beside `setParam`: C2, M. Two paths in every node.
  * (b) Node API v2 (`ParamFrame` by index, `rate`, `smoothMs`, `channels`, `reset`, `tailSeconds`,
    `latencySamples`), and port every node: C3, XL.
* **Recommended: b** (ADR-0005). About 70 types: most are mechanical (math, logic, controls, indicators); about 15
  sound nodes need care. Porting under an equivalence test keeps it safe: identical output before and after for every
  node.

**EG18 — Garbage on the audio thread.**
* *Evidence:*
  * `processStage`: `sources.some(...)`, `node.paramFeeds.some(...)` and `.filter(...)` per node per block, and a
    `WeakSet` per block.
  * `TrackRuntime.schedule`: `map`, spread, sort, and a `run: () => …` closure per event per block.
  * `Engine.mixSegment`: a `MixContext` object per segment.
  * `VoicePool`: a sort copy per steal and `filter` in `activeCount`.
* *Fix:* a compiled plan executor (flat arrays, no closures), pooled event records, and a test that fails on
  allocation in a steady-state render. C2, M.
* Unmeasured as a cause of P1, but it is the standard source of GC glitches in worklets (Chrome and Mozilla
  guidance).

**EG19 — Global segmentation.**
* *Evidence:* `Engine.renderBlock` splits the block at every scheduled event of any track, and each `mixSegment`
  renders **every** track, the strip and the master for that span (`engine/engine.ts:524`, `:624`). A dense
  arpeggio on one track fragments all tracks into short `process` calls. Per-call overhead dominates at short spans.
* *Options:* (a) give note events a sample offset inside the block and let the instrument split only its own voices'
  render: C3, M. (b) cap segment density by quantizing events (loses sample accuracy): C1, S, a regression.
* **Recommended: a.** Automation and audio-clip horizons keep their own segmentation, since they are rarer.

**EG20 — Suspension.**
* Shared stages and insert effects with silent input still run, and so do muted and solo-excluded tracks (BACKLOG P2).
* **Declared-tail sleep for effects** is now part of ADR-0008 and I4, as CLAP and VST3 do it: not a generator, a
  finite tail, input silent beyond the tail; silence flags propagate; wake at the next non-silent block. C2, S on top
  of EG14.
* **Muted-track suspension** stays a **stretch** item (C3, M). It touches routing, taps and held notes.

**EG21 — NaN and denormals.**
* *Evidence:* no sanitizing at stage boundaries. Feedback nodes (comb, reverb, filters) carry state with no denormal
  guard: harmless on Apple Silicon, potentially costly on x86, not measured.
* *Fix:* sanitize non-finite samples at boundaries with a counter in the status (ADR-0003), and guards in feedback
  state (ADR-0005). C1, S.

#### DSP infrastructure

**EG22 — Anti-aliasing kit and core node upgrades.**
* *Evidence:* "Oscillators are naive (alias at high pitches); no band-limiting or oversampling"
  ([limits](../reference/limits.md)).
* *Fix:* shared helpers (PolyBLEP/BLAMP, a mipmap builder, ADAA antiderivatives, a 2× halfband helper), then the
  in-place upgrades of ADR-0014:
  * oscillator → band-limited VA with PWM, sync and `pm`;
  * filter → ZDF SVF with drive;
  * envelope → curved DAHDSR;
  * LFO → extras;
  * comb → extended Karplus-Strong;
  * sampler → stereo.
* C3, L for the kit plus the four core nodes. The comb and sampler are M each.

**EG23 / EG24 — Latency and tail.** `Bounce` detects delay nodes to size its tail (see "Delay timing" in
[graphs and nodes](../architecture/graphs-and-nodes.md)); no node can report latency. Both become declarations
(ADR-0005). C1–C2, S each. Delay compensation itself is **out of scope**.

**EG25 — Data assets.**
* Wavetables, modal material tables and impulse responses need data in the worklet. Samples have a bank (`SampleLookup`).
* *Plan:* factory tables are generated procedurally in `create()` (no transfer). User-imported tables later reuse the
  sample bank (a wavetable is a WAV of N×2048 frames, the Serum convention).
* C2, S to write down now; no PI work beyond that.

#### Tooling

**EG26 — No DSP quality tests.**
* Today's tests check finiteness, audibility and examples' structure, plus bit-exact hashes of old projects.
* *Fix:*
  * quality tests per node class: aliasing energy, self-oscillation tuning, level;
  * golden renders of a set of reference patches, stored as hashes plus a spectral fingerprint, so an intended change
    is reviewed by listening and accepted by updating the golden (IDEAS F8).
* C2, M.

**EG27 — No CPU or allocation harness.**
* *Fix:*
  * a Node benchmark harness (per node, per reference patch, per Factory preset: µs per voice per block);
  * a worklet trace script (extending `scripts/profile-status.cjs`);
  * the allocation probe of EG18.
* C2, M. It is the arbiter for ADR-0013 and the budget in ADR-0015.

**EG28 — No effective-value telemetry.**
* The status path reports levels and indicators (B0), not the modulated value of a parameter.
* *Fix:* for the selected track's graphs, send effective values of modulated parameters at status rate (about 30 Hz),
  only while a view shows them. C2, M. The UI rings are part of the modulation UI work (EG1).

**EG29 — The bit-exact policy.** Decisions 5, 6 and 43 and `old-projects.test.ts` freeze the sound. ADR-0002 replaces
them with structure-preserving migration and re-baselined golden renders. C1, S.

---

## 4. Dependencies

```
EG29 policy ─┐
EG26/27 harness ─┬──────────────────────────────────────────────┐
                 ▼                                              │
EG17 node API v2 ──► EG2/EG3 param buffers ──► EG1 routes ──► EG4/EG6 smoothing ──► EG28 telemetry
      │   └► EG18 plan executor ──► EG12 off-thread plan ──► EG13 swaps ──► EG14 dormancy
      │                                    └► EG19 per-track offsets
      ├► EG21/23/24 declarations
      └► EG10 reset ──► EG8 modes ──► EG9 unison ◄── EG7 stereo
EG5 pitch convention ──► EG8 glide, EG9 detune, EG22 oscillators
EG22 AA kit ──► core node upgrades (ADR-0014) ──► examples rebuilt ──► format v16
```

The order follows from this:
1. The harness and the node contract come first, because everything is ported onto them.
2. Parameters come before voices.
3. Voices come before the life cycle, because swaps must carry voice state.
4. DSP upgrades come last before the bump, so the examples are rebuilt once.

---

## 5. The engine-improvements PI

### Shape

* **Seven iterations of about two weeks**, on one long-lived branch (`feat/engine-pi`).
* It merges to `main` once, at the format bump (ADR-0002: older builds can't open v16).
* Iterations 0–1 are **sound-neutral**: a project without automation renders bit for bit as before, and automated
  ones match within float tolerance. Today's hashes check the refactor, so it can be verified before anything
  breaks. Iteration 2 changes only the ramps on wired and modulated parameters.
* **Sizing is for one developer working with an agent:** about **14 weeks nominal, 11–18 weeks as a range.** The
  stretch items are marked; drop them first.

### PI objectives

Each objective is measurable at the PI's end.

| # | Objective | Measure |
|---|---|---|
| O1 | Modulation that adds, ramps and shows | A knob with a binding plus three routes in the reference patch. Zipper test: a slow cutoff sweep shows no block-rate steps (energy at multiples of 375 Hz, the 128-sample block rate at 48 kHz, below −80 dBFS). An automated parameter costs ≤ 1.2× an unautomated one (3.6× today). Effective values visible on knobs. |
| O2 | Stereo, playable voices | Stereo instruments; mono, legato and glide; unison 1–8 lanes with spread; stealing without a click (no discontinuity above −60 dBFS); 32 voices |
| O3 | Editing never interrupts | A held note survives a rewire; a reverb tail survives an unrelated insert edit; no quantum above budget while building a 32-voice, 80-node patch (worklet trace) |
| O4 | Unused engines cost nothing | A disabled or dormant branch measures 0 µs; switching on, off and bypass is click-free; an idle effect sleeps after its tail and wakes without a click |
| O5 | Clean core DSP | Saw at C7 and a 2 kHz PWM sweep: aliasing ≥ 50 dB below the fundamental (threshold tuned in I5); SVF self-oscillation within ±5 cents; ADAA shaper tests |
| O6 | Everything still opens | Every fixture v1–v15 loads into v16 with no loss (structural assertions); Low Light, Glass Rain, the Starter and the Factory are rebuilt and pass a listening pass |
| O7 | Measured budget | The CPU harness in CI-runnable form; the flagship reference voice (3 band-limited oscillators, SVF, 2 envelopes, 2 LFOs, 6 routes) ≤ 40 µs/voice/block in Node; worklet first-callback not worse than today's 3.265 ms |

### Iterations

| It. | Theme | Gaps | Deliverables | Exit criteria | Effort |
|---|---|---|---|---|---|
| **I0** | Safety net and decisions | EG29, EG26 (harness part), EG27 | ADRs accepted; rounds 12d and 13a (below) landed on `main`; CPU harness and allocation probe; golden-render harness; **reference renders of today's examples** (WAV, kept for listening comparisons); v16 migration scaffold and a fixture pipeline; `feat/engine-pi` | Harness numbers reproduce within 10% on rerun; reference renders archived | M–L |
| **I1** | Node contract and the plan executor | EG17, EG18, EG3, EG21, EG23, EG24, (EG16) | Node API v2 with the N-channel buffer model and channel policies (ADR-0006: still only mono and stereo in use); every node ported; flat plan executor; automation writes parameter buffers; `processAutomatedRun` removed; `reset`, `tailSeconds`, `latencySamples`; bounce uses `tailSeconds`; boundary sanitizing | **Sound-neutral**: `old-projects.test.ts` hashes unchanged; automated renders within 1e-6; the allocation probe reports 0 in steady state; automated parameter ≤ 1.2× | XL |
| **I2** | Modulation model, engine half | EG1, EG2, EG4, EG6, EG28 | Bindings and routes (`depth`, `via`, curve) in the compiler; ramps and smoothing; effective-value telemetry; persistence of routes (still behind the v15 reader: routes only in new graphs); **spec for the modulation UI** signed off | Socket-wired projects sound the same except for the ramp; route tests (order-independence, clamp, polarity by kind, `via`) | L |
| **I3** | Stereo and voices | EG7, EG8, EG9, EG10, EG11, EG5 | Stereo instruments and boundaries, through the layout model; conversion nodes (*Pan*, *Downmix*) with the documented pan law and downmix table; project `outputLayout`, track, return and group `layout` fields (mono and stereo only), the device-output channel request with a stereo fallback, the strip-converter slot; voice modes, priority and glide; unison lanes with a fast path hook; stealing with a fade, a spare voice, 32 voices; Note node outputs; seeds by note-on counter; `Note.pitch`, and the pitch convention in the oscillator, sampler, comb and key tracking | O2 measures pass; determinism with 8 against 32 voices; first **breaking** iteration: hashes retired (ADR-0002) | XL |
| **I4** | Graph life cycle | EG12, EG13, EG14, EG19 | Plan on the main thread; sliced instantiation and lazy voices; swaps by node identity with state carried and a 10 ms crossfade; `active` and `whenInactive` on every node and module use, with fades; module-use switching and bypass routes (scopes and boundary points in flattening); dormancy backward, forward and per voice; *Audio selector*, *Audio router*, *Crossfader*, *Audio switch*; declared-tail sleep for effects; header toggles and dormant styling (patcher); per-track event offsets | O3 and O4 measures; an idle reverb return sleeps and wakes without a click; velocity layers switch per voice; no regression in the arrangement-loop audio spec or the MIDI recording timing specs | XL |
| **I5** | DSP kit and core upgrades | EG22, EG26 (quality tests), EG25 (design) | AA helpers; oscillator → band-limited VA (PWM, sync, `pm`); filter → SVF with drive; envelope → curved DAHDSR; LFO extras; comb → extended Karplus-Strong; sampler stereo; project *Quality* setting; quality tests | O5 measures; reference voice ≤ 40 µs | L–XL |
| **I6** | Hardening and release (IP) | migration, examples, docs, EG20 (stretch), EG15 (stretch) | **Format v16** with one migration (pitch wires, bindings and routes, parameter remaps, enum remaps, stereo, `bypassed` → `active = 0` with `whenInactive = bypass`, project and track `layout` defaults) and a fixture per rewrite; Low Light, Glass Rain, the Starter and the Factory rebuilt in the DSL; listening pass against I0's reference renders; library catalog and `.sfxlib` import through the migration; `architecture/` rewritten, STATUS, decisions rows; the modulation UI's first slice (route list, depth handles, rings) if the spec allows | O6 and O7; all smoke groups and audio specs green; merge to `main` | L |

### Carrying the examples over

* **Examples are code**, so they are rebuilt, not migrated. This is cheap and clean: `examples/tech-house`,
  `examples/generative` and `examples/factory` use the DSL (`patchOf`, `knob`). The rebuild:
  * swaps `note.frequency>osc.freq` for `note.pitch>osc.pitch`;
  * turns the *Add*/*Map range* modulation chains into routes;
  * replaces the hand-built *Soft clip* module with the waveshaper (ADR-0014) where it lands in I5, otherwise keeps it.

  About **M**, mostly mechanical. The examples' structural tests stay; their audio thresholds are re-tuned.
* **Listening pass.** I0 archives renders of every scene of both examples. I6 renders them again; one person listens
  in pairs and notes anything that is more than "the same, cleaner". This is a human check, like BACKLOG V4 and V12.
* **Users' projects** go through the v16 migration. The fixtures v1–v15 already exist, and each gets a v16 assertion.

### Risks (ROAM)

| Risk | Likelihood | Response |
|---|---|---|
| Porting about 70 nodes (I1) takes longer than planned | Medium | **Mitigate**: equivalence test per node (old against new output), mechanical nodes in batches, sound nodes one by one |
| The modulation UI is a design problem, not just plumbing | High | **Mitigate**: the spec in I2; engine first; UI slice in I6 or its own round after the PI |
| Swaps with state carry-over (I4) have subtle bugs (stuck notes, clicks) | Medium | **Mitigate**: identity rules kept simple (same id and type ⇒ keep); tests for held notes across every edit kind; fall back to a crossfade with retrigger when in doubt |
| Migration loses something in users' files | Low–Medium | **Mitigate**: a fixture per rewrite; never drop silently (ADR-0002); keep the v15 file untouched in storage until the user saves |
| The long-lived branch conflicts with the redesign | Low | **Resolved by the order below**: 12d and 13a land on `main` before the PI starts; 13b comes after it |
| Performance regresses (parameter buffers, stereo) | Low | **Mitigate**: the harness in I0 and an O7 gate every iteration |
| No human time for listening passes | Medium | **Accept**, with a reduced pass (the busiest scene of each example, plus the Factory starters) |
| Firefox and Safari untested (V2, V3) | Existing | **Accept** for the PI; MIDI and audio behaviour unchanged in kind |

### Out of scope for the PI

* MPE (D2): the slots are ready, the input is not.
* WASM kernels (ADR-0013: only when measured).
* Delay compensation.
* Flagship nodes beyond the core upgrades: wavetable, ladder, FM, modal, chorus, phaser and the waveshaper. These are
  flagship phases 2–3 and are built **on** the PI.
* The full modulation UI beyond its first slice.
* Granular and spectral nodes.

---

### Order with the redesign

Decided 2026-11-06:

| When | What |
|---|---|
| Done (2026-11-06) | **Round 12d**, touch recording into the arrangement (its signed-off spec, §4 of [SPEC-round-12](../archive/ui-redesign/SPEC-round-12-arrangement-editor.md)). It closes round 12. Its tests then guard I1's rewrite of the automation path. |
| Next | **Round 13a, UI foundations**, scoped in the [roadmap](ui-redesign-roadmap.md#round-13a-ui-foundations-before-the-engine-pi): design tokens, no hard-coded colours, the theme mechanism with light and high-contrast token sets, one icon set, shared control states. New UI in the PI is built on them. |
| Then | **This PI**, I0 to I6. Its UI (power and bypass controls in headers, dormant and sleep states, routing-node cards, the route list, depth handles and rings) uses 13a's tokens and icons. |
| After the PI | **Round 13b, the design pass**: the look and feel of the whole app with the PI's UI in place. Its own spec. |

## 6. Decisions to make

1. **Accept the ADR drafts** 0001–0015, or mark the ones to rework. The ones the PI cannot start without are 0002,
   0003, 0004, 0005 and 0013.
2. **PI scope:** with or without the stretch items (EG15 feedback pair, EG20 suspension, the modulation UI's first
   slice).
3. ~~Order against the redesign~~: decided (above).
4. **One merge at v16** (recommended), or ship the early iterations I0–I2 to `main` as they land (no breaking change and no format
   change before I3).
5. **Where the core node upgrades go:** in the PI (I5, recommended, so there is one format bump and one rebuild of the
   examples), or in flagship phase 2.
