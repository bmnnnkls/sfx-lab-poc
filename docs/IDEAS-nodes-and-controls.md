# Ideas: controls, indicators, analysis, effects and example modules

A pool of things we could build next, kept so we can pick the most valuable ones later. Nothing here is decided or started.
When an item ships, document it in `ARCHITECTURE.md`, then tick or delete it here.

**How to read it.** Each item has an ID (reply with "A1, C1–C4, G2"), a value (★ to ★★★) and a rough cost (S: a node and its
tests; M: a node plus new plumbing, or several nodes; L: a new subsystem). `?` marks something not verified against the code.

**Built (marked ✓ in the tables)**: A1 to A4, B0 to B3, C1 to C4 and C10 to C13, D1 with G1, G2 and G4, E1 and F1. What differs from the lists, and what it
left behind:

* **A3 (push button)** is the Switch's `trigger` mode; "latch" is not a separate mode, since a toggle plus the *Flip-flop* (C11) is a latch.
* **G4 (Geiger)** is one node with two outputs: `Click` (crackle) and `Trigger` (a gate for envelopes and samplers).
* **C10** is *Random* (a value that stays until a rise on `Roll`); **G3** (smooth random with glides) is not built.
* **E1** shipped as two modules under a new picker category, *Examples* (an overtone oscillator and a drawbar organ); E8 (a bigger library) is not built.
* **F1** randomizes and mutates the graph on show, with a seed and a per-node lock; per-*parameter* locks and a randomize on the panel's controls only are not built.
* **Left for later, found while building:** the DSP has no tempo, so *Clock* counts in Hz or BPM but cannot follow the project's tempo (a `tempo` in
  `ProcessContext` would fix it, and make C12's "tempo-synced" real); noise and the other seeded sources start from the same seed in every voice of a
  chord (a per-voice salt would decorrelate them); an indicator inside a module's own editor has no live value (a module is only live where it is used);
  indicators in a voice are absent, not stale, when no voice sounds (so a LED driven by a voice-stage follower goes dark between notes).
* **A1** is the same `ControlWidget` as the panel's, inside the card (`widgets.mjs`); the widget's own label is hidden there, the title is the name.
* **Not selected, so not built:** A5 to A7, B4 and B5, C5 to C9, D2 to D12, E2 to E9, F2 to F8, G5 to G14, H.

**Where we are** (control-nodes work, steps 1–8, see `HANDOFF-control-nodes.md` and `ARCHITECTURE.md`): controls, XY pad and
switch; parameter sockets on every numeric parameter; a global stage; math nodes (arithmetic, shaping, MIDI, unit conversions,
sample & hold, smooth, quantize, map range, mix); a property editor, quick-add, node pictures; a panel built from control nodes;
module controls; controls in note graphs. Sound nodes: oscillator (sine, saw, square, triangle; detune; pitch input), LFO
(sine, triangle, saw, square, random), ADSR, filter (low, high, band pass), delay with feedback, reverb, stereo reverb,
ping-pong, width, pan, gain, mono sum, sampler (one-shot, hold, loop). Note nodes: arpeggiator, chord, echo, scale lock,
transpose, velocity, range split, clip and track notes.

## Facts the lists rest on

* **All DSP runs in our own AudioWorklet** (`src/audio/worklet/engine-processor.ts`), in blocks of 128 frames
  (`MAX_BLOCK_FRAMES`). We do not use the browser's built-in nodes (`BiquadFilterNode`, `ConvolverNode`, ...) for the sound. So
  "can it be done in Web Audio" really means "can it be done in plain JavaScript (or WASM) inside a worklet": almost
  anything can; see section H.
* **Nodes see whole sample buffers.** The sampler reads `samples.get(id)` from the context, so a granular node can read any
  position of a loaded sample.
* **No FFT exists in the code yet.** Everything spectral needs one new pure-core utility first (see H1).
* **The Switch already is a toggle button.** It outputs 0 or 1 and has a `mode` of `toggle` or `momentary`. What it lacks:
  configurable on/off values and a one-block pulse mode. So A2 and A3 below *extend the Switch*, they are not new nodes.
* **Stages.** Controls and math on them run once per block in the `global` stage, before voices. An analysis node reads
  audio, so it lives in the voice or shared stage and can feed nodes in its own or a later stage, not a global one.
* **Note graphs** get control and math nodes with constants baked in (`engineNoteGraph`). Live audio-derived values cannot
  reach the note graph without a new engine-to-scheduler path.
* **Determinism matters here.** WAV export and tests need the same sound every time, so every random or noise source takes
  a seed.

---

## A. Controls that live inside the node

