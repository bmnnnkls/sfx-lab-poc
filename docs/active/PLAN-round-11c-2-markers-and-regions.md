---
status: active
date: 2026-10-31
note: "Plan signed off 2026-10-31 as proposed; not started. Part 2 of the handling-and-spectrum spec: markers, regions, snap, Revert to original and the sampler's loop points; format v12."
---
# Round 11c, part 2: markers, regions and loop points

Status: **plan, signed off** 2026-10-31, every decision as proposed. Written 2026-10-31, revised the same day: format v12 and loop points in this
part (the user: only the two example projects exist, so a version bump and an engine change are fine). Part of the
[UI redesign](ui-redesign-roadmap.md). Carries out part 2 of the signed-off [handling and spectrum
spec](SPEC-wave-editor-handling-and-spectrum.md) (§ Suggested split): markers, regions, snap and *Revert to
original*, as [round 11's spec](SPEC-round-11-wave-editor.md) has them (§ Overview, detail and the ruler; § Cursor,
selection, markers and regions; § In-place edits; § Keys and commands), plus loop points for the sampler, which the
handling spec allowed "as a region kind if the plan finds it cheap". The inventory was taken on
`imp/wave-11c-1-handling-85124e` at `abbae05` (round 11c part 1 done, not merged into `feat/ui-redesign` yet). The
specs' decisions are settled and not repeated here; this plan adds the ones they leave open, in § Decisions to sign off.

## Goal

After this part:

* **markers:** *Add marker* (M) puts one at the cursor; they show in a **mark lane** between the ruler and the lanes,
  and as a line through the lanes; drag one to move it, double-click or F2 to rename it, Delete to remove it, `[` and
  `]` to jump between them;
* **regions:** *Make region* (R) saves the selection as a named region, drawn as a band in the mark lane; a click on
  it, or a double-click in the lanes inside it, selects it; its edges drag; it can be renamed, played, zoomed to and
  deleted;
* **a loop:** *Set loop* (L) makes the selection the sample's loop, drawn in the mark lane; its edges drag. A sampler
  in *loop* mode playing that sample repeats the loop while the note is held, instead of the stretch from *Start* to
  the end;
* markers, regions and the loop are **project edits**, one undo step each (a drag is one step), **follow every edit**
  (markers and regions already do: § The data is there), and travel with the project, packages and library items;
* **snap:** *Snap to beats* (while the ruler counts beats) and *Snap to zero crossings* in *View ▾*, off by default;
  pointer gestures snap to the beat grid, zero crossings, markers, region edges and the loop's edges within 8 px; Alt
  held turns snapping off for that gesture;
* ***Revert to original*** points every use back at the sample's first version, in one undo step, with clips' trims,
  markers, regions and the loop moved back to where they were in it;
