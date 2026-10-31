---
status: active
date: 2026-10-31
note: "Plan written 2026-10-31, waiting for sign-off. Part 2 of the handling-and-spectrum spec: markers, regions, snap and Revert to original."
---
# Round 11c, part 2: markers and regions

Status: **plan, waiting for sign-off.** Written 2026-10-31. Part of the [UI redesign](ui-redesign-roadmap.md). Carries
out part 2 of the signed-off [handling and spectrum spec](SPEC-wave-editor-handling-and-spectrum.md) (§ Suggested
split): markers, regions, snap and *Revert to original*, as [round 11's spec](SPEC-round-11-wave-editor.md) has them
(§ Overview, detail and the ruler; § Cursor, selection, markers and regions; § In-place edits; § Keys and commands),
with loop points for the sampler if the plan finds them cheap (it doesn't, § Decisions). The inventory was taken on
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
* both are **project edits**, one undo step each (a drag is one step), **follow every edit** (they already do: § The
  remap exists) and travel with the project, packages and library items;
* **snap:** *Snap to beats* (while the ruler counts beats) and *Snap to zero crossings* in *View ▾*, off by default;
  pointer gestures snap to the beat grid, zero crossings, markers and region edges within 8 px; Alt held turns snapping
  off for that gesture;
* ***Revert to original*** points every use back at the sample's first version, in one undo step, with clips' trims,
  markers and regions moved back to where they were in it.

**Out of scope:**

* the second pane (part 3) and the spectrum (11d);
* loop points for the sampler, slicing to pads, and markers in the arrangement (§ Decisions; BACKLOG items);
* markers carried by copied audio: the clipboard holds audio only (§ Decisions).

## Inventory

What part 2 touches, beyond the specs' inventories.

### The data is there, the editing isn't

* `SampleInfo` (`core/sample/types.ts`) has `origin?`, `markers?: SampleMarker[]` (`{ id, frame, name }`) and
  `regions?: SampleRegion[]` (`{ id, from, to, name }`), since format v11. `SAMPLE_MARK_LIMITS` (`marks.ts`) is 256
  markers, 256 regions, names of 60 characters. `sanitize-samples.ts` clamps them to the sample's saved length and
  drops bad ones; the fixture `v11-sample-markers.sfxlab.json` has some.
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
  not after a reload. So *Revert* must either have kept the original's facts, or rebuild them from its bytes (decode
  for the rate, length and channels; the container's magic bytes for the extension).

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
* **The sampler's *loop* mode** repeats from *Start* to the sample's end (`sampler.node.ts`). A loop range would be an
  engine change: the node reads only `SampleData` and its params.
* **Tests that read the toolbar and status:** `wave-editor.smoke.spec.ts` (*View ▾* entries, the status text),
  `views-at-min-size.smoke.spec.ts` (the editor at 480 × 240), `profile-status.cjs` `wave` (56 component renders a
  second).

## Design

### Marks in `core`

* **`core/sample/sample-marks.ts`**, pure, on a `SampleInfo`: `addMarker(info, frame, name?)`, `moveMarker`,
  `renameMarker`, `removeMarker`, `addRegion(info, range, name?)`, `updateRegion(info, id, { from?, to?, name? })`,
  `removeRegion`. Frames are clamped to `savedFrameCount(info)` and rounded; a region keeps `from < to` (at least one
  frame); at `SAMPLE_MARK_LIMITS` an add returns the info unchanged; names are cut to 60 characters. Default names are
  *Marker N* and *Region N* (the lowest N not in use). Ids from `createId('marker')` and `createId('region')`. Markers
  and regions are kept **sorted** (by frame, then by `from`), so drawing and `[` `]` walk them in order.
* **`core/project`**: `updateSampleMarks(project, sampleId, change)` applies one of those to the library entry; the
  project store gets `editSampleMarks(sampleId, change, mergeKey?)`. A drag passes `marker:<origin>:<id>` or
  `region:<origin>:<id>:<edge>`, so it is one undo step.

### The chain of edits, for *Revert*

* **Remap steps as data.** `RemapStep` is `{ kind: 'splice', from, to, inserted } | { kind: 'crop', from, to } |
  { kind: 'mirror', from, to }`. `remap.ts` gains `mapOf(step)` (the `FrameMap` it is) and `inverseStep(step)`, and
  each shape constructor is written over a step, so a map and its data can't disagree. `SAMPLE_EDITS` entries' `remap`
  return a step (or none for the identity); `sampleRemap` and `replaceSample` keep taking maps.
* **`SampleInfo.lineage?`** `{ original: { extension, bytes, channels, durationSeconds, sampleRate }, steps:
  RemapStep[] }`. `replaceSample` sets it on an in-place edit: the first edit of a sample with no `origin` records the
  original's facts from the entry being replaced; every edit appends its step (identities add nothing). At most
  `MAX_LINEAGE_STEPS` (256) steps: past that the chain is dropped (and *Revert* falls back, below). An optional field:
  an older build drops it silently and only loses an exact revert (decision 4 in [decisions](../decisions/README.md)),
  so **no format version**. The sanitizer checks it like the marks.
* **`revertRemap(info)`**: the inverse steps, last first, composed into one `SampleRemap` from the present length to
  the original's. Trims, markers and regions go back exactly; ones only in pasted or inserted audio go to its start
  (trims, as `start` does) or are dropped (markers, empty regions), as for any edit.

### *Revert to original* (`app`)

* **`SampleLibrary.revertSample(sampleId)`**, the one call, beside `editSample` and through the same commit: read the
  origin's bytes from storage (absent: an error toast, "The original of *name* is missing; import the file again"),
  decode them, send `sample/add`, and `replaceSample(project, id, original, revertRemap(info))` as one undo step, if the
  sample is still in the project. The result has the present name, no `origin` (it is the origin), no `lineage`, and
  the reverted markers and regions. The editor follows it by origin, as after any edit.
* **The original's `SampleInfo`** comes from `lineage.original`. A sample edited before this part has no lineage: its
  facts come from the decoded bytes, and its extension from the container (`sniffAudioExtension(bytes)`: RIFF, ID3 or
  an MPEG frame, OggS, fLaC, ftyp; else the present one).
* **Without a chain** (edited before this part, or past 256 steps) trims keep their fractions, markers and regions
  scale by the length ratio, and a toast says "Positions couldn't be followed back exactly".
* **The action** `sample-selection.revert` (*Revert to original*), the last entry of the `process` group (so in
  *Process ▾* and the right-click menu), under a separator. Disabled, with the reason as its tooltip, while an edit
  runs or when the sample is its own origin ("This is the original").

### The mark lane (`ui/wave-editor/MarkLane.tsx`)

* A **20 px row** between the ruler and the lanes, in the editor's second grid column (its first column says
  *Marks*). One canvas, drawn like the ruler: subscribed to the view store, redrawn in an animation frame on zoom,
  scroll and resize, and when the sample's marks change. React renders it only when the marks change.
* **Drawn:** a region as a band with its name (clipped to the band), a marker as a flag with its name; a marker also
  as a 1 px line through the lanes (`LaneOverlay.markers`), a region's edges as faint lines. The selected region (the
  selection equals it) is in the accent colour.
