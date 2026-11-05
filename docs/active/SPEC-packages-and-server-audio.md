---
status: active
date: 2026-11-05
note: "Proposal for discussion: split the code into workspace packages along today's layers, keep the headless part runnable on a server, run the engine on a server for remote clients, and keep the door open for streaming audio. Nothing signed off; the decisions in § 8 are open."
---

# Packages, an engine on a server, and audio streaming

Three ideas keep coming up: a Tauri desktop app, a server that runs the audio engine for several remote clients, and an
app split into packages (audio, UI components, views, layout) so the boundaries hold and the interfaces stay small. This
spec checks the code for how far it already is from that, proposes the packages and the steps to a server, and says where
a monorepo tool (Nx) fits.

It builds on the [explorations](../archive/EXPLORATIONS-2026-10-14.md) (§ 3 Tauri and a Rust engine, § 4 collaboration,
§ 8 one engine, many hosts) and differs from them in one place: the engine on the server is the TypeScript engine we have,
in Node, before any Rust port (§ 5 below).

The inventory was taken on `feat/library-improvements` on 2026-11-04 and 05 (`953d72d` with the library work in progress,
re-checked at `204821d`). Line counts leave out tests.

## 1. Analysis

### 1.1 Where the test time goes

Measured on 2026-11-04 on the main development machine (12 logical cores); the numbers are in
[baselines](../reference/baselines.md#test-suites).

| Suite | Time | What sets it |
|---|---|---|
| `npm test` (Vitest, 246 files) | 29 s wall, 107 s summed over files | Two files: `core/examples/low-light.test.ts` (28 s) and `glass-rain.test.ts` (24 s), mostly their *cannot be broken by Randomize* tests (14 s and 17 s). Vitest runs files in parallel, not the tests inside one |
| `test:smoke` (229 tests) | about 250 s with one worker | `workers: 1` ran every spec file one after another |
| `tsc` and `vite build` | about 3 s | Not a factor |

**Nx's caching would not make these faster.** `core` holds about 95 % of the unit-test time and was touched by 46 % of
the recent commits that touched `src`. Its modules import each other in loops (§ 1.3), so it can't be split finer
without that work first. Nx reruns the split browser tests (its Atomizer) whenever the app or anything it depends on
changes, which is nearly every commit. `vitest --changed` and watch mode already rerun only the tests a change reaches, by
file, with no restructuring. The quick wins are elsewhere: parallel smoke workers (done: two), and splitting the two
slow example files.

Nx earns its place once there are several apps sharing packages (§ 4).

### 1.2 The engine seam

The engine is already shaped for a server:

* Everything going in is an `EngineCommand` (`core/engine/commands.ts`), plain data "safe to post across threads";
  everything coming out is `EngineStatus`, about 30 times a second, and a clock message.
* The browser side is small: the thread messages (`audio/protocol.ts`, 14 lines), `AudioHost` (139 lines) and
  `app/project-sync.ts` (70 lines), which turns project changes into commands with `diffProject`.
* `core` has no DOM, React or Web Audio (the architecture test enforces it), and the engine runs in Node in the unit
  tests and in the offline bounce, faster than real time.

### 1.3 The import graph

Taken from every non-test import in `src`, grouped by `core` module, `ui` folder and layer.

**`core`.** Ten modules form one loop: `automation`, `control`, `library`, `midi`, `notefx`, `patch`, `persistence`,
`preset`, `project`, `session`. Most edges that close it import types only, and those disappear once the model's types
sit in one package. Three loops call functions across modules:

| Loop | Where |
|---|---|
| `control` ↔ `project`, `preset` | `control/edit.ts` and `control/resolve.ts` call project edit functions and `busGroups`; `control/effective.ts` calls `preset`'s `projectWithSampleBindings`, while `preset` calls into `control` |
| `library` ↔ `persistence` | `library/bundle.ts` uses `canonicalPortableSignature` and `validateLibraryPayloads`; `persistence/signature-migration.ts` uses `LIBRARY_CATALOG_VERSION` and `validateBundleObjectBudget` |
| `engine` ↔ `sync` | `engine/bounce.ts` calls `diffProject`; `sync` imports engine types. One package holds both, so this one dissolves |

Two smaller ones: `notefx` calls `session`'s note-identity helpers (`eventInScope`, `childIdentity`), and `sample` and
`spectrum` import each other (`sample/edits.ts` calls `spectrum`; `spectrum` imports `sample` types). `project/types.ts`
reaches `library`, `preset`, `control` and `midi` for types only.

**`ui`.** `ui/layout` is effectively the list of views: it imports every view. Views import small pieces back from it
(`view-titles`, `view-events`, `group-focus`) and from `ui/commands`; `layout`, `commands` and `file-menu` import each
other. `clip-editor` and `audio-clip-editor` import each other only for `LengthField`.

**`state`.** `state/actions` has 80 imports into the zustand stores, and the stores import the actions back. This knot
only matters for several clients sharing one document (§ 3.2), but there it is most of the work.

### 1.4 Host-specific code

All of it is already outside `core`: `AudioContext` and the worklet in `audio` (and `app/library.ts`), IndexedDB in
`storage` and `app/services.ts`, `localStorage` in `storage`, `state/wave-edit-settings.ts` and several views' stored preferences, Web MIDI in `app/midi-input.ts`, the
spectrum `Worker` in `audio`. The host adapters in § 2 are these folders.

## 2. The packages

```
  apps        web · desktop (Tauri) · server · cli
  client UI   workbench · views · ui-kit · state
  hosts       web-audio · web-storage · tauri-fs · net-link        (swappable; one interface each)
  headless    library · examples
              engine · protocol · persistence
              model
              dsp                                                   (runs in a worklet, in Node, on a server)
```

Dependencies point down. The headless packages are what a server, a CLI or a test needs.

| Package | From today's | Lines | Notes |
|---|---|---|---|
| `dsp` | `core/dsp`, `sample`, `spectrum`, `shared` | ~7.2k | `sample` ↔ `spectrum` stay inside one package |
| `model` | `core/patch`, `notefx`, `project`, `control`, `automation`, `preset`, `midi`, `history` | ~7.1k | The `control`/`preset` loop may stay inside at first: a loop within a package is tolerable, between packages it isn't |
| `persistence` | `core/persistence` | ~1.7k | File format, migrations, sanitizing |
| `library` | `core/library` | ~0.7k | Catalog, bundles |
| `engine` | `core/engine`, `instrument`, `session`, `transport`, `sync` | ~4.4k | `Engine`, `renderProject`, `diffProject` |
| `protocol` | new | small | `EngineCommand` and `EngineStatus` (moved from `engine`), the message envelope, a codec for the wire, the engine-link interface (§ 3.1), the clock |
| `examples` | `core/examples` | ~2.7k | Its 50 s of renders get out of everyone's way |
| `state` | `state` | ~6.5k | Stores and actions |
| `ui-kit` | `ui/shared`, `controls`, `panel` | ~2.7k | Plus `LengthField` and the view contract (`view-titles`, `view-events`, `group-focus`) |
| `views` | the editors and lists (`patcher`, `wave-editor`, `clip-editor`, `arrangement`, `mixer`, `library`, …) | ~12.7k | Depend on `ui-kit` and `state`, never on `workbench` |
| `workbench` | `ui/layout`, `commands`, `file-menu`, `transport-bar`, `history-buttons` | ~3k | The registry of views and the commands |
| `web-audio` | `audio` | ~0.6k | One engine-link implementation |
| `web-storage` | `storage` | ~0.8k | Behind storage interfaces that `state` or `app` define |
| `tauri-fs`, `net-link` | new | — | The desktop's files; the engine link over a WebSocket |
| apps | `app` (~1.7k) becomes `apps/web` | — | Each app is a composition root |

The architecture test's layer rules become package dependencies; its other checks (window-sized files, the status
subscriptions) stay as tests.

