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
other `core` modules are reached only through their `index.ts` and that `core`/`audio` import no third-party
packages (`storage` may use only `fflate`). If you need to break a rule, change the rule on purpose, not by accident.

| Layer | Owns | May import |
|---|---|---|
| `core` | the document model, DSP, audio engine, scheduling, file format | itself only |
| `audio` | `AudioContext`, worklet shell, thread protocol, audio-file decoding | `@core` |
| `storage` | `localStorage`/IndexedDB adapters, autosaver, project files & packages, hashing | `@core` (+ `fflate`) |
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
| `project` | the saveable document: tracks, clips, notes, tempo, name; pure note/clip edit operations | `Project`, edit functions, `moveNotes`, `resizeNotesEnd`, `setClipLength`, … |
| `transport` | sample-accurate beat clock | `Transport` |
| `session` | clip launching: quantized start/stop, looping, note events | `ClipLauncher` |
| `engine` | **the facade**: `apply(command)` + `render(left, right)` + `status()` | `Engine`, `EngineCommand`, `EngineStatus` |
| `sync` | diffs two `Project`s into `EngineCommand`s | `diffProject` |
| `sample` | sample metadata/data types, engine-side `SampleBank`, mono mixdown, peaks, WAV encoder, demo samples | `SampleInfo`, `SampleData`, `SampleBank`, `createDemoSamples`, … |
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

## Editing clips (piano roll)

* **Gestures are pure functions of the pointer.** `ui/clip-editor/note-gestures.ts` describes draw / move /
  resize-start / resize-end as `applyGesture(gesture, pointer, grid) -> notes`, computed from the notes *as they
  were when the drag began*, so results never drift and are unit-tested without a DOM. The note arithmetic itself
  (`moveNotes`, `resizeNotesEnd`, `trimNotesToLength`, …) lives in `core/project/note-edit.ts`.
* **One surface, one hook.** `PianoRoll` is a single pointer-driven element (grid lines are CSS gradients, not
  thousands of cells). `use-piano-roll-interaction.ts` owns the mouse and keyboard behaviour: click-drag on empty
  space draws a note as long as the drag; drag a note to move; drag its end handles to resize; Shift-click
  multi-selects and groups move/resize together (a group is stopped at the clip edges, never squashed);
  double-click or right-click deletes; Delete, arrows (Shift = octave), Ctrl+A, Ctrl+D, Esc work on the selection.
* **A gesture is one undo step.** While dragging, edits live in a local `draft` that is shown on screen and
  committed once on release. That keeps undo per-gesture and avoids sending a clip update to the engine on every
  mouse move. A double-click only deletes when the second click doesn't turn into a drag.
* **Notes have stable ids** (`Note.id`) so selection survives edits and undo, and so the clip launcher can tell
  which notes are sounding. Files from before this get fresh ids on load.
* **Clip length** is in beats (1–256), shown with bars. Lengthening keeps notes; shortening trims notes that no
  longer fit (undo restores them); **Double** doubles the length and repeats the notes into the new half. The length
  field applies on Enter/blur, never per keystroke, because typing "16" would otherwise pass through "1" and trim.
  Long clips get horizontal zoom (slider or Ctrl+wheel), a bar ruler and a sticky keyboard.
* **Editing a playing clip never leaves a note stuck.** The launcher remembers which notes it has started. When
  `syncClips` swaps in edited clip data it releases any sounding note that was deleted, moved, re-pitched or cut
  short, and lets one that merely got longer ring to its new end. Without this, deleting a held note would
  leave its voice sounding forever (its note-off is never generated).
* No-op edits return the same project object (`updateTrack`/`updateClip`), so they don't create empty undo steps.
* **Velocity lane** (`VelocityLane.tsx`, pure picking logic in `velocity-lane-logic.ts`): one bar per note under the
  roll. Press a bar and drag; if the note is selected the whole selection follows. Chords put several bars at one x,
  so the bar whose top is nearest the pointer wins. Same draft-then-commit pattern as the roll (one undo step).
* **Marquee select:** Ctrl/Cmd-drag on empty space draws a box (Shift adds to the selection); plain drag still draws a
  note. `notesInRegion` / `marqueeRegion` are pure.
* **Copy / cut / paste** (Ctrl+C/X/V, Ctrl+D duplicates): the clipboard (`note-clipboard.ts`) is in memory so notes can
  move between clips. Paste lands under the **mouse pointer** (not the last click, since clicking empty space draws a
  note), and repeated pastes with the mouse left alone follow on after each other. Pasted notes get fresh ids and
  anything past the clip end is dropped (`pasteNotes`).
* **Audition:** placing a note, grabbing one, dragging it to a new pitch, or nudging with the arrows plays it through
  the track's own instrument (`track/audition` -> `TrackRuntime.auditionNote`: a 0.3 s note on the track's voice pool,
  so you hear the real patch, even while stopped). Resize handles stay silent. Toggle in the toolbar.
* **Follow playhead** scrolls a long clip along with playback. `Playhead` owns its status subscription so the roll
  itself does not re-render 30x a second; the static parts (keys, ruler, pitch rows, notes) are memoised.