* **One trigger, subjects from the pointer:** the lane is an `ActionMenu` trigger whose subject is set in its own
  `onContextMenu` (`markAt(view, marks, x)`: the marker within 4 px, else the region under it, else none), as the canvas
  and arrangement lanes do. So 256 marks are one element, not 256.
* **Gestures** (in `useMarkGestures`): drag a marker to move it; drag a region's edge (within `EDGE_PX`) to move that
  edge; click a region to select it (and put the cursor at its start); double-click a mark to rename it; a click on
  empty lane sets the cursor. Drags snap (below) and auto-scroll past the edges, as selection drags do.
* **Rename in place:** a `RenameField` positioned over the mark while `useRenameStore` names it, as elsewhere.
* **At the minimum size** (the editor under 300 px high, a container query) the lane folds: it collapses to 6 px, marks
  show as ticks, and its gestures and menu still work on them. Markers keep their lines through the lanes.

### Subjects and actions

* **`{ kind: 'sample-marker', sampleId, markerId }`** (`state/actions/sample-marker.ts`): *Go to* (cursor there, the
  view follows), *Rename* (`renameAction`, verb `rename`), *Delete* (verb `delete`). Named "*Marker 1* in *Kick*".
* **`{ kind: 'sample-region', sampleId, regionId }`** (`sample-region.ts`): *Select*, *Play*, *Zoom to region*,
  *Rename*, *Delete* (verb `delete`). Named "*Region 1* in *Kick*".
* **`sample-selection`** gains *Add marker* and *Make region* (disabled without a selection, or at 256) in a new group,
  **`marks`**, between `process` and `view`; and *Revert to original* (above). The group order becomes `open, edit,
  clipboard, delete, process, marks, view`.
* `commitRename` gains the two kinds; `subjectName` names them.

