---
status: proposed
date: 2026-11-06
deciders: project owner
---
# ADR-0010: Graph swaps: built off the critical path, installed without cutting notes

## Context

* A structural edit (a wire, a node, a module change, the voice count) sends `track/setPatch` or `track/setVoices`.
  `TrackRuntime.setPatch` then constructs a **new `Instrument`**: it compiles the patch once per voice, allocating
  every node and buffer.
* This happens inside the worklet's `port.onmessage`, which runs **on the audio thread** between render quanta
  (`audio/worklet/engine-processor.ts`).
* Consequences:
  * A big patch × 16 voices (32 with ADR-0007) is built in one go on the audio thread, which risks an overrun.
  * Every sounding note is **cut**: the old instrument is dropped.
  * `setFx` does the same to the insert graph, so a reverb's tail stops dead.
* Users and sound designers edit while playing. The flagship's panel switches engines (ADR-0008) and morphs presets;
  those must never click or cut.

## Decision

1. **Plan on the main thread.** The main thread computes the compiled *plan*: order, stages, buffer slots, parameter
   and route tables, dormancy. It is plain data and is posted with the command. The worklet doesn't run topological
   sorts or stage planning.
2. **Instantiate in slices.** The worklet builds the new instrument's node instances across several render quanta,
   within a time budget per quantum (for example 0.3 ms), while the old instrument keeps playing.
   * Voices are built lazily: the first voice, then the rest as notes need them, each on demand.
   * Buffers come from per-track pools.
3. **Install with continuity.**
   * Notes held when the swap lands are re-attached to the new instrument at their current pitch, and their
     envelopes resume from their current level (state carried over by the voice-core contract where node identities
     match; otherwise retriggered legato).
   * The old instrument's output crossfades into the new one over 10 ms.
   * Insert graphs swap the same way. Tails of nodes whose identity and type are unchanged carry over (a reverb keeps
     its buffers), otherwise they crossfade.
4. **Parameter-only changes never swap.** They are `setParam`, binding and route value updates, as today.
   `active` changes and routing choices re-plan without re-instantiating (ADR-0008).
5. **Identity.** Node ids are the key that matches old and new instances. A node whose id and type are unchanged keeps
   its instance and state.

## Options considered

* **Compile in a worker and transfer instances.** JS objects can't be transferred into an AudioWorklet; only data can.
* **Keep building on the audio thread, but faster.** It still cuts notes, and still risks one long quantum.
* **A plan from the main thread, sliced instantiation, and a crossfaded install that keeps instances by identity
  (chosen).**

## Consequences

* Patching while playing becomes seamless. That is a feature for a lab, and a requirement for preset browsing on the
  flagship.
* The engine needs a "pending instrument" state and a swap scheduler per track, plus tests:
  * a held note survives a rewire;
  * no quantum exceeds the budget while building a 32-voice patch;
  * a reverb tail survives an insert-graph edit that leaves the reverb untouched.
* Partial overlap with P1 (the first-callback overrun). Building up front at prepare time could also go through slices.

## Related

ADR-0005 (plans, `reset`), ADR-0008; BACKLOG P1; [engine gaps](../../active/REPORT-engine-gaps.md) (EG12, EG13).
