---
status: proposed
date: 2026-11-06
deciders: project owner
---
# ADR-0015: Macro and Factory preset conventions

## Context

* The Factory has 49 items and no presets (BACKLOG L7).
* The flagship's library is the goal of this work. A library is only as good as its consistency:
  * every preset's macros do something audible;
  * the mod wheel always does something;
  * levels match;
  * names are findable.
* Evidence from the research ([flagship report §6](../../active/REPORT-flagship-synth.md#6-the-factory-library)):
  * Arturia validates every preset's macros and mod wheel.
  * Steinberg's HALion guideline sets level, tuning and naming rules.
  * GForce and NKS split functional categories from character tags.
  * Synplant 2 was faulted for having no tags.
* The parts exist: control nodes and panels, module knobs, snapshots and presets, A/B morph, Randomize with seeds, and
  the Factory built from code (`FACTORY_CONTENT`).

## Decision

### Macros

1. Every Factory **instrument** has **8 macros**: control nodes named `M1`…`M8`, shown first on its panel.
   * **M1 Tone** (brightness: cutoff, wavetable position, FM index, as fits).
   * **M2 Movement** (modulation depth or rate).
   * **M3 Character** (drive, fold, noise, detune).
   * **M4 Space** (effect sends and mixes, stereo width).
   * **M5–M8** are free per preset, with names of the preset's choice.
   * Effects in the Factory get 4 (M1–M4 with names of their own).
2. A macro drives its targets through **modulation routes** (ADR-0004), each with its own depth and curve, so one
   macro can open a filter while closing a resonance.
3. **Always mapped**, unless the preset's note says why not:
   * the **mod wheel** (CC1) does something meaningful (vibrato, brightness, movement);
   * **velocity** reaches level or tone;
   * **pressure** reaches something.

### Taxonomy and names

4. **Category, by function:**
   * Bass
   * Lead
   * Pad
   * Pluck
   * Keys
   * Arp & Sequence
   * Drums & Percussion
   * FX & Texture
   * Generative

   **Character tags:**
   * bright, dark
   * clean, dirty
   * static, moving
   * mono, poly
   * analog, digital, acoustic
   * pressure, MPE (later)
   * generative
   * lo-fi
5. **Names** are English, no artist, brand or song names, don't repeat the category ("Bass"), don't start with a
   digit, and are at most 24 characters.

### Quality gate (a test per Factory preset)

6. Render a reference phrase offline: a held C3, a chord, and a fast pattern, at 120 BPM. Then check:
   * **finite and audible**;
   * **peak level**: −6 to 0 dBFS for Bass, Lead and Pluck at full velocity, and −12 to −3 dBFS for Pad, Keys and
     Texture;
   * **tuning**: the pitch detector (YIN) says the held note is within ±5 cents, for pitched categories;
   * **CPU**: at most 40 µs per voice per block, as the PI's harness measures it in Node;
   * **every macro and the mod wheel audible**: the render at macro 0 differs from the render at 1 by a spectral or
     level distance above a threshold;
   * **no dormant waste**: no active branch that reaches nothing audible (ADR-0008);
   * **stable**: identical after a save and reload, and identical across two renders (ADR-0012).
7. **Init presets.** Each voice-core family has an *Init* preset: one oscillator, an open filter, a plain envelope,
   the macros bound but neutral.

## Options considered

* **Four macros (Pigments).** Fewer to validate, but our panels and the market (Serum 2, Phase Plant, Hydrasynth) use
  eight.
* **No convention; each designer decides.** That is what produces thin, inconsistent banks.
* **Eight macros, the first four with fixed meaning, plus an automated gate (chosen).**

## Consequences

* The gate is a vitest suite over `FACTORY_CONTENT`, extending `factory.test.ts`. A preset that fails doesn't ship.
* The CPU budget ties presets to ADR-0013's harness.
* The thresholds above are starting values, tuned on the first 24 presets.

## Related

ADR-0004, ADR-0008, ADR-0012, ADR-0013; BACKLOG L7, V12.