* **format v12:** `SampleInfo` gains `lineage` (the original's facts and the chain of position maps) and `loop`.

**Out of scope:**

* the second pane (part 3) and the spectrum (11d);
* a crossfaded loop and a loop finder; slicing to pads; markers in the arrangement (BACKLOG items, § Decisions);
* markers carried by copied audio: the clipboard holds audio only (§ Decisions).

## Inventory

What part 2 touches, beyond the specs' inventories.

### The data is there, the editing isn't

* `SampleInfo` (`core/sample/types.ts`) has `origin?`, `markers?: SampleMarker[]` (`{ id, frame, name }`) and
  `regions?: SampleRegion[]` (`{ id, from, to, name }`), since format v11 (`CURRENT_VERSION = 11` in
  `core/persistence/format.ts`). `SAMPLE_MARK_LIMITS` (`marks.ts`) is 256 markers, 256 regions, names of 60
  characters. `sanitize-samples.ts` clamps them to the sample's saved length and drops bad ones; the fixture
  `v11-sample-markers.sfxlab.json` has some.
* `replaceSample` (`core/project/sample-uses.ts`) already moves markers and regions through an edit's remap
  (`remapMarkers`, `remapRegions`): a marker in deleted audio goes, a region is clipped and goes when empty. It sets
  `origin: originOf(old)`.
* **Nothing creates, changes or shows them.** No `core` edit functions, no project store actions, no subject, no UI.
  Personal library items keep a sample's `SampleInfo` through `sanitizeSamples`, so marks already travel there.

### Remaps are closures

* `core/sample/remap.ts` has four shapes, `identityMap`, `spliceMap(from, to, inserted)`, `cropMap(from, to)` and
  `mirrorMap(from, to)`, each a `FrameMap` of functions. Each `SAMPLE_EDITS` entry's `remap` returns one. They are
  built, used once by `replaceSample` and dropped: **nothing records the chain of edits**, so nothing can map a position
  in the present version back to the first one. That is why 11b left *Revert to original* to 11c (BACKLOG U1).
* All four shapes are invertible for positions that exist in both versions: a splice's inverse is a splice, a crop's
  is a shift (a splice at 0), a mirror is its own inverse. Positions in audio that only the later version has (pasted
  or inserted) have no place in the earlier one.

### What the original is

* Storage (`storage/sample-storage.ts`) keeps **bytes only**, by id: no name, extension, rate or channel count. The
  origin's bytes are an import (never cleaned up) or, for a sample *Edits make copies* made, an edit-made file that the
  project names (so kept).
* The origin's `SampleInfo` is gone from the project once an in-place edit replaced it. Undo history may hold it, but
  not after a reload. So the original's facts have to be kept on the sample.
* Only the two example projects exist outside the browsers used for development, and neither has an edited sample.
  So a sample edited before this part (no chain) can simply not revert.

### The sampler and the engine

* **The sampler** (`core/dsp/nodes/sampler.node.ts`): `loopStart` is the *Start* param times the length; in *loop*
  mode the voice wraps from the sample's end back to `loopStart` until the gate falls, then fades out over
  `RELEASE_SECONDS`. It reads the audio through `ProcessContext.samples` (`SampleLookup`, the `SampleBank`), which holds
  `SampleData` (`{ id, sampleRate, channels }`) and nothing else.
* **Commands:** `sample/add` (the audio, transferred), `sample/remove`, `sample/preview`, `sample/stopPreview`
  (`core/engine/commands.ts`). The live engine and the bounce are both built by `diffProject` (`core/sync/
  diff-project.ts`); **the bounce applies `diffProject(null, project)` first and `sample/add` after**
  (`core/engine/bounce.ts`), so anything `diffProject` sends about a sample arrives before its audio.
* **Bit for bit:** `core/engine/old-projects.test.ts` bounces the committed old projects and checks their hashes. A
  sample without a loop must play exactly as now.

### Where it plugs in

* **The subject and keys** from part 1: `sample-selection` actions (`state/actions/sample-selection.ts`), the group
  order (`open, edit, clipboard, delete, process, view`), `waveKeyAction` and `VIEW_KEYS`, `useWaveGestures` (drags,
  edges, auto-scroll, double-click), `menuTargetAt`, `selectionEdgeAt`, `EDGE_PX`.
* **The editor's grid:** toolbar, overview (48 px), ruler (18 px), lanes, status bar, with the level scales in a 28 px
  first column. The mark lane is a new row.
* **Rename in place** (round 5): `renameAction(kind)` (verb `rename`, `takesFocus`), `useRenameStore`,
  `RenameField`, `commitRename(subject, name, context)` with one setter per kind.
* **Undo merging:** the project store's setters take a `mergeKey`, so rapid edits (a drag) collapse into one step.
* **The ruler's beats:** `rulerTicks(view, rate, mode, bpm)` in `ruler-ticks.ts` (bars and beats in 4/4 from frame 0,
  labels 72 px apart, `BEAT_STEPS`).
* **Tests that read the toolbar and status:** `wave-editor.smoke.spec.ts` (*View ▾* entries, the status text),
  `views-at-min-size.smoke.spec.ts` (the editor at 480 × 240), `profile-status.cjs` `wave` (56 component renders a
  second).

## Design

### Marks in `core`

