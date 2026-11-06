---
status: active
date: 2026-11-06
note: "Part 4 of the round 12 spec: touch recording into the arrangement. Written 2026-11-06 on feat/round-12d-touch-arrangement; signed off 2026-11-06, every decision as proposed."
---
# Round 12d: touch recording into the arrangement

Status: **signed off** 2026-11-06, every decision as proposed. Written 2026-11-06. Part of the [UI redesign](ui-redesign-roadmap.md#round-12-arrangement-editor).

This plan carries out part 4 of the signed-off [round 12 spec](SPEC-round-12-arrangement-editor.md) (§ Suggested
split). It implements the spec's § 4 (touch recording into the arrangement) on top of 12b's loop and 12c's timeline
lanes, both done. The inventory was taken on `main` at `84a25b3` (`feat/midi-recording` merged, format v15).

* The spec's decisions are settled and not repeated here.
* This plan adds the decisions it raises.
* One of them corrects a sentence of the spec (§ Decisions, row 1).

It is the last part of round 12. After it come round 13a and the
[engine-improvements PI](REPORT-engine-gaps.md#order-with-the-redesign).

## Goal

While the **arrangement** plays and ● *Touch* is armed, moving a control records it into **its owner's timeline lane**
for that target, the way it records into the playing clip or slot in the Session today. After this part:

* **Every timeline owner records:**
  * instrument and audio tracks;
  * returns;
  * the master;
  * groups with a bus: their fader, pan, sends, and the bus's effect knobs from the mixer, the session's group header,
    panels, pinned panels and the graph editor.

  A folder has no lanes, so touch on a folder's controls authors the base, as today.
* **MIDI-learned controls record the same way.** They go through the same gesture.
* **A lane is created on the first sample** if the owner has none for the target, within 64 lanes per owner. The owner's
  lanes open under its row, so the take is visible.
* **Loop passes.** With the loop brace on, a take spans passes: each pass replaces its touched part, so the last pass
  wins where they overlap. A take that started before the brace keeps that part too.
* **Each take is one undo step.** Takes from several sources are one step each, as today.
* **Ending a take.** It ends when the control is released, and also on ■, on a seek while playing (a click in the
  ruler), on a change of the brace, when playback switches between Session and Arrangement, and at the limits.
* **Armed preset recall records too.** A preset or snapshot recalled while touch is armed and the arrangement plays
  records its steps on the timeline, as it does into a clip today.
* **Feedback names the destination.** The transport bar says "Touch → timeline" while the arrangement plays. The arm
  button's tooltip and the effective-value hint say where touch records in either mode.

**Out of scope:**
* drawing the take live while it records (the lane updates when the take is saved, as clip lanes do today);
* a per-track arm (the spec's decision: touch's global ● stays the only arm);
* *Read* shown in the mixer and panels with a "touch replaces from here" marker (a spec wish).

## Inventory

### Touch today (`state/touch-store.ts`, 139 lines)

* **`touchDestination(project, target, status)`** finds the owner's **playing session clip or slot** from
  `status.tracks[trackId]` or `status.masterAutomation`. A group finds nothing, so touch authors its base.
  * In arrangement mode the launcher is reset, so there is no playing clip: touch is "unavailable" for every owner.
  * This is what 12c left: "touch while the arrangement plays behaves as today".
* **`captureTouch(source, changes, agoMs)`** keeps one take per gesture source.
  * Each target's capture is `{ clipId, start, length, base, samples }`, with samples in beats relative to the clip's
    start, so they span clip loops.
  * It sets an override per sample, so the control holds while it is touched.
  * Limits: 256 beats (`MAX_TOUCH_BEATS`), 16,384 samples, 64 targets.
* **`finishTouch(source, endBeat)`** re-finds the clip.
  * It runs `applyTouch(lane, samples, length, base)` for each capture, and commits one history step.
  * Then it releases the overrides, so *Read* resumes.
  * It throws, and discards the take, if the destination changed.
* **`reconcileTouches(status)`** runs on every status. It finishes a take at the real launch, stop or retrigger
  boundary when the destination changes, and at the 256-beat limit.
* **The clock.** `setTouchClock` is wired in `app/project-sync.ts` to `AudioHost.recordingBeat`: a **beat only**.
  `AudioHost.recordingPosition` also gives the run and the loop pass (`ClockPosition { beat, lap, run }`). The MIDI
  recorder (`state/record-clock.ts`, `record-store.ts`) uses it for arrangement takes over loop passes, as
  `takeTime = beat + lap × brace length`.
* **Callers:**
  * `state/control-gesture.ts` (`createControlGesture`), used by `ui/controls/use-control-gesture.ts` and
    `app/midi-controls.ts`;
  * `state/preset-actions.ts` (`recordRecall`, armed recall with `stepRecallLane`);
  * `ui/controls/EffectiveValue.tsx` (whether touch could record here);
  * `ui/transport-bar/TransportBar.tsx` (the arm, its tooltip, the feedback);
  * `ui/automation/AutomationEditor.tsx` ("Touch armed" in its header).

### `applyTouch` (`core/automation/record.ts`, 60 lines)

* It works in a lane's own coordinates `[0, length]`. It splits the samples at multiples of `length` (passes), and in
  each pass replaces only the touched span, with 1e-7-beat hold guards at its edges and simplification within 0.002.
* It canonicalizes points to `[0, length]`, and refuses a take over 2048 points whole.

### The timeline (12c)

* **The model** (`core/automation/timeline.ts`):
  * `arrangementAutomation: TimelineLanes[]`, per owner, in song beats `[0, MAX_TIMELINE_BEATS]` (4096);
  * `timelineOwnerAllowed`, `timelineLanesOf`, `setTimelineLanes` (canonical, refused for an owner not allowed);
  * `setTimelineLanesOpen` (a view field, no undo).
* **The engine** (`core/engine/arrangement-automation.ts`). A timeline lane that is enabled and has points **takes
  its target for the whole song**: the target goes into `taken`, and region lanes on it never play. Outside its points
  it holds its first and last values (`automationPosition`). Overrides apply to timeline lanes like any other.
* **The loop** (`project.arrangementLoop { from, to, enabled }`). `EngineStatus` carries `mode`, `run` (one more at
  every start and every seek while playing) and `lap` (loop jumps within a run).

### Tests to extend

* `core/automation/record.test.ts`;
* the touch tests in `state` (`preset-actions.test.ts`, `automation-slots.test.ts`, `timeline-automation.test.ts`);
* `tests/browser/audio/automation.audio.spec.ts` (its `touch` mode);
* `tests/browser/timeline/automation.smoke.spec.ts` and `timeline-automation.smoke.spec.ts`.

## Design

### A destination per mode (`touchDestination`)

`touchDestination` returns one of two shapes; the take code branches on the kind only where it reads or writes lanes
(the spec's "one branch per mode; the take code doesn't know which"):

```ts
type TouchDestination =
  | { kind: 'clip'; clip; start; playing }                       // today's, unchanged, in session mode
  | { kind: 'timeline'; owner; brace?: { from: number; to: number }; run: number }  // arrangement mode
```

* **Session mode** (`status.mode === 'session'`): exactly today's rule.
* **Arrangement mode** (`status.mode === 'arrangement'` and `status.playing`): a timeline destination when
  `timelineOwnerAllowed(project, owner)`, so groups with a bus are included and folders are not.
  * `brace` is the loop when `arrangementLoop.enabled`.
  * `run` is the status's run.

### Take time

* **Timeline captures are kept in take time**, as the MIDI recorder does: `beat + lap × (to − from)` within a run.
  Take time only goes forward, across loop jumps.
* **The touch clock moves to positions.**
  * `setTouchClock` is wired to `AudioHost.recordingPosition`.
  * `touchPositionNow(agoMs)` replaces the beat-only read, and `touchBeatNow` stays as its `.beat` for the clip path
    and existing callers.
  * A sample whose run differs from the capture's isn't taken: it finishes the take (below).
* **A timeline capture** is `{ kind: 'timeline', owner, run, brace, base, samples }`, with `samples[].beat` in take
  time. The 256-beat limit and the sample limit apply to take time unchanged.

### Writing a take (`applyTouch` with a span)

`applyTouch` gains a **span**: `applyTouch(lane, samples, { offset, length, extent }, base)`.

* `offset` is where pass 0 starts in the lane's coordinates; `length` is the pass length; `extent` is the lane's
  canonical bound.
* Today's call is `{ offset: 0, length, extent: length }`, with identical output (a test).
* **Loop off.** One call, with `{ offset: 0, length: MAX_TIMELINE_BEATS, extent: MAX_TIMELINE_BEATS }` and the samples
  in song beats: no wrap.
* **Loop on.** The take splits at the brace's start:
  * samples before `from` (a take begun before the brace, in pass 0) are applied as with the loop off;
  * samples from `from` on are applied with `{ offset: from, length: to − from, extent: MAX_TIMELINE_BEATS }`, where
    `applyTouch` subtracts `offset` and splits passes as for a clip's loops.

  Both parts go into one lane, one commit.
* Points outside the touched span are kept, with today's boundary guards.
* **A new lane** takes the control's normalized base around the span, as today.
* **Limits.** A take that would pass 2048 points is refused whole. A new lane past 64 for the owner is refused, as
  today, with its message.

### Finishing and reconciling

`finishTouch` re-reads the owner's timeline lanes, applies, and commits with `setTimelineLanes` in one history step. On
the **first** lane it opens the owner's lanes (`setTimelineLanesOpen`, a view field, outside the step). Then it releases
the overrides.

`reconcileTouches(status)` finishes a timeline take:

| What happened | Where the take ends |
|---|---|
| ■ | Before the stop is dispatched, as today: at the stop's position, in take time |
| A seek while playing (`run` changes) | At its last sample: the seek's position belongs to the new run |
| The brace changes (`from`, `to` or `enabled`) | At the last sample before the change was seen |
| The mode changes (Session ↔ Arrangement) | At the last sample |
| The owner is no longer allowed (bus switched off, track removed) | Discarded with the existing message ("Touch destination changed; take discarded") |
| 256 beats of take time | At the limit, as today |

Run, brace and mode changes are noticed in `reconcileTouches`, and also in `captureTouch` when the next sample
arrives first.

### Armed preset recall (`state/preset-actions.ts`)

`recordRecall` takes the same destination. On a timeline destination it writes a step into the owner's timeline lane
at the current **song beat** (`stepRecallLane` with the timeline's bound as its length). With the loop on, the step goes
where the transport is now, in song beats; a recall is an instant, so it has no passes.

### Feedback

| Where | Text |
|---|---|
| The arm button's tooltip | "Record controls into each owner's playing clip or automation slot, or into the timeline while the arrangement plays" (with the key) |
| Arming | "Touch armed · play a clip, an automation slot or the arrangement" |
| Recording, arrangement mode | "Touch → timeline" |
| Recording, session mode | "Touch recording" (unchanged) |
| A take saved, arrangement mode | "Touch take saved to the timeline" |
| A take ended by a seek, brace or mode change | "Touch take saved; the transport jumped" / "…; the loop changed" / "…; playback switched" |
| A folder's control while armed | "Touch unavailable: a folder has no lanes (give the group a bus)" |
| `EffectiveValue`'s hint | "Play a clip, an automation slot or the arrangement to record controls" |

The timeline lane's header shows the recording state of its target (●, from `useTouchStore.recording`), as a control
shows "Touch recording".

### Region lanes under a take (spec correction)

* **The spec (§ 4) says** a region's own lane on the same target "stops sounding where the take lands".
* **What 12c built** (signed off: "a timeline lane with points wins") is that a timeline lane takes its target **for
  the whole song**. So the first take on a target that a region automates silences that region's lane everywhere.
  Outside the take the target holds the base, from the new lane's guard points.
* **Recommended for 12d: keep the engine as built and say so.**
  * The feedback adds "· replaces the region's lane on this control" when a region on that track has a lane on the
    target.
  * The architecture doc states the rule.
* The alternative is in § Decisions.

## Steps

1. **`applyTouch` with a span** (`core/automation/record.ts`).
   * The span parameter, with today's callers passing `{ offset: 0, length, extent: length }`.
   * Tests:
     * the clip path is unchanged (existing tests, plus an equality test on a looped clip);
     * a loop span with an offset: passes replace in order, the last wins;
     * the pre-brace part plus the looped part go into one lane;
     * canonical to the extent;
     * 2048 points refused whole.
2. **The touch clock as positions** (`state/touch-store.ts`, `app/project-sync.ts`).
   * `touchPositionNow`; `touchBeatNow` kept as its beat.
   * Tests: a beat-only reader (as tests give it) still works, as in `record-clock.ts`'s `asPosition`.
3. **Timeline destinations, captures and finishing** (`state/touch-store.ts`).
   * The destination union, take time, `finishTouch` per kind, the reconcile rules, opening the lanes, the feedback
     texts.
   * Tests (`state/touch-arrangement.test.ts`):
     * `touchDestination` in both modes for a track, an audio track, a return, the master, a group with a bus, and a
       folder (none);
     * a take with the loop off;
     * a take over three loop passes, last wins;
     * a take begun before the brace;
     * ■, a seek, a brace change and a mode switch each finishing at the right beat;
     * an owner removed mid-take (discarded);
     * 64-lane and 2048-point refusals;
     * one undo step per take;
     * the lanes opened without an undo step;
     * two sources on two targets;
     * a competing source refused.
4. **Armed recall on the timeline** (`state/preset-actions.ts`).
   * Tests: a preset recalled while the arrangement plays writes steps into the timeline lanes of every affected owner
     in one step; refused, as today, if any owner has no destination.
5. **UI.**
   * The transport bar's tooltip and feedback, `EffectiveValue`'s hint, the timeline lane header's ●, and the
     region-lane warning in the feedback.
   * Smoke (`tests/browser/timeline/`): arm *Touch*, play the arrangement, drag a track's knob and a group bus's
     fader; their lanes open with points; undo removes each take; "Touch → timeline" shows.
6. **Real worklet** (`tests/browser/audio/`).
   * The spec's case: touch on a bus fader while the arrangement plays, then reload and play. The level follows the
     recorded lane, against an offline render.
   * Plus a track parameter touched over two loop passes, played back against an offline render.
7. **Docs.**
   * `architecture/control-and-automation.md` (touch into the timeline, take time, the region-lane rule).
   * STATUS: round 12 done.
   * BACKLOG: U2 closed; V11 gains 12d's hand pass.
   * Archive the round 12 spec and the four plans; update the roadmap.
   * Decisions rows; the spec correction noted where the spec is archived.

No format change: timeline lanes are already v15.

## Behavior changes

* While the arrangement plays and touch is armed, controls record into the timeline instead of reporting "Touch
  unavailable".
* The touch clock reads positions (beat, run, loop pass). Session takes are unchanged.
* The first take on a target that a region automates silences that region's lane on the target for the whole song
  (12c's rule, now reachable by touch). The feedback says so.

## Verification

* `npm test` (unit and architecture);
* the smoke groups;
* the audio specs above;
* the existing session touch specs unchanged (`automation.audio.spec.ts` `touch` mode).

**Hand pass** (added to BACKLOG V11), in Chrome:
* touch on a knob with a trackpad, and on a MIDI controller's knob (V5), over a 2-bar loop at 90 and 140 BPM;
* a seek while touching;
* the feedback and the ● in a lane header in both themes.

## Decisions to sign off

Signed off 2026-11-06: every row as proposed.

| Question | Proposed | Alternative |
|---|---|---|
| A take on a target a region automates | **Keep 12c's rule** (the timeline lane takes the target for the whole song) and warn in the feedback; correct the spec's sentence | Change the engine so a timeline lane wins only between its first and last point, region lanes playing outside (a punch-in; changes how 12c's hand-drawn lanes play outside their points, and the constant-range proof) |
| A seek while touching | **Finishes the take at its last sample** and saves it | Discards the take |
| Armed preset recall while the arrangement plays | **Records steps on the timeline**, like touch | Refused while the arrangement plays |
| Showing a new take | **Opens the owner's lanes** (a view field, not undone) and marks the recording lane's header with ● | Feedback only; lanes stay as they were |
| A take begun before the brace | **One take, one undo step**: the part before the brace is written straight, the rest by passes | Ends the take at the brace's first jump |

## Changes made while implementing

### Step 1: `applyTouch` with a span

* **The split at the brace's start is its own function**, `applyTimelineTouch(lane, samples, brace, base)` in
  `core/automation/record.ts`, so the store only names the brace. Both parts meet at a point on the brace's start, at
  the value the take had there, so neither leaves a gap or a ramp across the join.
* **A pass's shift is `pass × length`, not `offset + pass × length`:** lane beats of every pass fall in
  `[offset, offset + length]`. The guard before a pass is written whenever it starts after 0, so a looped pass keeps
  what lies before the brace.
* **The clip path's equality test** pins the output of the function before the change (taken from `HEAD` once) for a
  take over three passes of a looped clip, holds included.
* The MIDI recorder's expression lanes (`core/record/expression.ts`) call `applyTouch` too; they pass a clip's span.

### Step 2: the touch clock as positions

* **A bare beat takes the status's run and loop pass**, not `{ lap: 0, run: 0 }` as `record-clock.ts`'s `asPosition`
  does: touch compares a sample's run with the status's (step 3), and a test's beat-only reader would otherwise look
  like a seek on the first status with a run. With no reader at all, touch reads the status, as before.
* **Two host stubs in `app` tests named `recordingBeat`** (`touch-runtime`, `project-sync`); they now give
  `recordingPosition`, which `project-sync` wires. `touch-runtime`'s still returns a bare beat, so it is the beat-only
  case end to end.
