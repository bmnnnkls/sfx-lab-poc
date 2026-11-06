---
status: proposed
date: 2026-11-06
deciders: project owner
---
# ADR-0009: Feedback: inside primitives, or through an explicit block delay

## Context

* Patches must be acyclic. `planStages` throws on a cycle, the editor refuses one, and BACKLOG G5 asks for "feedback
  cycles behind an explicit delay boundary".
* Tight feedback needs sample-by-sample loops, which a block graph can't run:
  * FM operator feedback;
  * Karplus-Strong and waveguides;
  * the phaser's resonance;
  * a ladder's resonance.
* Bitwig's Grid solves graph feedback with a *Long delay* node whose minimum delay is one block.

## Decision

1. **Tight feedback lives inside primitives.** Operators, strings, resonators, filters and phasers implement their own
   loops at sample rate. This is a rule for node design (ADR-0005).
2. **Graph feedback goes through an explicit *Feedback* node pair**: *Feedback send* and *Feedback return*, sharing an
   id.
   * The return outputs what the send received **one block earlier** (128 samples, 2.67 ms at 48 kHz). That is
     enough for slow feedback textures, delay networks and modulation loops (a follower driving its own source).
   * The compiler treats the pair as cut, so the graph stays acyclic for ordering.
   * Within a voice the pair is per voice; across stages it is refused (voice→shared only flows one way).
3. Other cycles are refused, as today, with a hint naming the *Feedback* node.

## Options considered

* **Allow cycles and run the cycle per sample.** It is correct, but the cost is unbounded and it breaks the block
  model and the stage split.
* **No graph feedback ever.** It forbids a class of experimental patches that a lab should allow.
* **Primitives, plus an explicit one-block pair (chosen).**

## Consequences

* N9 (FM operator), N10 (modal), N11 (string) and N12 (phaser) in the flagship report are self-contained by design.
* The pair is low priority in the PI (Iteration 5, optional).

## Related

ADR-0005; BACKLOG G5; [flagship report §3](../../active/REPORT-flagship-synth.md#3-node-gaps-what-to-build).