* **`core/sample/sample-marks.ts`**, pure, on a `SampleInfo`: `addMarker(info, frame, name?)`, `moveMarker`,
  `renameMarker`, `removeMarker`, `addRegion(info, range, name?)`, `updateRegion(info, id, { from?, to?, name? })`,
  `removeRegion`, `setLoop(info, range | null)`. Frames are clamped to `savedFrameCount(info)` and rounded; a region and
  the loop keep `from < to` (at least one frame); at `SAMPLE_MARK_LIMITS` an add returns the info unchanged; names are
  cut to 60 characters. Default names are *Marker N* and *Region N* (the lowest N not in use). Ids from
  `createId('marker')` and `createId('region')`. Markers and regions are kept **sorted** (by frame, then by `from`), so
  drawing and `[` `]` walk them in order.
* **`core/project`**: `updateSampleMarks(project, sampleId, change)` applies one of those to the library entry; the
  project store gets `editSampleMarks(sampleId, change, mergeKey?)`. A drag passes `marker:<origin>:<id>`,
  `region:<origin>:<id>:<edge>` or `loop:<origin>:<edge>`, so it is one undo step.
* **The loop** is `SampleInfo.loop?: { from, to }`, one per sample, remapped by `replaceSample` like a region (and
  dropped when an edit empties it).

### Format v12

* **`CURRENT_VERSION = 12`.** `SampleInfo` gains `lineage?` and `loop?` (below). The migration from 11 adds nothing: a
  v11 sample has no chain (it can't revert) and no loop. A fixture, `v12-sample-lineage.sfxlab.json`, written with a
  throwaway test as the gotchas say, has a sample with two edits' chain, markers, a region and a loop.
* **The sanitizer** checks `lineage` (the original's facts, and each step's numbers inside the lengths they map
  between) and `loop` (clamped, dropped when empty), like the marks. A bad lineage is dropped, not the sample.

### The chain of edits, for *Revert*

* **Remap steps as data.** `RemapStep` is `{ kind: 'splice', from, to, inserted } | { kind: 'crop', from, to } |
  { kind: 'mirror', from, to }`. `remap.ts` gains `mapOf(step)` (the `FrameMap` it is) and `inverseStep(step)`, and
  each shape constructor is written over a step, so a map and its data can't disagree. `SAMPLE_EDITS` entries' `remap`
  return a step (or none for the identity); `sampleRemap` and `replaceSample` keep taking maps.
* **`SampleInfo.lineage?`** `{ original: { extension, bytes, channels, durationSeconds, sampleRate }, steps:
  RemapStep[] }`. `replaceSample` sets it on an in-place edit: the first edit of a sample with no `origin` records the
  original's facts from the entry it replaces; every edit appends its step (an identity adds nothing). A step is a
  few numbers, so the chain isn't capped: a thousand edits are about 40 KB of project JSON.
* **`revertRemap(info)`**: the inverse steps, last first, composed into one `SampleRemap` from the present length to
  the original's. Trims, markers, regions and the loop go back exactly; ones only in pasted or inserted audio go to its
  start (trims, as `start` does) or are dropped (markers, empty regions and loops), as for any edit.

### *Revert to original* (`app`)

* **`SampleLibrary.revertSample(sampleId)`**, the one call, beside `editSample` and through the same commit: read the
  origin's bytes from storage (absent: an error toast, "The original of *name* is missing; import the file again"),
  decode them, send `sample/add`, and `replaceSample(project, id, original, revertRemap(info))` as one undo step, if the
  sample is still in the project. The original's `SampleInfo` is `lineage.original` with the origin's id. The result
  has the present name, no `origin` (it is the origin), no `lineage`, and the reverted markers, regions and loop. The
  editor follows it by origin, as after any edit.
* **The action** `sample-selection.revert` (*Revert to original*), the last entry of the `process` group (so in
  *Process ▾* and the right-click menu), under a separator. Disabled, with the reason as its tooltip, while an edit
  runs, when the sample is its own origin ("This is the original"), and when it has no chain ("Edited before
  *Revert* was possible").

### Loop points in the engine

* **The bank keeps loops apart from the audio:** `SampleBank.setLoop(id, { from, to } | null)` and
  `SampleLookup.loopOf(id)`, so a loop may arrive before its sample's audio (the bounce's order) and survives a
  `sample/add` of the same id. A new command, **`sample/setLoop { sampleId, loop }`**, plain data.
* **`diffProject` sends it** for every sample whose `loop` differs from the previous project's (all of them from
  `null`), so the live engine, a loaded project and the bounce get loops the same way, and an undo of a loop edit sends
  the old one.
