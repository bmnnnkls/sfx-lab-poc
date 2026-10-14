# Roadmap: where we are, where we stand, what next

A one-page wrap-up of the explorations ([`EXPLORATIONS.md`](EXPLORATIONS.md)) against the current state of the project and the
open work ([`TASKS.md`](TASKS.md)). This page holds the decisions and the order; the other two hold the detail.

## Where we are

* **A working browser instrument, about 80 commits old:** a session view (clip launcher, scenes, piano roll, audio clips), a
  patcher with modules, note graphs, track and master effects, returns and sends, a mixer, control nodes with Panels, analysis,
  math and generative nodes, seeded Randomize/Mutate, undo, autosave, import/export, a deterministic WAV export, and two example
  projects (*Low Light*, *Glass Rain*). Deployed to GitHub Pages.
* **Architecture that is better than a POC needs:** layered and enforced by a test (`core` has no browser dependency); the engine
  is a facade behind a small command/status protocol; the project is one immutable document edited by pure functions; rendering
  is sample-accurate and deterministic. About 15k lines in `core`, 8k in UI and state, ~90 unit test files, 35 browser checks.
* **Every exploration found this structure to be the asset:** the engine seam makes a Rust port and remote engines possible; the
  document model makes git and collaboration possible; determinism makes exports, comparison tests and listen-to-diff possible.
* **Open debts** (`TASKS.md`): the browser suite is slow and brittle; audio-rate math reads parameters per sample; delays do not
  follow tempo; no MIDI input yet; no LICENSE file.

## Where we stand on the broader landscape

Neighbours, and what we take from each without competing head on:

| Neighbour | We share | We deliberately do not try to be |
|---|---|---|
| Ableton Live | the session view and clip launching | a full DAW (arrangement, recording, mixing, plugin hosting) |
| Max/MSP, Pure Data | the patcher; Pd patches run as nodes (section 10) | a general-purpose multimedia language |
| Strudel, TidalCycles, Sonic Pi | browser-first, generative, pattern thinking; interoperate over OSC | a live-coding language |
| VCV Rack | modular sound design | a Eurorack emulator |
| TouchDesigner, vvvv | live visuals, rooms and installations (section 7) | a visual-effects suite |
| Suno, Udio, MusicGen | AI as a co-player (small MIDI models, text steering Randomize) | an audio generator |

**The pin:** *a generative sound lab that opens from a link and grows into a room.* A clip launcher and a patcher in one
instrument; seeded, deterministic and reproducible ("the same project always sounds the same", so versions can be compared by ear);
playful Panels that become touch Surfaces for other people; and, later, one engine that runs a browser tab, a desktop app and a
room of screens, lights and phones. For sound designers, creative coders, educators and installation artists, not for producers
finishing records.

What follows from the pin: keep the Pages build as the always-working front door; favour generative and performative features over
production features; treat interoperability (OSC, MIDI, Pd, Link) as reach instead of rebuilding what others do well.

## Decisions to make first

1. **License.** Decides which GPL/AGPL tools (Strudel, SuperSonic's engine, Essentia, aubio) can be bundled; Pd, libpd, Faust's
   output and most Rust crates are permissive.
2. **Go/no-go on the Rust engine**, after a spike with numbers (below), not before.
3. **Audience emphasis** for the next months: solo browser lab first, rooms and collaboration second (recommended), or the reverse.

## Next steps

**Now: in today's TypeScript code, no platform risk.**

1. **Pick the license** and add the file.
2. **Test hygiene** (`TASKS.md`): a fast smoke set and a full browser run; checks read the node registry instead of hard-coded lists.
3. **Per-block parameter reads** in the engine (`TASKS.md`, "audio-rate math is dear"): cheaper heavy patches now, and the shape
   the Rust engine needs anyway.
4. **MIDI input with MIDI learn** (`TASKS.md`, F4): makes Panels playable, and is the first bridge.
5. **Tempo-synced delay times** (`TASKS.md`): small, makes the examples tempo-proof.

**Next: two spikes that decide the platform.**

6. **Rust engine spike** (`EXPLORATIONS.md` sections 3 and 8): one or two expensive nodes in Rust compiled to WASM, called per block
   from the TypeScript engine, with a comparison harness against the TypeScript version. Measure speed, WASM size, and how close the
   output is. This is the go/no-go for the port.
7. **WASM plugin interface with a Pd patch node** (section 10): prototype the interface in today's engine with a libpd WASM build;
   separately check that the same module runs in `wasmtime`. Whatever the Rust decision, the interface survives.

**Then: if the spike says go, the platform milestones** (`EXPLORATIONS.md`, "Suggested order"): engine parity in Pages; views with
their own targets and docking; the document crate with git-friendly projects; the headless node and protocol; Tauri, roles and
Surfaces; bridges (OSC with SuperDirt, Link, MIDI); visuals and outputs; render, GPU and ML jobs. If it says no-go, the same order
works in TypeScript minus the native hosts, with the WASM plugin interface carrying Pd and Faust.

**Any time, as showpieces** (small, independent, good for demos): pattern clips with our own mini-notation; tempo and onset
detection for audio clips; a probe on wires; a full-screen shader output window driven by the engine's beat and notes; MusicVAE
morphing on an XY pad.

**Parked:** biosignal and BCI input (discussed, not pursued for now).
