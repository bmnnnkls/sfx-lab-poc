---
status: proposed
date: 2026-11-06
deciders: project owner
supersedes: "decision 6, the clause 'instruments stay mono'"
---
# ADR-0006: Channels: N channels with a layout; instruments mono or stereo

## Context

* Today a signal is either mono or stereo:
  * "Instruments are mono; stereo starts in the insert graph" ([mixing-and-routing](../../architecture/mixing-and-routing.md));
  * `Instrument.render` returns one mono buffer, and the voice→shared boundaries are mono;
  * a stereo node is two mono copies (`stereoCapable`, `PatchNode.stereo`);
  * *Pan*, *Width*, *Stereo reverb* and *Ping-pong* are `insertOnly`.
* The flagship needs **stereo inside the voice**: unison spread, per-voice pan, stereo oscillators, per-voice stereo
  effects ([flagship report §4](../../active/REPORT-flagship-synth.md#4-the-proposal-what-the-flagship-is)).
* The project owner wants to keep the door open for **spatial sound** (quad, 5.1, 7.1.4, ambisonics, binaural) without
  building it now. Research (2026-11-06, summarized below) gives the cheap-now, expensive-later choices:
  * **Buffers should carry N channels and a layout tag, not a stereo flag.** N alone is ambiguous: 4 is quad or
    first-order ambisonics; 6 is 5.1 or not.
  * **Channels and voices must stay separate concepts.** Max MC and VCV reuse one cable for both, and users pay for
    it.
  * **Each node declares how it handles N channels.** It is lifted per channel (Max's MC wrapper, SuperCollider's
    multichannel expansion), or it understands the layout (panners, decoders, downmixers).
  * **Instruments stay mono or stereo in spatial work.** IEM, Envelop for Live, Spat and Atmos objects place sources
    with a panner or encoder on the track; a per-voice position is enough for per-voice placement.
  * **Browsers are the weak link for multichannel output.** It depends on browser, OS and device: Firefox fixed macOS
    channel selection only in 128; Chrome on Windows and Safari are unverified. Offline rendering of any N works.
    Web Audio's built-in panner is mono or stereo in, stereo out, so a worklet panner is needed anyway. Resonance Audio
    was archived in April 2026.
  * **A capped N** (16 covers 7.1.4 = 12 and third-order ambisonics = 16) keeps buffers preallocated.

## Decision

1. **A signal has N channels (1 ≤ N ≤ 16) and a layout.**
   * Layouts:
     * `mono`
     * `stereo`
     * `quad`
     * `5.1`
     * `7.1`
     * `7.1.4`
     * `ambix(order)` (ACN order, SN3D)
     * `discrete(N)`
   * Buffers are planar. N and the layout are fixed when the graph is compiled; a change rebuilds the graph
     (ADR-0010).
   * The port kind `stereo` becomes "a multichannel port"; its layout comes from what is wired.
2. **Nodes declare a channel policy** (`channels`, ADR-0005):
   * `mono` sums or refuses;
   * `lift` runs one state per channel, as stereo works today;
   * `layout` understands the layout and declares what it accepts and produces.

   Reverbs and delays are `lift` by default, with a per-channel decorrelation option. A compressor is `layout`, so
   its detector is linked.
3. **Conversions are visible, never silent.**
   * Mono into an N-channel input is heard in every channel, as mono into stereo is today.
   * Every other change of layout goes through a converter node: *Pan* (mono or stereo to a layout), *Downmix*, and
     later *Encode* and *Decode*.
   * There is **one pan law** (constant power, −3 dB at centre, as now) and **one downmix table** (Web Audio's
     "speakers" rules for mono, stereo, quad and 5.1, extended in the spec for 7.1 and 7.1.4). Both are documented.
     Changing them later would change existing mixes.
4. **Instruments output mono or stereo.**
   * `Output` takes mono or stereo, and the voice→shared boundaries carry what reaches them.
   * *Pan*, *Width*, *Stereo reverb* and *Ping-pong* lose `insertOnly`.
   * A voice's position for later per-voice spatialization is a per-voice value (ADR-0007), not more instrument
     channels.
5. **Layouts at three levels**, all modelled in this PI, but only `mono` and `stereo` selectable until spatial nodes
   exist:
   * **Project `outputLayout`** (default `stereo`) is the master bus's layout and **the device output's channel
     count**. The worklet asks for that many channels (`channelInterpretation: 'discrete'`, `channelCountMode:
     'explicit'`), and falls back to a stereo downmix when `destination.maxChannelCount` is lower; the status says so.
     A monitoring renderer (stereo downmix, later binaural) can sit after the master. The bounce writes the master's
     layout (`WAVE_FORMAT_EXTENSIBLE`; channel mask for speaker layouts, mask 0 for ambisonics with the order
     documented).
   * **Track `layout`** (default `stereo`, as in Reaper's per-track channel count) is the width of the track's insert
     graph, its *Track out* and its channel strip. Returns and group buses have one too.
   * **Where layouts meet** (a track into a bus or the master, a send into a return), the **channel strip's panner is
     the converter**:
     * same layout: pan or balance;
     * mono or stereo into a speaker layout: a surround pan;
     * into ambisonics: an encode;
     * wider into narrower: the documented downmix.

     It is chosen from the two layouts, shown on the strip, and its position is automatable like today's pan.
6. **Mono stays cheap.** A node runs with N channels only when an N-channel signal reaches it, or the user sets it.
7. **Channel order is defined in one place.** The internal order per layout lives in one module; export and the
   device edge map from it.

## Options considered

* **A stereo boolean (the first draft of this ADR).** It is enough for the flagship, but a second contract change
  would be needed for any spatial work.
* **Fully spatial now** (bus formats, encoders, decoders, binaural). There is no current need, and the browsers'
  device support is uncertain.
* **N channels with a layout in the contract, instruments mono or stereo, and the spatial nodes deferred (chosen).**
  The cost now is roughly that of the stereo-only version: the generalization is in types and lifting, not in new
  DSP.

## Consequences

* Breaking (ADR-0002):
  * Old instruments are mono patches and play the same in both channels, as they effectively did through the strip.
  * `PatchNode.stereo` migrates to "run with the channels that reach it".
* The bounce, audio taps, *Track audio* sidechains and the meters already handle stereo after the insert graph. The
  instrument→insert hand-off changes type. The meters will need a per-channel form for N > 2 later.
* Tests:
  * a mono patch renders identically in both channels;
  * a lifted node with N = 4 equals four mono runs;
  * conversions follow the documented pan law and downmix table.
* **Deferred** (each a later ADR when wanted): layouts beyond stereo in the pickers, surround panning and ambisonic
  encoders and decoders on the strip, binaural monitoring (HRTF/SOFA), VBAP, object positions and their automation, and
  multichannel WAV export. The fields, their persistence and validation, and the strip-converter slot exist after the PI.
  A 30-minute browser test page (read `maxChannelCount`, open 6- and 8-channel destinations, an 8-output worklet node,
  an offline render) should come before any of them.

## Related

ADR-0005 (`channels`), ADR-0007 (per-voice position), ADR-0010 (rebuild on a layout change); decision 6.