* **The sampler, in *loop* mode with a loop:** it starts at *Start* as now; while the note is held, reaching the loop's
  end wraps to the loop's start (interpolating across the wrap, as the end-to-*Start* wrap does now). A voice that
  starts past the loop's end plays on to the sample's end and wraps to the loop's start. On release it stops looping
  and fades out over `RELEASE_SECONDS`, as now. *one-shot* and *hold* ignore the loop. **Without a loop nothing
  changes:** the same code path as now, so old projects' bounce hashes hold.
* **No crossfade at the loop point** in this part: snap to zero crossings is how to set a clean loop. A crossfaded
  loop and a loop finder are a BACKLOG item (§ Decisions).
* **The preview:** *Play loop* previews the loop, looping (`sample/preview` already takes `from`, `to` and `loop`).

### The mark lane (`ui/wave-editor/MarkLane.tsx`)

* A **20 px row** between the ruler and the lanes, in the editor's second grid column (its first column says
  *Marks*). One canvas, drawn like the ruler: subscribed to the view store, redrawn in an animation frame on zoom,
  scroll and resize, and when the sample's marks change. React renders it only when the marks change.
* **Drawn:** a region as a band with its name (clipped to the band); the loop as a band of its own colour, labelled
  *Loop*, with brackets at its edges; a marker as a flag with its name; a marker also as a 1 px line through the lanes
  (`LaneOverlay.markers`), region and loop edges as faint lines. The selected region (the selection equals it) is in
  the accent colour.
* **One trigger, subjects from the pointer:** the lane is an `ActionMenu` trigger whose subject is set in its own
  `onContextMenu` (`markAt(view, marks, x)`: the marker within 4 px, else a loop edge, else the region or loop under
  it, the shortest first, else none), as the canvas and arrangement lanes do. So 256 marks are one element, not 256.
* **Gestures** (in `useMarkGestures`): drag a marker to move it; drag a region's or the loop's edge (within `EDGE_PX`)
  to move that edge; click a region or the loop to select it (and put the cursor at its start); double-click a marker or
  region to rename it; a click on empty lane sets the cursor. Drags snap (below) and auto-scroll past the edges, as
  selection drags do.
* **Rename in place:** a `RenameField` positioned over the mark while `useRenameStore` names it, as elsewhere.
* **At the minimum size** (the editor under 300 px high, a container query) the lane folds: it collapses to 6 px, marks
  show as ticks, and its gestures and menu still work on them. Markers keep their lines through the lanes.

### Subjects and actions

* **`{ kind: 'sample-marker', sampleId, markerId }`** (`state/actions/sample-marker.ts`): *Go to* (cursor there, the
  view follows), *Rename* (`renameAction`, verb `rename`), *Delete* (verb `delete`). Named "*Marker 1* in *Kick*".
* **`{ kind: 'sample-region', sampleId, regionId }`** (`sample-region.ts`): *Select*, *Play*, *Zoom to region*,
  *Set loop from region*, *Rename*, *Delete* (verb `delete`). Named "*Region 1* in *Kick*".
* **`{ kind: 'sample-loop', sampleId }`** (`sample-loop.ts`): *Select*, *Play loop*, *Zoom to loop*, *Clear loop*
  (verb `delete`). Named "Loop in *Kick*".
* **`sample-selection`** gains *Add marker*, *Make region* and *Set loop* (disabled without a selection, or at 256) in
  a new group, **`marks`**, between `process` and `view`; and *Revert to original* (above). The group order becomes
  `open, edit, clipboard, delete, process, marks, view`.
