# Open tasks

Reconciled against the implementation on `codex/performance-and-library`, 2026-10-24.
This file lists remaining work. Shipped behavior belongs in [ARCHITECTURE.md](../ARCHITECTURE.md);
older handoffs and exploration notes retain historical scope, not current delivery status.

## Prototype follow-ups: arrangement and sample editor (2026-10-17)

The arrangement timeline, its follow-ups (looping regions, moving a region across tracks, placing from the session
grid, bouncing the arrangement) and the sample editor (stage 1) are shipped; see `ARCHITECTURE.md` for what exists.
Follow-ups, in rough order of value:

1. **Sample editor stage 2 (granular, G6-lite)**: a granular sampler node reading the loaded buffer (position,
   density, grain size, pitch spread, spray), edited with the same controls in the sample editor. Nodes already
   read whole sample buffers, so this is feasible without new engine plumbing.
2. **Arrangement automation lanes** and **recording into the arrangement** (touch recording, slice 3c, could land
   on the timeline too).
3. **Sample editor polish**: destructive in-place editing (a way to replace a sample's bytes), stereo samples, a
   spectrum view (needs the FFT utility first, H1), slicing a selection to pads.

## Current iteration: demo release candidate

The user accepted a bounded demo-release scope on 2026-10-23. The automation curve-prefix regression and
terminal audio failure UX are fixed; deterministic signatures now use project v9 / catalog v2 / bundle v2,
with preserving migration and recovery backups. See the current [demo release record](measurements/demo-release/README.md).

For this experimental demo, the retained 3.265 ms first callback (2.667 ms budget) and one-track no-lane
+27/+30% overhead are accepted limitations. The original strict F1/R1 performance gate remains unmet;
this decision does not turn its recorded failures into passes. C6 and further capacity/optimization campaigns
are deferred. Physical MIDI checks and wider device/browser performance qualification remain deferred.

Unit/build/production-browser verification is complete (1,783 unit checks, 22 smoke checks and 13 real-output audio checks).
All 14 example scenes passed the complete-pattern walkthrough. Do a short human listening/demo pass, then publish the reviewed branch through the existing main deployment workflow and tag the verified commit.
No deployment-policy changes, additional feature work or automatic application rollback are part of this iteration.

The dated review records below retain their original acceptance criteria and historical results; this explicit
release disposition supersedes their indefinite hold for the accepted demo performance limitations only.

## Branch review and merge readiness

The performance/library implementation sequence, slices **0–7**, is complete. Its contracts and verification are in
[SPEC-performance-and-library.md](SPEC-performance-and-library.md) and
[PLAN-performance-and-library.md](PLAN-performance-and-library.md). Completion of the sequence does not close the
findings in [REVIEW-performance-and-library.md](REVIEW-performance-and-library.md), added in commit `8caa072`.

- Independent assessments are complete: [F1](ASSESSMENT-review-critical-F1.md) and
  [F2–F25](ASSESSMENT-review-other-findings.md). The latter includes preserved diagnostic reproductions in
  [docs/tmp](tmp/claims.test.ts), separate from the normal regression suite. These record observed behavior,
  including defects; revisit assertions as fixes land.
- Follow [the remediation plan](PLAN-review-remediation.md): proposed merge blockers are F1/F2/F3 scheduling,
  routing and helper timing, plus F5 signature compatibility/migration. R0–R5 define implementation order,
  focused follow-ups and dispositions for all 25 findings; G1–G3 define measurable acceptance gates.
  The plan is not implementation evidence or approval of deferrals. Preserve note timing, automation,
  live/offline parity and saved data, and keep the original review and assessments intact.
- F1 implementation wrap-up: [status and decision review](REPORT-fix-F1-implementation-status.md), following
  [the execution plan](PLAN-fix-F1.md). TypeScript block audio, actual-rate/sample helpers, storage improvements,
  exact components/constant ranges, startup readiness and compact clock/full-status packets are implemented.
  C1–C5 decisions were explicitly reviewed; C6 prototype-hook measurement remains proposed, not approved.
  All 1,742 unit tests, build/typecheck, 21 smoke and 13 real-output audio checks pass. Two fresh offline pairs pass
  every notes-capacity case. The full production campaign passes all engine gates and both full arrangements but
  retains a 3.265 ms constant-case first callback. One-track no-lane overhead repeats at +27/+30% and needs diagnosis.
  F1/R1 remain open. Work wrapped at the user's request; no further C6 campaign was started.
  The user subsequently authorized local commits; the report lists separate implementation/evidence/experiment groups. Preserve all failures
  and exact-source evidence in [the implementation record](measurements/f1-fix/README.md); no gate relaxation,
  compatibility exception, muted-DSP change or merge authorization follows from these results.
- Re-run checks appropriate to any resulting fixes. Preserve audio tolerances, worklet capture readiness and complete
  finite-window checks. The review did not independently re-run browser tests; the slice 7 delivery did pass all
  17 smoke and 12 real-output checks. Do not treat that earlier pass as verification of future fixes.
- Bounded review remedies are implemented locally: F2 topology/gain separation; F10 snapshot remapping; F11 retained
  unsupported-owner diagnostics; F14 format-neutral indexing/ancestry/identical-sound validation reuse; F16 preview
  operation ownership; F18 conflict isolation; P3 F12/F15/F19 empty-copy/F22. See the plan's bounded execution record
  and [raw validation/measurement evidence](measurements/README.md). These do not close R1/R3 or establish merge readiness.
  Post-R1/R3 integration, callback/deadline baselines and G1/G2/G3 signoff remain open; F19 concurrent lane ownership and
  R5 harness/deployment policy remain reserved. Existing signatures/formats and historical diagnostics are preserved.
- Perform physical MIDI keyboard/controller checks for permission, routing, sustain, disconnect and timing/feel.
  Simulated ports and real-worklet tests have shipped; physical hardware verification remains unperformed.

## Performance, verification and storage follow-ups

- Check and reduce unnecessary DSP work on muted and solo-excluded tracks. Currently instruments and effects render
  before the channel strip applies audibility, so mute is not a DSP suspension mechanism. Measure scheduling,
  active voices, inserts and sends separately; define safe suspension conditions that account for audio/note taps,
  sidechains, audible returns, automation, held-note ownership and release/effect tails. Review any change to mute/unmute
  state continuity before implementation. Verify CPU/call-count savings and correct unmute/resume behavior without
  stuck notes, clicks, lost tails or broken dependent tracks. Keep this separate from the F1 scheduling fix; update
  the examples' "mute a few tracks" performance advice to match the verified behavior.
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

- Add chorus/flanger or other stereo modulation effects, a gate, a true brickwall limiter and a phaser.
  The compressor with sidechain, knee, make-up, dry/wet mix and gain-reduction output is shipped; see [SPEC-effects-round-2.md](SPEC-effects-round-2.md).
- Improve mixer meter peak-hold/numeric readouts and consider stereo support for the plain mono Reverb. Stereo reverb
  and Mono sum already provide the supported stereo-routing alternatives.
- Add audio-region loop points, loop crossfades, bounce stems and batch export as separately
  scoped work. Arrangement editing and bounce are shipped; recording and time-stretch remain follow-ups.
- Choose further nodes from [IDEAS-nodes-and-controls.md](IDEAS-nodes-and-controls.md), checking the current registry
  before scheduling an item. The envelope follower/sidechain building blocks, Comb and tempo-synced delays are shipped.

## Retained proposals

[ROADMAP.md](ROADMAP.md) and [EXPLORATIONS.md](EXPLORATIONS.md) retain platform/WASM, git-backed projects,
collaboration, touch surfaces, visuals and installation-host research. These are proposals, not scheduled follow-on
slices. External MIDI clock/output, MPE and linked library updates also need explicit scope decisions.