* **Remembered UI preferences:** grid, zoom, audition, follow, lane visibility and the editor panel height are kept in
  `localStorage` via `useStoredState` (guarded, validated, falls back to defaults). The editor panel is resizable with a
  draggable, keyboard-operable splitter (`ui/shared/Splitter.tsx`); its saved height is clamped to the window on use.

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

## Samples

A **sampler node** plays a library sample, re-pitched from the note being played, so samples are playable
instruments that reuse everything else: MIDI clips, polyphony, envelopes, filters, effects.

* **Sampler node** (`dsp/nodes/sampler.node.ts`): inputs `freq` and `gate`; params *Mode* (`one-shot` plays through
  regardless of the gate, `hold` stops when the gate falls, `loop` repeats until it falls), *Root note* (plays at
  original speed), *Start*, *Tune*. It compensates for the sample's own sample rate, interpolates linearly, and
  fades out in 10 ms on release to avoid clicks. Its sample is a node-level reference (`PatchNode.sampleId`, chosen
  with a picker in the node), not a numeric param.
* **Three homes for one sample**, all keyed by the **SHA-256 of the original file** (so importing the same file
  twice is a no-op, and ids can't collide):
  1. **Project** — `Project.samples: SampleInfo[]` (name, duration, …) is the library. Saved, undoable, tiny.
  2. **Storage** — the original bytes in IndexedDB (`storage/sample-storage.ts`), written once at import.
     Autosave only ever writes the small project JSON.
  3. **Engine** — decoded **mono** float data in `SampleBank` (`core/sample`), delivered by a
     `sample/add` command whose buffer is *transferred* to the worklet, not copied.
* **Flow** (`app/sample-library.ts`): import/drop → hash → decode (`audio/decode-audio.ts`, via
  `OfflineAudioContext`, so no user gesture is needed) → store bytes → add to project → send to engine. On startup and
  whenever `project.samples` changes it loads any sample the engine lacks from storage. Removing a sample from
  the project clears the nodes that used it (undo restores both) but keeps the bytes, so undo and re-import work.
* **Missing audio is not fatal.** A sample listed in the project but absent from storage (cleared browser data,
  plain-JSON import on another machine) shows *audio missing*, plays silence, and is restored by importing the
  original file again (same hash).
* **Engine side:** a sampler node looks samples up at process time (`ProcessContext.samples`), so samples that
  arrive after the instrument was built, or are swapped (`track/setSample`), take effect without a rebuild.
  `sample/preview` auditions a sample straight to the master; `EngineStatus.peak` drives the output meter.
* **Project files with samples** (`storage/project-transfer.ts`): a project with no samples exports as plain
  `name.sfxlab.json`. With samples it exports as a zip, `name.sfxlab`: `project.json` (the same envelope as
  always) + `samples/<sha256>.<ext>` holding the **original bytes** (no re-encoding; WAV is deflated, compressed
  formats are stored). Import sniffs the first bytes (`PK` = zip), verifies **each sample against its hash** before
  trusting it, ignores unexpected entries, caps inflated entry size, then runs the usual `parseProject`.
  Missing/corrupt samples become warnings, not failures.
* **Persistence of the new fields:** `samples` and `sampleId` are optional with safe defaults (a reference to a
  sample not in the library is dropped with a warning), so no format-version bump was needed.
* **Add a sample-playing node:** set `usesSample: true` on its definition; the patcher shows the picker and the
  engine calls `setSample` on it.

## Not yet: audio clips

Samples are played by the sampler through MIDI clips. Launching a sample as an *audio clip* in the session grid
(looped and synced to the transport, Ableton-style) is not implemented; it would add a second clip type to the
`ClipLauncher` and a track kind that plays from the `SampleBank` instead of an `Instrument`.

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
* The piano roll assumes 4/4 for the ruler, has no per-note-length velocity ramps, no quantize/humanize, and the
  clipboard is not shared with the OS clipboard.
* Samples are mono (stereo is mixed down), at most 120 s / 32 MB per file, with no trimming or loop-point editing.
  Bytes stay in IndexedDB after a sample is removed from a project (so undo works); there is no cleanup yet.
  `decodeAudioData` resamples to 48 kHz, and the sample's reported rate is that decoded rate.
* Sample hashing needs a secure context (https or localhost).
* A node's stage is decided by its type (`shared`) and wiring; there is no per-node override.
* Oscillators are naive (alias at high pitches); no band-limiting or oversampling.
* Launch quantisation is fixed at one bar; no recording, audio clips or plugin hosting.
* History is per session (not saved) and does not cover selection or transport.
* One autosaved project per browser. Two tabs on the same site overwrite each other (last write wins).
  `localStorage` holds ~5 MB, plenty for projects, not for samples (see above).
* Targets desktop Chromium/Firefox. Safari/iOS quirks are untested.

## Natural next steps

1. Audio clips in the session grid, sample trimming/loop points and unused-sample cleanup, 2. offline bounce using `Engine` directly,
3. MIDI input via Web MIDI (now worth having: playing chords), 4. more nodes (LFO, reverb, band-limited oscillators),
5. WASM DSP nodes (Faust/RNBO).