* `commitRename` gains the marker and region kinds; `subjectName` names all three.

### Snap (`ui/wave-editor/snap.ts`, `core/sample` for zero crossings)

* **Settings:** `snapBeats` and `snapZero` in `useWaveEditSettings`, per browser (`sfxlab:wave-snap`), off. *View ▾*
  shows *Snap to beats* (disabled while the ruler counts time) and *Snap to zero crossings*, checked when on.
* **`snapFrame(frame, targets, view)`**: the nearest target within `SNAP_PX` (8) columns, else the frame. **Targets**,
  while either snap is on: the beat grid's lines at the ruler's present step (`rulerTicks` in beats; only with *Snap to
  beats* on and the ruler in beats); zero crossings (only with *Snap to zero crossings*); every marker, region edge and
  loop edge.
* **`nearestZeroCrossing(audio, frame, channels, radius)`** (`core/sample/audio-math.ts`): the nearest frame within
  `radius` where the average of the selected channels changes sign or is zero; null when there is none.
* **What snaps:** a click's cursor, a selection drag's moving end, a selection edge drag, a marker drag, and a region
  or loop edge drag. *Add marker* puts the marker exactly at the cursor. **Keys don't snap**: they move by columns,
  which is already exact. **Alt** held during a gesture turns snapping off for it.

### Keys

| Keys | What |
|---|---|
| M | *Add marker* at the cursor (F2 then renames it) |
| R | *Make region* from the selection |
| L | *Set loop* from the selection |
| `[` `]` | Cursor to the previous or next marker, region edge or loop edge; with Shift, extend the selection there |

A mark's Delete and F2 come from its subject's verbs, in its menu and the palette. `waveKeyAction` takes the sample's
marks for `[` `]`; M, R and L return `{ mark: 'marker' | 'region' | 'loop' }` for the handler to run the actions. Rows
in `VIEW_KEYS`.

### Double-click

The lanes' double-click selects the region (or the loop) under the pointer on the channels the rule takes
(`channelsAt`); outside all of them, the whole sample, as now. One inside another: the innermost (the shortest).

## Steps

Each step lands green: `npm test`, `npm run typecheck`, `npm run test:smoke` (outside the sandbox). The bounce hashes
in `old-projects.test.ts` must hold at every step; step 4 changes the engine, so it also runs `npm run test:audio`.

1. **Marks, remap steps and format v12 in `core`.** `sample-marks.ts` (with the loop), `updateSampleMarks`, `RemapStep`
   with `mapOf` and `inverseStep`, the edits' `remap` as steps, `lineage` and the loop in `replaceSample`,
   `revertRemap`, `nearestZeroCrossing`; v12, its migration, the sanitizer and the fixture.
   *Tests:* each mark edit as a table (clamping, order, limits, names, default names, the loop); every edit kind's step
   against its old map for 200 random positions and ranges; `inverseStep` round trips positions that survive; a chain
   of five edits reverted against positions recorded before them (trims, markers, regions, the loop); `lineage` set on
   the first edit and appended after; the v11 fixtures load unchanged and the v12 fixture round trips; the sanitizer
   keeps a good lineage and loop and drops bad ones; zero crossings on a sine, on silence and with none in range.
2. **Store, subjects and actions.** `editSampleMarks` with merge keys; `sample-marker`, `sample-region` and
   `sample-loop` subjects, their actions, names and renames; *Add marker*, *Make region*, *Set loop* and the `marks`
   group; the snap settings.
   *Tests:* actions enabled and disabled (no selection, at 256, the sample gone); a drag's merge key gives one undo
   step; rename commits one step; verbs from the subjects; `describeActions` order with the new group.
3. **Revert.** `revertSample` in `app`, the action, toasts.
   *Tests* (`app`, memory storage): revert after delete, crop, paste and reverse puts clips' trims, markers, regions
   and the loop back where they were; a missing original refuses; undo of a revert brings the edited version back; a
   sample that is its own origin, and one with no chain, can't revert.
