# Architecture

## Layers

```
            ┌────────┐
            │  app   │  composition root: creates the AudioHost, wires stores ⇄ engine, renders <Workspace/>
            └───┬────┘
      ┌─────────┼──────────┐
      ▼         ▼          ▼
  ┌──────┐  ┌───────┐  ┌───────┐
  │  ui  │─▶│ state │  │ audio │   browser integration: AudioContext, AudioWorklet, message protocol
  └──┬───┘  └───┬───┘  └───┬───┘
     │          │          │
     └──────────┴────┬─────┘
                     ▼
                ┌────────┐
                │  core  │   pure TypeScript: no DOM, no React, no Web Audio. Runs in Node tests too.
                └────────┘
```

Dependencies only point down. This is **enforced by `tests/architecture.test.ts`**, which also checks that
other `core` modules are reached only through their `index.ts` and that `core`/`audio` import no third-party
packages. If you need to break a rule, change the rule on purpose, not by accident.

| Layer | Owns | May import |
|---|---|---|
| `core` | the document model, DSP, audio engine, scheduling | itself only |
| `audio` | `AudioContext`, worklet shell, thread protocol | `@core` |
| `state` | zustand stores, `EngineControls` interface | `@core` |
| `ui` | React components | `@core`, `@state` |
| `app` | wiring | everything |

## `core` modules (deep modules, small public surface)

Each folder exposes one `index.ts`; everything else in it is private.

| Module | Responsibility | Public surface |
|---|---|---|
| `shared` | tiny math/id helpers | `clamp`, `midiToFrequency`, `createId` |
| `dsp` | node library: definitions (ports, params, factory) + processors | `nodeDefinitions`, `requireNodeDefinition`, types |
| `patch` | immutable node-graph model + pure edit operations | `Patch`, `addNode`, `connect`, `canConnect`, … |
| `instrument` | compiles a `Patch` to a runnable mono voice | `Instrument` |
| `project` | the saveable document: tracks, clips, notes, tempo | `Project`, edit functions, `createDemoProject` |
| `transport` | sample-accurate beat clock | `Transport` |
| `session` | clip launching: quantized start/stop, looping, note events | `ClipLauncher` |
| `engine` | **the facade**: `apply(command)` + `render(left, right)` + `status()` | `Engine`, `EngineCommand`, `EngineStatus` |
| `sync` | diffs two `Project`s into `EngineCommand`s | `diffProject` |

### Data flow

```
 UI event ──▶ state (zustand project store, pure edits from core)
                 │ subscribe
                 ▼
          app/project-sync ──diffProject──▶ AudioHost.send(EngineCommand)
                                                   │ postMessage
                                                   ▼
                                  AudioWorklet: Engine.apply(command)
                                  AudioWorklet: Engine.render(L, R)   (every 128 frames)
                                                   │ status @ ~30 Hz
 UI ◀── state (status store) ◀── AudioHost.onStatus ◀┘
```

* **The project is the single source of truth** and lives on the main thread. The engine is a mirror kept
  in sync by commands; it never reads UI state.
* **Position-only and param-only edits are cheap.** `diffProject` ignores canvas positions and turns param
  changes into `track/setParam` so dragging nodes or sliders never rebuilds a voice.
* **Timing is sample-accurate.** The engine splits each 128-frame block at note-event boundaries; events
  come from beat ranges `[from, to)` that are contiguous across blocks, so each fires exactly once.
* **The `Engine` has no browser dependency**, so the same code is unit-tested in Node, and could render
  offline (bounce/export) without changes.

## Conventions

* Files are `kebab-case.ts`; React components are `PascalCase.tsx` with a `PascalCase.module.css` beside them.
* Processors are `<name>.node.ts` and export one `NodeDefinition`.
* One concept per file; prefer many small files over a large one. Tests sit next to the code (`*.test.ts`).
* Core data is immutable; edits are pure functions returning new values (`patch/edit.ts`, `project/edit.ts`).
* Cross-layer imports use bare aliases (`@core`, `@state`, …), never deep paths (`@core/patch/edit`).
* Commands and status are plain serialisable data so they can cross the worklet boundary.

## Common changes

**Add a DSP node** — create `core/dsp/nodes/<name>.node.ts` exporting a `NodeDefinition`, add it to
`core/dsp/registry.ts`. The patcher palette, parameter UI and engine pick it up automatically.

**Add an engine capability** — add a variant to `EngineCommand`, handle it in `Engine.apply`, and (if it comes
from the document) produce it in `core/sync/diff-project.ts`. If it is a one-off UI action, expose it on
`EngineControls` (`state/engine-controls.tsx`) and implement it in `app/engine-controls.ts`.

**Add a UI feature** — new folder under `ui/`, read state via `@state` hooks, mount it from `Workspace` or
`EditorPanel`.

## Known POC limits (deliberate)

* Instruments are **monophonic** (last-note priority); one clip plays per track.
* Oscillators are naive (alias at high pitches); no band-limiting or oversampling.
* Launch quantisation is fixed at one bar; no recording, audio clips, plugin hosting or undo/redo.
* No persistence: the project resets on reload (`Project` is plain JSON, so saving is straightforward).
* Targets desktop Chromium/Firefox. Safari/iOS quirks are untested.

## Natural next steps

1. Polyphony (voice pool per instrument), 2. save/load + undo/redo on the project store,
3. sample/audio clips (decode on main thread, stream via `SharedArrayBuffer`),
4. offline bounce using `Engine` directly, 5. MIDI input via Web MIDI, 6. WASM DSP nodes (Faust/RNBO).
