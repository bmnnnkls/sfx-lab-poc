# Architecture

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
other `core` modules are reached only through their `index.ts` and that `core`/`audio`/`storage` import no
third-party packages. If you need to break a rule, change the rule on purpose, not by accident.

| Layer | Owns | May import |
|---|---|---|
| `core` | the document model, DSP, audio engine, scheduling, file format | itself only |
| `audio` | `AudioContext`, worklet shell, thread protocol | `@core` |
| `storage` | `localStorage` adapter, autosaver, file download/upload | `@core` |
| `state` | zustand stores, `EngineControls` / `ProjectFiles` interfaces | `@core` |
| `ui` | React components | `@core`, `@state` |
| `app` | wiring | everything |

## `core` modules (deep modules, small public surface)

Each folder exposes one `index.ts`; everything else in it is private.

| Module | Responsibility | Public surface |
|---|---|---|
| `shared` | tiny math/id helpers | `clamp`, `midiToFrequency`, `createId` |
| `dsp` | node library: definitions (ports, params, factory) + processors | `nodeDefinitions`, `requireNodeDefinition`, types |
| `patch` | immutable node-graph model + pure edit operations | `Patch`, `addNode`, `connect`, `canConnect`, … |
| `instrument` | compiles a `Patch` into a polyphonic synth: voice pool + shared effects | `Instrument`, `classifyStages` |
| `project` | the saveable document: tracks, clips, notes, tempo, name | `Project`, edit functions, `createDemoProject` |
| `transport` | sample-accurate beat clock | `Transport` |
| `session` | clip launching: quantized start/stop, looping, note events | `ClipLauncher` |
| `engine` | **the facade**: `apply(command)` + `render(left, right)` + `status()` | `Engine`, `EngineCommand`, `EngineStatus` |
| `sync` | diffs two `Project`s into `EngineCommand`s | `diffProject` |
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
* **The `Engine` has no browser dependency**, so the same code is unit-tested in Node, and could render
  offline (bounce/export) without changes.

## Polyphony

* **Each track has a voice pool** (`Track.voices`, 1–16, default 8; set in the Instrument tab). A chord or
  overlapping notes play on separate voices; when all are busy the new note **steals** a voice: first one that is
  already releasing, otherwise the oldest.
* **A patch is split into two stages** (`instrument/stages.ts`). *Voice* nodes are instantiated once per voice;
  *shared* nodes (effects) are instantiated once and fed the **sum of all voices**. A node is shared if its
  `NodeDefinition.shared` is true (today: delay) **or anything upstream of it is shared**, which makes the split a
  clean cut: signals flow from voices into the shared stage, never back. The patcher tags shared nodes.
  Without this split, a delay would be copied into every voice and its echoes would be chopped off whenever a
  voice is reused.
* **Freeing voices:** `Voice` is done once it has been released and its output stayed below −80 dB for 50 ms
  (this works for any envelope shape), or after a 10 s safety cap (a patch with no envelope never goes quiet).
  Idle voices cost nothing: only active voices are rendered.
* **Files:** `compile.ts` builds one stage; `stages.ts` plans the split; `voice.ts` is one note's state and
  lifetime; `voice-pool.ts` allocates and steals; `instrument.ts` ties them together and sums the output.
* `voices` is saved in the project; older files without it load with the default and no warning (a new
  optional field with a safe default needs no format-version bump).
* Measured on the engine alone (Node, this container): 3 tracks / ~3 voices ≈ 2 % of the real-time budget, 8 tracks ×
  16 voices ≈ 25 %.

## Undo / redo

* `core/history` is a generic, pure `History<T>` (`past` / `present` / `future`). The project store holds a
  `History<Project>`; `project` is always `history.present`. Snapshots are immutable, so unchanged tracks, clips
  and patches are shared between entries and keeping 200 steps is cheap.
* **Every document edit is undoable**, including replacing the whole project (import / new / demo / restore).
  The startup load is not (`resetProject`), so a fresh session starts with an empty history. Selection, transport
  and the playhead are not part of history.
* **Drags are one step.** Continuous edits pass a merge key (`param:<track>:<node>:<param>`, `move:<track>:<node>`,
  `volume:<track>`, `tempo`, `name`); consecutive edits with the same key within 800 ms collapse into a single
  entry. Discrete actions (add node, connect, toggle note, add track…) pass no key, so each is its own step.
  An undo or redo always ends the merge, so the next edit starts a new step.
* **Nothing else needs to know.** Undo/redo just changes `project`, so `diffProject` updates the engine (param
  changes become `setParam`, structural ones rebuild the voice) and autosave stores the undone state. History
  itself is not saved: it is empty after a reload.