4. **Loop points in the engine.** `SampleBank.setLoop`, `loopOf`, `sample/setLoop`, `diffProject`, the sampler.
   *Tests:* the sampler in *loop* mode with a loop repeats exactly the loop's frames while held (a ramp sample, read
   back frame by frame), starts past the loop's end and wraps, stops looping on release; *one-shot* and *hold* ignore
   it; without a loop the output equals today's bit for bit; `diffProject` sends `sample/setLoop` on a change and on
   load; the bounce of a project with a looped sampler loops (the loop arrives before the audio); the old projects'
   hashes hold. *Audio* (`npm run test:audio`): a looped sampler through the real worklet.
5. **The mark lane.** `MarkLane`, the lines through the lanes, `markAt`, `useMarkGestures`, rename in place, the
   container query.
   *Tests:* `markAt` (a marker, a region, a loop edge, a marker over a region, nothing); edge hit testing.
   *Browser:* M adds a marker that shows in the mark lane; dragging it moves it and one undo puts it back; double-click
   renames it; R makes a region from a selection; clicking the region selects it; dragging its edge resizes it; L sets
   the loop and *Play loop* plays it; a delete before the marker moves it left; `views-at-min-size` with the folded
   lane.
6. **Snap and keys.** `snapFrame`, the targets, Alt, *View ▾* toggles; `[` `]`, M, R, L in `waveKeyAction`; the lanes'
   double-click on regions; `VIEW_KEYS` rows.
   *Tests:* `snapFrame` as a table (each target kind, out of range, the nearest of two, Alt); `waveKeyAction` rows for
   `[` `]` with and without Shift, at the ends, with no marks.
   *Browser:* with *Snap to zero crossings* on, a click lands on a crossing; with *Snap to beats*, a drag's end lands on
   a beat; `]` jumps to the next marker; a double-click inside a region selects it.
7. **Docs and the profile.** `architecture/samples-and-wave-editor.md` (marks, the mark lane, snap, revert, lineage,
   loop points in the sampler), `architecture/workbench.md` (the three subjects, the `marks` group),
   `reference/formats-and-versions.md` (v12, `sfxlab:wave-snap`); the notes sorted per
   [doc-workflow](../dev/doc-workflow.md); STATUS and BACKLOG; the profile.

## Behavior changes

* Projects are saved as **v12**; a build before this part refuses to open them.
* The editor gains a 20 px mark lane under the ruler (folded at the minimum size).
* *Process ▾* and the right-click menu end with *Revert to original*; the right-click menu gains *Add marker*, *Make
  region* and *Set loop*; *View ▾* gains the two snap toggles.
* M, R, L, `[` and `]` are new view keys. A double-click inside a region selects the region, not the whole sample.
* A sampler in *loop* mode plays its sample's loop when it has one; samples without one play as before.
* An in-place edit records its position map on the sample (`lineage`): a few dozen bytes per edit.
* Snapping is off until turned on; nothing moves differently until then.

## Verification

* `npm test`, `npm run typecheck`, `npm run test:smoke` at every step; `npm run test:audio` at step 4 and at the end.
* **Bit for bit:** the old projects' bounce hashes hold; a test compares the sampler without a loop against today's
  output.
* **Profile:** `wave` stays at 56 component renders a second with the preview playing and a few marks present; the
  mark lane redraws in the animation frame like the ruler, with no React render on zoom or scroll.
* **Measure:** `revertSample` for a 120 s stereo sample (decode, add, commit), and `nearestZeroCrossing` at the
  widest zoom, recorded in "Changes made while implementing", with the script committed.
* **Manual pass** (BACKLOG V10 grows): marker, region and loop drags on a trackpad, Alt with a drag, rename in place,
  the folded lane, and listening to a looped sampler.

## Decisions to sign off

Signed off 2026-10-31: every row as proposed.

