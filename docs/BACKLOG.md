# Backlog

Open work only. Each item has an ID so it can be referred to ("V1, E2"). When an item ships, delete it here, and
describe the result in [`architecture/`](architecture/). Ideas that nobody has committed to are in [IDEAS.md](IDEAS.md);
the order of the big pieces is in [STATUS.md](STATUS.md#now-and-next).

Reconciled with the code on 2026-10-31 (`feat/ui-redesign` after round 11c, part 3). This replaces `docs/TASKS.md`.

## UI redesign

Planned round by round. Each round gets a plan in [`active/`](active/) before it starts.

- **U2 Round 12: arrangement editor**: track headers beside the lanes, automation lanes on the timeline, recording into
  the arrangement (touch recording on the timeline).
  [Spec](active/SPEC-round-12-arrangement-editor.md) signed off 2026-11-01; 12a is done
  ([plan](archive/ui-redesign/PLAN-round-12a-timeline-frame.md)), and so is 12b, markers and the loop
  ([plan](archive/ui-redesign/PLAN-round-12b-markers-and-loop.md)), and 12c, automation on the timeline
  ([plan](archive/ui-redesign/PLAN-round-12c-timeline-automation.md)); 12d (touch into the arrangement) is to plan.
- **U3 Round 13: visual refresh and themes**: design tokens, no hard-coded colours, light and high-contrast themes.
- **U4 Drops not done in round 6**: regions dragged out of the arrangement, drops that create tracks, OS files outside
  Samples and the Library, library samples, several things at once outside the Library (the Library's tree drags
  several items since library phase 7).
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
  (round 5), float WAV copies and stereo MP3 (rounds 11a and 11b), the Library tree's drag and drop and spring-open
  (library phase 1), dragging tracks, groups, clips, samples and presets onto the Library with its refusal reason
  (library phase 2), dragging graphs, clips, samples and presets out of the Library's *This project* (library phase 3), dragging a
  preset row out of Sounds (library phase 4), dragging several library items at once (library phase 7).
- **V3 Make V1 and V2 possible**: install Firefox, and download the Playwright Firefox and WebKit builds that match the
  installed Playwright version.
- **V4 Listening passes for 11a, 11b and 11c-2**: an old project with a stereo file; reverse used by a clip, a region
  and a sampler; a delete before a looped clip's trim; cut and paste with 0 and 100 ms crossfades; a 120 s stereo file
  opened in the UI; a sampler in loop mode with a loop set on zero crossings and one not.
- **V5 Physical MIDI**: a keyboard and a controller, for permission, routing, sustain, disconnect and timing. Simulated
  ports and real-worklet tests exist. Recording too: a real keyboard at 90 and 140 BPM with the metronome, and that the
  latency offset nudges notes as expected (MIDI recording part 1); overdubbing a 2-bar loop at 90 and 140 BPM, and a
  1-bar count-in with a downbeat played slightly early (part 2); recording 8 bars from bar 5 into the Arrangement,
  punching in and out with F9, and a 2-bar loop brace over three passes, at 90 and 140 BPM (part 3).
- **V6 Flaky smoke test**: `library.smoke.spec.ts`, the isolated preview case, reads the saved project right after
  loading the Starter, sometimes before the autosave has written it (2 failures in 5 runs on its own, round 8).
- **V7 Load-sensitive audio test**: `tempo.audio.spec.ts`'s ping-pong case fails its tail-level check when the machine
  is busy, because it times tempo edits from the page. `midi-recording.audio.spec.ts`'s first case failed once the same
  way, late in a run of the whole audio suite (MIDI recording part 3), and passes on its own.
- **V8 Commit the measuring scripts** that rounds 4 and 11b used (`measure.cjs`, the in-place flow timing). Only
  `scripts/profile-status.cjs`, `scripts/measure-selection-levels.cjs` (round 11c-1) and
  `scripts/measure-revert-and-zero.cjs` (round 11c-2), `scripts/measure-second-pane.cjs` (round 11c-3) and
  `scripts/measure-long-timeline.cjs` (round 12a) are in the repository.
- **V9 Demo release**: a short human listening pass on `main`, then tag the verified commit.
- **V10 Hand pass for the wave editor's handling** (rounds 11c-1 to 11c-3), in Chrome, and Firefox and Safari once V3
  is done: every view key (M, R, L, `[` `]` among them, and Shift with a bracket on a non-US layout) and the edit keys
  with the focus on the lanes, on the mark lane, on the toolbar and in the project name field; middle-drag with a
  mouse; edge drags, marker, region and loop drags and auto-scroll on a trackpad; Alt held during a drag with snapping
  on; rename in place in the mark lane; the folded mark lane under 300 px; the right-click menu with Shift+F10; with
  two panes, copying from one sample into another, the splitter on a trackpad, which pane the toolbar and keys act on,
  and both panes under 300 px; the spectrogram (round 11d-1): its colors and frequency scale in both themes, *Split*
  under 300 px, the fill-in on a long file, zooming in and scrolling on a trackpad (the columns on demand); boxes in the
  spectrogram (round 11d-2): drawing and resizing them on a trackpad, their outline in both themes, and listening to
  *Band gain…* and *Keep band* on real material (ringing, the feathers in time and frequency).
- **V11 Hand pass for the arrangement's timeline frame** (round 12a), in Chrome, and Firefox and Safari once V3 is
  done: the sticky headers and ruler on a trackpad scroll in both axes, at the editors' minimum size and under 600 px;
  the header splitter; pinch and ⌘-wheel zoom; middle-drag on a mouse; auto-scroll while dragging a region on a
  trackpad; snapping with Alt; follow pausing on a trackpad scroll; every key in the *Arrangement* rows with the focus
  on the timeline, on a region and in the project name field. Round 12b adds: drags in the mark lane on a trackpad
  (markers, drawing the brace, its body and edges, auto-scroll past the side, Alt), rename in place, a marker's and the
  brace's menu with Shift+F10, the brace dimmed and lit in both themes, and listening to a loop of a few bars with held
  notes and an unwarped audio region across the jump, and to a click in the ruler while playing (notes cut, audio
  rejoining in phase). Round 12c adds: drawing, dragging and box-selecting points on a timeline lane with a trackpad and
  a mouse, at high and low zoom; the lanes and the corner twisty in both themes and at 120 px; *+ Lane*'s picker by
  keyboard; and listening to a bus fader lane and a region's own filter sweep on the timeline.
- **V12 Library listening pass** (library round): each Factory instrument and effect auditioned once (▶ in the
  Library; the tests check only that every instrument is finite, audible and not blown up, before and after a
  Randomize roll), and a copy of Low Light's stab on a new track played beside the original.
- **V13 Library wording and layout review** (library round): the labels, tooltips and reports each phase was unsure
  of, listed with their screens in the [runbook's queue](archive/library-ux/RUNBOOK-library.md#queued-for-the-user-never-blocking): the Library menu's disabled reasons and drop
  refusals, *This project*'s details, Sounds' empty state, kind labels and tooltips, the library link's wording, the
  Factory's root, details, descriptions and clip names, and phase 7's *Cut*, *Copy* (beside *Copy to My library* on
  Factory rows), *Paste here*, "Drop one sound at a time" and the hint. Also: with the *Library* button the transport
  bar wraps below about 1250 px instead of 1175 px; Sounds' header at 280 px ends a long owner name in an ellipsis and
  keeps the morph slider across selections; the empty Library at 280 × 200 puts *Save Bass to library* before the hint;
  the Factory's content choices (*Hook stab* for a Groove stab, *Pluck* without its arpeggiator, two *Hall*s told apart
  by their descriptions).
- **V14 Profile round 12c's timeline lanes** (round 12c): `scripts/profile-status.cjs` has a `lanes` setup (Bass's and
  the master's lanes open, a fader lane with three points each, the arrangement playing), not run yet: it needs a dev
  server and a preview server from the round's checkout. Compare with 12b's `editor` 87 and `loop` 87 component renders
  a second; the lanes subscribe to the project, not the status, so they should add none.

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
- **P6 Library code loads eagerly.** `core/library` is in the eager `core` chunk because the state layer and the UI
  import it (`linkOf`, `graphFitsOwner`, `insertionScope`, the drops). Moving those behind the lazy library service
  would load it only when needed; measure what it saves first (library phase 5).
- **P5 The in-place edit of a long sample blocks the main thread**: on 120 s of stereo, one task of 100 to 130 ms
  (applying the edit, encoding the WAV and hashing it), with the spectrogram on or off (round 11d-1's measure). Move
  the encode and the hash to a worker, or split them into tasks.

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
- **L6 Sample choices beside the sampler's own sample picker.** Sounds lists a graph's per-use sample choices under
  *Sample choices*; they belong in the Instrument view's property editor, where the shared default is picked (library
  phase 4 left them in Sounds, collapsed).
- **L7 Factory presets.** The Factory's sounds have no presets yet (library phase 6, signed off): a content pass would
  add a few per sound, as rows of `FACTORY_CONTENT` with their states, recallable from Sounds through the link.
- **L8 Sidechain-ready Factory sounds.** Low Light's Bass, Stab, Arp, Drone and Echo duck under the Kick through *Track
  audio*, which the library can't hold, so the Factory has them without the duck (and Low Light's Echo not at all). A
  duck that takes its key from a send or a sidechain input chosen on insert would let them come whole.

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
- **C9 Control groups on a panel**: a frame with a label, direction and items per line (user testing 6,
  [review](active/REVIEW-user-testing-2026-11.md)).
- **C10 Pin parts of a panel**: single controls, groups, module uses and controls inside modules, shown under their
  instrument (user testing 7; groups need C9).
- **C11 Control ports on module uses**: a wire into a module's control replaces it and hides it on panels (user
  testing 8).

## Graph and note workflow

- **G1 Move several selected patch nodes together.** Delete, duplicate, copy and paste of a selection exist.
- **G2 Note effects**: humanize, note length, random pitch, strum; arpeggiator latch; bypass-all.
- **G3 Audition piano-roll notes through the note chain; preview notes from other tracks; a multi-track graph view.**
- **G4 An explicit send-notes-only control.**
- **G5 Feedback cycles in graph routing** behind an explicit delay boundary (cycles are refused today).
- **G6 Launch quantisation other than one bar; triplet grids in the piano roll.**

## MIDI

- **M3 A track's MIDI input on its header or mixer strip**: it is set in MIDI settings only, and the header shows a tag.

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