### Snap (`ui/wave-editor/snap.ts`, `core/sample` for zero crossings)

* **Settings:** `snapBeats` and `snapZero` in `useWaveEditSettings`, per browser (`sfxlab:wave-snap`), off. *View ▾*
  shows *Snap to beats* (disabled while the ruler counts time) and *Snap to zero crossings*, checked when on.
* **`snapFrame(frame, targets, view)`**: the nearest target within `SNAP_PX` (8) columns, else the frame. **Targets**,
  while either snap is on: the beat grid's lines at the ruler's present step (`rulerTicks` in beats; only with *Snap to
  beats* on and the ruler in beats); zero crossings (only with *Snap to zero crossings*); every marker and region edge.
* **`nearestZeroCrossing(audio, frame, channels, radius)`** (`core/sample/audio-math.ts`): the nearest frame within
  `radius` where the average of the selected channels changes sign or is zero; null when there is none.
* **What snaps:** a click's cursor, a selection drag's moving end, a selection edge drag, a marker drag and a region
  edge drag. *Add marker* puts the marker exactly at the cursor. **Keys don't snap**: they move by columns, which is
  already exact. **Alt** held during a gesture turns snapping off for it.

### Keys

| Keys | What |
|---|---|
| M | *Add marker* at the cursor (F2 then renames it) |
| R | *Make region* from the selection |
| `[` `]` | Cursor to the previous or next marker or region edge; with Shift, extend the selection there |

A mark's Delete and F2 come from its subject's verbs, in its menu and the palette.
`waveKeyAction` takes the sample's marks for `[` `]`; M and R return `{ mark: 'marker' | 'region' }` for the handler
to run the actions. Rows in `VIEW_KEYS`.

### Double-click

The lanes' double-click selects the region under the pointer on the channels the rule takes (`channelsAt`); outside
every region, the whole sample, as now. A region inside another: the innermost (the shortest).

## Steps

Each step lands green: `npm test`, `npm run typecheck`, `npm run test:smoke` (outside the sandbox). No engine changes,
so the bounce hashes hold.

1. **Marks and remap steps in `core`.** `sample-marks.ts`, `updateSampleMarks`, `RemapStep` with `mapOf` and
   `inverseStep`, the edits' `remap` as steps, `lineage` in `replaceSample` and the sanitizer, `revertRemap`,
   `nearestZeroCrossing`, `sniffAudioExtension`.
   *Tests:* each mark edit as a table (clamping, order, limits, names, default names); every edit kind's step against
   its old map for 200 random positions and ranges; `inverseStep` round trips positions that survive; a chain of five
   edits reverted against positions recorded before them (trims, markers, regions); `lineage` set on the first edit,
   appended after, dropped past 256; the sanitizer keeps a good lineage and drops a bad one; zero crossings on a sine,
   on silence and with none in range; the sniffer on each container's first bytes.
2. **Store, subjects and actions.** `editSampleMarks` with merge keys; `sample-marker` and `sample-region` subjects,
   their actions, names and renames; *Add marker*, *Make region* and the `marks` group; the snap settings.
   *Tests:* actions enabled and disabled (no selection, at 256, the sample gone); a drag's merge key gives one undo
   step; rename commits one step; verbs from the subjects; `describeActions` order with the new group.
3. **Revert.** `revertSample` in `app`, the action, toasts.
   *Tests* (`app`, memory storage): revert after delete, crop, paste and reverse puts clips' trims, markers and regions
   back where they were; a sample edited without a lineage reverts with fractions and the toast; a missing original
   refuses; undo of a revert brings the edited version back; a sample that is its own origin can't revert.
4. **The mark lane.** `MarkLane`, the lines through the lanes, `markAt`, `useMarkGestures`, rename in place, the
   container query.
   *Tests:* `markAt` (a marker, a region, a marker over a region, nothing); region edge hit testing.
   *Browser:* M adds a marker that shows in the mark lane; dragging it moves it and one undo puts it back; double-click
   renames it; R makes a region from a selection; clicking the region selects it; dragging its edge resizes it; a
   delete before the marker moves it left; `views-at-min-size` with the folded lane.
