---
status: active
date: 2026-11-04
note: "Signed off 2026-11-01, every decision as proposed; 12a done 2026-11-04. Splits round 12 into 12a (headers and the timeline frame), 12b (markers and the loop), 12c (automation lanes on the timeline, groups included) and 12d (touch recording into the arrangement)."
---
# Round 12: the arrangement editor (spec)

Status: **spec, signed off** 2026-11-01, every decision as proposed. Round 12 can now be planned, part by part; **12a is done** (2026-11-04, [plan](../archive/ui-redesign/PLAN-round-12a-timeline-frame.md)); 12b has its [plan](PLAN-round-12b-markers-and-loop.md). Written 2026-11-01 on `feat/ui-redesign` at `5823b9d` (round 11 done). No code
was changed. Part of the [UI redesign](../archive/ui-redesign/README.md);
[roadmap § Round 12](ui-redesign-roadmap.md#round-12-arrangement-editor) gives the outline, and
[BACKLOG](../BACKLOG.md) U2 is the item. It follows the shape of the [round 11 spec](../archive/ui-redesign/SPEC-round-11-wave-editor.md) and
the [handling and spectrum spec](../archive/ui-redesign/SPEC-wave-editor-handling-and-spectrum.md).

The round plans take their steps, their browser tests and their verification from here. Where this spec and a plan
disagree later, the plan wins and says so.

**One rule for every choice below, as in round 11: do what the rest of the app already does.** The wave editor, the
piano roll, the session grid and the mixer have settled most gestures; the arrangement takes theirs. Where the app has
no precedent, it takes the most common behavior of arrangement views (Ableton's, since the session grid already follows
Ableton) and leaves a seam for a setting.

## Goal

The arrangement prototype becomes an editor a song can be finished in. After round 12:

* **track headers** sit beside the lanes and stay there while the timeline scrolls sideways; they carry the name, mute,
  solo and the automation toggle. Groups fold in them, and returns and the master get lanes too;
* **the timeline zooms and scrolls** like the wave editor: from a whole song in the width down to sixteenths, around
  the pointer, to fit and to the selection, with middle-drag and a playhead that can be followed;
* **the arrangement has a position:** a click in the ruler sets where playback starts, ▶ plays from there and ■ goes
  back there;
* **markers and a loop brace** sit in a lane over the ruler; with the loop on, the arrangement plays the brace's range
  over and over;
* **automation lanes run on the timeline,** in song beats, for every owner: tracks, returns, the master and **group
  buses**, which round 8 left without lanes. A region's own clip lanes play inside it too;
* **touch recording writes into the timeline** while the arrangement plays, into any owner's controls, a group's fader,
  pan, sends and effect knobs among them;
* **a region opens** in Clip with its playhead and its own lanes, and its sample in the wave editor (as today).

**Out of scope** (see § Wishes, later):

* recording notes or audio into the arrangement. "Recording" in this round is touch recording of controls;
* a time selection across lanes, several regions selected at once, and the edits they bring (split, consolidate,
  insert or delete time, move a range of lanes). Selection stays one region at a time;
* tempo and time-signature changes along the timeline: one tempo, 4/4, as everywhere in the app;
* lane heights the user drags, and showing a region's own lanes on the timeline;
* freezing, comping, crossfades between regions, warping beyond *Re-pitch*;
* exporting the loop range on its own.

## Inventory

What exists on `feat/ui-redesign` at `5823b9d`.

### The arrangement view

`ui/arrangement/` has three components and a stylesheet ([clips-and-arrangement](../architecture/clips-and-arrangement.md#the-arrangement-clips-on-a-timeline)).

* **`ArrangementView`** (253 lines) draws a toolbar (▶ *Arrangement*, ■, a zoom slider, a hint) and **one scroller for
  both axes**. Inside it, every lane is a CSS grid of two columns, the name (`--name-width`, 120 px) and the row. So
  the names scroll away with the timeline when it scrolls sideways; only the ruler is sticky, at the top.
* **Lanes:** one per shown instrument or audio track, in `visibleRows(trackRows(project))` order, and a `GroupLane`
  before a group's members with a twisty. Collapsed, a group lane shows its members' regions as thin bars. **Returns
  and the master have no lane.** A folder and a bus group look the same.
* **The name** (`LaneName`) selects the track on click, carries the track's menu, drags and takes drops for reordering.
  It has **no mute, solo or arm**, and no volume. The session grid's `TrackHeader` has a volume slider but no M or S
  either (BACKLOG C3); M and S are only in the mixer, as `track.mute` and `track.solo` actions.
* **Zoom** is a slider from 8 to 64 px per beat, kept per browser (`sfxlab:arrangement-zoom`). No ⌘-wheel, no fit, no
  zoom to selection, no keys. At 8 px per beat a 100-bar song is 3200 px: it can't be seen whole.
* **The ruler** is a `<span>` per bar, numbered from 1. No beats, no time, no click.
* **Snap** is fixed: `snap()` rounds to a quarter beat, for drops, moves and resizes. No grid setting, no Alt.
* **The timeline's length** is at least 32 bars and always 4 bars past the last region.
* **Regions** (`ArrangementRegion`) are DOM elements placed by `left` and `width`; a drag moves them (across lanes
  too) or resizes the right edge, merging into one undo step. They are focusable; Enter or a double-click opens Clip.
* **The playhead** (`ArrangementPlayhead`) is drawn in every lane from `status.beat` whenever the transport plays, **in
  session mode too**: the status doesn't say which source plays, so the line moves across the timeline while scenes
  play.
* **Transport:** the toolbar's ▶ sends `arrangement/play` with `fromBeat` 0 (its comment says it resumes; it doesn't:
  `playArrangement` defaults to 0). ■ is `transport/stop`, which rewinds to 0. There is no position to start from, no
  seek in the UI, no loop. The transport bar's ▶ plays the session.

### The model and the engine

* **`ArrangementClip`** (`core/project/arrangement-clip.ts`): `{ id, trackId, startBeat, content, loop? }`. `content` is
  a copy of a session clip, **its `automation` lanes included**. `Project.arrangement` is optional; at most 2000 regions
  (`LIMITS.arrangementClips`).
* **`sanitizeArrangement` drops `loop`.** It rebuilds each region as `{ id, trackId, startBeat, content }`, so a looping
  region stops looping after a reload. No test covers it. It also passes no owner to `sanitizeClip`, so a region's
  lanes are kept whatever owner they name.
* **Playback** is derived from the position (`ArrangementPlayer`, `ArrangementNotes`, `ArrangementAudio`): a seek plays
  what is under the playhead, audio joins in phase. `arrangement/set` pushes the whole list; each runtime keeps its own.
* **Modes:** `Engine.playbackMode` is `'session' | 'arrangement'`; `arrangement/play` switches to the timeline,
  `transport/play`, `clip/launch` and `scene/launch` back. **`EngineStatus` doesn't carry the mode.**
* **`Transport`** has `play`, `stop` (rewinds to 0), `seek` and `advance`. **No loop.** Nothing splits a block at a
  loop end.
* **The bounce's** `arrangement` scope renders from beat 0 to the last region's end, then the tail.
* **Regions don't play automation.** `EngineAutomation` follows launch queues (session clips, return and master slots);
  in arrangement mode the launchers are reset, so a region's copied lanes are kept and silent. Clip says so for a
  selected region ("no automation and no playhead for a region yet").

### Automation

([control-and-automation](../architecture/control-and-automation.md))

* **Lanes** (`core/automation/types.ts`): `{ id, target, enabled, points }`, points `{ id, beat, value, interpolation }`
  with normalized values, at most 64 lanes per holder and 2048 points per lane. Beats are clip-relative, in
  `[0, length]`; `canonicalAutomationPoints(points, length)` sorts, collapses and clamps.
* **Holders:** `Clip.automation` and `AudioClip.automation` (an instrument or audio track's own targets), and
  `AutomationSlot` on returns and the master (scene-indexed). **A group has no holder.** `automationSlotsOf` returns
  nothing for it, the parsers warn "unsupported owner" for a group lane, `control.show-automation` says "not on a group
  yet", and touch on a bus control authors its base.
* **The engine** (`core/engine/automation.ts`, 167 lines): `EngineAutomation.tick(from, to)` takes each owner's playing
  clip from its `LaunchQueue`, evaluates its lanes at the clip's phase and calls `write(target, value, base)`.
  `Engine.writeAutomation` turns writes into per-block curves (or note writes) for **any** owner: a group's bus is
  keyed by the group's id, as overrides and MIDI already reach it. Configuration arrives as `automation/configure`, a
  list of `AutomationTrack { trackId, slotOwner?, noteGraph?, clips }`, compiled from the project by `diffProject`.
* **The editor** (`ui/automation/AutomationEditor.tsx`, 132 lines) is an SVG with a 0..1000 viewBox over the clip's
  length: a lane picker, points added, dragged, multi-selected, copied and pasted, a step and a zoom. Its pointer and
  point logic are inside the component, not in pure functions.

### Touch recording

* **`state/touch-store`**: one global arm (● *Touch* in the transport bar, `transport.touch`). `touchDestination`
  finds the owner's **playing session clip or slot**; for a group it finds nothing, by design. Captures are per
  gesture and source, in beats relative to the destination's start; `finishTouch` commits through `applyTouch`.
* **`applyTouch(lane, samples, length, base)`** (`core/automation/record.ts`) splits a capture at wraps of `length` and
  replaces only the touched span of each pass, keeping what is around it. A take is at most 256 beats
  (`MAX_TOUCH_BEATS`), 16,384 samples and 64 targets.
* **The recording clock** (`audio/recording-clock`) turns event timestamps into beats across tempo and transport
  changes. It has never seen a loop jump, since the transport has none.

### Tracks and groups

([tracks-and-groups](../architecture/tracks-and-groups.md))

* `trackRows` and `visibleRows` give the rows, depth first, groups before their members, returns after the clip
  tracks. `mixRouting` gives each channel its effective mute and solo, through its groups.
* Group mute and solo exist on every group (folders too); `group.mute` and `group.solo` are actions. A bus has a
  fader, pan, sends and an insert graph; a folder has none of these.
* `collapsed` and `hidden` are view fields: saved, not undone (`editView`, `withViewOf`).

### Opening a region

* `region.edit` (*Edit*, Enter, double-click) selects the region and reveals Clip, which edits its own copy through
  `ClipRef { kind: 'region' }` (round 6). The piano roll and the audio clip editor are told `playhead={false}`; no
  automation toggle.
* `region.edit-sample` (*Edit sample*) opens an audio region's sample in the wave editor at the part it plays, through
  `openSampleEditor(sampleId, range)` (round 11b). An in-place edit there remaps the region's trim with every other use.
* `region.edit-session-clip` opens the session source while it exists.

So the roadmap's "opening a region in the clip editor and in the wave editor" exists; what is missing is Clip's
playhead and automation for a region.

### The wave editor's timeline pieces

What an arrangement timeline could share, all in `ui/wave-editor/`, all in **frames**:

| Piece | Where | Generic already? |
|---|---|---|
| A view: start, units per pixel, width | `WaveView` (`core`), `clampView`, `zoomAround`, `zoomTo`, `fitFramesPerPixel` (`wave-geometry.ts`) | The math is; the names say frames |
| Ruler ticks at a readable step | `ticksEvery(view, framesPerUnit, steps, label)`, `formatBeat`, `formatTime` (`ruler-ticks.ts`) | Yes, but private |
| Snap to targets within 8 px, Alt off | `snapFrame`, `SnapTarget`, `SNAP_PX` (`snap.ts`) | Yes, over numbers |
| Auto-scroll past an edge, middle-drag pan | `autoScrollFrames`, `use-wave-gestures.ts` | The function is; the hook is the wave editor's |
| Marks: markers, ranges, edges, hit-testing | `markAt`, `markEdgeAt`, `markLines` (`mark-geometry.ts`), `MarkLane.tsx`, `use-mark-gestures.ts` | Over `SampleMarker` and `SampleRegion` |
| Canvases the size of what is visible, redrawn in a frame | `Ruler.tsx`, `WaveLane.tsx` | The pattern |
| View keys as one pure function | `waveKeyAction` (`wave-keys.ts`) | No: frames, channels, a sample |

The piano roll has its own ruler (`clip-editor/Ruler.tsx`) and its own follow rule (`Playhead.tsx`: when the playhead
leaves the view, scroll so it sits 15% in).

### Noticed, not this round's

* The session grid's track header has no M or S (BACKLOG C3). The arrangement's headers get them here; the session's
  can reuse the same buttons later.
* `track.show-automation` and `control.show-automation` open a session clip's lane. With timeline lanes they need a
  choice (below).

### What the inventory changes in the roadmap's outline

* **"Opening a region" is mostly done.** What is left is Clip's playhead and lanes for a region, which need the
  timeline to play region lanes first.
* **"Arm" has nothing to arm.** The only recording is touch, and its arm is global. A per-track arm means something
  once notes or audio are recorded into the arrangement, which is out of scope. The headers get M and S, and the
  automation toggle where the arm would go (decision below).
* **Automation on the timeline is a new holder,** not a new kind of lane: lanes in song beats per owner, beside clip
  lanes and slots. The evaluator, the curves, the touch merge and the limits stay; the engine gains a second source of
  playing lanes beside the launch queues.
* **Returns and the master need lanes** on the timeline to hold their automation, so the arrangement shows them, below
  the clip tracks, without regions.
* **A loop needs the transport,** not only the view: the engine has no loop, and the recording clock has never seen a
  jump back.
* **Two bugs to fix on the way:** the sanitizer dropping `loop`, and the playhead moving in session mode.

## Design

### Where each part lives

| Part | `core` | `state` | `ui` | Crosses the worklet |
|---|---|---|---|---|
| Timeline geometry (view, ticks, snap, marks) | | | `ui/shared/timeline/`, shared with the wave editor | no |
| Headers and lanes | `arrangementRows` (owners in order) | | `ArrangementView` rebuilt | no |
| Position, follow, zoom | | `arrangement-view-store` | toolbar, ruler | `arrangement/play` with `fromBeat` (exists) |
| Playback mode in the status | `EngineStatus.mode` | | playheads | status gains `mode` |
| Markers | `Project.arrangementMarkers`, edits | actions | mark lane | no |
| Loop brace | `Project.arrangementLoop`, edits; `Transport` loop | actions | mark lane, toolbar | `arrangement/setLoop` |
| Timeline lanes | `Project.arrangementAutomation`, edits, sanitizer | `editTimelineAutomation` | lanes under each header | `automation/configure` gains `timeline` |
| Region lanes playing | `ArrangementAutomation` (engine) | | Clip for a region | no new command |
| Touch into the timeline | `applyTouch` unchanged | `touchDestination` gains the timeline | feedback texts | no |
| Format | v13 | | | |

### 1. The timeline frame and the headers (12a)

**Layout.** The view becomes a toolbar over one scroller, as today, but the scroller's content is a grid of **three
regions**: the corner, the ruler (sticky at the top) and the mark lane; the **header column** (sticky at the left);
and the lanes. Sticky positioning keeps the headers and the lanes in one vertical scroll with no JavaScript to sync
them, and a horizontal scroll moves only the lanes and the ruler. (The alternative, two scrollers synced by script, is
what DAWs built on native widgets do; in a browser it lags a frame on a trackpad.)

**Rows.** `arrangementRows(project)` in `core` gives the timeline's rows from `visibleRows(trackRows(project))`, then
one row per return and one for the master:

| Row | Header | Lane |
|---|---|---|
| Instrument or audio track | twisty for its lanes, name, M, S | its regions |
| Group with a bus | fold twisty, name, M, S, lanes twisty, a *bus* tag | collapsed: its members' bars, as today; expanded: empty |
| Group without a bus (folder) | fold twisty, name, M, S | as above; no lanes to show |
| Return | lanes twisty, name, M, S | empty: returns hold no regions |
| Master | lanes twisty, *Master* | empty |

* **Mute and solo** are the mixer's `MuteSolo` buttons (`ui/mixer/ChannelStrip.tsx`, moved to `ui/shared/`), running
  `track.mute`, `track.solo`, `group.mute` and `group.solo`: lit for the row's own flag, half lit when it comes through
  a group, from `mixRouting`. A muted row's name is struck through, as the session's group header does. A return has
  them as in the mixer; the master has neither.
* **The header column** is 180 px, resized by a `Splitter` (the shell's, keyboard-operable) between 120 and 320 px, kept
  per browser. At the editors' minimum width (480 px) it stays at 120 px.
* **Group colours, depth and drag** work as today's `LaneName` and `GroupLane`: indent per level, the stripe, the
  track's or group's menu, drag to reorder, drops of presets on a bus.
* **Height.** A region lane is 56 px, as today; an automation lane 40 px. User-sized lanes are a wish.
* **Returns and the master go last,** after the clip tracks, as in `trackRows`. Hidden tracks have no row, as today.

**The view.** A `TimelineView { start, unitsPerPixel, width }` in beats, the same type the wave editor uses in frames
(below). Per browser, in `state/arrangement-view-store.ts`, like the wave editor's store: zoom, scroll, follow, the
grid, the header width. Not saved with the project and not undone.

* **Zoom** runs from the whole timeline in the width down to 256 px per beat (a sixteenth is 64 px). ⌘ or Ctrl with
  the wheel, and a pinch, zoom around the pointer; the wheel scrolls vertically, Shift+wheel and a trackpad sideways,
  as in the patcher. The slider stays, mapped logarithmically.
* **Zoom to fit** shows from beat 0 to the timeline's end (the last region's loop end, the loop brace's end and the
  last marker, whichever is last). **Zoom to selection** shows the selected region with a bar on each side; with no
  region selected, the loop brace; with neither, it is disabled.
* **Middle-drag pans**, and a region or edge dragged past the view's side **auto-scrolls**, with the wave editor's
  functions.
* **The ruler** counts bars and beats (`formatBeat`), at the step `ticksEvery` picks, with bar lines across the lanes at
  the same step. Time is not offered: the arrangement is in beats, and one tempo makes them the same.

**Snap.** A **grid** setting in the toolbar: *Bar*, *Beat*, *1/2*, *1/4* (the default, today's quarter beat), *1/8*,
*1/16*, *Off*. Region moves, edge drags, drops and marker drags snap to the grid; with snap on, they also snap to
markers, the loop's edges and other regions' edges within 8 px (`snapFrame`'s rule). **Alt held during a drag doesn't
snap**, as in the wave editor.

**Position and playback.**

* **The position** is where arrangement playback starts: a line in the ruler, in the arrangement-view store (not
  saved). A click in the ruler sets it; while the arrangement plays, the click also seeks there (`arrangement/play`
  with `fromBeat`, which already plays what is under the playhead).
* **▶ *Arrangement*** plays from the position. **■** stops, and the position stays where it was, so ▶ again starts
  from the same place (Ableton's default). Pressing ■ while stopped sets the position to 0.
* **`EngineStatus.mode`** (`'session' | 'arrangement'`) is new. The arrangement's playhead shows only in arrangement
  mode, and the session's in session mode.
* **The transport bar** stays as it is: its ▶ and Space (`transport.play-stop`) play the session, and the
  arrangement's own ▶ plays the timeline. Space stops either. Making the transport bar's ▶ and Space follow the visible
  view is a decision below.

**Follow playhead.** A toggle in the toolbar, kept per browser, on by default. Following uses the piano roll's rule
(when the playhead leaves the view, scroll so it sits 15% in). A horizontal scroll or zoom by the user while playing
turns follow off for that playback, and the toggle shows it; the next ▶ turns it back on.

**Keys.** The lanes become focusable, as the wave editor's are, and give a **timeline focus subject** whose view keys
are one pure function, `timelineKeyAction`, like `waveKeyAction`:

| Key | Does |
|---|---|
| ← → | move the position a grid step (Alt: a tenth of the view) |
| Home, End | the position to 0, or to the timeline's end |
| + (=), − | zoom around the position |
| Z, Shift+Z | zoom to selection, to fit |
| F | follow on or off |
| M | add a marker at the position (12b) |
| L | loop on or off (12b) |
| `[`, `]` | the position to the previous or next marker or loop edge (12b) |

They are listed read only in the shortcuts dialog under *Arrangement*, and rebindable through round 10's table. Space
stays the transport's. A region keeps its own keys (Enter, Delete through the verbs, ⌘C, ⌘D).

**Shared with the wave editor.** The pure geometry moves to `ui/shared/timeline/`, generic over the unit:

* `TimelineView`, `clampView`, `zoomAround`, `zoomTo`, `fitView`, `xOf`, `unitAt`;
* `rulerTicks(view, unitsPerLabel, steps, label)` (today's private `ticksEvery`), `formatBeat`, `formatTime`;
* `snapTo(value, snapping, view, ignore?)` (today's `snapFrame`), `SnapTarget`, `SNAP_PX`;
* `autoScrollUnits` (today's `autoScrollFrames`);
* the mark geometry, over `{ id, at }` points and `{ id, from, to }` ranges (today's over `SampleMarker` and
  `SampleRegion`).

The wave editor keeps its names as one-line wrappers where it reads better, and its tests run unchanged. The gesture
hooks are not shared: the wave editor's select channels and bands, the arrangement's move regions.

### 2. Markers and the loop brace (12b)

**Markers** are `{ id, beat, name }` in `Project.arrangementMarkers`, at most 256, sorted by beat. They are **project
edits and undone**, a drag being one step (merge key `arr-marker:<id>`), as a sample's markers are.

* *Add marker* (M, the ruler's menu, the toolbar) adds one at the position, named "Marker *n*".
* A marker drags in the mark lane, renames in place (double-click or *Rename*, round 5's rename), deletes, and is
  jumped to: a click on it sets the position there, and `[` `]` step through them.
* Markers are drawn as a flag in the mark lane and a faint line down the lanes.

**The loop brace** is `Project.arrangementLoop: { from, to, enabled }`, in beats, at least one beat long.

* **The range** is set by dragging in the mark lane's empty space (a new brace), by dragging the brace's body (moves
  it) or edges, by *Loop selected region* in a region's menu, and by *Set loop to markers* ▸ (from one marker to the
  next). The range is a project edit, undone, a drag being one step.
* **On and off** is the toolbar's ⟳ *Loop* button and L. It is a **view field**, saved and not undone, as a group's
  `collapsed` is: turning the loop on and off while listening shouldn't fill the history.
* With the loop off, the brace stays drawn, dimmed.

**The engine loop.** `Transport` gains `loop: { from, to } | null`. In arrangement mode with a loop, the engine splits
every block at the loop's end and jumps the position to its start, sample-accurately, as a seek: the arrangement
players already derive what sounds from the position, so audio rejoins in phase and notes that start after `from` fire.
Notes held across the jump are released at it, with the 5 ms audio tail, as on any seek. Session mode ignores the loop.

* `arrangement/setLoop { loop: { from, to } | null }` carries it; `diffProject` sends it when the range or the toggle
  changes.
* **Playing from outside the loop** plays on into it and then loops (Ableton's behavior); playing from after it plays
  on and never loops.
* **The status** reports the beat after the jump. The recording clock learns the jump: its segments gain a *wrap*
  record, so a touch timestamp before the jump maps to the right pass.
* **The bounce** ignores the loop and renders the whole timeline, as today.

### 3. Automation lanes on the timeline (12c)

**The model.** `Project.arrangementAutomation?: readonly TimelineLanes[]`, one entry per owner that has lanes:

```ts
interface TimelineLanes {
  readonly owner: ControlOwner          // a track, a return, the master or a group with a bus
  readonly lanes: readonly AutomationLane[]
}
```

* The lanes are today's `AutomationLane`, with **beats from the song's start**. Every lane rule holds: normalized
  values, linear or hold, sorted, equal beats collapsing, at most 64 lanes per owner and 2048 points per lane, a lane
  only addressing its own owner's targets.
* **The timeline's length bound** is `MAX_TIMELINE_BEATS`, 4096 beats (1024 bars at 4/4), the `length` that
  `canonicalAutomationPoints` clamps to. Regions get the same bound on `startBeat` in the sanitizer.
* **Before the first point and after the last,** a lane holds the first or last value, as clip lanes do. A lane with no
  points, or disabled, doesn't play.
* **Edits** are pure functions in `core/automation` (`setTimelineLanes(project, owner, lanes)`), one undo step each,
  point drags merging per gesture, as in the clip editor. Moving a track, a group or a region changes no timeline lane:
  they belong to owners, not to regions.
* **Cleanup** follows the control values': `removeTrack` drops a track's entry; `ungroup`, `removeGroup` and a group
  losing its last track drop a group's; **switching a bus off keeps its lanes, unavailable**, for undo, as its control
  values and mappings are kept. Duplicating a track copies its timeline lanes onto the copy, remapped like its clip
  lanes.
* **A group owner is accepted here and only here.** Clip lanes and slots keep refusing it.

**Which lane plays.** In arrangement mode, for each target, at most one source:

1. a **timeline lane** of the target's owner, while it has points;
2. else a lane of the **region** playing on that track at the position: the region's own clip lanes, at the region's
   phase (`beat − startBeat`, wrapped by the clip length while the region loops, up to its loop end). Overlapping
   regions: the newest start wins, as for audio;
3. else the base.

So a session clip with a filter sweep sounds the same once placed on the timeline, and a timeline lane drawn over it
takes the control. In session mode nothing changes: timeline lanes don't play.

**A region moved to another track** has its own lanes' owners rewritten, as a session clip's are when it moves, so they
keep playing on the new track; targets the new track lacks are marked unavailable, as today.

**The engine.** `automation/configure` gains `timeline: readonly AutomationTrack[]`-shaped entries for the timeline
lanes and the regions' lanes, compiled against the current specs by `diffProject` like the others. A new
`ArrangementAutomation` (in `core/engine`) answers "which lanes play at beat *b*" from the position, the way
`ArrangementPlayer` answers "which regions sound". `EngineAutomation.tick` asks it in arrangement mode instead of the
launch queues; everything after that (overrides winning over lanes, `write`, curves per block, restoring bases when a
lane stops, the note-graph cadence) is today's code. The planning horizon also stops at a region's start or loop end and
at the loop's jump, as it stops at audio boundaries.

* **Performance:** with no timeline lanes and no region lanes, the arrangement source adds nothing per block (the
  no-lane overhead in STATUS § Accepted limits must not grow). The plan measures a 16-track arrangement with a lane per
  track against the same with session clips.
* **The bounce** gets the timeline lanes from `diffProject` like the live engine, so a bounce and playback agree.

**The lanes in the view.** Each owner's header has a lanes twisty (▸ *A*). Opened, the owner's timeline lanes appear
under its row, one per lane, each with its own header:

* **The lane header:** the target's name (`controlTargetLabel`), on/off (`enabled`), *Read* re-enable while
  overridden, the lane's menu (*Clear*, *Delete lane*, *Show in panel*). A *+ Lane* row at the bottom has today's
  target picker (search, by graph and module).
* **The lane body** is a canvas the size of the visible part, redrawn in an animation frame, under the same ruler, grid
  and position as the regions. A region lane behind it is not drawn; the region's own lanes are edited in Clip.
* **Editing points:** today's clip editor's gestures, moved into pure functions in `ui/automation/point-gestures.ts`
  so both editors use one: click adds a point (snapped to the grid, value at the pointer), drag moves (Shift keeps the
  beat, Alt doesn't snap), Shift-click and a box select several, Delete removes, ⌘C, ⌘X and ⌘V copy and paste at the
  position, the segment menu switches linear and hold. A point drag is one undo step.
* **Show automation** on a control becomes a choice: *In the playing clip* (today's, for tracks, returns and the master)
  and *On the timeline*, which reveals the Arrangement, opens the owner's lanes, and adds the lane if it is not there.
  On a group's control only *On the timeline* exists, and the "not on a group yet" note goes.

**Clip for a region.** With region lanes playing, Clip shows a region's automation toggle and lanes (its `AutomationEditor`
edits the region's own copy through its `ClipRef`), and the piano roll, the audio clip editor and the lane editor draw a
playhead while the arrangement plays inside the region: `(beat − startBeat) mod lengthBeats` for a looping region, none
outside it.

### 4. Touch recording into the arrangement (12d)

**Where a take goes.** `touchDestination` gains a branch: while the engine plays the **arrangement**
(`status.mode`), the destination for any owner, a group with a bus included, is **the owner's timeline lane** for the
target, created on the first sample if missing. In session mode it is today's playing clip or slot, and a group still
authors its base.

* The capture's beats are song beats; `applyTouch` gets `MAX_TIMELINE_BEATS` as its length, so there is no wrap.
* **With the loop on,** a capture spans passes: the recording clock maps each sample to its pass, and `applyTouch` with
  the loop as the span replaces each pass's touched part in order, so the last pass wins where they overlap. The
  function already does this for clip loops; the timeline passes it an offset and the loop's length.
* **What it replaces:** only the span touched, keeping the lane around it, with today's boundary guards and
  simplification. A take that would pass 2048 points is refused whole, as today.
* **A region's own lane on the same target** stops sounding where the take lands, since a timeline lane with points
  wins (§ 3). The take doesn't touch the region's lanes.
* **Feedback** on the transport bar names the destination: "Touch → timeline", or today's texts in session mode. The
  touch button's tooltip says it records into "each owner's playing clip or slot, or the timeline while the arrangement
  plays".

**A group's controls.** The fader, pan and send knobs in the mixer's bus strip and in the session's group header, and
the bus's effect knobs on panels, pinned panels and the graph editor, all go through `createControlGesture` already,
so touch reaches them once the destination exists. MIDI-learned bus controls record the same way.

**Arm.** The transport bar's ● *Touch* stays the only arm. Headers carry no arm button (decision below).

### 5. Format

* **Version 13**, with an identity migration from 12 and a fixture (`v13-arrangement`), carrying
  `arrangementMarkers`, `arrangementLoop` and `arrangementAutomation`. A bump, as in round 11: an older build would
  drop a song's markers and lanes without a word. One bump covers the round; it lands with 12b, and 12c adds its field
  under v13 without a second bump, since no build ships from `feat/ui-redesign` between the parts (round 8's reasoning).
* **The sanitizer** keeps a region's `loop`, bounds `startBeat` by `MAX_TIMELINE_BEATS`, clamps markers and the loop to
  the timeline and drops a loop shorter than a beat, reads timeline lanes with the owner check (a lane naming another
  owner warns and is kept unavailable, as today), and keeps a group owner's entry only for a group that exists. Each
  repair warns.
* `reference/formats-and-versions.md` gets the row.

## Suggested split

Four parts, each landing green and usable alone, in this order:

1. **12a, the timeline frame.** The shared timeline geometry (the wave editor moved onto it), the header column with
   M, S and group folding, returns' and the master's rows, zoom and its keys, middle-drag and auto-scroll, the grid and
   snap, the position, follow, `EngineStatus.mode`, and the two fixes (the sanitizer's `loop`, the playhead in session
   mode). No format change.
2. **12b, markers and the loop.** The mark lane, markers, the brace, the transport loop and `arrangement/setLoop`, the
   recording clock's wraps, format v13.
3. **12c, automation on the timeline.** `arrangementAutomation`, its edits and sanitizer, `ArrangementAutomation` in the
   engine with region lanes, the lanes under the headers, the shared point gestures, *Show automation*'s choice, group
   lanes, Clip's playhead and lanes for a region.
4. **12d, touch into the arrangement.** The destination rule, takes over loop passes, groups' controls, the feedback.

12b and 12c don't depend on each other and could swap; 12d needs both (a take over loop passes).

## Tests

* **`core`:** `arrangementRows` (returns and the master last, hidden and collapsed left out); the timeline geometry
  against the wave editor's existing tables; the transport loop at block sizes 1, 97, 128 and 4096, a loop end inside a
  block, playing from before, inside and after the loop; notes released and audio rejoining in phase at the jump;
  `ArrangementAutomation` picking timeline over region lanes, the newest region, a looping region's phase, nothing in
  session mode; group-owner lanes writing the bus's fader, pan, a send and an effect parameter; the bounce with timeline
  lanes against live capture; the sanitizer (region `loop` kept, bounds, owner checks); the migration and the fixture;
  `removeTrack`, `ungroup`, `removeGroup` and `setGroupBus(false)` with lanes; `applyTouch` over loop passes with an
  offset.
* **`state`:** `touchDestination` in both modes for every owner kind; a take across a loop jump; marker and loop edits
  as undo steps, the loop toggle not one; follow turned off by a scroll.
* **Audio (real worklet):** a looped arrangement compared across two passes with an offline render; a group bus's
  fader lane against an offline render; touch on a bus fader while the arrangement plays, then reload and play.
* **Browser:** headers stay while scrolling sideways and scroll with the lanes; M and S on a track and a group; zoom
  with ⌘-wheel, fit and selection; a click in the ruler sets the position; follow; a marker added, dragged, renamed;
  the brace dragged and looped; a lane added from *Show automation* on a bus control, points drawn and undone; a region
  opened in Clip showing its playhead; the views-at-minimum-size spec with the header column at 480 × 240.

## Built to change

Every decision below sits behind one seam, as round 11 asked: **a decision is a constant, a table entry or one
function, and nothing else reads around it.**

| Decision | The seam |
|---|---|
| Sticky headers vs. synced scrollers | The header column is one component placed by the view's grid; nothing else knows how it stays beside the lanes. |
| Which rows the timeline has | `arrangementRows`; adding or dropping returns' and the master's rows is one filter. |
| Which lane plays (timeline over region over base) | One function in `ArrangementAutomation`, `laneAt(target, beat)`, tested as a table. Region lanes off is one branch. |
| Lanes per owner vs. per region | Timeline lanes go through `setTimelineLanes`, the engine through `automation/configure`'s `timeline`; the view asks one selector for an owner's lanes. |
| Group owners on the timeline | One predicate, `timelineOwnerAllowed(project, owner)`, used by the sanitizer, the edits and touch. |
| Touch's destination | `touchDestination` keeps one branch per mode; the take code doesn't know which. |
| The loop in the transport | `Transport.loop` and the block split in one place in the engine; session mode ignoring it is one condition. |
| The loop toggle as a view field | Kept with `collapsed` and `hidden` in `withViewOf`; making it an undo step is removing it there. |
| Stop returning to the position | One function in the arrangement's controls (`stopArrangement`). |
| Follow's rule, zoom limits, grid steps, header width | Constants and settings in `arrangement-view-store`, per browser. |
| Keys | Rows in round 10's table, through `timelineKeyAction`. |
| Limits (`MAX_TIMELINE_BEATS`, markers) | Constants in `core/project/limits.ts`; tests import them. |
| Shared timeline geometry | `ui/shared/timeline/`; either editor can fork a function without touching the other's callers. |

**What is hard to change later:**

* **Files written as v13.** Timeline lanes in song beats, markers and the loop stay readable forever.
* **Lanes belonging to owners.** Once songs hold timeline lanes, moving them into regions needs a migration that splits
  a lane at region edges.
* **Region lanes heard on the timeline.** Songs balanced with them would change if they stopped playing.

## Wishes, later

* Recording notes (and later audio) into the arrangement, which is where a per-track arm belongs.
* A time selection across lanes, several regions selected at once, split, consolidate, insert and delete time.
* User-sized lanes, and drawing a region's own lanes on the timeline.
* A tempo track and time-signature changes.
* Exporting the loop range, and stems from the arrangement (E7).
* The session grid's headers taking the same M and S buttons (C3).
* Showing a timeline lane's value in the mixer and panels as *Read*, with a "touch replaces from here" marker.

## Decisions to sign off

Signed off 2026-11-01: every row as proposed. § Built to change says how each can be revisited.

| Question | Proposed | Alternative |
|---|---|---|
| How the headers stay beside the lanes | **One scroller, headers sticky at the left, the ruler at the top:** sync for free | Two scrollers kept in step by script; lags a frame on trackpads |
| What a header carries | **Name, M, S and a lanes twisty** (groups: fold twisty too) | Also a volume slider and pan, as Ableton's tall headers do |
| A per-track arm | **None this round:** touch's global ● stays the only arm; an arm comes with note recording | A per-owner arm that limits touch to armed owners |
| Returns and the master on the timeline | **Rows after the clip tracks, without regions,** to hold their lanes | Their lanes only in a master/returns strip at the bottom |
| Where timeline automation lives | **Per owner, in song beats** (`arrangementAutomation`), beside clip lanes and slots | In the regions: lanes stretch and move with them, and groups, returns and the master can't have any |
| A region's own clip lanes on the timeline | **They play inside the region;** a timeline lane with points on the same target wins | They stay silent (as today), and placing a clip warns that its automation doesn't come along |
| Group lanes | **Groups with a bus only;** a folder has nothing to automate. Switching the bus off keeps them, unavailable | Also folders, for mute and solo lanes |
| Stop | **Returns to the position;** ■ while stopped goes to 0 | Rewinds to 0 every time, as today |
| The transport bar's ▶ and Space | **Unchanged:** they play the session, the arrangement's ▶ the timeline | Follow the visible view: the timeline while Arrangement shows |
| The loop's range and toggle | **The range is an undo step; on and off is a view field** (saved, not undone) | Both undo steps; or both per browser |
| Playing from outside the loop | **Plays on into it, then loops** | Jumps into the loop at once |
| The bounce and the loop | **Ignores it:** the whole timeline, as today | Offers the loop range as a scope |
| Zoom to selection | **The selected region, else the loop brace** | A time selection dragged across lanes (out of scope) |
| Follow | **On by default; a manual scroll turns it off until the next ▶;** the piano roll's 15% rule | Always on while the toggle is; page by page |
| Snap | **A grid setting (default 1/4), plus markers, loop and region edges within 8 px; Alt doesn't snap** | Fixed quarter beat, as today |
| Sharing with the wave editor | **The pure geometry moves to `ui/shared/timeline/`,** the hooks stay apart | Copy what the arrangement needs into `ui/arrangement/` |
| Timeline length bound | **4096 beats** (1024 bars) | No bound (regions have none today), with lanes clamped to the last region |
| Format | **v13 once, with 12b,** an identity migration and a fixture; 12c adds under it | Optional fields at v12, as the arrangement itself was added |
| One round or four parts | **Four parts** (12a to 12d), each with its own plan | One plan with four steps groups |