The card shows the real, working widget for control, XY pad and switch nodes (today they show a small picture, and the
widget lives in the panel and the property editor). Both views edit the same node, so they stay in sync for free.

| ID | What | ★ | Cost |
| --- | --- | --- | --- |
| A1 ✓ | The real widget inside the card (knob, fader, XY pad, switch), sized by the node's panel size. Needs a drag guard so turning a knob does not move the node, and care under canvas zoom. | ★★★ | M |
| A2 ✓ | **Extend the Switch:** an `off` value and an `on` value, both parameters with sockets (so "set via props or other inputs" works), instead of a fixed 0 and 1. | ★★★ | S |
| A3 ✓ | **Push-button modes on the Switch:** momentary (exists), *trigger* (a one-block pulse on press), *latch*. A trigger fires samplers and envelopes. | ★★★ | S |
| A4 ✓ | Selector / radio with N positions that outputs the index. | ★★ | S |
| A5 | On-screen keys and drum pads that emit notes or gates, so patches can be played without a MIDI keyboard (needs a way for a control node to feed the note path). | ★★ | M |
| A6 | Step sequencer row (8 to 32 values) driven by a clock (C12). | ★★ | M |
| A7 | Number box: type a value, scroll to nudge. | ★ | S |

## B. Indicators (control in, nothing out)

| ID | What | ★ | Cost |
| --- | --- | --- | --- |
| B0 ✓ | **Engine to UI readout path** for arbitrary values. Level meters work because the engine already reports peaks; a node's picture is computed on the main thread from one frame and cannot update live. Everything below needs this. | ★★★ | M |
| B1 ✓ | LED: on/off at a threshold, brightness proportional to the value, or colour by range. | ★★★ | S |
| B2 ✓ | Number display: int or float, decimals, unit, note name for MIDI values. | ★★★ | S |
| B3 ✓ | Bar / level meter. | ★★ | M |
| B4 | Mini scope tracing a control's recent history; gate and clock lamp. | ★★ | M |
| B5 | Audio scope and spectrum as a node picture or panel widget. | ★★ | L |

## C. Analysis and control utilities (audio in, control out)

| ID | What | ★ | Cost |
| --- | --- | --- | --- |
| C1 ✓ | **Envelope follower** (peak or RMS, attack and release). Auto-wah, ducking, level to LED. | ★★★ | S |
| C2 ✓ | **Level in dB** (measured, not converted). | ★★★ | S |
| C3 ✓ | **Pitch detector** (Hz and confidence; autocorrelation or YIN). With the existing "Hz to MIDI", a pitch-follower synth. | ★★★ | M |
| C4 ✓ | **Threshold / Schmitt trigger:** control to gate, with hysteresis. | ★★★ | S |
| C5 | Onset / transient detector that pulses on hits (triggers samplers from audio). | ★★ | M |
| C6 | Zero-crossing rate (a cheap noisiness measure). | ★★ | S |
| C7 | Spectral centroid (brightness) and band energies (low, mid, high). Needs H1 for the accurate version; a filter-bank version is cheap. | ★★ | M |
| C8 | Peak hold, clip detector, stereo correlation and balance. | ★ | S |
| C9 | Spectral flux; loudness (LUFS-style). | ★ | M |
| C10 ✓ | Random control (seeded; re-roll button). See also G-noise below. | ★★ | S |
| C11 ✓ | Edge detect, flip-flop, counter. | ★★ | S |
| C12 ✓ | Control clock and divider (tempo-synced). | ★★ | S |
| C13 ✓ | Control delay. | ★ | S |

## D. Synthesis building blocks

| ID | What | ★ | Cost |
| --- | --- | --- | --- |
| D1 ✓ | **Noise:** see section G. | ★★★ | S |
| D2 | Distortion / waveshaper, bit-crusher, sample-rate reducer. Part of this may build from the math nodes (`quantize`, shaping) `?`. | ★★★ | M |
| D3 | More filter types: notch, peak, low and high shelf, all-pass; a steeper (24 dB) slope; comb filter. | ★★★ | M |
| D4 | Phase-modulation input on the oscillator, plus hard sync. FM through today's Pitch input (semitones) probably works but is not linear phase FM `?`. | ★★ | M |
| D5 | Pulse width (PWM); a wavetable or additive oscillator. | ★★ | M |
| D6 | Compressor / limiter with sidechain; gate. | ★★ | M |
| D7 | Chorus, flanger, phaser. Delay time now has a socket, so a modulated delay line may already build a chorus or flanger from parts `?`. | ★★ | M |
| D8 | EQ (parametric). | ★★ | M |
| D9 | Karplus-Strong plucked string as one node (audio feedback loops between nodes are probably refused, so it must be self-contained) `?`. | ★ | M |
| D10 | Envelope variants: AD, AR, looping, multi-stage. | ★ | S |
| D11 | Check oscillator aliasing (is the saw and square band-limited?) `?`. | ★ | S |
| D12 | Unison / supersaw as one node (many voices, one set of controls). | ★★ | M |

