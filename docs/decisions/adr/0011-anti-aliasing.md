---
status: proposed
date: 2026-11-06
deciders: project owner
---
# ADR-0011: Anti-aliasing and oversampling policy

## Context

* The oscillators are naive and alias at high pitches ([limits](../../reference/limits.md)). The planned shapers
  (waveshaper, folder) alias under drive. The filters are linear biquads.
* A flagship's first impression is a bright saw lead and a driven bass. Aliasing there reads as "cheap".
* CPU is finite but not the blocker: a 3-oscillator voice costs about 11 µs per block
  ([flagship report §1](../../active/REPORT-flagship-synth.md#what-a-flagship-voice-costs-measured)).
* The standard techniques, by cost (DSP research in the flagship report):

| Technique | Use | Cost class |
|---|---|---|
| PolyBLEP / PolyBLAMP | Analytic saw, pulse, triangle, hard sync | A |
| Mipmapped band-limited tables | Wavetables, arbitrary waves, FM-friendly | A–B |
| First-order ADAA | Memoryless shapers (tanh, clip, fold) | A–B |
| 2× polyphase halfband oversampling | Nonlinear filters, heavy folding, FM stacks | ×2 on the wrapped node, plus the filters |

## Decision

1. **Oscillators are band-limited by default.** Analytic waves use PolyBLEP/PolyBLAMP, with a correction at the
   fractional reset for sync. Table-based waves use mipmaps: one level per octave, crossfaded, with tables of 2048
   samples. There is no naive mode, except a deliberate *Lo-fi* option where aliasing is the point.
2. **Memoryless nonlinearities use first-order ADAA**: the waveshaper's curves and the drive stages in filters. They
   fall back to the midpoint value when the input barely changes. The numerically safe antiderivatives (for example
   `log cosh` written without overflow) live in one shared module.
3. **Oversampling is opt-in per node**, through a shared 2× halfband helper (cascade to 4×) that a node wraps around
   its core.
   * Nodes that default to 2×: the nonlinear ladder, the wavefolder at high fold, FM stacks with feedback.
   * The quality setting `Quality: draft | normal | high` is per project. The bounce defaults to `high`, live play
     to `normal`.
4. **Quality is tested.** Each oscillator and nonlinear node has a test that renders a sweep or a high note and
   measures the energy of aliased components (below the fundamental, or off the harmonic grid) against a threshold
   in dB. Self-oscillating filters are checked for tuning.
5. **Linear filters are trapezoidal (ZDF/TPT)** and need no oversampling. The direct-form biquad remains only for
   static EQs and is never modulated at audio rate.

## Options considered

* **Oversample everything (Bitwig Grid's 4×).** Simple, but it costs 4× everywhere, and Grid is criticised as
  "CPU-heavy".
* **minBLEP / BLIT.** Slightly better analytic quality, but a per-voice correction buffer that is awkward in a node
  graph.
* **Targeted techniques per node class (chosen).**

## Consequences

* `core/dsp/aa/` (or similar) holds the BLEP, mipmap, ADAA and halfband helpers, with their own tests.
* Projects get a *Quality* setting. The bounce renders at `high`.
* The DSP of the oscillator and the shapers changes, so this depends on ADR-0002.

## Related

ADR-0002, ADR-0005, ADR-0014; IDEAS D11; [limits](../../reference/limits.md).
