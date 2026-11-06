---
status: active
date: 2026-11-06
note: "Research and design report for discussion; nothing here is decided. Decisions to make are at the end."
---
# The flagship synth: research and design report

Written 2026-11-06 on `feat/midi-recording` (`cbd9b84`). The goal: shift focus to the Factory library, and design and
build one first-class, distinctive synth to anchor it. This report answers three questions, then lays out a plan to
discuss.

1. **How should we design it?** As a curated instrument on top of our open graph, built in layers (primitives →
   components → building blocks → voice cores → the instrument → presets). Its identity comes from things our
   engine already does differently: per-voice everything, a modulation layer that is alive, and morphing. See
   [§4](#4-the-proposal-what-the-flagship-is).
2. **Do we have the basic units?** **No, and the gap isn't only nodes.** About half of what a 2026 flagship needs exists.
   But some gaps are in the **engine**, and no node can fix them:
   * instruments are mono;
   * modulation replaces a parameter instead of adding to it, and is read once per 128-sample block;
   * there is no unison, glide or mono/legato;
   * a preset cannot switch an engine off.

   Fix those first, then build nodes just in time, phase by phase, each phase proven by presets that use it
   ([§2](#2-engine-gaps-what-nodes-cannot-fix), [§3](#3-node-gaps-what-to-build)).
3. **Which submodules, in what order?** Five layers and five phases, in [§5](#5-the-layered-build) and
   [§7](#7-phased-plan).

Sources: an inventory of the code and docs, one benchmark I ran, and three web research passes (the synth landscape,
DSP techniques, and how modular systems are layered). Each research claim has its source in the
[appendix](#appendix-sources-and-confidence). Treat 2026 product facts as moderately reliable: several rest on forum or
blog sources.

---

## 1. Where we stand

### What a flagship needs, against what we have

| Area | Flagship expectation (2026) | We have | Verdict |
|---|---|---|---|
| Classic oscillators | Band-limited saw/pulse/tri, PWM, hard sync, phase reset | Naive sine/saw/square/tri (alias at high pitch, [limits](../reference/limits.md)); a `pitch` CV input and linear FM through `freq` | **Missing**: band-limiting, PWM, sync, phase modulation (PM) |
| Wavetable | Mipmapped tables, position morph, warp modes, user import | Nothing (the sampler loops a buffer) | **Missing** |
| FM | 2–6 PM operators, feedback | Linear FM via `freq` (the *FM bell* starter) | **Partial**: no PM, no operator feedback (cycles are refused, [BACKLOG](../BACKLOG.md) G5) |
| Physical / modal | Exciter → resonator, scale-aware (Meld, Pigments, Zebra 3) | *Comb* (Karplus-Strong-style), noise, Geiger impulses | **Partial**: no modal bank, no string with damping or dispersion, no exciter set |
| Sample / granular | Sample playback; granular | Sampler (one-shot, hold, loop) | **Partial**: granular is BACKLOG E2 |
| Noise | White, pink, brown | ✓ | **Have** |
| Filters | SVF multimode safe under audio-rate modulation, ladder, diode, comb, formant, drive, two filters routed | RBJ biquad, 8 modes, 12/24 dB, key tracking, exponential `cutoff` CV; Comb; 3-band EQ | **Partial**: direct-form biquads aren't safe under fast modulation; no ladder, drive, formant or phaser |
| Envelopes | Curved ADSR/DAHDSR, loop mode, MSEG | Linear ADSR | **Partial** |
| LFOs | Sync, phase, fade-in, retrigger modes, smooth random, custom shapes | Five shapes, beat sync, retrigger; *Perlin*, *Random*, S&H, clocks | **Mostly have**: no phase, fade-in or smooth random |
| Modulation model | Source → depth on the route → **added** to the knob; per-route curve; smooth | A wire **replaces** the parameter; block rate; *Add* and *Map range* nodes by hand | **Missing** at engine level ([§2](#2-engine-gaps-what-nodes-cannot-fix), E2) |
| Macros | 4–8 per preset, mod wheel always mapped | Control nodes, panels, module knobs, MIDI learn, CC node | **Have the parts**; no macro convention |
| Voice | Unison (detune, spread, phase), glide, mono/legato, gentle stealing, stereo voices | 1–16 voices, steal released-then-oldest; **mono instrument output** | **Missing** |
| Expression | Velocity, wheel, pressure, MPE | Velocity, bend, channel pressure, CCs, recorded as lanes | **Have**, except per-note MPE (BACKLOG D2) |
| Shapers | Waveshaper with anti-aliasing, folder, crusher | Hand-built *Soft clip* module | **Missing**: specced as BACKLOG E1, not built |
| Modulation effects | Chorus/ensemble, phaser, flanger | None as nodes | **Missing** |
| Space effects | Delay, reverb, EQ, compressor | Delay, ping-pong, Freeverb (mono and stereo), EQ, compressor | **Have** (plain Freeverb is the weak spot) |
| Analysis as modulation | Rarely offered (a market gap) | Envelope follower, level, pitch (YIN), Schmitt trigger | **Have**: an advantage |
| Generative | Rare in synths (Pigments' sequencer, Korg lanes) | Perlin, Geiger, Random, clocks, counters; note graph with arp, chord, echo, scale lock | **Have**: an advantage |
| Morph / variation | Massive XL Morpher, Omnisphere mutations | A/B snapshot morph, seeded Randomize/mutate with per-node locks | **Partial**: 4-corner XY is BACKLOG L1; no variation history |
| Spectral | Serum 2 / Vital spectral modes | FFT/STFT core in `core/spectrum` (used by the wave editor) | **Foundation only** |
| Library | Tagged browser, hundreds of presets, macro QA | Library with Factory root (49 items, no presets yet: BACKLOG L7), A/B morph | **Partial** |

### What a flagship voice costs (measured)

I rendered flagship-sized patches through `Instrument` in Node with vitest (48 kHz, 128-frame blocks, load average
about 3.9). The script is in the session scratchpad, not the repo.

| Patch | Voices | ms per block | µs per voice | Share of 2.667 ms |
|---|---:|---:|---:|---:|
| 3 saws + 24 dB filter + 2 envelopes + LFO | 1 | 0.012 | 11.6 | 0.4% |
| same | 8 | 0.088 | 11.0 | 3% |
| same | 16 | 0.170 | 10.6 | 6% |
| 7-saw unison + 24 dB filter | 8 | 0.138 | 17.2 | 5% |
| 7-saw unison + two 24 dB filters | 16 | 0.307 | 19.2 | 12% |

**The node engine is cheap enough for a flagship voice.** Two caveats:
* Band-limited oscillators, nonlinear filters and 2× oversampling of the nonlinear stages will roughly double or
  triple these costs.
* The worklet has fixed overheads on top of this, already accepted as limits: a first callback of 3.265 ms, and +27%
  on a one-track project ([STATUS](../STATUS.md#accepted-limits)).

Budget a flagship preset at about **40 µs per voice** (so 16 voices take about 25%), and make that a check every
Factory preset must pass ([§6](#6-the-factory-library)).

---

## 2. Engine gaps: what nodes cannot fix

These come before, or alongside, the first flagship nodes. Each has the evidence, why it matters, and a rough cost
(S, M or L, as in [IDEAS](../IDEAS.md)).

**E1. Stereo voices (L).**
* Evidence: "Instruments are mono; stereo starts in the insert graph" ([mixing-and-routing](../architecture/mixing-and-routing.md)), and `Instrument` renders mono.
* Why it matters: unison spread, per-voice panning, stereo oscillators and per-voice stereo effects are table stakes.
  The market's most concrete complaint is that Serum 2's effects can't run per voice. Our graph answers that only if
  voices can be stereo.
* The plumbing exists: the insert graph's stereo port kind, `stereoCapable` nodes and lifted per-channel runs.

**E2. A modulation model (L): additive, with depth on the route, smooth.**
* Evidence:
  * "A wire replaces the value… To add on top of a stored value use an *Add* node"
    ([control nodes](../architecture/control-nodes-and-panels.md)).
  * Sockets are read once per block, so a modulated parameter steps every 2.67 ms (zipper noise on cutoff, pitch and
    amplitude).
  * By my reading of `compile.ts`, only automation-driven sources take the per-sample path (`processAutomatedRun`,
    which also allocates a buffer and a `Map` per call). An LFO wired into a socket is block rate. My benchmark agrees.
    [SPEC-effects-round-2](SPEC-effects-round-2.md) says the chorus recipe runs per sample; that is worth re-checking.
* What flagships do: every modulation is *source × depth (± polarity, curve) added to the knob's value*, clamped, and
  shown on the knob (Kilohearts, Vital, Serum). Our *control → socket replaces the value* model makes "knob plus LFO
  plus mod wheel" a three-node chore per parameter.
* Options:
  * **(a)** Engine-level modulation routes on any parameter: base + Σ depth·source, ramped linearly across the block
    (Vital's approach). Per sample only on parameters a node declares audio-rate (pitch, PM, amplitude). The patcher
    shows routes as a list on the node or as thin wires with a depth handle.
  * **(b)** A *Mod* node (an attenuverter with polarity and curve) that adds into a socket, plus per-block ramping of
    socket values.
* (b) is cheaper; (a) is what makes a flagship panel feel right. **Recommendation:** (a), designed once, because every
  later node and preset depends on it.

**E3. Voice modes (M).**
* Unison as *inner lanes of one voice*, not extra voices (Vital), so stealing and envelopes stay per note. It needs
  detune, spread, phase randomize and blend.
* Glide (constant time or constant rate, legato only or always), mono and legato with note priority (last, low, high).
* Steal with a 2–5 ms fast release instead of a hard cut.
* More than 16 voices only if unison stays inside the voice.
* Today none of these exist ([limits](../reference/limits.md)).

**E4. Dormant branches (M).**
* Evidence: presets "never replace graphs", and bypass is structural (it restarts the graph). A flagship with three
  engine slots, each switchable between VA, wavetable, FM and resonator, would render every family all the time.
* Fix: a value-level *enable* (or a *Selector* that gates) which the compiler honours by skipping the nodes that only
  feed a disabled branch. Then a preset can change the engine, and an unused oscillator costs nothing.
* This is also what HALion's preset rules ask for: unused oscillators off, and still working when turned on.

**E5. Per-voice facts on the Note node (S).**
* Add: the note number, release velocity, a per-voice random value rolled at note-on (seeded), and the unison lane
  index and spread (after E3).
* "Per-voice randomness on any parameter" is a recurring wish in Serum 2 threads.

**E6. Feedback inside nodes (policy, S).**
* Cycles are refused (G5). Keep it that way for now: tight feedback (operator feedback, strings, resonators, phaser)
  lives inside primitives.
* Bitwig makes users insert a one-block delay for graph feedback. We could add that later as an explicit *Feedback*
  node.

**E7. Anti-aliasing kit (M).** Shared helpers, not nodes:
* PolyBLEP/PolyBLAMP;
* a mipmapped wavetable builder (one band-limited level per octave, crossfaded);
* an ADAA helper for memoryless shapers;
* a 2× halfband oversampler that nonlinear nodes can wrap themselves in.

**E8. MPE (L, BACKLOG D2).** Per-note bend, pressure and slide (CC74). Recommendation: design E2 and E5 so per-note
sources slot in, but ship MPE after v1. Every flagship has it, and our users have no MPE controller verified (V5).

---

## 3. Node gaps: what to build

Priority **P1** is needed for the first flagship release, **P2** for v1, **P3** later.

| ID | Node | What | P | Cost |
|---|---|---|---|---|
| N1 | **VA oscillator** (upgrade *Oscillator*, keeping old patches sounding the same, or a new node) | PolyBLEP saw/pulse/tri, `width` (PWM), `sync` input, `pm` input, phase reset on note, start phase. Covers IDEAS D4, D5, D11 | P1 | M |
| N2 | **SVF filter** | Simper/Zavalishin trapezoidal SVF: LP, BP, HP, notch, peak, shelves from one structure; stable under audio-rate cutoff; `drive` (tanh before it); 12/24 dB; key tracking and velocity amount | P1 | M |
| N3 | **Ladder filter** | 4-pole TPT ladder with per-stage tanh, cheap linearised solve; self-oscillates in tune; 2× oversampled | P1 | M |
| N4 | **Curved envelope** (upgrade *Envelope*) | Exponential segments with a curve per stage, delay and hold (DAHDSR), velocity amount, loop mode | P1 | S |
| N5 | **LFO+** (upgrade *LFO*) | Phase, fade-in or delay, smooth random, retrigger modes (free, note, one-shot) | P1 | S |
| N6 | **Waveshaper and Crusher** (BACKLOG E1, already specced) | Add first-order ADAA and a fold curve | P1 | S |
| N7 | **Chorus / ensemble** | Two or three modulated delays (cubic interpolation), Juno-style modes I, II and I+II, stereo | P1 | M |
| N8 | **Wavetable oscillator** | Mipmapped tables (E7), `position` morph, warps (bend, sync, mirror, quantize), unison-ready; a procedural factory table set (no third-party tables); WAV import after | P2 | L |
| N9 | **FM operator / FM 4** | Sine PM operators with feedback inside the node, ratio or fixed frequency, envelope inputs; algorithms as modules | P2 | M |
| N10 | **Modal resonator** | 16–64 two-pole modes from a material table (bar, plate, membrane, bell, glass, wood), damping, brightness, inharmonicity, position, `scale-aware` tuning option; input is an exciter | P2 | M |
| N11 | **String / waveguide** (upgrade *Comb*) | Extended Karplus-Strong: allpass fractional delay, loop filter, dispersion, pick position | P2 | M |
| N12 | **Phaser** | 4–12 TPT allpasses with feedback (an all-pass mode exists, but a node is cheaper and smoother) | P2 | S |
| N13 | **Formant filter** | Three to five SVF band-passes with vowel tables, morph | P2 | S |
| N14 | **Plate reverb** | Dattorro plate, stereo, modulated; Freeverb stays | P2 | M |
| N15 | **MSEG** | Breakpoint envelope or LFO with curves, loop points and sync; needs an editor widget | P3 | L |
| N16 | **Granular** (BACKLOG E2) | Grain pool over a sample, as IDEAS G6 | P3 | L |
| N17 | **Spectral** oscillator or effect | On `core/spectrum`: freeze, blur, spectral morph (IDEAS H3, H7) | P3 | L |
| N18 | Diode ladder, MS-20, comb-plus-filter models | Character filters | P3 | M |

**Not needed as new nodes:** noise, sampler, delays, EQ, compressor, pan and width (insert-only until E1), the
control and logic families, and the analysis nodes. They are already good enough.

---

## 4. The proposal: what the flagship is

### What the market tells us

* **Table stakes in 2026** (missing one shows up as a con in reviews):
  * wavetable with import;
  * two or three oscillators that each switch engines;
  * drag-and-drop modulation that is visible;
  * MSEG or drawable LFOs;
  * 4–8 macros (8 is typical);
  * two routable filters;
  * unison, glide and mono/legato;
  * MPE;
  * an effects rack;
  * an arpeggiator or sequencer;
  * a tagged preset browser.
* **Differentiators:** spectral modes, modal and physical engines, per-voice effect lanes (Phase Plant), a fully
  polyphonic graph (Bitwig Grid, Zebra 3), sound matching and mutation, preset morphing, physics modulators (Korg
  Kaoss Physics), formula modulators (Surge), spline drawing (Zebra 3).
* **Recurring gaps:**
  1. Per-voice effects (Serum 2 can't).
  2. Per-voice randomness, and modulation that follows audio.
  3. Morph and XY as a first-class layer, with drawn paths.
  4. Deep engines that are learnable. Osmose: "game-changing" expression, "obtuse" editor.
  5. Behaviour and physics modulation in software.
  6. CPU efficiency (Serum 2, Zebra 3 at twice the CPU per module, Grid all criticised).
  7. Visible modulation and voice activity.
  8. Scale awareness. Meld's resonators "come out as music".

### Where we can be first-class *and* different

We should not try to out-Serum Serum on wavetable editing. We are a browser app whose instruments are open,
polyphonic, deterministic graphs, with a note graph, generative sources and analysis nodes that no plugin synth has.
The flagship should make those visible and playable:

1. **Per-voice everything.** Every voice is a stereo graph (E1), so drive, folding, filters and even a short delay or
   resonator run per note. This is the market's most concrete wish, and our architecture's natural shape.
2. **A modulation layer that is alive.**
   * The usual sources: envelopes, LFOs, macros, wheel, pressure.
   * Three sources almost nobody ships:
     * **audio-following** (the envelope follower and pitch tracker on the voice itself, or on another track's audio);
     * **generative** (Perlin wander, Geiger, random clocks, all seeded so renders repeat);
     * eventually **behaviour** (a "physics" source: a bouncing or orbiting point that outputs X, Y and impacts;
       software territory nobody occupies).
3. **Morph and Variations.**
   * A four-corner XY morph across snapshots (BACKLOG L1). It can be played, automated and recorded like any control.
   * **Variations:** seeded mutation around the current preset, with a history you can step back through. It is
     reproducible because the seed is stored.
   * Massive XL and Omnisphere 3 are just arriving here, and nobody else combines morph with deterministic,
     shareable seeds.
4. **Hybrid engines, scale-aware.** Three source slots, each one of: VA, Wavetable, FM, Resonator (exciter → modal or
   string, optionally tuned to the project's scale, which the note graph's *Scale lock* already knows), Noise or
   Sample.
5. **A curated panel over an open graph.** The front panel is the instrument; *Open patch* shows the real graph (it
   already exists), with no conversion step. This is Bitwig's Polymer → Grid idea, done as one thing.

### The instrument, at a glance

```
Note ─┬─ Source A ┐                        ┌─ Amp (env, vel, pan/spread) ─┐
(+E5) ├─ Source B ┼─ per-voice FX lane* ──►┤                              ├─► Voice out (stereo, E1)
      └─ Source C ┘    (drive/fold/crush)  └─ Filter 1 ⇄ Filter 2 ─────────┘    │
        VA | WT | FM | Resonator | Noise/Sample  (series / parallel / blend)    ▼
                                                                  Shared FX: Ensemble · Phaser ·
Mod: Env×3 (one loopable) · LFO×3 (voice) + 2 (global) · Perlin/Random ·       Drive · Delay · Plate/Hall · EQ · Comp
     Follower · Wheel · Pressure · Velocity · Per-voice random · Macros M1–M8
Morph: XY across 4 snapshots · Variations (seeded, with history)
Voice: poly 1–16 · mono/legato · glide · unison per slot (E3)
Notes: the existing note graph (arp, chord, scale lock) in front
```
\* Phase Plant's poly effect lanes, here simply nodes in the voice stage.

---

## 5. The layered build

The layering converges across Reaktor (Core → Primary → Blocks), Faust (`physmodels`: elements → exciters → parts →
`Model` → `_ui` → `_ui_MIDI`), Max/RNBO (gen~ → abstraction → `poly~`), Bitwig (Grid modules → Polymer) and VCV:

| Layer | What | Here | Examples |
|---|---|---|---|
| **L0 Primitives** | Compiled per-sample DSP; all tight feedback lives here | DSP nodes in `core/dsp/nodes` | N1–N18, plus E7 helpers |
| **L1 Components** | One function, fixed port order (audio, pitch, gate, mod), defaults that need no wires | The same nodes with conventions applied | *VA osc*, *SVF*, *Env* |
| **L2 Building blocks** | Small modules exposing 2–4 meaningful controls | Modules (example modules today) | below |
| **L3 Voice cores** | Interchangeable families with one contract (in: pitch, gate, velocity, pressure, random, macros; out: stereo audio) | Modules with a fixed interface | VA, WT, FM, Resonator |
| **L4 Instrument** | Voice cores + filter/amp + mod + FX + 8 macros + panel | A Factory instrument graph | the flagship, plus derived instruments |
| **L5 State** | Presets, snapshots, morph sets, variations | `core/preset`, Library | the Factory bank |

**L2 building blocks**, each a module with 2–4 controls. Meld's lesson: every engine's two macro knobs must
audibly do something.

* **Sources**
  * *Supersaw stack* (until unison lands in E3);
  * *Sync lead* (VA with sync sweep);
  * *PWM pair*;
  * *Sub + noise*;
  * *FM pair* and *FM 4* algorithms (N9);
  * *Wavetable scanner* (WT plus position LFO and warp).
* **Exciters** (for N10/N11)
  * *Mallet* (filtered impulse, hardness);
  * *Pluck* (noise burst, brightness);
  * *Bow* (noise × pressure follower);
  * *Breath* (filtered noise × envelope);
  * *Strike* (Geiger for rattles).
* **Bodies**
  * *Modal body* (material, size, damping, scale-aware);
  * *String* (damping, pick position);
  * *Tube* (later).
* **Filter section**
  * Filter 1 and 2, routing blend (series ↔ parallel), drive, envelope amount, key tracking, velocity.
* **Amp section**
  * Envelope, velocity curve, pan and spread.
* **Modulation packs**
  * *Vibrato* (delayed LFO + wheel);
  * *Breath and brightness* (pressure → cutoff and level);
  * *Movement* (LFO ↔ Perlin blend, one knob);
  * *Follow* (envelope follower → anything);
  * *Humanize* (per-voice random → pitch, cutoff, start).
* **Effects**
  * *Ensemble*;
  * *Phaser*;
  * *Tape drive*;
  * *Space* (delay + plate, one *Size* and one *Mix*);
  * *Ducker* (BACKLOG L8);
  * *Widener*.

**L3 voice cores**: *VA*, *Wavetable*, *FM*, *Resonator*, *Hybrid*. Each also ships as a Starter instrument (its
own "Init").

**L4**: the flagship, and smaller instruments derived from the same blocks, so the Factory has breadth early:
* a mono bass synth;
* a poly pad;
* a pluck/keys (FM or modal electric piano);
* a drum synth (IDEAS E5);
* a texture instrument (Perlin, follower, later granular).

---

## 6. The Factory library

What exists: a read-only Factory root, 49 items from the examples, and no presets (BACKLOG L7 is the mechanism, as
rows of `FACTORY_CONTENT`).

* **Taxonomy:**
  * The category says what the sound is *for*:
    * Bass
    * Lead
    * Pad
    * Pluck
    * Keys (u-he renamed "Keys" to "Poly")
    * Arp/Sequence
    * Drum/Percussion
    * FX/Texture
    * Generative
  * Character tags say what it *sounds like*: bright/dark, clean/dirty, static/moving, mono/poly, analog/digital/acoustic,
    MPE or pressure, and others.
  * GForce separates functional and subjective tags; NKS uses type, subtype and characters.
* **Macro convention**, the contract every preset keeps:
  * **M1 Tone**, **M2 Movement**, **M3 Character** (drive, fold, FM index), **M4 Space**; M5–M8 free per preset.
  * The mod wheel, velocity and pressure always do something meaningful. Arturia validates every preset for this,
    and Pigments has four macros.
* **Naming and level rules**, adapted from Steinberg's HALion guideline:
  * A single note at full velocity peaks at −1 to 0 dBFS for bass and lead, about −6 dBFS for pads.
  * Tuned to A = 440 Hz, synced to tempo, auditioned at 120 BPM.
  * No unused parts running (E4).
  * English names; no artist or brand names; don't repeat the category in the name; no names that start with a number.
* **An automated quality gate**, in our test style. Every Factory preset gets a test that renders a reference phrase
  offline and checks:
  * it is finite and audible;
  * its peak is in the range for its category;
  * its CPU is under budget (µs per voice, as in §1);
  * each macro changes the render: a spectral or level difference above a threshold between the macro at 0 and at 1;
  * it sounds the same after a reload.

  This reuses the bounce, the factory test harness and the spectrum core.
* **Size:** grow in step with the engine. About 24 presets at v0.1, 80 at v0.2, 150–200 at v1. Flagships ship
  250–1,700+; one sound designer's well-made 150 beats 600 thin ones. The research found "make more and cut half"
  advice but could not confirm its source.
* **Examples:** once the flagship exists, rebuild Low Light's and Glass Rain's synths on it (or add a third example),
  so the examples show the flagship instead of hand-wired graphs that are getting old.

---

## 7. Phased plan

Each phase ends with something playable and a batch of Factory presets that prove its nodes. That is the "complete
the set first?" answer: complete it **just in time**, not all at once.

| Phase | Builds | Ships | Size |
|---|---|---|---|
| **0. Contract** | A signal-conventions note: pitch unit and reference, modulation polarity and ranges, port order, clamp and NaN policy, macro convention; the spec for E2 | A spec in `active/`, signed off | S |
| **1. Engine foundations** | E2 modulation routes, E1 stereo voices, E3 voice modes, E4 dormant branches, E5 Note node facts, E7 helpers | No new sound yet; existing patches unchanged (tests) | L |
| **2. Subtractive core** | N1 VA osc, N2 SVF, N3 ladder, N4 envelope, N5 LFO, N6 shaper and crusher, N7 ensemble; the L2 sources, filter, amp and mod packs; the VA voice core | **Flagship v0.1** (VA only) with panel and macros; mono bass and poly pad; about 24 presets; quality gate | L |
| **3. Digital engines** | N8 wavetable with a procedural table set, N9 FM, N12 phaser, N14 plate; WT and FM cores; 3 slots | **v0.2**, about 80 presets | L |
| **4. Signature** | N10 modal, N11 string, exciters, scale-aware tuning; four-corner morph (L1) and Variations; follower and generative mod packs; N13 formant | **v1**, 150–200 presets; examples refreshed | L |
| **5. Depth** | N15 MSEG, E8 MPE, N16 granular, wavetable import, N17 spectral, N18 character filters | v1.x | L each |

The UI work this needs (modulation rings on knobs, route editing, the morph pad, the macro row, a combined
instrument-and-effects panel, BACKLOG C2/C9) belongs in phases 1–2. The order was decided on 2026-11-06: round 12d, round 13a
(UI foundations), the [engine PI](REPORT-engine-gaps.md#5-the-engine-improvements-pi), then round 13b (the design pass).

---

## 8. Decisions to discuss

1. **Identity.** Do we agree on the five pillars in §4 (per-voice everything, a modulation layer that is alive,
   morph and variations, scale-aware hybrid engines, a curated panel over an open graph)? Which one or two lead?
2. **Modulation model.** Engine-level additive routes (E2a, recommended) or a *Mod* node with block ramping (E2b)?
3. **Stereo voices** (E1): in v0.1 or later? Recommended for v0.1: unison spread and per-voice FX depend on it.
4. **Upgrade or add nodes.** Upgrade *Oscillator*, *Envelope*, *LFO* and *Filter* in place with sound-preserving
   defaults, or add new nodes (*VA osc*, *SVF*) and keep the old ones for the examples?
5. **One flagship or a family.** One big instrument with three switchable slots (needs E4), or a family of focused
   instruments sharing L2 blocks, then the flagship? They can be sequenced: the family first is cheaper.
6. **MPE timing** (E8): after v1 (recommended), or design-in now?
7. **WASM.** Stay in TypeScript for now (the benchmark says there is headroom), with a WASM SIMD path for the hottest
   kernels if a phase needs it. This matches the
   [capacity report](../archive/2026-10-perf-library/REPORT-browser-audio-capacity-and-rust-engine.md).
8. **Order against the redesign.** Before or after round 12d and round 13, and should `feat/midi-recording` merge first?
9. **Name.** The flagship needs one.

---

## Appendix: sources and confidence

**Repo (verified in code):**
* `dsp/nodes/oscillator.node.ts` (naive waves), `envelope.node.ts` (linear ADSR), `filter.node.ts` and `biquad.ts`
  (RBJ, 16-sample coefficient blocks), `instrument/compile.ts` and `automation-run.ts` (block-rate sockets; the
  per-sample path only for automation; allocation per call), `instrument/voice.ts` (note state: frequency, velocity,
  gate, trigger, pressure, bend).
* [mixing-and-routing](../architecture/mixing-and-routing.md) (mono instruments), [library-and-presets](../architecture/library-and-presets.md)
  (recall never replaces graphs), [limits](../reference/limits.md), [IDEAS](../IDEAS.md), [BACKLOG](../BACKLOG.md).

**Products** (moderate confidence; 2026 releases mostly from news sites and forums):
* Serum 2 — [xferrecords.com](https://xferrecords.com/products/serum-2), [MusicTech](https://musictech.com/reviews/software-instruments/xfer-records-serum-2-review), per-voice FX complaint [KVR](https://www.kvraudio.com/forum/viewtopic.php?p=9067717)
* Pigments — [arturia.com](https://www.arturia.com/products/software-instruments/pigments/overview), [Attack](https://www.attackmagazine.com/reviews/gear-software/arturia-pigments-7-the-best-gets-even-better/), macro validation on the [Arturia forum](https://forum.arturia.com/t/feature-request-at-least-8-macros-please/7930)
* Phase Plant — [docs](https://kilohearts.com/docs/phase_plant), [modulation](https://kilohearts.com/docs/modulation)
* Omnisphere 3 — [SOS](https://www.soundonsound.com/reviews/spectrasonics-omnisphere-3)
* Zebra 3 — [KVR news](https://www.kvraudio.com/news/u-he-releases-zebra-3---modular-wireless-synthesis-and-physical-modeling-engine-66720)
* Massive XL — [Synth Anatomy](https://synthanatomy.com/2026/10/native-instruments-massive-xl-review-flagship-wavetable-synth.html)
* Synplant 2 — [MusicTech](https://www.musictech.net/reviews/plug-ins/sonic-charges-synplant-2-review/)
* Bitwig Grid and Polymer — [signals](https://www.bitwig.com/userguide/latest/on_grid_signals), [special connections](https://www.bitwig.com/userguide/latest/special_connections), [Polymer](https://www.bitwig.com/polymer/)
* Meld — [Ableton](https://www.ableton.com/en/blog/meld-a-look-at-live-12s-new-bi-timbral-synth/)
* Osmose — [SOS](https://www.soundonsound.com/reviews/expressive-e-osmose)
* modwave mkII — [Korg](https://www.korg.com/us/products/synthesizers/modwave_mk2/)
* Surge XT — [site](https://surge-synthesizer.github.io/)
* VCV — [voltage standards](https://vcvrack.com/manual/VoltageStandards)
* Faust — [physmodels](https://faustlibraries.grame.fr/libs/physmodels/)
* Reaktor Blocks — [framework manual](https://native-instruments.com/fileadmin/ni_media/downloads/manuals/REAKTOR_Blocks_Framework_Manual_English.pdf)
* HALion — [preset guideline](https://steinbergmedia.github.io/halion-script-api/HALion-Tutorials-Guidelines/pages/HS-Preset-Guideline.html)
* Radical1 (JSON preset schema, editing presets with an LLM) — [Sound Radix](https://www.soundradix.com/articles/synth-presets-ai-generation-radical1/)

**DSP** (high confidence; standard literature):
* Zavalishin, [*The Art of VA Filter Design*](https://www.native-instruments.com/fileadmin/ni_media/downloads/pdf/VAFilterDesign_2.1.0.pdf); Simper SVF; Välimäki and Huovilainen 2007 (PolyBLEP); Välimäki et al. 2010 (DPW)
* ADAA — Parker et al. DAFx-16, [Chowdhury notebook](https://ccrma.stanford.edu/~jatin/Notebooks/adaa.html)
* Vital's oscillator source, for unison and spectral warps — [GitHub](https://github.com/mtytel/vital/blob/main/src/synthesis/producers/synth_oscillator.cpp). GPLv3: learn from it, don't copy it.
* Signalsmith reverb — [blog](https://signalsmith-audio.co.uk/writing/2021/lets-write-a-reverb/)
* Chrome AudioWorklet design patterns — [developer.chrome.com](https://developer.chrome.com/blog/audio-worklet-design-pattern)

**Not verified:**
* Kilohearts v3's release.
* Zebra 3's preset count.
* Exact LFO and envelope counts in Serum 2 and Hydrasynth.
* Published JS vs WASM vs WASM SIMD numbers for audio DSP. None found; the WAC 2022 comparison exists but could not
  be read.
* Whether ADAA works inside ZDF feedback loops. An open research topic.
* The source of "make 1,000 presets, cut half".