* UI: ↶ ↷ buttons in the transport bar and `Ctrl/⌘+Z`, `Ctrl/⌘+Shift+Z`, `Ctrl/⌘+Y` (ignored inside text fields,
  which keep the browser's own undo).
* **To make a new continuous control undoable as one step**, pass a stable merge key to its store action.

## Saving, loading, import/export

* **One format, one gate.** Autosave, export and import all use `core/persistence`. Files are
  `{ "format": "sfx-lab-project", "version": N, "project": … }`. `parseProject(text)` is the *only* way
  untrusted text becomes a `Project`: it checks the envelope, refuses newer versions with a clear message,
  runs `migrations.ts` (`MIGRATIONS[n]` upgrades v*n* → v*n+1*), then **sanitizes** by rebuilding patches through
  the normal edit functions (`addNode`/`connect`). So unknown nodes, bad ports, cycles, out-of-range params and
  oversize inputs are dropped or clamped and reported as warnings, instead of crashing the audio worklet.
  It never throws.
* **To change the saved shape:** bump `CURRENT_VERSION`, add a migration, and commit a new fixture beside
  `persistence/fixtures/v1-minimal.sfxlab.json` — the old fixture must keep loading.
* **Autosave:** `app/autosave.ts` subscribes to the project store; `storage/autosaver.ts` debounces (500 ms)
  and flushes on tab hide / `pagehide`. The header shows Saved / Saving… / Not saved.
* **Startup:** `app/services.ts` loads the saved project *before* the first render. Unreadable data is copied
  to `sfxlab:corrupt` (never silently overwritten) and the demo project is used, with a toast explaining why.
* **Replacing the project** (import / new / demo / restore) goes through one function in `app/project-files.ts`:
  it saves the outgoing project to a **one-slot backup**, stops the transport, resets selection, then swaps.
  *File → Restore previous* swaps back (and the slot then holds what you just left).
* If browser storage is unavailable (private mode), the app keeps working in memory and says so.
* Ids are random (`createId`), so ids from saved projects never collide with new ones.

## Planned: sample packages

Audio samples are large and binary, so they must not live inside the project JSON or `localStorage`.
The format is designed so today's file becomes the `project.json` of a package:

1. **Content-addressed samples.** A sample's id is the SHA-256 of its file bytes. Clips reference it
   (`{ sampleId }`) with only light metadata (name, duration, sample rate). Identical files dedupe for free.
2. **Local store:** IndexedDB `samples` (id → Blob), written once at import time. Autosave keeps writing only the
   small project JSON, so it stays fast.
3. **Export:** a project that uses samples exports as a zip, `name.sfxlab`: `project.json` (the same envelope,
   version bumped when `sampleId` appears) + `samples/<sha256>.<ext>` holding the *original* bytes (no
   re-encoding). Projects without samples keep exporting as plain `.sfxlab.json`. Use `fflate` (~8 kB) for zipping.
4. **Import:** sniff the first bytes (`PK` = zip, `{` = JSON), unzip, verify each sample's hash matches its
   file name, add missing ones to IndexedDB, then run the same `parseProject`. A missing sample becomes a warning
   and a silent placeholder clip, not a failure.
5. **Layering:** `core` owns the `SampleRef` types and parsing rules; `storage/` gains the IndexedDB sample store
   and the zip reader/writer; decoding (`decodeAudioData`) happens on the main thread and the engine receives raw
   channel data via a command with transferable `ArrayBuffer`s.

(Embedding base64 samples in the JSON would work for a handful of tiny SFX but bloats files by a third and
every autosave; not recommended beyond a stopgap.)

## Conventions

* Files are `kebab-case.ts`; React components are `PascalCase.tsx` with a `PascalCase.module.css` beside them.
* Processors are `<name>.node.ts` and export one `NodeDefinition`.
* One concept per file; prefer many small files over a large one. Tests sit next to the code (`*.test.ts`).
* Core data is immutable; edits are pure functions returning new values (`patch/edit.ts`, `project/edit.ts`).
* Cross-layer imports use bare aliases (`@core`, `@state`, …), never deep paths (`@core/patch/edit`).
* Commands and status are plain serialisable data so they can cross the worklet boundary.

## Common changes

**Add a DSP node** — create `core/dsp/nodes/<name>.node.ts` exporting a `NodeDefinition`, add it to
`core/dsp/registry.ts`. Set `shared: true` if it is an effect whose state must outlive individual notes (reverb,
chorus, …). The patcher palette, parameter UI, engine and file loader pick it up automatically.

**Add an engine capability** — add a variant to `EngineCommand`, handle it in `Engine.apply`, and (if it comes
from the document) produce it in `core/sync/diff-project.ts`. If it is a one-off UI action, expose it on
`EngineControls` (`state/engine-controls.tsx`) and implement it in `app/engine-controls.ts`.

**Add a UI feature** — new folder under `ui/`, read state via `@state` hooks, mount it from `Workspace` or
`EditorPanel`.

**Add a field to the project** — add it to `project/types.ts`, give it a safe default in
`persistence/sanitize-*.ts`, and add a migration only if old files would otherwise load wrongly.

## Known POC limits (deliberate)

* One clip plays per track. Polyphony has simple voice stealing and no unison, glide or legato modes.
* A node's stage is decided by its type (`shared`) and wiring; there is no per-node override.
* Oscillators are naive (alias at high pitches); no band-limiting or oversampling.
* Launch quantisation is fixed at one bar; no recording, audio clips or plugin hosting.
* History is per session (not saved) and does not cover selection or transport.
* One autosaved project per browser. Two tabs on the same site overwrite each other (last write wins).
  `localStorage` holds ~5 MB, plenty for projects, not for samples (see above).
* Targets desktop Chromium/Firefox. Safari/iOS quirks are untested.

## Natural next steps

1. Sample clips + package format (above), 2. offline bounce using `Engine` directly,
3. MIDI input via Web MIDI (now worth having: playing chords), 4. more nodes (LFO, reverb, band-limited oscillators),
5. WASM DSP nodes (Faust/RNBO).
