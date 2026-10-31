# Backlog

Open work only. Each item has an ID so it can be referred to ("V1, E2"). When an item ships, delete it here, and
describe the result in [`architecture/`](architecture/). Ideas that nobody has committed to are in [IDEAS.md](IDEAS.md);
the order of the big pieces is in [STATUS.md](STATUS.md#now-and-next).

Reconciled with the code on 2026-10-31 (`feat/ui-redesign` after round 11c, part 3). This replaces `docs/TASKS.md`.

## UI redesign

Planned round by round. Each round gets a plan in [`active/`](active/) before it starts.

- **U9 Round 11d: the spectrogram and spectral edits** in the wave editor
  ([spec](active/SPEC-wave-editor-handling-and-spectrum.md), signed off): the FFT core (idea H1), a spectrum
  pyramid computed in a worker, time-and-frequency selection, band gain and keep band. In two parts: part 1, the
  spectral core and a read-only spectrogram, is planned
  ([plan](active/PLAN-round-11d-1-spectrogram.md), signed off, not started); part 2, band selection and the band edits, is planned after it.
- **U2 Round 12: arrangement editor**: track headers beside the lanes, automation lanes on the timeline (groups are
  control owners but not automation owners yet), recording into the arrangement (touch recording on the timeline).
- **U3 Round 13: visual refresh and themes**: design tokens, no hard-coded colours, light and high-contrast themes.
- **U4 Drops not done in round 6**: regions dragged out of the arrangement, drops that create tracks, OS files outside
  Samples, library samples, several things at once.
- **U5 Track copy and paste between projects, and *Duplicate group*** (rounds 5 and 7 left it). It needs modules and
  samples to come along, as the Library does.
- **U6 Grouping several tracks at once**: needs a track multi-selection first.
- **U7 Track audio from a bus** (sidechain from a drum bus): the picker, repair and cleanup remain.
- **U8 Preview a wave-editor process before applying it** (a `sample/previewData` command).
- **U10 A crossfaded sampler loop and a loop finder**: round 11c part 2 plays a sample's loop with a plain wrap; snap
  to zero crossings is how to set clean points until then.

## Verification debt

Things that shipped without the check their plan asked for.

- **V1 Press every default key by hand** in Chrome, Firefox and Safari on macOS, with the focus on the background, a
  button, the project name field and a graph canvas. The table to fill in is in
  [round 10's notes](archive/ui-redesign/PLAN-round-10-commands-and-keys.md#changes-made-while-implementing). Change any
  default a browser keeps.
- **V2 Firefox and Safari passes for the redesign**: container queries and sticky scrolling (round 4), Shift+F10
  (round 5), float WAV copies and stereo MP3 (rounds 11a and 11b).
- **V3 Make V1 and V2 possible**: install Firefox, and download the Playwright Firefox and WebKit builds that match the
  installed Playwright version.
- **V4 Listening passes for 11a, 11b and 11c-2**: an old project with a stereo file; reverse used by a clip, a region
  and a sampler; a delete before a looped clip's trim; cut and paste with 0 and 100 ms crossfades; a 120 s stereo file
  opened in the UI; a sampler in loop mode with a loop set on zero crossings and one not.
- **V5 Physical MIDI**: a keyboard and a controller, for permission, routing, sustain, disconnect and timing. Simulated
  ports and real-worklet tests exist.
- **V6 Flaky smoke test**: `library.smoke.spec.ts`, the isolated preview case, reads the saved project right after
  loading the Starter, sometimes before the autosave has written it (2 failures in 5 runs on its own, round 8).
- **V7 Load-sensitive audio test**: `tempo.audio.spec.ts`'s ping-pong case fails its tail-level check when the machine
  is busy, because it times tempo edits from the page.
- **V8 Commit the measuring scripts** that rounds 4 and 11b used (`measure.cjs`, the in-place flow timing). Only
  `scripts/profile-status.cjs`, `scripts/measure-selection-levels.cjs` (round 11c-1) and
  `scripts/measure-revert-and-zero.cjs` (round 11c-2) and `scripts/measure-second-pane.cjs` (round 11c-3) are in the
  repository.
- **V9 Demo release**: a short human listening pass on `main`, then tag the verified commit.
- **V10 Hand pass for the wave editor's handling** (rounds 11c-1 to 11c-3), in Chrome, and Firefox and Safari once V3
  is done: every view key (M, R, L, `[` `]` among them, and Shift with a bracket on a non-US layout) and the edit keys
  with the focus on the lanes, on the mark lane, on the toolbar and in the project name field; middle-drag with a
  mouse; edge drags, marker, region and loop drags and auto-scroll on a trackpad; Alt held during a drag with snapping
  on; rename in place in the mark lane; the folded mark lane under 300 px; the right-click menu with Shift+F10; with
  two panes, copying from one sample into another, the splitter on a trackpad, which pane the toolbar and keys act on,
  and both panes under 300 px.

## Performance

- **P1 Strict F1/R1 gate**: the first callback (3.265 ms against 2.667 ms) and the +27/+30% no-lane overhead are
  accepted for the demo but unsolved. C6 (prototype-hook measurement) was proposed and not approved. See the
  [F1 status report](archive/2026-10-perf-library/REPORT-fix-F1-implementation-status.md).
- **P2 Suspend DSP on muted and solo-excluded tracks.** Instruments and effects render before the channel strip applies
  audibility. Measure scheduling, voices, inserts and sends separately. Define safe suspension conditions that account
  for audio and note taps, sidechains, audible returns, automation, held notes and release and effect tails. Verify the
  savings, and verify that unmuting brings no stuck notes, clicks or lost tails. Then update the examples' "mute a few
  tracks" advice.
- **P3 Profile idle-track inserts and sends and dense automated note graphs** with reproducible measurements. CPU
  figures in old exploration notes are not a benchmark.
- **P4 Lazy example loading**, measured against the current chunk graph.

## Storage

- **S1 Cleanup of unused imported sample bytes.** Edit-made files are cleaned up already (11b). Imported bytes stay in
  IndexedDB after removal so undo works. Never delete bytes only because an item left the visible library.
- **S2 Ask for persistent storage** (`navigator.storage.persist()`), for example at the first in-place edit. 11b
  deferred it because some browsers ask the user.

## Testing infrastructure

- **T1 Migrate the remaining legacy browser checks** in [browser-checks](browser-checks/README.md) (trim and fades,
  LFO and reverb import, piano-roll editing, menus, module controls, return routing, export), and remove hard-coded
  registry lists.
- **T2 CI audio coverage and deployment concurrency**: assess review findings F23–F25 before changing the workflow.
- **T3 Review leftovers**: F19 concurrent lane ownership, and R5 harness and deployment policy, from the
  [remediation plan](archive/2026-10-perf-library/PLAN-review-remediation.md).

## Effects and audio editing

- **E1 Waveshaper and Crusher**: part 3 of [SPEC-effects-round-2](active/SPEC-effects-round-2.md), ready to build.
- **E2 Granular sampler (G6-lite)**: position, density, grain size, pitch spread and spray over a loaded buffer, edited
  from the wave editor. Nodes already read whole sample buffers.
- **E3 Gate, true brickwall limiter, phaser.** Chorus and flanger need no new nodes (spec, idea D7), so ship them as
  example modules.
- **E4 Mixer meters**: peak hold and numeric readouts; a dB fader law.
- **E5 Stereo plain Reverb** (Stereo reverb and Mono sum cover stereo routing today).
- **E6 Audio clips and regions**: loop points inside a region, loop crossfades, time-stretch, recording.
- **E7 Bounce**: stems and batch export.
- **E8 Wave editor**: slicing a selection to pads (the spectrum view is U9).

## Library and reusable sounds

- **L1 Snapshot XY corners**: four-corner blending needs its own design and acceptance criteria.
- **L2 Module-only library items.**
- **L3 Update or replace a module definition from a file.** Inserted sounds are independent copies; linked updates
  need a scope decision (D3).
- **L4 Module usage in the module list** (the module editor already lists uses).
- **L5 More example modules (idea E8), saving a personal module example, and the drum-machine example (idea E5)** with
  independent sampler pads.

## Controls and panels

- **C1 Per-parameter Randomize locks** (locks apply to a whole node today).
- **C2 A combined instrument and effects panel; free control positioning; controls from deeper nested modules** on the
  outer panel.
- **C3 Common control widgets in the mixer; pan, mute and solo in session track headers.**
- **C4 Live indicator values while editing a module definition; scopes and meters on panels; a session-header panel.**
- **C5 Named-value enum controls** created from enum parameters.
- **C6 MIDI note names on suitable controls; right-click to create an XY control paired with another parameter.**
- **C7 Animated node pictures and audio-rate parameter sockets** (telemetry needed).
- **C8 Open a pinned panel in Panel mode**: the mode lives in `ui`'s `localStorage`, so *Open* can't choose it yet.

## Graph and note workflow

- **G1 Move several selected patch nodes together.** Delete, duplicate, copy and paste of a selection exist.
- **G2 Note effects**: humanize, note length, random pitch, strum; arpeggiator latch; bypass-all.
- **G3 Audition piano-roll notes through the note chain; preview notes from other tracks; a multi-track graph view.**
- **G4 An explicit send-notes-only control.**
- **G5 Feedback cycles in graph routing** behind an explicit delay boundary (cycles are refused today).
- **G6 Launch quantisation other than one bar; triplet grids in the piano roll.**

## Documentation

- **W1 Remove history from `architecture/`.** The split kept the old text word for word. About 40 places still say
  "slice 2a", "round 8", a date or a review finding (most in control-and-automation, midi, library-and-presets and
  samples-and-wave-editor). Rewrite them in the present tense, and move any reasons to [decisions](decisions/README.md).
- **W2 Move the raw measurement logs out of git.** `docs/measurements/` holds about 150 MB in 403 files. Keep the
  READMEs and move the logs, traces and JSON to Git LFS, a release asset or an orphan `evidence` branch. The
  `scripts/review-benchmark/` scripts write there, so update their paths too.

## Decisions needed

Not work yet: each needs a scope decision first.

- **D1 External MIDI clock and output.**
- **D2 MPE.**
- **D3 Linked library updates** (a project copy that follows its library item).
- **D4 When `feat/ui-redesign` merges into `main`**, and whether a v11 build ships to Pages before round 12.
