---
status: proposed
date: 2026-11-06
deciders: project owner
---
# ADR-0012: Determinism: seeded sources, reproducible renders

## Context

* Determinism is already practice: "every random or noise source takes a seed" ([IDEAS](../../IDEAS.md)).
  * Voices get a salt from their slot, so voices differ but a render repeats (`compileStage`'s `voiceSalt`).
  * WAV export, the examples' tests and Randomize's seeds rely on it.
* The PI adds new random things: unison phases, the per-voice `random`, analog drift, Variations
  ([flagship report](../../active/REPORT-flagship-synth.md#4-the-proposal-what-the-flagship-is)).
* It also changes allocation (lazy voices, spare voices for fades). Slot-based salts could then depend on timing.

## Decision

1. **Every random source is seeded and stateless across renders**:
   * the node's own seed parameter;
   * the voice's salt;
   * for per-note values, the **note-on counter** of the instrument, not the slot.

   The same notes in the same order give the same randomness, whatever the voice allocation does.
2. **One generator.** `dsp/random.ts` (seeded, fast) is the only source. `Math.random()` is banned in `core/dsp` and
   `core/instrument` (an architecture test).
3. **Live and offline agree.** The bounce and the worklet run the same code on the same events and produce the same
   samples, within float tolerance where block cuts differ. The existing loop audio spec is the model.
4. **Variations are seeds.** A Variation (mutation, randomize) stores its seed and amount, so a shared project
   reproduces it exactly.
5. **Analog drift and other slow randomness** is seeded per voice salt and note counter, and runs on render time
   (frames), never on wall-clock time.

## Options considered

* **Seed by slot (status quo).** It breaks once allocation changes with lazy voices and spare fade voices.
* **Seed by note-on counter (chosen).** Stable under any allocation strategy.

## Consequences

* The voice-seed tests move from slot to counter.
* A test renders the same clip with 8 and with 32 voices and requires identical per-note random values.

## Related

ADR-0007, ADR-0015 (Variations); `instrument/voice-seed.test.ts`.