5. **Snap and keys.** `snapFrame`, the targets, Alt, *View ▾* toggles; `[` `]`, M, R in `waveKeyAction`; the lanes'
   double-click on regions; `VIEW_KEYS` rows.
   *Tests:* `snapFrame` as a table (each target kind, out of range, the nearest of two, Alt); `waveKeyAction` rows for
   `[` `]` with and without Shift, at the ends, with no marks.
   *Browser:* with *Snap to zero crossings* on, a click lands on a crossing (the status's frame); with *Snap to beats*,
   a drag's end lands on a beat; `]` jumps to the next marker; a double-click inside a region selects it.
6. **Docs and the profile.** `architecture/samples-and-wave-editor.md` (marks, the mark lane, snap, revert, lineage),
   `architecture/workbench.md` (the two subjects, the `marks` group), `reference/formats-and-versions.md` (`lineage`,
   `sfxlab:wave-snap`); the notes sorted per [doc-workflow](../dev/doc-workflow.md); STATUS and BACKLOG; the profile.

## Behavior changes

* The editor gains a 20 px mark lane under the ruler (folded at the minimum size).
* *Process ▾* and the right-click menu end with *Revert to original*; the right-click menu gains *Add marker* and
  *Make region*; *View ▾* gains the two snap toggles.
* M, R, `[` and `]` are new view keys. A double-click inside a region selects the region, not the whole sample.
* An in-place edit records its position map on the sample (`lineage`): a project gets a few dozen bytes per edit.
* Snapping is off until turned on; nothing moves differently until then.

## Verification

* `npm test`, `npm run typecheck`, `npm run test:smoke` at every step.
* **Profile:** `wave` stays at 56 component renders a second with the preview playing and a few marks present; the
  mark lane redraws in the animation frame like the ruler, with no React render on zoom or scroll.
* **Measure:** `revertSample` for a 120 s stereo sample (decode, add, commit), and `nearestZeroCrossing` at the
  widest zoom, recorded in "Changes made while implementing".
* **Manual pass** (BACKLOG V10 grows): marker and region drags on a trackpad, Alt with a drag, rename in place, the
  folded lane.

## Decisions to sign off

| Question | Proposed | Alternative |
|---|---|---|
| How *Revert* finds where positions were | **Keep the chain:** each in-place edit appends its position map as data (`lineage.steps`, a few numbers), and *Revert* runs them backwards, so clips, markers and regions land exactly where they were | Keep trims as fractions and scale markers and regions by the length ratio (what 11b deferred); simpler, but a delete earlier in a sample shifts what clips play after a revert |
| Where the original's facts come from | **Recorded on the first edit** (`lineage.original`); rebuilt from the bytes (decode, sniff the container) for samples edited before this part | Always rebuilt from the bytes |
| The new field's format | **Optional `lineage`, no version bump:** an older build drops it and only loses an exact revert (decision 4) | v12 with a migration and a fixture |
| How long the chain may get | **256 steps,** then dropped (revert falls back to fractions, with a toast) | No limit |
| Marks on screen | **A 20 px mark lane** under the ruler, plus marker lines through the lanes; it folds to 6 px under 300 px of height | Marks only on the ruler, no lane |
| Marks as subjects | **Subjects of their own** (`sample-marker`, `sample-region`) with menus, verbs and palette rows, from one trigger whose subject is the mark under the pointer | Only in the selection's menu (*Delete marker at cursor*) |
| Editing regions | **Edges drag** in the mark lane (`EDGE_PX`), the band selects | Only *Make region*, rename and delete; redo a region to change it |
| Snap targets | **Beats** (ruler in beats, *Snap to beats* on), **zero crossings** (*Snap to zero crossings*), and **markers and region edges** whenever either is on; within 8 px; pointer gestures only | A third toggle for markers; or keys snap too |
| Turning snap off for one gesture | **Alt held** | No modifier: toggle in *View ▾* |
| Zero crossings on stereo | **Where the average of the selected channels crosses** | The left channel's; or both channels at once (rarely the same frame) |
| Keys | **M** marker, **R** region, **`[` `]`** previous and next mark (Shift extends) | M only, the rest from menus and the palette |
| Where *Add marker* and *Make region* sit | **A `marks` group** between the processes and the view entries | In `edit`, at the top of the menu |
| Where *Revert to original* sits | **Last in *Process ▾* and the `process` group,** under a separator | A button in the toolbar's sample group |
| Markers with copied audio | **Not carried:** the clipboard holds audio; a paste adds none | Copy the marks inside the selection and paste them with it |
| Loop points for the sampler | **Not in this part:** the sampler's loop runs from *Start* to the end, and a loop range is an engine change (the node reads only the audio and its params), which old projects' bounce hashes must survive; a BACKLOG item | A `loop` region kind the sampler reads, sent with `sample/add` |

## Changes made while implementing

Nothing yet.
