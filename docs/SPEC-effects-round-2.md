# Effects round two: distortion, filter modes, parametric EQ

Status: **draft product behavior; nothing implemented yet**. Written 2026-10-18.

This is the product specification for the next effects sequence. It takes precedence over older
sketches in TASKS.md and IDEAS-nodes-and-controls.md where they disagree. All three modules are
pure DSP nodes in the existing registry; the patcher, quick-add and persistence pick them up
automatically once they are registered and documented.

## Outcome and order

Widen what a patch can sound like with three additions, in this order:

1. **Filter modes** (idea D3): notch, peak, low and high shelf, all-pass, and a steeper 24 dB
   slope on the existing Filter. Extracts the RBJ biquad into a shared helper.
2. **Parametric EQ** (idea D8): a three-band EQ node built from that helper. Nearly free after 1.
3. **Distortion** (idea D2): a Waveshaper and a Crusher. The top-rated open idea; lets the
   hand-built *Soft clip* module migrate to a node.

## Verified: chorus and flanger need no new nodes (idea D7)

Checked against the compiler and the DSP (2026-10-18):

* Every numeric parameter has a socket; `delay.time` is `param:time`.
* When a varying source feeds a parameter socket the compiler re-runs the node sample by sample
  (`compile.ts` → `processAutomatedRun`), calling `setParam` per frame. True per-sample
  modulation, not block steps.
* A chorus (0.5 Hz over 10–30 ms) is smooth and click-free. A flanger (1–5 ms sweep) is smooth,
  finite and stable, but a swept comb at feedback 0.9 rings to about 9x the input; keep feedback
  at or under 0.8 (about 5x) or ride the mix.
* The recipe: `LFO (uni)` -> `Map range` (0.005–0.03 s) -> `delay.param:time`, feedback 0.3–0.8,
  mix about 0.5. A stereo chorus is two delays with slightly different LFO rates.
* Limits: the delay's time floor is 1 ms (flangers go lower), and the per-sample re-run costs
  CPU, so keep it to one or two nodes per patch.
* A **phaser** still needs a node: an all-pass chain, which the filter modes below add. It then
  builds from parts (all-pass, LFO on `param:cutoff`).

## 1. Filter modes (edit `src/core/dsp/nodes/filter.node.ts`)

| Param | Change |
| --- | --- |
| `mode` | extend to: lowpass, highpass, bandpass, notch, peak, low shelf, high shelf, all-pass |
| `gain` | new: −24…24 dB, default 0, unit dB. Boost/cut for peak and both shelves; ignored by the others |
| `slope` | new: options 12 dB / 24 dB, default 12 dB. 24 dB cascades a second identical biquad with its own state |

Algorithm: RBJ cookbook; `designBiquad` moves to `src/core/dsp/nodes/biquad.ts` so the EQ and any
future filter reuse it. Coefficient redesign per `MODULATION_BLOCK` and on param change stays as
is; the 24 dB cascade shares the same coefficients.

Tests: notch kills a sine at the cutoff (over 30 dB down), all-pass is unity magnitude with a
measurable phase shift, shelves move the shelf side by the gain amount on a steady sine, peak
boosts at the cutoff, 24 dB rolls off about twice as fast, existing modes unchanged, `gain`
ignored by the pass filters.

## 2. Parametric EQ (new `src/core/dsp/nodes/eq.node.ts`)

Category Effects, `shared: true`, `stereoCapable: true`. Ports `in` / `out`.

| Band | Params | Range |
| --- | --- | --- |
| Low shelf | `lowFreq`, `lowGain` | 20–500 Hz (default 120), −18…+18 dB (default 0) |
| Mid peak | `midFreq`, `midGain`, `midQ` | 200–8000 Hz (default 1000), −18…+18 dB (default 0), Q 0.1–10 (default 1) |
| High shelf | `highFreq`, `highGain` | 1000–20000 Hz (default 6000), −18…+18 dB (default 0) |

Algorithm: three RBJ biquads in series (low shelf, peaking, high shelf), redesigned on param
change only. Every gain default is 0, so all-zero settings are a flat passthrough. All seven
parameters are numeric, so they get sockets automatically: bands are automatable and can take CV.

Tests: +12 dB at 1 kHz measures about +12 dB on a 1 kHz sine with the other bands untouched,
−18 dB on the low shelf quiets a 60 Hz sine, all-zero is a near-exact passthrough, finite at
extreme frequencies (near Nyquist), both channels equal.

## 3. Distortion (new `src/core/dsp/nodes/waveshaper.node.ts`)

### Waveshaper

Category Effects, `shared: true`, `stereoCapable: true`. Ports `in` / `out`.

| Param | Range | Default |
| --- | --- | --- |
| `drive` | 1–20 | 2 |
| `curve` | options: soft clip, hard clip, fold, asym | soft clip |
| `bias` | −1…1 | 0 |
| `mix` | 0–1, step 0.01 | 1 |

Algorithm: pre-gain by `drive` plus `bias`, then the curve, then loudness compensation and the
dry/wet mix.

* soft clip: the existing *Soft clip* module's curve, `y = x − x³/3` after holding to ±1.5, so
  the module can migrate to the node later.
* hard clip: hold to ±1.
* fold: `y = (2/π)·asin(sin(x·π/2))` — folds at ±1 and never leaves range.
* asym: `y = 1 − e^(−x)`, normalized — even harmonics, an octave-ish character.

### Crusher (same file)

| Param | Range | Default |
| --- | --- | --- |
| `bits` | 2–16 | 16 (off) |
| `rate` | 1–48 (a divisor) | 1 (off) |
| `mix` | 0–1, step 0.01 | 1 |

Algorithm: hold each sample for `rate` frames, then quantize to `2^bits` levels.

Tests: the soft curve has a slope-0 corner (no jump at the clamp), hard clips at exactly ±1, fold
stays within ±1 for any input, asym is asymmetric (`f(x) ≠ −f(−x)`), mix 0 is untouched dry,
drive 1 with bias 0 is near-passthrough at small levels, silence in is silence out, both nodes
are finite for extreme input.

## Handoff notes

* Registration and the `node-docs.ts` entry are part of each slice; the docs test fails a node
  without words. Categories: Filter stays `Filters`, EQ and the distortion pair are `Effects`.
* The compressor (a4b94ed) is the pattern to copy: `Params`, `stereoCapable`, `shared`, a docs
  entry with keywords, and a test file beside the node.
* After the filter modes land, a phaser becomes a cheap recipe (all-pass chain, LFO on
  `param:cutoff`) — verify it the same way as the chorus before deciding it needs a node.