## 3. Audio on the server

The audio runs on the server. What moves is where the project document lives.

### 3.1 Stage 1: a remote engine, one client

The client keeps the document and `diffProject` as today; only the transport changes. `protocol` gets an engine-link
interface (send a command, status and clock callbacks, the recording clock) with two implementations: the worklet's
`postMessage` (today's `AudioHost`) and a WebSocket (`net-link`). Three things need real work:

* **Samples.** `sample/add` carries the whole float data. Over a network, a sample goes up once, keyed by its content
  hash (`storage/hash.ts` already hashes), and commands refer to it by id.
* **Clocks.** Touch-automation recording reads the audio thread's clock (`audio/recording-clock.ts`). Across a network
  that needs a ping-based offset between client and server.
* **Live notes** played on the client arrive a network trip late. On a LAN that's fine; quantized launches hide it
  anyway.

### 3.2 Stage 2: the server owns the document, several clients

The project store moves to the server: clients send edits and receive changes, and keep only what is theirs (selection,
view, layout, the wave editor's view). This is the master-authoritative model of exploration § 4: no CRDT, last write wins
for parameters, permissions by role and scope. The work is splitting `state/actions` into pure edits, most of which are
already pure functions in `core`, and client-only stores: the 80 imports of § 1.3.

### 3.3 Keeping the door open for streaming

Three seams in the server's engine host:

1. **The render loop doesn't know where the audio goes.** It pulls blocks from the `Engine` and hands them to an
   audio sink: the server's sound card, a stream to clients, or a file. The file sink is what the offline bounce already
   is. A stream sink is then an experiment, not a redesign: PCM over the WebSocket into a client worklet with a jitter
   buffer first, Opus over WebRTC later.
2. **The engine runs in its own worker thread**, so garbage collection in the WebSocket and document code can't cause
   dropouts.
3. **Sample rate and block size are settings** of the host, not assumptions.

### 3.4 Tauri

Exploration § 3 found the system webviews' AudioWorklet support patchy, so Tauri pays off with an engine outside the
webview. The server app is that engine: Tauri can bundle it as a sidecar binary, and the desktop app is then also the
server that remote clients join.

## 4. Tooling

1. **npm workspaces with TypeScript project references** when the second app becomes real. Project references refuse
   loops between packages at compile time, which is the discipline the split is for.
2. **Nx on top** (`nx init` on the existing workspace) once there are several apps: affected-only test and build runs in
   CI, a cache, and the project graph. Its agent tooling (`nx configure-ai-agents`: an MCP server, skills and agent
   instruction files) helps parallel agent sessions mostly through `nx affected`; its CI insight and self-healing need
   Nx Cloud. The instruction files it writes must be reconciled with [how these docs are kept](../dev/doc-workflow.md).
3. Not checked: Nx's plugins against TypeScript 7, Vite 8 and Vitest 5.

## 5. How this relates to the explorations

* **§ 8's layout is crates** (`crates/engine`, `crates/document`, `crates/protocol`). The packages here are the same
  boundaries in TypeScript. If a Rust engine wins later, `engine` and `dsp` are what it replaces, behind the same
  `protocol`; nothing above them changes. This follows [decision 2](../decisions/README.md#engine-audio-and-formats):
  fix the TypeScript engine rather than move to Rust for capacity.
* **§ 8's rule "send state and time, not media"** stays the default. Streaming is a sink for experiments and
  monitoring, not how clients normally hear the music.
* **§ 4's master-authoritative sync** is stage 2.

## 6. Phasing

Each step ends with a working app.

1. **Untangle the three runtime loops** of § 1.3 and move the model's shared types down. A handful of files, worth it on
   its own.
2. **Extract `protocol` and the engine-link interface** in the single package, with `AudioHost` as the first
   implementation.
3. **Workspaces for the headless packages** (`dsp`, `model`, `persistence`, `library`, `engine`, `protocol`,
   `examples`); `apps/web` is the rest, unchanged.
4. **A `cli` app** that renders a project to WAV: `renderProject` exists, so it is nearly free, and it proves the headless
   packages run outside the browser.
5. **A server prototype:** `net-link`, the engine in a worker thread, a sound-card sink; then a stream sink as the
   experiment.
6. **Stage 2** (§ 3.2), if several clients are wanted.
7. **The UI packages** (`ui-kit`, `views`, `workbench`) last: discipline, nothing waits on them. Each view package
   gets a harness page that mounts it with the real stores and seeded state, and its own browser specs for its keys,
   pointer handling, rendering and minimum size. The app keeps the flows that cross views (drag and drop between them,
   the library into tracks, save and reload, undo). The smoke groups (`tests/browser/<group>/`) already follow these
   areas, so their specs move with their package.

## 7. Not verified

* Whether Node renders in real time without dropouts. The engine has only run faster than real time in Node.
* Whether any engine code relies on a global a server process lacks (`performance`, `crypto`, timers). The worklet and
  Vitest's Node environment both have them; a bare `worker_thread` was not tried.
* Nx's support for this toolchain (§ 4).

## 8. Decisions

| # | Question | Proposed | Status |
|---|---|---|---|
| P1 | Package boundaries | As in § 2: headless `dsp`, `model`, `persistence`, `library`, `engine`, `protocol`, `examples`; client `state`, `ui-kit`, `views`, `workbench`; host adapters; apps | open |
| P2 | Untangle before splitting? | Yes: the three runtime loops first (§ 6 step 1) | open |
| P3 | Where the document lives with a server engine | Stage 1 on the client; stage 2 on the server, master-authoritative as exploration § 4 | open |
| P4 | The server's engine | The TypeScript engine in Node, in a worker thread; a Rust engine stays possible behind `protocol` | open |
| P5 | How audio leaves the engine | Through a sink interface; streaming is one sink, for experiments and monitoring | open |
| P6 | Samples over the network | Uploaded once, by content hash | open |
| P7 | Monorepo tooling | npm workspaces and TypeScript project references at step 3; Nx once there are several apps, not for test speed | open |
| P8 | The first second app | A `cli` renderer | open |
