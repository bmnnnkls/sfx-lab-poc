---
status: proposed
date: 2026-11-06
deciders: project owner
---
# ADR-0003: Signal conventions: pitch, ranges, gates, port order

## Context

Every signal is a `Float32Array` block, so the engine itself has no units. The conventions are whatever each node
assumes, and today they differ:

* **Pitch is carried in hertz** (`Note.frequency` → `oscillator.freq`), and pitch modulation in three other units:
  * the oscillator's `pitch` input is "×*Pitch CV* semitones per unit";
  * the filter's `cutoff` input is "×*CV amt* octaves per unit";
  * key tracking divides by middle C in Hz.

  Glide, scale quantizing, unison detune and MPE bends are all linear in semitones. In Hz they need conversions on
  every wire.
* **Modulation ranges vary.** The LFO has `out` (±depth) and `uni` (0..depth). The envelope is 0..1. Velocity and
  pressure are 0..1, bend is −1..1, a CC is 0..1.
* **Gates are "> 0.5"** in the envelope, while VCV uses 10 V gates and Schmitt thresholds.
* **There is no rule for port order or names**, nothing about NaN, and nothing about levels above 1.

Reaktor Blocks, Bitwig Grid, VCV Rack and SuperCollider each converge on a small typed set of signals with one pitch
unit and fixed names. That is what makes modules interchangeable
([flagship report §5](../../active/REPORT-flagship-synth.md#5-the-layered-build)).

## Decision

### Signal kinds and ranges

| Kind | Range | Notes |
|---|---|---|
| **Audio** | nominal ±1 (0 dBFS) | May exceed 1 inside a graph; never hard-clipped by the engine. Saturation is a node's job. |
| **Pitch** | MIDI note number as a float (69 = A4 = 440 Hz; 60 = C4) | Absolute. Bend, glide, detune and transpose are additions in semitones. Hz exists only inside nodes and on explicit `freq` (Hz) ports. |
| **Modulation, bipolar** | −1..+1 | LFO `out`, bend, random, Perlin, follower deltas. |
| **Modulation, unipolar** | 0..1 | Envelopes, velocity, pressure, CCs, macros, LFO `uni`. |
| **Gate** | 0 or 1; "on" is ≥ 0.5 | Held for the note's length. |
| **Trigger** | a rising edge through 0.5 | A one-sample pulse, or a gate's onset. |
| **Phase** | 0..1, wraps | For phase-driven nodes (oscillator `pm`, a future phasor). |

Each output port declares its kind (`PortSpec.signal: 'audio' | 'pitch' | 'bipolar' | 'unipolar' | 'gate' | 'phase'`).
The patcher colours wires by kind and warns on a mismatch, but doesn't refuse it.

### Pitch

* The Note node gains `pitch` (the note number, bent by the wheel and later MPE). `frequency` stays as Hz for
  compatibility and for linear-FM recipes.
* Oscillators, the sampler, the comb or string, and key tracking read `pitch`.
* Pitch modulation is a modulation route in semitones (ADR-0004), not a scaled CV input.
* Key tracking is a *pitch amount*: 1 means the cutoff follows the note one-to-one, around C4.
* Cutoff-like parameters are shown in Hz but modulated on their knob's logarithmic scale (ADR-0004).

### Port order and names

1. Inputs, in this order: audio (`in`, `in2`…), `pitch`, `gate` and `trigger`, then dedicated audio-rate inputs (`pm`,
   `fm`, `sync`), then sidechains. Parameter sockets come after, generated as today.
2. Outputs: the main output first (`out`), then the others.
3. Names follow SuperCollider's contract where one applies: `pitch`, `gate`, `velocity`, `pressure`, `out`. A voice
   core's interface is `pitch, gate, velocity, pressure, slide, random` in, `out` (stereo) out (ADR-0006, ADR-0007).

### Safety

* An engine stage boundary (voice sum, shared input, track output) replaces non-finite samples with 0 and counts them
  in the status (a debug readout).
* Nodes don't check every sample. A node with feedback guards its own state (denormals, NaN) (ADR-0005).
* Level budget for presets: ADR-0015.

## Options considered

* **Pitch in Hz (status quo).** Every musical operation needs a conversion node; exponential FM and linear pitch
  modulation get mixed up.
* **Pitch in octaves, V/oct-style (VCV, Bitwig's 0.1/oct).** Equivalent, but users and MIDI think in notes.
* **Pitch as a MIDI note number (chosen).** Readable (60 is C4), additive in semitones, and matches the note graph, the
  scale lock and MIDI.

## Consequences

* The migration (ADR-0002) rewires `Note.frequency → X.freq` to `Note.pitch → X.pitch` wherever X is an
  oscillator, sampler or comb. Math chains on a frequency (the FM bell's *Modulator pitch* multiply) stay on
  `frequency` and keep working.
* `midiToHz` and `hzToMidi` stay for odd cases.
* Declared port kinds give the patcher wire colours (IDEAS F6) for free.
* Every new node in the PI follows the order, names and kinds above. A test over the registry enforces names and
  kinds, like the node-docs test.

## Related

ADR-0004 (how modulation is applied), ADR-0005 (port declarations), ADR-0007 (voice-core interface).
