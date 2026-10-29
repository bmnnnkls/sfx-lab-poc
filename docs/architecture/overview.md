# Architecture overview

The layers, what each `core` module owns and how a change travels from the UI to the audio thread. Start here; the other files in this folder describe one subsystem each.

## Layers

```
                 ┌────────┐
                 │  app   │  composition root: builds services, wires stores ⇄ engine ⇄ storage, renders <Workspace/>
                 └───┬────┘
      ┌──────────────┼───────────────┐
      ▼              ▼               ▼
  ┌──────┐      ┌─────────┐    ┌──────────────────────┐
  │  ui  │─────▶│  state  │    │  audio      storage  │   browser integration:
  └──┬───┘      └────┬────┘    │  (worklet)  (saving) │   AudioContext/worklet, localStorage/files
     │               │         └──────────┬───────────┘
     └───────────────┴────────┬───────────┘
                              ▼
                         ┌────────┐
                         │  core  │   pure TypeScript: no DOM, no React, no Web Audio. Runs in Node tests too.
                         └────────┘
```

Dependencies only point down. This is **enforced by `tests/architecture.test.ts`**, which also checks that
other `core` modules are reached only through their `index.ts` and that `core`/`audio` import no third-party
packages (`storage` may use only `fflate`). The test knows our five aliases (`@core`, `@audio`, …) apart from scoped
third-party packages such as `@radix-ui/…`, so those are checked against the same allow-lists. If you need to break a rule, change the rule on purpose, not by accident.

| Layer | Owns | May import |
|---|---|---|
| `core` | the document model, DSP, audio engine, scheduling, file format | itself only |
| `audio` | `AudioContext`, worklet shell, thread protocol, audio-file decoding | `@core` |
| `storage` | `localStorage`/IndexedDB adapters, autosaver, project files & packages, hashing | `@core` (+ `fflate`) |
| `state` | zustand stores, `EngineControls` / `ProjectFiles` interfaces | `@core` |
| `ui` | React components | `@core`, `@state` (+ `react`, `@radix-ui/react-context-menu`) |
| `app` | wiring | everything |

## `core` modules (deep modules, small public surface)

Each folder exposes one `index.ts`; everything else in it is private.

| Module | Responsibility | Public surface |
|---|---|---|
| `shared` | tiny math/id helpers | `clamp`, `midiToFrequency`, `createId` |
| `dsp` | node library: definitions (ports, params, factory) + processors | `nodeDefinitions`, `requireNodeDefinition`, types |
| `patch` | immutable node-graph model + pure edit operations | `Patch`, `addNode`, `connect`, `canConnect`, … |
| `instrument` | compiles a `Patch` into a polyphonic synth (voice pool + shared effects) or a track's insert graph (`FxGraph`) | `Instrument`, `FxGraph`, `classifyStages` |
| `project` | the saveable document: tracks (instrument, audio, return), the master bus, clips, notes, tempo, name; pure note/clip edit operations | `Project`, edit functions, `moveNotes`, `resizeNotesEnd`, `setClipLength`, … |
| `transport` | sample-accurate beat clock | `Transport` |
| `session` | clip launching: a shared quantized `LaunchQueue`, the MIDI `ClipLauncher` (note events) and `AudioClipLauncher` (start/stop events) | `ClipLauncher`, `AudioClipLauncher` |
| `engine` | **the facade**: `apply(command)` + `render(left, right)` + `status()` (also the channel strips: fader, pan, mute/solo, meters), and the offline bounce built on it | `Engine`, `EngineCommand`, `EngineStatus`, `renderProject`, `Bounce` |
| `automation` | clip lane edits, bounds, normalized evaluation and runtime compilation | `AutomationLane`, `setClipAutomation`, `compileAutomation`, … |
| `library` | storage-independent catalog/folders, dependency closure, asset/clip insertion, portable lanes and isolated preview documents | `captureLibraryAsset`, `insertLibraryAsset`, `captureLibraryClip`, `insertLibraryClip`, … |
| `preset` | scoped snapshots, immutable asset revisions, project presets, sample-instance bindings and recall/morph | `captureSnapshot`, `recallSnapshot`, `saveProjectPreset`, `recallProjectPreset`, … |
| `sync` | diffs two `Project`s into `EngineCommand`s | `diffProject` |
| `sample` | sample metadata/data types, engine-side `SampleBank`, mono mixdown, peaks, WAV encoder (mono, stereo, 16-bit or 32-bit float), demo samples | `SampleInfo`, `SampleData`, `SampleBank`, `createDemoSamples`, … |
| `examples` | the shipped example projects (*Low Light*, *Glass Rain*), written as code with a small DSL for patches and scores; what a first visit opens on | `exampleProjects`, `findExampleProject`, `FLAGSHIP_EXAMPLE` |
| `persistence` | project file format: envelope, versioned migrations, sanitizing | `serializeProject`, `parseProject` |
| `history` | generic undo/redo over immutable snapshots | `createHistory`, `commit`, `undo`, `redo` |

### Data flow

```
 UI event ──▶ state (zustand project store, pure edits from core)
                 │ subscribe                                   │ subscribe
                 ▼                                             ▼
          app/project-sync ──diffProject──▶ AudioHost     app/autosave ──(500 ms debounce)──▶ ProjectStorage
                                              │ postMessage                                    (localStorage)
                                              ▼
                             AudioWorklet: Engine.apply(command) / Engine.render(L, R)
                                              │ status @ ~30 Hz
 UI ◀── state (status store) ◀── AudioHost.onStatus ◀┘
```

* **The project is the single source of truth** and lives on the main thread. The engine is a mirror kept
  in sync by commands; it never reads UI state.
* **Position-only and param-only edits are cheap.** `diffProject` ignores canvas positions and turns param
  changes into `track/setParam` so dragging nodes or sliders never rebuilds a voice.
* **Timing is sample-accurate.** The engine splits each 128-frame block at note-event boundaries; events
  come from beat ranges `[from, to)` that are contiguous across blocks, so each fires exactly once.
* **The `Engine` has no browser dependency**, so the same code is unit-tested in Node and renders offline: File > Export audio is
  `renderProject`, the same engine pulled faster than real time (see "Exporting audio").