## E. Example modules (built from existing parts)

Modules are shareable definitions with exposed controls, so these double as a library. A built-in "Insert example module"
entry in the quick-add picker would surface them (E8).

| ID | What | ★ | Notes |
| --- | --- | --- | --- |
| E1 ✓ | **Overtone oscillator:** N oscillators at note frequency x ratio, each with a level, mixed. Variants: harmonic series, odd-only, 9-drawbar organ. | ★★★ | Buildable now. |
| E2 | **FM pair:** carrier and modulator with ratio and index knobs. | ★★★ | Best after D4. |
| E3 | Supersaw / unison from detuned saws. | ★★ | Buildable now; D12 makes it one node. |
| E4 | Subtractive mono synth (osc and sub, filter envelope, amp envelope) as a starter template. | ★★ | Buildable now. |
| E5 | **Drum machine:** 8 samplers, each gated when the incoming MIDI note equals its pad (Hz to MIDI, compare, multiply, gate), with per-pad level, pan and tune knobs exposed. | ★★★ | Routing not verified `?`; may want a "drum pad" helper module. |
| E6 | Auto-wah and ducking (follower into filter cutoff or gain). | ★★ | Needs C1. |
| E7 | Tremolo, vibrato, wobble bass (LFO into gain, pitch, cutoff). | ★ | Buildable now. |
| E8 | Example-module library in the quick-add picker. | ★★ | S |
| E9 | Granular pad, glitch kit, spectral effects as modules over G and H nodes. | ★★ | After G, H. |

## F. Workflow and platform

| ID | What | ★ | Cost |
| --- | --- | --- | --- |
| F1 ✓ | **Randomize / mutate**, jsfxr-style: re-roll parameters within their ranges, with a seed and a lock per control. | ★★★ | M |
| F2 | **Export to WAV** (offline render of the current patch or clip), and batch export of variations. | ★★★ | M |
| F3 | Control presets / snapshots, with morphing between two via an XY pad. | ★★ | M |
| F4 | Web MIDI input: CC into control nodes, MIDI learn on panel controls, MIDI keyboard for notes. | ★★ | M |
| F5 | Automation: record a control's movements. | ★★ | M |
| F6 | Wire colours by kind; a probe that shows a wire's current value. | ★★ | S |
| F7 | Comment and frame nodes; align; duplicate. | ★ | S |
| F8 | Golden-render tests: render patches offline and compare, to catch silent DSP regressions. | ★★ | M |

---

## G. Noise, granular and glitch

### Noise and smooth randomness

All seeded, so renders repeat.

| ID | What | ★ | Cost |
| --- | --- | --- | --- |
| G1 ✓ | **White, pink and brown noise** (audio rate). Hats, wind, snares, most SFX. | ★★★ | S |
| G2 ✓ | **Perlin / value / simplex noise as a control signal:** rate, octaves, persistence (fractal), seed. Smooth, organic wobble for cutoff, pitch, pan. A 2D variant takes a second input (e.g. an XY pad or an LFO) so a point can wander across a noise field. | ★★★ | S |
| G3 | Smooth random (random target values with glides) and stepped random with a clock. Partly covered by the LFO's `random` shape and sample & hold. | ★★ | S |
| G4 ✓ | Crackle / dust / velvet noise (sparse random impulses with density): vinyl, rain, geiger. | ★★ | S |
| G5 | Noise as an audio-rate oscillator: sample-and-hold noise at a pitch (the classic "crunchy noise" voice), and band-limited noise via a filter. | ★ | S |

### Granular

Feasible: the sampler already reads whole buffers in the worklet. Grains are short windowed (Hann or similar) copies
of the buffer played at a chosen speed, many overlapping, scheduled sample-accurately inside the block loop.

| ID | What | ★ | Cost |
| --- | --- | --- | --- |
| G6 | **Granular sampler:** position, density, grain size, pitch (with random spread), position jitter ("spray"), direction (forward, reverse, random), pan spread, window shape. Position takes a control, so a scanning LFO or Perlin noise (G2) gives evolving textures; a note sets the pitch. A grain cap (32 to 64) bounds CPU. | ★★★ | L |
| G7 | **Granular effect:** the same on a rolling record of the node's *input*, with freeze. Needs a capture buffer; runs as a track effect. | ★★ | L |
| G8 | Grain output as a stereo signal with per-grain pan; envelope follower on the grain stream for visual feedback (B0). | ★ | S |