| Question | Proposed | Alternative |
|---|---|---|
| How *Revert* finds where positions were | **Keep the chain:** each in-place edit appends its position map as data (`lineage.steps`, a few numbers), and *Revert* runs them backwards, so clips, markers, regions and the loop land exactly where they were | Keep trims as fractions and scale marks by the length ratio (what 11b deferred); simpler, but a delete earlier in a sample shifts what clips play after a revert |
| The format | **v12,** with `lineage` and `loop` on `SampleInfo`, an identity migration and a fixture | Optional fields at v11 (older builds would drop them silently) |
| A sample edited before this part | **Can't revert** (disabled, with the reason): only the example projects exist, and neither has an edited sample | Rebuild the original's facts from its bytes and revert with fractions |
| How long the chain may get | **No limit:** a step is a few numbers | A cap, with a fallback past it |
| The loop | **One per sample, `SampleInfo.loop`,** remapped by edits like a region, set from the selection or a region | A region marked as the loop (several candidates, one flag) |
| How the engine gets loops | **`sample/setLoop`, from `diffProject`;** the bank keeps loops apart from the audio, so order doesn't matter | Inside `sample/add` (resending the audio for every loop change) |
| What the sampler does with it | **In *loop* mode: repeat the loop while held, then fade on release;** *one-shot* and *hold* ignore it; no loop plays as now | A loop mode of its own, or the loop in every mode |
| A crossfade at the loop point | **Not in this part:** snap to zero crossings sets clean points; a crossfaded loop and a loop finder go to BACKLOG | A fixed short crossfade at the wrap now |
| Marks on screen | **A 20 px mark lane** under the ruler, plus marker lines through the lanes; it folds to 6 px under 300 px of height | Marks only on the ruler, no lane |
| Marks as subjects | **Subjects of their own** (`sample-marker`, `sample-region`, `sample-loop`) with menus, verbs and palette rows, from one trigger whose subject is the mark under the pointer | Only in the selection's menu (*Delete marker at cursor*) |
| Editing regions and the loop | **Edges drag** in the mark lane (`EDGE_PX`), the band selects | Only make, rename and delete; redo one to change it |
| Snap targets | **Beats** (ruler in beats, *Snap to beats* on), **zero crossings** (*Snap to zero crossings*), and **markers, region and loop edges** whenever either is on; within 8 px; pointer gestures only | A third toggle for marks; or keys snap too |
| Turning snap off for one gesture | **Alt held** | No modifier: toggle in *View ▾* |
| Zero crossings on stereo | **Where the average of the selected channels crosses** | The left channel's; or both channels at once (rarely the same frame) |
| Keys | **M** marker, **R** region, **L** loop, **`[` `]`** previous and next mark (Shift extends) | M only, the rest from menus and the palette |
| Where the mark actions sit | **A `marks` group** between the processes and the view entries | In `edit`, at the top of the menu |
| Where *Revert to original* sits | **Last in *Process ▾* and the `process` group,** under a separator | A button in the toolbar's sample group |
| Markers with copied audio | **Not carried:** the clipboard holds audio; a paste adds none | Copy the marks inside the selection and paste them with it |

## Changes made while implementing

* **Step 1: `SampleRemap` carries its steps.** `sampleRemap(edit, …)` is `remapOfSteps([step], …)` (`remapStep(edit,
  frames)` drops an identity), and `replaceSample` appends `remap.steps` to the lineage, so it keeps taking one map.
  `composeMaps` runs maps in order; the old closures are kept in `remap.test.ts` as the reference the steps are checked
  against. `lineageAfter`, `revertBlocked`, `originalInfo` and `revertRemap` are in `core/sample/lineage.ts`.
* **Step 1: a result with the origin's id is the original.** `replaceSample` gives it no `origin` and no `lineage`.
  That is how a revert drops them, and it is also right when an edit's bytes happen to equal the original's (a reverse
  of an edit-made sample, twice).
* **Step 1: the loop's edges move with `moveLoop`,** beside `setLoop`, as a region's do with `updateRegion`. An add takes
  an optional id, so *Add marker* knows the marker F2 then renames. A rename to an empty name changes nothing.
* **Step 1: the sanitizer's lineage** must end at the sample's own length (`savedFrameCount`), and needs an origin; else
  it is dropped with a warning ("can't be reverted"). A loop is clamped and rounded, then dropped when empty; markers
  and regions are still dropped when outside, as in v11.
