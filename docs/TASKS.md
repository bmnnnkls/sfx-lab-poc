# Open tasks

Reconciled against the implementation on `codex/performance-and-library`, 2026-10-18.
This file lists remaining work. Shipped behavior belongs in [ARCHITECTURE.md](../ARCHITECTURE.md);
older handoffs and exploration notes retain historical scope, not current delivery status.

## Branch review and merge readiness

The performance/library implementation sequence, slices **0–7**, is complete. Its contracts and verification are in
[SPEC-performance-and-library.md](SPEC-performance-and-library.md) and
[PLAN-performance-and-library.md](PLAN-performance-and-library.md). Completion of the sequence does not close the
findings in [REVIEW-performance-and-library.md](REVIEW-performance-and-library.md), added in commit `8caa072`.

- Independent assessments are complete: [F1](ASSESSMENT-review-critical-F1.md) and
  [F2–F25](ASSESSMENT-review-other-findings.md). The latter includes preserved diagnostic reproductions in
  [docs/tmp](tmp/claims.test.ts), separate from the normal regression suite. These record observed behavior,
  including defects; revisit assertions as fixes land.
- Decide merge conditions and remediation from those assessments. Prioritize F1/F2/F3 audio scheduling and
  helper timing, and F5 deterministic signatures with compatibility/migration handling. Preserve note timing,
  automation, live/offline parity and saved data. Follow the assessments' qualified findings and evidence;
  keep the original review intact rather than treating all of its claims or suggested fixes as accepted.
- Re-run checks appropriate to any resulting fixes. Preserve audio tolerances, worklet capture readiness and complete
  finite-window checks. The review did not independently re-run browser tests; the slice 7 delivery did pass all
  17 smoke and 12 real-output checks. Do not treat that earlier pass as verification of future fixes.
- Perform physical MIDI keyboard/controller checks for permission, routing, sustain, disconnect and timing/feel.
  Simulated ports and real-worklet tests have shipped; physical hardware verification remains unperformed.

## Performance, verification and storage follow-ups

- Profile idle-track insert/send processing and dense automated note graphs using current reproducible measurements.
  Historical CPU figures in exploration notes are not a current benchmark. Preserve release/effect tails when idle.
- Extend portable browser assertions for remaining legacy scenarios: trim/fades, LFO/reverb import, piano-roll editing,
  menus, module controls, return routing and export. Smoke/audio projects are already separate; improve execution time
  and remove brittle hard-coded registry lists where they remain.
- Assess CI audio coverage and deployment concurrency through review F23–F25 before changing the workflow.
- Investigate lazy example loading against the current production chunk graph; old bundle-size figures are historical.
- Design safe unused-sample/blob cleanup. Current conservative retention protects undo, project dependencies and trash;
  do not delete bytes solely because an item was removed from the visible library.

## Snapshots, library and reusable sounds

- **Snapshot XY corners remain deferred.** A/B snapshot capture, recall and morph are implemented; four-corner blending
  needs its own design and acceptance criteria.
- Add standalone module-only library items. Instrument/audio-effect/note-effect dependency closures, presets,
  MIDI/audio clips, samples, virtual folders, recoverable trash, isolated preview and reviewed `.sfxlib` exchange exist.
- Consider library drag/drop and an explicit workflow for updating/replacing a module definition from a file.
  Inserted sounds are independent project copies; automatic linked updates remain outside the completed sequence.
- Expose module usage directly from the module list. The module editor already lists uses and warns that edits
  affect every use.
- Expand example modules (E8), provide a workflow for saving a personal module example, and build the drum-machine
  example (E5) with independent sampler pads, levels, pan and tuning. Per-instance sample bindings already exist.

## Controls, panels and session workflow

- Add **per-parameter Randomize locks**; current locks apply to the entire node.
- Add scene renaming in the session UI. `Project.sceneNames` is already persisted and displayed.
- Add a combined instrument/effects panel, optional free control positioning, and controls from deeper nested modules
  on the outer panel. Controls directly inside a used module already appear there.
- Reuse common control widgets in the Mixer, design a dB fader law, and expose pan/mute/solo in session track headers.
  Mixer pan/mute/solo, master controls and common control gestures are already implemented.
- Add live indicator values while editing a module definition, optional scopes/meters on panels and a session-header
  panel. Existing LED/number/bar indicators already work on track panels and cards.
- Extend enum controls with parameter-aware/named-value choices where useful. The numeric Selector node and
  toggle/momentary/trigger Switch controls already exist; automatic enum-parameter control creation remains separate.
- Show MIDI note names on suitable controls; add right-click creation of an XY control paired with another parameter.
- Consider telemetry for animated node pictures and audio-rate parameter sockets. Current pictures show static values
  (with moving-input indication); existing audio-rate modulation ports remain distinct from parameter sockets.

## Graph and note workflow

- Move multiple selected patch nodes together and add keyboard delete/duplicate for graph selections. Piano-roll
  multi-selection and its keyboard operations already exist.
- Add note effects such as humanize, note length, random pitch and strum; consider arpeggiator latch and bypass-all.
- Audition piano-roll notes through the note chain, preview notes from other tracks, and consider a multi-track graph view.
- Consider an explicit send-notes-only control. Today a track can feed notes onward with its own sound disconnected
  or its volume lowered; audio tracks have no note graph.
- Design an explicit delay boundary before allowing feedback cycles in graph routing; cycles are currently refused.

## Effects and audio editing

- Add chorus/flanger or other stereo modulation effects and a limiter/compressor beyond the existing master soft clip.
- Improve mixer meter peak-hold/numeric readouts and consider stereo support for the plain mono Reverb. Stereo reverb
  and Mono sum already provide the supported stereo-routing alternatives.
- Add audio-region loop points, loop crossfades, bounce stems and batch export as separately
  scoped work. Recording, time-stretch and arrangement editing are outside the completed sequence.
- Choose further nodes from [IDEAS-nodes-and-controls.md](IDEAS-nodes-and-controls.md), checking the current registry
  before scheduling an item. The envelope follower/sidechain building blocks, Comb and tempo-synced delays are shipped.

## Retained proposals

[ROADMAP.md](ROADMAP.md) and [EXPLORATIONS.md](EXPLORATIONS.md) retain platform/WASM, git-backed projects,
collaboration, touch surfaces, visuals and installation-host research. These are proposals, not scheduled follow-on
slices. External MIDI clock/output, MPE and linked library updates also need explicit scope decisions.
