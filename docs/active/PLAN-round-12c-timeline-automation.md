---
status: active
date: 2026-11-05
note: "Part 3 of the round 12 spec: automation lanes on the timeline for every owner, groups with a bus included; region lanes playing; returns' and the master's rows; Clip's playhead and lanes for a region. Waiting for sign-off."
---
# Round 12c: automation on the timeline

Status: **plan, waiting for sign-off.** Written 2026-11-05. No code was changed. Part of the
[UI redesign](../archive/ui-redesign/README.md). Carries out part 3 of the signed-off
[round 12 spec](SPEC-round-12-arrangement-editor.md) (§ Suggested split): its § 3, automation lanes on the timeline,
the returns' and the master's rows that [12a's plan](../archive/ui-redesign/PLAN-round-12a-timeline-frame.md) moved
here, and the field § 5 adds. The inventory was taken on `main` at `397460c` (rounds 12a and 12b done, `feat/ui-redesign`
merged into `main`). The spec's decisions are settled and not repeated here; this plan only adds the ones it raises.
Where it differs from the spec or from [12b's plan](../archive/ui-redesign/PLAN-round-12b-markers-and-loop.md), it says
so.

## Goal

Automation can be drawn on the arrangement and plays with it. After this part:

* **every owner has timeline lanes,** in song beats: instrument and audio tracks, returns, the master and **groups with
  a bus**. A folder has none;
* **returns and the master have rows** after the clip tracks, without regions, so their lanes have a place;
* **a header's lanes twisty** opens the owner's lanes under its row: one 40 px lane per target, with a header (name,
  on/off, *Read*, a menu) and a *+ Lane* row with the target picker;
* **points are drawn and edited** on the timeline with the clip editor's gestures, which move into pure functions both
  editors share;
* **a region's own clip lanes play** inside the region on the timeline; a timeline lane with points on the same target
  wins;
* ***Show automation*** offers the timeline beside the clip; on a group's control it is the only choice;
* **Clip for a region** shows its automation toggle, edits the region's own lanes, and draws a playhead while the
  arrangement plays inside it;
* **the timeline lanes are saved**, in a new format version (§ Decisions).

**Out of scope:**

* touch recording into the timeline (12d). In this part, touch while the arrangement plays behaves as today;
* user-sized lanes, and drawing a region's own lanes on the timeline (wishes in the spec);
* automation on folders (the spec's decision).

## Inventory

What 12c touches, beyond the [spec's inventory](SPEC-round-12-arrangement-editor.md#inventory) and 12a's and 12b's.

### The model and the files

* Lanes are `AutomationLane { id, target, enabled, points }` (`core/automation/types.ts`). `canonicalAutomationPoints
  (points, length)` sorts, collapses and clamps to `[0, length]`; `uniqueAutomationLanes` keeps one lane per target.
* Holders today: `Clip.automation`, `AudioClip.automation`, and `AutomationSlot` on returns and the master.
  `automationSlotsOf` returns nothing for a group, and `setAutomationSlot` refuses one.
* `CURRENT_VERSION` is 13 (`core/persistence/format.ts`). **`sanitizeProject` builds the project from the fields it
  knows**, so a build that doesn't know a field drops it on load, without a warning.
* **`feat/ui-redesign` is merged into `main`** (`7d299bf`), and `main` deploys to GitHub Pages on every push. So v13
  has shipped without `arrangementAutomation`. The spec's "12c adds its field under v13" assumed no build would ship
  between the parts; that no longer holds (§ Decisions). STATUS still says the branch is not merged.
* `sanitizeArrangement` calls `sanitizeClip` and `sanitizeAudioClip` **without an owner**, so a region's lanes are
  never checked against its track.
* **Cleanup has one place per owner kind:** `removeTrack` (`core/project/edit.ts`) drops the removed track's control
  values, mappings and clip lanes that reference it (sends to a removed return too, through `removedControlReference`);
  `withoutGroups` (`group-membership.ts`) drops what a removed group owned, and `ungroup`, `removeGroup` and
  `pruneGroups` all go through it; `setGroupBus(false)` keeps everything; `duplicateTrack` copies clip lanes with
  `copyLanes`, moving the owner.
* **A region moved to another track keeps its lanes' old owner.** `updateArrangementClip` changes `trackId` only. The
  session's move uses `movedTo(clip, trackId)` (`core/project/clip-copy.ts`, private), which rewrites the owner.

### The engine

* `EngineAutomation` (`core/engine/automation.ts`, 167 lines) keeps one `LaunchQueue` per owner. `tick(from, to)` takes
  each queue's playing clip, evaluates its lanes at the phase, and writes; keys that stop being written get their base
  back. `noteOwners` proves note lanes constant over a range so interval scheduling can stay.
* **`tick` runs per sample** inside a planning horizon (`renderBlock`), so whatever answers "which lanes play now" must
  not search per call.
* The horizon stops at audio events and one-shot ends. It does not stop at a region's edges.
* In arrangement mode the queues are reset, so nothing plays: `automation.configured` is false for a project without
  session lanes, and the block takes the fast path (the no-lane overhead in STATUS § Accepted limits).
* **`writeAutomation` and the curves already reach a group's bus**: it is a `StereoBus` in `tracks`, keyed by the
  group's id, as returns are. `addNoteOwner` only counts track owners, which is right: a bus has no note graph.
* `seekArrangement` (the loop's jump, a click while playing) does not touch automation; `stopTransport` calls
  `automation.reset()`, which drops overrides and restores bases.
* The engine status carries `automation` readouts from the active lanes; the UI's *Read* and override state come from
  them.

### The compile and the sync

* `compileAutomation(project)` (`core/automation/evaluate.ts`) gives one `AutomationTrack` per owner with lanes,
  resolving each lane against the current specs and dropping lanes of another owner.
* `app/project-sync.ts` compiles and `JSON.stringify`s the result **on every project change** to decide whether to send
  `automation/configure`; `diffProject` does the same for the bounce. Timeline lanes can be large (64 lanes of 2048
  points per owner), so this cost grows with them.

### The UI

* `AutomationEditor` (`ui/automation/AutomationEditor.tsx`, 132 lines) is an SVG over a 0..1000 viewBox. Its pointer
  logic is inline: click adds, drag moves the selection, Shift-click toggles, ⌘A, ⌘C, ⌘X, ⌘V, Delete; a numeric field
  for one point. **No box selection, no Alt, no Shift constraint.**
* It edits through `editOwnerAutomation(owner, clip.id, …)`, which finds a **session** clip by id. A region's content
  keeps its source's id, so pointed at a region it would edit the session source. Its phase line (`AutomationPhase`)
  follows the launcher's `playingClipId`, which would also match the session source.
* `ClipEditor` shows a region with `playhead={false}` and no *Notes / Automation* toggle.
* `control.show-automation` has one inline entry per target (per XY axis), disabled on a group ("not on a group yet").
  `track.show-automation` and `master.show-automation` open a clip or slot. Groups have no such action.
* `arrangementRows` drops returns (`if (row.track.kind === 'return') return []`) and has no master row.
* The view (`ArrangementView`) renders a `GroupRow` or a `LaneRow` per row, each beside an `ArrangementHeader`. The
  ruler is a canvas sized to the visible timeline, redrawn in an animation frame; regions and marks are DOM elements.

## Design

### The model (`core/automation/timeline.ts`)

As the spec says:

```ts
interface TimelineLanes {
  readonly owner: ControlOwner          // a track, a return, the master or a group with a bus
  readonly lanes: readonly AutomationLane[]
  readonly open?: boolean               // the lanes twisty: a view field (§ Decisions)
}
// On Project:
readonly arrangementAutomation?: readonly TimelineLanes[]
```

* **One entry per owner**, lanes in song beats, every lane rule as for clip lanes, `MAX_TIMELINE_BEATS` as the length.
* **`timelineOwnerAllowed(project, owner)`**: a track or return that exists, the master, or a group that exists and has
  a bus. Used by the sanitizer, the edits and (in 12d) touch.
* **Edits**, pure, each returning the same project when nothing changes:
  * `setTimelineLanes(project, owner, lanes)`: keeps lanes of that owner, one per target, at most 64, points
    canonical; an owner not allowed is refused. An entry left with no lanes and not open is removed.
  * `setTimelineLanesOpen(project, owner, open)`: a view field, written by `editView`, carried by `withViewOf`.
* **Undo:** `editTimelineAutomation(owner, lanes, key?)` in `state/automation-store.ts`, one step each; a point drag
  merges under a key per gesture (`automationGestureKey`, as 12b learned).
* **Cleanup**, in the places the inventory names:
  * `removeTrack`: drops the track's entry and, in every other entry, lanes that reference it (a send to a removed
    return);
  * `withoutGroups`: drops a removed group's entry (so `ungroup`, `removeGroup` and pruning do too);
  * `setGroupBus(false)`: keeps the entry; its lanes resolve as missing ("The group has no bus") and don't play;
  * `duplicateTrack`: copies the entry onto the copy with `copyLanes`.
* **Regions:** `updateArrangementClip` with a new `trackId` rewrites the content's lanes with `movedTo`, now exported.

### Format v14

* `CURRENT_VERSION` 14, `MIGRATIONS[13]` the identity, a fixture `v14-timeline-automation.sfxlab.json`: a track lane,
  a group bus fader lane, a master lane, an open entry, and a looping region with its own lane. (The spec said v13,
  with 12b; § Decisions.)
* **`sanitizeTimelineAutomation`** (`core/persistence/sanitize-timeline-automation.ts`): reads each entry's owner, drops
  an entry whose owner doesn't exist, merges duplicate owners (first wins), reads lanes with `sanitizeAutomation(raw,
  MAX_TIMELINE_BEATS, warn, owner)` so a lane naming another owner warns and is kept unavailable, keeps `open` only for
  a real `true`. A group without a bus keeps its entry (switching the bus back on brings its lanes back). Each repair
  warns.
* **Region lanes get their owner check:** `sanitizeArrangement` passes the region's track as the owner.
* `reference/formats-and-versions.md` gets the row; `architecture/persistence.md` the field.

### Which lane plays (`core/engine/arrangement-automation.ts`)

The spec's rule, per target, in arrangement mode: a timeline lane of the owner while it has points and is enabled,
else the lane of the region playing on that track (the newest start), else the base.

**The compile.** `compileTimelineAutomation(project)` in `core/automation` gives:

```ts
interface TimelineAutomation {
  readonly owners: readonly { readonly owner: ControlOwner; readonly lanes: readonly PlaybackLane[] }[]
  readonly regions: readonly {
    readonly trackId: string
    readonly start: number           // the region's startBeat
    readonly end: number             // its end, or its loop end (arrangementLoopEnd) when it loops
    readonly length: number          // the clip's length: the phase wraps by it
    readonly lanes: readonly PlaybackLane[]
  }[]
}
```

Only owners and regions with compiled lanes are listed, so a project without any compiles to empty lists.
`automation/configure` gains `timeline?: TimelineAutomation`; `diffProject` and `project-sync` send it with the rest.

**The runtime.** `ArrangementAutomation` holds the compiled lists, the regions sorted by start per track.

* `prepare(beat)` once per planning horizon: for each track, the region under `beat` (newest start) and the next
  boundary after it (a region's start or end on that track). Returns the nearest boundary.
* `lanesAt(beat, into)` fills the active lanes per target key: the timeline lane if it has points, else the prepared
  region's lane at its phase (`(beat − start) mod length`, clamped to `length` for a region that doesn't loop). It is
  the spec's `laneAt` seam, tested as a table.
* `EngineAutomation.tick` asks it **instead of the queues** while the engine plays the arrangement. What follows is
  today's code: overrides win over lanes, writes become curves, a key no longer written gets its base back, note
  writes go to the note runtime.
* **The horizon** also stops at the boundary `prepare` returns, as it stops at audio events. The loop's jump already
  ends a block, and `seekArrangement` calls `prepare` again.
* `noteOwners` gets the same answer for the range, so constant note lanes keep interval scheduling.
* **No lanes, no cost:** with empty lists, `configured` stays false and the block takes the fast path.
* **Overrides** on a timeline lane last until *Read* (re-enable) or ■, which `reset` already handles. A seek or the
  loop's jump keeps them (§ Decisions).
* **The bounce** builds its engine from `diffProject`, so it plays timeline and region lanes as the live engine does.

### Rows and headers (`core/project/arrangement-rows.ts`, `ui/arrangement/`)

* **`arrangementRows`** gains one row per return (`{ kind: 'return', track }`) and one for the master, after the clip
  tracks, as the spec's table says. Hidden returns have no row.
* **A return's header**: name, `MuteSolo`, lanes twisty. **The master's**: *Master*, lanes twisty. Their lane is empty
  (28 px, as a group row); drops of clips are refused there.
* **The lanes twisty** sits on every row that can own lanes (tracks, bus groups, returns, the master), not on a folder.
  Closed, it shows the number of lanes when there are any ("▸ 3"). It writes `open` through `editView`.
* **Selecting** a return or the master header selects it, as the mixer's strip does, so Effects and Sounds follow.

### The lanes in the view (`ui/arrangement/TimelineLane.tsx`)

* **Under an open owner's row:** one lane per timeline lane, 40 px, then a *+ Lane* row (24 px).
* **The lane header:** the target's name (`controlTargetLabel`), an on/off checkbox (`enabled`), *Read* (re-enable)
  while overridden, a missing or wired note when the target doesn't resolve, and the lane's menu.
* ***+ Lane*** opens today's target picker (search, by graph and module) in a popover, listing the owner's targets
  that have no lane yet.
* **The body** is a canvas the size of the visible timeline, sticky at the timeline's left as the ruler is, redrawn in
  an animation frame on scroll, zoom, resize and lane change: the curve, its points, the selection, and the value
  before the first point and after the last as a flat line. The grid, the position, the marker lines and the playhead
  are the lanes' existing layers.
* **Hit-testing** is pure (`timeline-lane-geometry.ts`): point within 6 px, segment under the pointer, box.

### Shared point gestures (`ui/automation/point-gestures.ts`)

The clip editor's pointer logic becomes pure functions of the pointer and the points at the press, as
`note-gestures.ts` does for the piano roll:

| Gesture | Does |
|---|---|
| Click on empty space | adds a point at the snapped beat and the pointer's value; a drag after it moves it |
| Drag a point | moves the selection; Shift keeps the beats, Alt doesn't snap |
| Shift-click a point | toggles it in the selection |
| ⌘ or Ctrl drag on empty space | a box selects (Shift adds), as the piano roll's marquee |
| Delete, ⌘A, ⌘C, ⌘X, ⌘V | as today; on the timeline ⌘V pastes at the position |
| Right-click a segment | *Linear* or *Hold* for the point that starts it |

* Both editors call them: the clip editor in its 0..1000 viewBox, the timeline in beats through its axis. The clip
  editor gains box select, Alt and Shift with no other change.
* A drag is one undo step; a point past 2048 is refused, as today.
* Snap on the timeline uses the view's grid and `timelineSnapping`'s targets (markers, loop edges, region edges).

### Subjects and actions

* **`timeline-lane { owner, laneId, beat? }`**, a new subject kind for a focused lane (`state/actions/timeline-lane.ts`):
  *Enable* or *Disable*, *Read* (re-enable, while overridden), *Clear* (all points), *Show in panel* (the control's
  panel), *Delete lane* (verb `delete`), and with a `beat` from a right-click on a segment, *Linear* and *Hold*.
  Selected points take the lane's keys, not a subject of their own (§ Decisions).
* **`control.show-automation`** becomes two entries per target: *Show automation in clip* (today's, for tracks,
  returns and the master) and *Show automation on timeline*: reveals the Arrangement, opens the owner's lanes, adds the
  lane if it is missing, scrolls it into view and focuses it. On a group's control only the second exists, and the
  "not on a group yet" note goes (§ Decisions).
* **`track.show-automation`, `master.show-automation`** stay; a group with a bus gets `group.show-automation`, which
  opens its timeline lanes. Each owner's menu also gets *Show automation lanes* / *Hide automation lanes* (the
  twisty).

### Clip for a region

* **`ClipRef` through the automation editor:** `AutomationEditor` takes a `clipRef` beside its owner, and
  `editOwnerAutomation` edits a region's content through `editClipAt`, so the region's copy changes, never its source.
* **The toggle:** a region gets *Notes / waveform* and *Automation*, as a session clip does.
* **The playhead:** `regionPhase(status, region, regions)` is `(beat − startBeat) mod lengthBeats` while the arrangement
  plays inside the region (to its loop end), none otherwise. The piano roll, the audio clip editor and the automation
  editor draw it when given a region; `playhead={false}` goes. The automation editor's phase line takes a `phase`
  function instead of matching `playingClipId`.
* The "no automation and no playhead for a region yet" comment and the architecture's sentence go.

## Steps

Each step lands green: `npm test`, `npm run typecheck`, `npm run test:smoke` (outside the sandbox: it needs local
ports). Steps 2 and 6 also run `npm run test:audio`.

1. **The model and format v14.** `timeline.ts`, `timelineOwnerAllowed`, the edits, the cleanup in `removeTrack`,
   `withoutGroups` and `duplicateTrack`, `movedTo` on a region's track change, the store's `editTimelineAutomation`
   and the view field, the sanitizer, the region owner check, the migration, the fixture, the formats row.
   *Tests:* each edit as a table (another owner's lane refused, a folder refused, 65 lanes, a point past the bound, no
   change keeps the project); `removeTrack` of a track and of a return (a send lane elsewhere goes); `ungroup`,
   `removeGroup`, a group losing its last track, `setGroupBus(false)` and back on; `duplicateTrack`; a region moved to
   another track plays its lanes there; undo of a point drag is one step and doesn't change `open`; the fixture loads
   without warnings and round-trips; each sanitizer repair warns; a v13 file loads with no lanes.
2. **The engine.** `compileTimelineAutomation`, `automation/configure`'s `timeline`, `ArrangementAutomation`,
   `tick` and `noteOwners` in arrangement mode, the horizon stopping at region edges, `prepare` after a seek.
   *Tests:* the `lanesAt` table (timeline over region, an empty timeline lane leaves the region's, a disabled one too,
   the newest region, a looping region's phase to its loop end, after a region's end the base); bases restored when a
   region ends and when a lane is deleted while playing; nothing in session mode, and session lanes unchanged in
   session mode; a region edge inside a block at block sizes 1, 97, 128 and 4096; the loop's jump re-evaluates; a group
   bus's fader, pan, a send and an insert parameter written from a timeline lane; a note-graph lane on a region keeps
   sample cadence only where it changes; the bounce with timeline lanes equals a live render; an empty timeline keeps
   the fast path (`configured` false).
   *Audio* (`timeline-automation.audio.spec.ts`): a group bus fader lane and a master filter lane over four bars,
   captured through the real worklet, against an offline render.
3. **Rows and headers.** Returns' and the master's rows, their headers, the lanes twisty, selection.
   *Tests:* `arrangementRows` with returns and the master last, hidden returns left out, memoized.
   *Browser:* the rows show; M and S on a return; a clip dropped on a return's row is refused; the views-at-min-size
   spec with the new rows.
4. **The shared point gestures.** `point-gestures.ts`, the clip editor moved onto it, box select, Alt, Shift.
   *Tests:* each gesture as a table (add, move with and without Shift and Alt, box with and without Shift, the point
   limit, paste at a beat, the segment's interpolation).
   *Browser:* the existing automation specs pass unchanged; a box selects three points in the clip editor.
5. **The timeline lanes.** `TimelineLane`, its header, *+ Lane*, the canvas, hit-testing, the `timeline-lane` subject
   and its actions.
   *Browser:* open a bus's lanes, add its fader lane, draw three points, drag one onto a bar, undo the drag; switch a
   segment to *Hold*; disable the lane; play and see the fader follow (the readout), override it by hand and press
   *Read*; delete the lane.
6. ***Show automation* and Clip for a region.** The two entries, `group.show-automation`, the lanes toggle in the
   menus, `ClipRef` through the automation editor, the region's toggle and playheads.
   *Tests:* the actions' `enabled` and `run` (a group's control has only the timeline entry, a folder's none); a region's
   lanes edited through its `ClipRef` leave the session source unchanged; `regionPhase` for a looping region, past its
   loop end, in session mode.
   *Browser:* *Show automation on timeline* on a bus control in the mixer adds the lane and focuses it; a region
   opened in Clip shows its playhead while the arrangement plays; its *Automation* edits its own lane, and the session
   source's lane stays.
   *Audio:* a session clip with a filter sweep, placed on the timeline, sounds the same in both modes; a timeline lane
   drawn over it takes the control.
7. **Docs and the profile.** `architecture/control-and-automation.md` (timeline lanes, groups as automation owners),
   `architecture/clips-and-arrangement.md` (rows, lanes, region lanes, Clip for a region), `architecture/persistence.md`,
   `reference/formats-and-versions.md`; this plan's "Changes made while implementing", sorted per
   [doc-workflow](../dev/doc-workflow.md); STATUS (and its stale *not merged* line) and BACKLOG (U2); the profile and the
   measure in [baselines](../reference/baselines.md).

## Behavior changes

* Returns and the master have rows on the arrangement; every row that can own automation has a lanes twisty.
* Automation lanes can be drawn on the timeline for tracks, returns, the master and group buses, and play while the
  arrangement plays.
* **A region's own clip lanes now play on the timeline.** Before, they were kept and silent. Songs that relied on that
  silence will change (the spec's decision).
* A region moved to another track keeps its lanes playing on the new track.
* *Show automation* has an *on timeline* entry; a group's control has it too.
* Clip shows a region's automation and playhead.
* The clip editor's automation lanes gain box select, Alt and Shift.
* Projects are saved as **v14**; older builds refuse them.

## Verification

* `npm test`, `npm run typecheck`, `npm run test:smoke` at every step; `npm run test:audio` at steps 2 and 6.
* **Profiling:** `scripts/profile-status.cjs` `editor`, `groups` and `loop` stay at 87, 58 and 87 component renders a
  second (12b): lanes subscribe to the project, and only the playhead reads the status. A new setup, `lanes` (the
  `editor` setup with two owners' lanes open, three points each), records the same while playing.
* **Measure** (`scripts/measure-timeline-automation.cjs`, new): the engine's render time per block for a 16-track
  arrangement with a lane per track, against the same lanes in playing session clips, and against no lanes. The
  no-lane case must stay at today's figure (STATUS § Accepted limits); the timeline case should be within 10% of the
  session one. Also the compile and signature cost per edit with 16 owners × 4 lanes × 512 points; if it passes 4 ms,
  the timeline part is memoized per lane array before the step lands.
* **Manual pass** in Chrome, and Firefox and Safari where they can be run (BACKLOG V3): drawing and dragging points on
  a trackpad, box select, the lanes at high and low zoom, both themes, listening to a bus fader lane and a region's
  filter sweep. What isn't done joins BACKLOG V11.

## Decisions to sign off

| Question | Proposed | Alternative |
|---|---|---|
| The format | **v14, a bump of its own,** with an identity migration and a fixture. `main` has deployed v13 since the redesign merged, and a v13 build would drop the lanes without a word. Differs from the spec, which said v13 | Under v13, as the spec said: one version fewer, but the deployed build loses lanes silently |
| Where the lanes twisty's state lives | **On the entry, `open`, a view field:** saved, not undone, as a group's `collapsed` | Per browser in the arrangement-view store, keyed by owner; not saved with the song |
| When an override on a timeline lane ends | ***Read* or ■;** a seek or the loop's jump keeps it, as an override does in Ableton's arrangement | Also at each loop jump, so every pass plays the lane again |
| Where a region's lanes come from at a beat | **The newest region under the beat on that track,** its lanes only, as for audio; an older overlapping region's lanes don't mix in | Per target, the newest region that has a lane on it |
| How *Show automation* offers the timeline | **Two entries,** *Show automation in clip* and *Show automation on timeline*, per XY axis; a group's control has the second only | One *Show automation* ▸ submenu with *In the playing clip* and *On the timeline* |
| A box over points | **⌘ or Ctrl and a drag on empty space,** as the piano roll's marquee; a plain drag still adds a point | A plain drag on empty space boxes, a click adds |
| Subjects | **One `timeline-lane` kind;** selected points use the lane's keys, a segment's interpolation is in the lane's menu at the clicked beat | Also an `automation-point` subject, with *Delete* and *Linear / Hold* in its own menu |
| Returns' and the master's lane row when closed | **28 px, empty,** as a group row; it holds nothing until its lanes open | 56 px, as a track row, so the rows line up with the session's |
| *Show automation* on a header | **A *Show / Hide automation lanes* entry** in each owner's menu beside today's *Show automation*; a bus group gets `group.show-automation` | Today's `track.show-automation` opens the timeline lanes when the Arrangement is showing |
