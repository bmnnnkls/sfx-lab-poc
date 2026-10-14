# Explorations: GPU sound, MIDI models, a Rust engine, collaboration, version control, layout, visuals and lights

Notes from seven "what if" conversations, kept so the reasoning is not lost. Nothing here is decided or started; unlike
`IDEAS-nodes-and-controls.md` these are directions, not a pick list. Each section ends with the cheapest first step. When one
is taken, record it in `ARCHITECTURE.md` and update the section here.

The constraints all seven keep running into come from the architecture, and they are also what makes each one feasible:

* **The engine is a facade behind a tiny protocol.** The UI only sends `EngineCommand`s and receives `EngineStatus`
  (`core/engine/commands.ts`, `audio/protocol.ts`); `audio/audio-host.ts` (~60 lines) is the only thing that knows a worklet exists.
* **The project is the single source of truth** on the main thread, edited by pure functions, mirrored into the engine by `diffProject`.
* **`core` has no browser dependency** (enforced by `tests/architecture.test.ts`), and **export is deterministic**: the same project
  always gives the same WAV. Any idea that puts nondeterministic or browser-only work inside the render path has to answer for that.
* **The engine renders 128-frame blocks (~2.7 ms) on the audio thread**, which cannot reach the GPU, the network or a Worker synchronously.

---

## 1. GPU (WebGL / WebGPU) for sound

**Why it is awkward.** `AudioWorkletGlobalScope` has no WebGL or WebGPU. GPU work must run on the main thread or a Worker,
and a dispatch plus readback (`mapAsync` / `readPixels`) often takes longer than one block. Live GPU audio therefore needs
50–100 ms of lookahead (fine for drones, pads, self-composing parts; wrong for note-on response or knobs). GPU floats differ
between vendors and drivers, so GPU output in the render path would break deterministic export.

**What fits.**

* **Bake to a sample (recommended first).** The GPU generates a buffer once and it goes into the existing `SampleBank`; the
  engine is unchanged and export stays deterministic because the baked audio is saved in the `.sfxlab` package. Good GPU work:
  * modal synthesis with 5–50k damped sines (bells, glass, plates, gongs; the CPU manages a few hundred live);
  * 2D physical models (FDTD membranes and plates; a 32×32 grid fits one workgroup's shared memory, so one dispatch runs many
    timesteps; drawable drum shapes);
  * granular clouds with 10k+ grains, and FFT-based spectral freeze, blur and morph.
* **A "Sound shader" generator, Shadertoy style.** The user writes `vec2 mainSound(float t)` in GLSL; a WebGL2 fragment shader
  draws samples into a float texture that is read back. Works everywhere, cheap to build, as a bake or a looping source.
* **Live streaming with lookahead (later).** A Worker runs WebGPU compute ahead and feeds the worklet a ring buffer. A
  `SharedArrayBuffer` needs COOP/COEP headers, which GitHub Pages cannot set (`coi-serviceworker` or `postMessage` transfers work
  around it). Export would need a baked copy or a CPU fallback.
* **Visuals** (spectrograms, scopes, plate-mode displays) have no latency problem and belong in `ui`.

WebGPU compute (storage buffers, shared memory) is the better fit; WebGL2 is enough for the sound shader and runs everywhere.

**First step:** a "GPU generator" in the Samples tab with two presets, a modal glass/bell bank and a GLSL sound-shader editor,
each baking to a sample.

---

## 2. Small MIDI models (MIDI "LLMs")