### Glitch candy

| ID | What | ★ | Cost |
| --- | --- | --- | --- |
| G9 | **Stutter / beat repeat:** capture a slice (1/4, 1/8, 1/16 of a beat, tempo-synced) and repeat it while a gate is on. The trigger is a Switch in trigger or momentary mode (A3). | ★★★ | M |
| G10 | **Tape stop / start** (speed ramps to zero or back) and varispeed. | ★★ | M |
| G11 | **Reverse chunks** and random slice shuffle (re-order the last N slices). | ★★ | M |
| G12 | Bit-crusher and sample-rate reducer (D2) with a control for each. | ★★★ | S |
| G13 | Glitch retrigger: sample & hold on the delay time, random pitch jumps, hard-gated chops from a Schmitt trigger (C4). | ★★ | S |
| G14 | Freeze (hold the last grain of the input). | ★★ | M |

---

## H. Spectral processing and "can it be done with Web Audio?"

**Yes.** The project runs its DSP in its own AudioWorklet, so there is nothing to ask the browser for. Spectral effects need
an FFT and an overlap-add framework (a short-time Fourier transform, STFT), both of which we write ourselves in plain
TypeScript, then do the effect on the bins. Constraints to design around:

* **Latency.** An STFT with a 1024 to 2048 frame window adds that much delay (about 23 to 46 ms at 44.1 kHz). Fine for effects
  on a track, awkward for a live-played instrument, and the project has no latency compensation, so each spectral node should
  say how much it delays.
* **CPU.** A 2048-point FFT in JavaScript costs well under a millisecond, and we do two (forward and inverse) per hop, with a
  hop of a quarter window. Comfortable for a handful of instances; per-voice use under a chord would be costly, so spectral
  nodes should be effects (shared stage or track effects), not per-voice.
* **No allocation in `process()`.** FFT tables, windows and frame buffers are preallocated when the node is created.
* **The browser's `AnalyserNode` cannot be used** for resynthesis (analysis only), so it does not replace H1.
* **WASM** (Rust or AssemblyScript) is an option if JS ever proves too slow, at the cost of a build step. Not needed to start.

| ID | What | ★ | Cost |
| --- | --- | --- | --- |
| H1 | **Spectral core:** FFT (power-of-two, real input), windowing, overlap-add STFT harness, preallocated, with unit tests (round trip, known tones). Everything below builds on it, and so do the accurate versions of C7, C9 and B5. | ★★★ | M |
| H2 | **Spectral delay:** each frequency bin (or band of bins) gets its own delay time and feedback, often set by a curve (e.g. low frequencies short, high long, or a random/Perlin pattern). Controls: time curve, feedback curve, tilt, mix. Delay lines are per bin, in the frame domain. | ★★★ | L |
| H3 | **Spectral freeze** and spectral blur / smear (average magnitudes over time): drones and pads from any sound. | ★★★ | M |
| H4 | **Spectral gate / filter:** magnitude threshold per bin, or an arbitrary drawn EQ curve; "robotise" (zero phases) and "whisper" (random phases). | ★★ | M |
| H5 | **Pitch shifter** (phase vocoder) and formant shift. | ★★ | L |
| H6 | **Vocoder:** carrier and modulator, a filter bank or STFT version. | ★★ | L |
| H7 | Spectral morph / cross-synthesis between two inputs. | ★ | L |
| H8 | **Convolution reverb** and impulse responses from loaded samples (FFT-based fast convolution). The browser has `ConvolverNode`, but not in our engine. | ★★ | L |
| H9 | Time stretch (phase vocoder or granular) without pitch change. | ★★ | L |

---

## Suggested first batch

A1 (controls in the cards), A2 and A3 (extend the Switch), B0 with B1 and B2 (live indicators), C1 to C4 (cheap analysis), G1
and G2 (noise, including Perlin), D2 (distortion and bit-crusher), E1 (overtone oscillator), F1 and F2 (randomize and WAV
export). A second round: G6 (granular sampler), G9 (stutter), H1 then H2 and H3 (spectral core, spectral delay, freeze),
E5 (drum machine), D3 to D4.

## Open questions

* Should a control node's card always show its live widget, or only when it is selected or expanded?
* For the drum machine (E5): is a helper "drum pad" module enough, or should the note graph route notes to pads (range split
  into several instrument chains)?
* Is a latency of 20 to 50 ms acceptable for spectral effects, or do we want latency compensation first?
