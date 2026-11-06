---
status: proposed
date: 2026-11-06
deciders: project owner
---
# ADR-0013: Runtime: TypeScript first, WASM for measured hot kernels

## Context

* The engine is TypeScript in an AudioWorklet. Decision 2 fixed F1 in TypeScript rather than moving to Rust/Wasm. The
  [capacity report](../../archive/2026-10-perf-library/REPORT-browser-audio-capacity-and-rust-engine.md) recommends a
  bounded Rust/Wasm experiment before any migration, and notes that "a guaranteed browser speed multiplier is not
  available".
* Measured on 2026-11-06 in Node: a 3-oscillator, 24 dB filter voice costs about 11 µs per block. 16 voices of a
  7-saw unison through two filters take 12% of the budget. There is headroom for band-limiting and some oversampling.
* WASM SIMD (128-bit, Baseline in Chrome, Firefox and Safari 16.4+) would suit unison oscillator banks and filter
  banks. Relaxed SIMD is not Baseline. Chrome's AudioWorklet guidance favours WASM for garbage-free DSP.
* No published audio-specific benchmark of JS against WASM-SIMD was found (flagship report, appendix).

## Decision

1. **The engine and every node stay in TypeScript for this PI.** The node contract (ADR-0005) is designed so that a
   node's core can later be a WASM kernel behind the same interface: flat buffers, indices, no objects in the hot
   loop.
2. **WASM is introduced per kernel, only with a measurement.** A kernel moves to WASM (Rust or AssemblyScript, chosen
   then) when a node's measured cost blocks a preset budget (ADR-0015) and a prototype shows at least 2× on the
   kernel in the real worklet. Candidates: unison wavetable banks, modal banks, the oversampled ladder.
3. **Fixed-width SIMD only.** No relaxed SIMD, for determinism (ADR-0012) and Safari.
4. **The per-node CPU harness is the arbiter.** It is the PI's profiling tool: a Node benchmark per node and per
   preset, plus a worklet run.

## Options considered

* **Rust/Wasm engine now.** A rewrite in the middle of a feature push, with no measured gain. Decision 2 already
  leaned against it.
* **TypeScript only, forever.** It closes the door on dense banks, which may be needed later.
* **TypeScript now, WASM per measured kernel (chosen).**

## Consequences

* No build-step change in this PI.
* The ADR-0005 rules (indices, no allocation, flat buffers) double as WASM readiness.
* This supersedes nothing; it extends decision 2 to the flagship's DSP.

## Related

ADR-0005, ADR-0015; decision 2; [packages and server audio proposal](../../active/SPEC-packages-and-server-audio.md).