**Prior work.** *Music Transformer* (Magenta, 2018); the *Anticipatory Music Transformer* (Stanford, 2023), trained to infill and
accompany, already run in a browser by MIDInfinite (ISMIR 2024, WebLLM, ~51 notes/s on an M3 with ~2 s of buffer);
*Aria* (EleutherAI, ISMIR 2025, ~1B parameters, superb piano continuation, far too big here); *MMM* (Multi-Track Music Machine,
bar and track infilling, close to our session view). In the browser today: Magenta.js MusicRNN and **MusicVAE** (latent
interpolation, which is literally morphing between two ideas). Tokenizing: MidiTok (REMI's `Bar, Position, Pitch, Velocity,
Duration` suits a bar-based launcher). Data: Lakh MIDI, MAESTRO, GigaMIDI, Aria-MIDI. We found no well-known small multi-track
model that runs live in a browser; that is the gap.

**Size and hardware.** A playground model is 2–20M parameters with a 512–1024-token context, trained on 0.5–2B tokens.
Compute ≈ 6 × parameters × tokens:

| Model | Tokens | Compute | One RTX 4090 / 3090 |
|---|---|---|---|
| 5M | 1B | 3e16 FLOPs | minutes |
| 20M | 2B | 2.4e17 | about an hour |
| 100M | 5B | 3e18 | about a day (≈10 h on a rented A100) |

A free Colab T4 or an M-series Mac handles the small end; fine-tuning on our own clips takes minutes. Data preparation
(deduplication, tokenizer, what a "track" is, transposition) is more work than training. Inference is cheap: a 5M model is
~10 MFLOPs per token, thousands of tokens per second in plain WASM or even TypeScript, ~5 MB of int8 weights. WebGPU
(ONNX Runtime Web, transformers.js) only matters above ~50M.

**How it would fit.**

* A **Model node in the note graph**: notes in (clip, *Track notes*), generated notes out, run in a Worker a bar or two ahead.
  Launches and note events are already bar- and beat-quantized, so bar-level lookahead hides the latency.
* **The controls are the instrument:** temperature and top-p as knobs; **logit masks** as hard constraints (scale lock, range,
  density, reusing the note effects' ideas); **conditioning tokens** (density, register, energy) driven slowly or by a Perlin
  node for evolving pieces; an **XY pad** between two seed contexts or two MusicVAE latents.
* **Drift and collapse** (a model fed its own output loops or wanders): keep human clip notes in the context as an anchor,
  reseed every N bars, schedule temperature, and expose a **memory** knob (how much of its own output it sees).
* For endless streams an RNN or state-space model (GRU, RWKV/Mamba-style) streams more naturally than a sliding transformer
  window; at 5M both work.
* **Determinism:** inference in pure TypeScript in `core` with seeded sampling fits the layer rules and lets export rerun the
  model; very likely identical, but `Math.exp` may differ between JS engines, so test rather than promise. **Print to clip**
  (freeze generated bars into a clip) is the simple alternative and a good feature anyway.
* **Sound textures:** emit parameter tokens (cutoff, drawbars, XY positions) next to notes so the model plays the patch too.
  No public dataset exists; make one by recording the app's own generative machinery (Glass Rain's Perlin, Geiger and dice;
  randomized patches) and training on it.

**First steps, cheapest first:** MusicVAE in a Worker feeding a clip, morphing on an XY pad (no training); a Markov / n-gram
baseline in `core`; a 5M REMI model trained with nanoGPT on Lakh, run in TypeScript inside a Model node; then parameter tokens
and fine-tuning on data recorded from the app.

---

## 3. Tauri and a Rust engine

**The seam exists.** Anything that accepts `EngineCommand`s and produces `EngineStatus` can replace the worklet. The Rust
work is the engine side of `core` (`dsp`, `instrument`, `engine`, `session`, `transport`, `notefx`, `sample`: about 8k lines, 4k
of them the node library). The project model, `diffProject`, persistence, undo and all of the UI stay in TypeScript.

**Pitfall:** Tauri with the current Web Audio engine is *worse* than Chrome. Tauri uses the system webview (WebKitGTK on Linux,
WKWebView on macOS), where AudioWorklet support is patchy. A consistent desktop wrapper alone means Electron; Tauri only pays
off with a native engine.

**Recommended shape: one Rust engine, two hosts.**

```
              Rust engine crate (apply / render / status)
                │                                  │
  WASM inside the AudioWorklet                 native on cpal (CoreAudio / WASAPI / ASIO / JACK)
  = the browser-only mode                      = Tauri: commands over IPC, status as events
```

* **Do not maintain a TypeScript and a Rust engine side by side**; they drift. Compile Rust to WASM for the browser instead.
* **The current TypeScript engine becomes the reference**: render the same project in both and compare within a tolerance.
  The deterministic offline bounce makes this a strong safety net.
* **Port gradually:** expensive nodes first (reverb, filters, FDTD / modal), called per 128-frame block from the TypeScript
  engine as WASM; then the whole engine. The browser gets faster along the way.
* Keep the command types in sync with `ts-rs` or `typeshare`.
* Known snag: the worklet scope has no `fetch` or `TextDecoder`, so the WASM module is compiled on the main thread and passed in.

**What native adds:** low-latency drivers and multichannel interfaces; tracks rendered in parallel (the worklet is one thread);
hosting VST3/CLAP plugins; shipping the engine *as* a CLAP/VST plugin (`nih-plug`); reliable MIDI hardware (Safari has no WebMIDI);
large sample libraries on disk; the model and GPU ideas natively (`candle`, `ort`, `wgpu`). Before that, WASM SIMD and threads
(with cross-origin isolation) raise the browser ceiling a long way.

**Why not all Rust, UI included?** A native Rust UI (egui, iced, Slint, vizia) means rewriting the UI and state (~8k lines
plus ~2.7k of CSS) and the rest of `core` too (project model, `diffProject`, persistence, undo): about 25k lines, against ~8k
for the engine alone. It also loses the React iteration speed and the Playwright browser checks. Its one strong argument is
shipping the whole app as a VST3/CLAP plugin (`nih-plug` with egui or vizia). egui also compiles to WASM, so a browser build
would survive, but text, styling and accessibility are rougher than the web's, and the node graph, piano roll and knobs would
all be hand-drawn. Collaboration (section 4) argues against it: phones joining a jam are browsers anyway, so a web UI would
be needed regardless, and there would be two UIs. **Decision: Rust where it pays (the engine), the web where it is strong
(the UI).** Porting the engine first is right either way; the crate is the same if a plugin build ever wins.

**Cost:** weeks, not days. **First step:** one expensive node in Rust/WASM, compared against its TypeScript version.

---

## 4. Collaboration

**First question: who makes the sound?**

| | **A. One master renders** | **B. Every workstation renders** |
|---|---|---|
| Idea | The master plays the room; clients are remote controls | Everyone holds the project and renders locally |
| Hard part | Remote listeners need an audio stream (WebRTC Opus, ~100–200 ms) | Clock sync so everyone hits bar 1 together (no Ableton Link in browsers; NTP-style offsets) |
| Fits | Jams, workshops, installations, audience phones | Remote co-writing |

**A is what we want first, and much simpler.**

* **Master-authoritative sync, not a CRDT.** Clients send edits; the master checks permissions, applies them in arrival order
  (last write wins for parameters) and broadcasts. CRDTs (Yjs, Automerge) suit peer-to-peer and offline work and handle
  permissions badly.
* **Edits on the wire.** Quickest retrofit: the client runs the existing pure edit, diffs old and new project into JSON patches
  (`tracks/<id>/fx/nodes/<id>/params/cutoff`) and sends those; the master checks each path. Named operations (`setParam`,
  `launchClip`, `editNotes`) are cleaner later and enable per-user undo (today's undo is whole-project snapshots, shared by everyone).
* **Permissions follow the existing structure:** roles (owner, performer, listener) and scopes (transport and scene launch, the
  master bus, per track: notes / instrument / effects, and **per Panel**). "You get the Bass panel" is a phone showing only that
  track's controls; the Panel view is most of the remote UI already.
* **Free properties:** clip launches are quantized to the next bar, which hides network delay; parameter-only edits are already
  cheap in the engine, so concurrent knob drags just need throttling to 30–60 updates/s; samples are identified by hash
  (`storage/hash.ts`), so clients sync references and fetch only what they lack.
* **Networking:** a browser cannot accept incoming connections, so a browser master needs WebRTC data channels plus a small
  signaling service. A small WebSocket relay (Node, Deno or Rust) is simplest. A Tauri master (section 3) could host the
  WebSocket server itself: the native audio box on the LAN, people join from any browser via a QR code.

**First step:** `BroadcastChannel` between windows on one machine: a master window and performer windows limited to one Panel
each. No server, but it exercises edits, permissions and broadcast end to end.

---

## 5. Version control (git-backed projects)

**What already helps.** Projects are JSON (`serializeProject`, optional pretty-print). Every entity (track, node, clip, module,
sample) has a stable ID, so merges can match by ID rather than by position. Every load goes through `parseProject`
(migrate, then sanitize), so checking out an old commit just works and a messy merge result is repaired (a send to a deleted
return, say). Samples are identified by content hash (`storage/hash.ts`), as git stores content. And deterministic rendering
makes the best feature possible: listening to a diff.

**Why committing `project.sfxlab.json` as-is is not enough.** Diffs are noisy: canvas moves rewrite coordinates and slider
drags leave long floats, so musical changes drown in layout. Git's line merge does not understand the structure: two people
editing different tracks still collide in the same arrays, and the result can be invalid JSON or musically wrong. Samples
are binary and grow the repository.

**Making it work well.**

1. **A git-friendly folder layout.** Lists become maps keyed by ID plus an explicit order list; keys sorted, floats rounded;
   canvas positions kept apart. Git's own line merge then mostly succeeds.
   ```
   project.json            name, tempo, scenes, track order
   tracks/<id>/track.json  volume, pan, sends
   tracks/<id>/instrument.json, fx.json, notes-graph.json
   tracks/<id>/clips/<id>.notes   one note per line: "n_x8k 36 0.000 0.500 100"
   modules/<id>.json
   layout.json             canvas positions only, so they do not clutter musical diffs
   samples/<hash>.wav      or Git LFS, or kept outside the repo and referenced by hash
   ```
2. **A merge on the project model.** Three-way merge by ID over tracks, nodes, wires, notes and parameters. A real conflict
   is "you both changed the Bass cutoff", resolved by picking a side, then `sanitizeProject` cleans up. `core` runs in Node, so
   the same code is a small CLI usable as a **git merge driver** (`.gitattributes: *.sfx merge=sfxlab`), and git merges
   projects correctly from the command line too.
3. **Readable diffs.** A diff driver summarizes a change as "Bass: cutoff 800 → 1200, +3 notes in clip 2; new return *Plate*".
4. **Listening to diffs.** Render both versions with `renderProject` and switch between them, or subtract one from the other to
   hear only what changed: `git bisect` for "when did the kick get muddy?". Few DAWs can offer this.

**Where git runs.**

* **The user's own git (simplest).** Chromium's File System Access API lets the app open a folder and read and write the
  layout above; the user commits with their own tools and the app has no git code. Not in Firefox or Safari.
* **Git in the browser:** `isomorphic-git` with IndexedDB storage. Pushing to GitHub needs a CORS proxy (GitHub's git HTTP
  endpoint does not allow browser requests).
* **Straight to GitHub:** the REST API's Git Data endpoints do allow browser requests and can commit a tree with an OAuth or
  fine-grained token, no git client involved.
* **Tauri:** `git2-rs` or the system git.

**In the app, in music words:** versions (commits) on a timeline, takes or variations (branches), compare (switch between two
versions while listening), combine (merge). It can start without git: a local, content-addressed version store in IndexedDB
next to undo and autosave, pushed to a real repository later.

**Link to collaboration:** git is working together at different times, section 4 is working together live. Both need the
same ID-based three-way merge, so building it once serves both.

**First steps, in order:** the folder layout plus "Open folder" (bring your own git); the diff and merge CLI as git drivers; a
Versions panel with listen-to-compare; push and pull from the app (`isomorphic-git` or the GitHub API).

---

## 6. A more modern layout: docking on the desktop, Surfaces on tablets

**What holds it back today.** The layout is fixed: transport bar, session view, a splitter, and one editor panel with six
tabs (`ui/Workspace.tsx`, `ui/editor-panel/EditorPanel.tsx`). More importantly, **every view reads one shared selection**
(`state/selection-store.ts`: one `trackId`, one `clipId`, one `tab`), which is why the Bass patcher cannot sit next to the Lead
patcher, or two piano rolls side by side.

**The enabling change: each view gets its own target**, e.g. `{ kind: 'patcher', track: 'bass', graph: 'fx' }` or
`{ kind: 'pianoRoll', clip: 'c_12' }`. A layout is a tree of these view descriptions, and the shared selection becomes "the
view that follows whatever you click". The same description is what a tablet page and a permission are made of.

**Desktop and master: VS Code-style docking.**

* **Editor groups:** tabs, splits both ways, views dragged between groups. **dockview** (React, no dependencies, layouts as
  JSON, pop-out windows) is the closest fit; FlexLayout and rc-dock are alternatives. Pop-out windows give multiple monitors and
  connect to the multi-window `BroadcastChannel` step of section 4.
* **Preview tabs**, as in VS Code: clicking a track opens its views in an italic preview tab the next click replaces; pin it to
  keep it. This settles "follow the selection" versus "stay on one target" in a way people already know.
* **Activity bar and sidebar:** Samples, Modules, Examples and version history (section 5) as browsers on the left; the existing
  property editor as an inspector on the right.
* **Command palette** (`Ctrl+Shift+P`): quick-add already behaves like one for nodes; extend it to every action.
* **Layout presets** ("Session", "Sound design", "Mix") and a focus mode. Layouts belong to the *user* (stored locally), not the
  project, so opening someone else's song does not rearrange your screen.
* **Keep the Ableton feel where it helps:** the session grid is a strength. Modernize the frame, keep the clip launcher; the
  default layout looks like today's on day one.

**Tablets: "Surfaces", not a small desktop.** Docking does not work on touch.

* A Surface page is a grid of large tiles: a track's **Panel** (exists), a subset of the clip grid, scene buttons, XY pads, a few
  mixer strips; later macros, automation lanes and live controls.
* **The page grants the permissions:** what is on a performer's page is what they may touch, nothing else. The owner builds pages
  on the master and assigns each to a seat ("Bass and drums", "FX throws"); the tablet joins by QR code. This is section 4's
  permission model with a user interface.
* **Surfaces are saved in the project** (they are part of how the piece is performed); desktop layouts are not.
* **Touch design:** multi-touch so two knobs turn at once (current controls assume one pointer); larger targets; no hover or
  right-click (tooltips move to a long press); controls that lock against accidental touches.
* **Useful on its own:** the Surface shell full-screen on the desktop is a performance mode, no network needed.

**One concept throughout:** views with their own targets make docking possible; docking produces saved view descriptions; a
Surface is a page of them; a permission is the set of targets a page allows; a future macro or automation tile is one more
kind of view.

**First steps, in order:** give every view its own target (a medium refactor); dockview with a default layout that looks like
today's, plus presets; command palette and preview tabs; the Surface editor and touch shell as a single-device performance mode;
then Surfaces served to tablets through the collaboration master.

---

## 7. Visuals, light and installations

The live, interactive installation use case: screens, shaders, projectors, lighting, audience input. The idea is to treat
visuals and lights as **graphs updated once per video frame**, alongside the audio graphs that run at audio rate, and to reuse
the patcher, control nodes, analysis nodes, Surfaces and the collaboration master.

**Prior art.** Max/Jitter and vvvv (gamma) for patching video next to sound; TouchDesigner and Notch for installations and
shows; in the browser cables.gl (node-based WebGL), Hydra (live-coded video synth), Shadertoy (whose shaders already read audio
as a texture) and Three.js (WebGPU renderer, TSL node materials); for outputs and show control Resolume, MadMapper (projection
mapping) and QLab (cue lists).

**A visual graph: the same patcher, a different update rate.**

* A new graph type, *Visual*, on the same `Patch` model and patcher UI, evaluated per frame on the GPU. Nodes: shader
  (GLSL/WGSL, Shadertoy-compatible `iTime`, `iResolution` plus audio inputs), feedback, blend, blur, displace, particles,
  video/camera in, text, a 3D scene, output.
* **Make update rates explicit.** Patches already have stages (voice, shared, global); add *frame* (60 Hz, GPU) and *fixture*
  (DMX, about 44 Hz).
* **Layering:** the visual graph model and its compilation into a render plan stay pure in `core`; a new `visual` layer, a
  sibling of `audio`, runs it with WebGPU/WebGL in an `OffscreenCanvas` Worker so the UI stays smooth. The architecture test
  gets one new row.

**The connection between sound and image (what makes it feel live).**

* **Sound → visuals:** any node output, sampled each block, readable by the visual graph; spectrum bands and onsets; and
  **exact musical events** from the scheduler (note-ons, clip launches, scene changes, beat and bar position), which are known
  ahead of time and never miss, unlike analysis.
* **Sync:** hold visuals back by the audio output latency (`AudioContext.outputLatency` / `getOutputTimestamp`) and work out the
  beat position per frame. Without it, flashes land 20–80 ms before the kick, and people notice.
* **Visuals and the world → sound:** camera tracking (MediaPipe pose and hands in the browser), optical flow, phone tilt and
  touch, microphones become control signals in the engine. In an installation, the audience is the instrument.

**Outputs: screens, projectors, lights.**

* **Screens and projectors:** pop-out output windows (section 6's docking), placed full-screen on chosen displays with the Window
  Management API (Chromium). An Output node does corner-pin and mesh warping, edge blending across projectors, and masks:
  basic projection mapping.
* **Video to other software** (Spout, Syphon, NDI into Resolume, TouchDesigner, MadMapper) needs native code: another reason for
  the Tauri master (section 3).
* **Lighting:** a fixture library (dimmer, RGB par, moving head pan/tilt) maps control signals to DMX channels, with a universe
  view. From the browser directly: Web Serial to an Enttec DMX USB Pro (Chromium), WLED LED strips over WebSocket, lighting desks
  over WebMIDI. Art-Net, sACN and OSC are UDP, which browsers cannot send, so they go through the relay server or Tauri.
* **Several machines, several projectors:** do not stream video between them. Each renders locally from the synced project and
  the master's beat clock (option B of section 4, for visuals only).

**Show control: scenes become cues.**

* A scene already launches a set of clips; let it also recall visual presets and lighting states, so it is a show cue. A cue list
  or timeline can come later.
* **Surfaces carry over:** a VJ seat, a lighting seat, audience phones with one control each. A *crowd* node combines many
  inputs (average, spread, number of people present).
* **Installations need:** kiosk mode, start on boot, a watchdog, days of running without leaking memory, recovery after a power
  cut (autosave exists). This is where a headless native master matters.

**Exporting video.** Audio export is deterministic and visuals are driven by engine data, so the app can render frames at a
fixed timestep from the offline bounce, encode with WebCodecs and mux to MP4 or WebM: a music video that comes out the same every
time. It reuses the GPU work of section 1.

**How it fits:** the same patcher and `Patch` model, a new update rate, a new output layer, the same Surfaces, permissions and
master. The sound engine stays the source of truth for time; everything else follows its clock.

**First steps, in order:** a full-screen output window with one Shader node fed level, spectrum, beat position and note events,
with latency compensation (small, immediately fun); the visual graph in the patcher; projection warping, then DMX (Web Serial,
WLED); scenes as cues; video export; native outputs (NDI, Spout/Syphon, Art-Net) through Tauri.

---

## Suggested order across all seven

1. Port one or two expensive nodes to Rust/WASM (faster browser, de-risks section 3).
2. GPU bake to sample: modal bank and sound shader (section 1).
3. MusicVAE / n-gram, then a small trained model as a note-graph node (section 2).
4. Views with their own targets, then docking, presets and the command palette (section 6).
5. The git-friendly folder layout with "Open folder", then the ID-based merge as a git driver (section 5).
6. Surfaces as a single-device performance mode (section 6).
7. A full-screen output window with a Shader node driven by the engine's level, spectrum, beat and note events, then the visual
   graph (section 7).
8. Multi-window collaboration over `BroadcastChannel`, then a WebSocket relay serving Surfaces to tablets with their
   permissions (sections 4 and 6), reusing the merge.
9. Projection warping, DMX over Web Serial and WLED, scenes as cues, video export (section 7).
10. A Tauri master with the native engine, the collaboration server and native outputs (NDI, Spout/Syphon, Art-Net) built in.

Steps 1–9 each improve the browser version on their own, so step 10 stays optional.

## References

* MIDInfinite, Anticipatory Music Transformer in the browser: <https://arxiv.org/abs/2411.09625>
* Aria (EleutherAI): <https://arxiv.org/abs/2506.23869>, <https://github.com/EleutherAI/aria>
* MidiTok: <https://github.com/Natooz/MidiTok>
* Magenta.js (MusicRNN, MusicVAE): <https://github.com/magenta/magenta-js>
* isomorphic-git: <https://isomorphic-git.org/>
* dockview: <https://dockview.dev/>
* cables.gl: <https://cables.gl/>, Hydra: <https://hydra.ojack.xyz/>, vvvv: <https://visualprogramming.net/>
* MediaPipe (pose, hands): <https://ai.google.dev/edge/mediapipe/solutions/guide>
* WLED JSON API: <https://kno.wled.ge/interfaces/json-api/>
