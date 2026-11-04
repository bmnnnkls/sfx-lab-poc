---
status: active
date: 2026-11-04
note: "Part 2 of the round 12 spec: markers and a loop brace in a mark lane, the transport looping the arrangement, a seek that releases what was sounding, format v13. Signed off 2026-11-04, every decision as proposed."
---
# Round 12b: markers and the loop

Status: **plan, signed off 2026-11-04, every decision as proposed.** Written 2026-11-04. Part of the [UI redesign](../archive/ui-redesign/README.md).
Carries out part 2 of the signed-off [round 12 spec](SPEC-round-12-arrangement-editor.md) (§ Suggested split): its
§ 2, markers and the loop brace, and § 5, format v13. The inventory was taken on `imp/hungry-cannon-e8e493` at `c680c55`
(round 12a done, not merged into `feat/ui-redesign` yet). The spec's decisions are settled and not repeated here; this
plan only adds the ones it raises. Where it differs from the spec or from
[12a's plan](../archive/ui-redesign/PLAN-round-12a-timeline-frame.md), it says so.

## Goal

The arrangement can be marked up and looped. After this part:

* **a mark lane** under the ruler holds **markers** (a flag and a name) and the **loop brace**;
* **markers** are added at the position (M, the toolbar, the mark lane's menu), dragged, renamed in place, deleted, and
  stepped through (`[` `]`); a click on one puts the position there. They are saved and undone;
* **the loop brace** is drawn by dragging in the mark lane, moved by its body, resized by its edges, or set from a
  region or between two markers. Its range is saved and undone; **⟳ Loop** (and L) turns looping on and off, saved but
  not undone;
* **with the loop on, the arrangement repeats the brace's range**, sample-accurately, in the engine;
* **a seek releases what was sounding:** a jump (the loop's, or a click in the ruler while playing) cuts held notes
  and restarts audio regions in phase, which 12a's click-to-seek did not;
* **snapping** reaches markers and the loop's edges, and *Zoom to selection* falls back to the brace;
* **format v13**, which carries the markers and the loop.

**Out of scope** (later parts of the spec):

* automation lanes, returns' and the master's rows (12c);
* touch recording into the timeline (12d). This part makes the recording clock follow the loop's jump, which 12d needs;
* exporting the loop range (a wish in the spec).

## Inventory

What 12b touches, beyond the [spec's inventory](SPEC-round-12-arrangement-editor.md#inventory) and 12a's.

### The format

* `CURRENT_VERSION` is 12 (`core/persistence/format.ts`); `MIGRATIONS[11]` is the identity for v12's optional sample
  fields, and each version has a fixture in `core/persistence/fixtures/` (`v12-sample-lineage`).
* `sanitizeProject` reads the arrangement through `sanitizeArrangement` and spreads it into the project; nothing reads
  markers or a loop yet.
* `withViewOf(restored, current)` (`core/project/track-groups.ts`) carries the view fields (a group's `collapsed`, a
  track's `hidden`, the pins) across undo and redo; the project store's `editView` writes one without an undo step.

### The engine

* `Engine.render` cuts a buffer into blocks of at most `MAX_BLOCK_FRAMES` (128) and `renderBlock` advances the transport
  by each block's frames at its end. Nothing splits a block at a beat chosen by the transport.
* `arrangement/play` sets the mode, `transport.seek(fromBeat)`, plays, and calls `setMode('arrangement')` on every
  track, which does nothing when the track already follows the arrangement. So **a seek while the arrangement plays only
  moves the transport**:
  * an instrument track's held notes keep sounding: `ArrangementNotes` is stateless, and a note's off comes when the
    range next passes its end, which after a jump back may be a whole loop away or never;
  * an audio track's `ArrangementAudio` still counts the region as playing, so it isn't restarted. A re-pitched
    region keeps its phase (its position derives from the beat), but an unwarped one plays on from where it was.
  12a's click in the ruler while playing hits this; the loop would hit it on every pass.
* `TrackRuntime.cancelNotes()` queues an all-off for the next schedule; `AudioTrackRuntime` has `fadeOutPlaying()` (a
  5 ms tail) and `arrangement.reset()`. Those are the pieces a seek needs.
* **The bounce** builds its engine from `diffProject(null, project)` and then sends `arrangement/play`. A loop command
  in `diffProject` would make the bounce loop.

### The recording clock

* The worklet posts a clock packet (`engine.clock()` with the quantum's `currentTime`) after a command whose type starts
  with `transport/` or ends with `/launch`. **`arrangement/play` and `arrangement/stop` don't set it**, so after them the
  recording clock waits for the next full status (up to 33 ms).
* `RecordingClock.update` adds an anchor when the beat isn't where the last one predicts, so a jump is understood, if
  the anchor carries the jump's own audio time. The quantum's start is up to 2.7 ms off.

### The wave editor's marks

* The wave editor draws marks on a canvas (`MarkLane.tsx`) and hit-tests them with `mark-geometry.ts`, because its view
  is virtual: there is no element per mark to press.
* The arrangement's view is a native scroller whose regions are DOM elements (12a). Markers (at most 256) and one
  brace fit that model: an element per mark presses, focuses, carries a menu and hosts `RenameField` with no geometry
  code. So **the mark geometry stays in the wave editor**; 12a's plan moved it "in 12b, with the markers", which
  assumed canvas marks (§ Decisions).
* Marks in the wave editor are subjects (`sample-marker`, `sample-region`, `sample-loop`) with *Go to*, *Rename*
  (`renameAction`, through the rename store and `RenameField`) and *Delete* (the `delete` verb).

### The arrangement after 12a

* The ruler row is 24 px and sticky; `scroll-padding-top` and the overlay's `top` are 24 px.
* `regionSnapping(regions, moving)` gives other regions' edges; `snapBeat` takes the nearer of the grid and a target.
* *Zoom to selection* needs a selected region; the timeline's keys are `timelineKeyAction`'s, with no M, L, `[` or `]`.
* `timelineEnd(regions)` is the regions' last loop end.
* A focused timeline gives no subject, so the palette lists nothing of the arrangement's own.

## Design

### The model (`core/project/arrangement-marks.ts`)

```ts
interface ArrangementMarker { readonly id: string; readonly beat: number; readonly name: string }
interface ArrangementLoop { readonly from: number; readonly to: number; readonly enabled?: boolean }
// On Project:
readonly arrangementMarkers?: readonly ArrangementMarker[]   // sorted by beat
readonly arrangementLoop?: ArrangementLoop
```

* **Limits:** at most 256 markers (`MAX_ARRANGEMENT_MARKERS`), names up to `MAX_NAME_LENGTH`, every beat inside
  `[0, MAX_TIMELINE_BEATS]`, a loop at least one beat long (`MIN_LOOP_BEATS`).
* **Edits**, pure, each returning the same project when nothing changes: `addArrangementMarker(project, beat, name?)`
  (named "Marker *n*", the lowest *n* not taken; refused at the limit), `moveArrangementMarker`,
  `renameArrangementMarker`, `removeArrangementMarker`, `setArrangementLoop(project, { from, to })` (ordered, clamped,
  stretched to a beat when shorter; keeps `enabled`), `removeArrangementLoop`, `setArrangementLoopEnabled`.
* **Undo:** markers and the loop's range are project edits; a drag merges into one step (`arr-marker:<id>`,
  `arr-loop`). `enabled` is a view field: `editView` writes it, and `withViewOf` carries it, as it carries `collapsed`.
* **`arrangementContentEnd(project)`** replaces the view's use of `timelineEnd(regions)`: the regions' last loop end,
  the loop's end and the last marker, whichever is last. *Zoom to fit*, End and the drawn length follow it.

### Format v13

* `CURRENT_VERSION` 13; `MIGRATIONS[12]` is the identity (v12 has neither field). Fixture
  `v13-arrangement-marks.sfxlab.json`: three markers, an enabled loop, a looping region.
* **`sanitizeArrangementMarks`** (`core/persistence/sanitize-arrangement.ts`): drops a marker without a finite beat in
  bounds, gives a duplicate or missing id a fresh one, trims the name, keeps the first 256 by beat; drops a loop that is
  not two finite beats in bounds, orders `from` and `to` and stretches a short one to a beat; keeps `enabled` only when
  it is a real `true`. Each repair warns.
* `reference/formats-and-versions.md` gets the row; `persistence.md` the field list.
* One bump for the whole round, as the spec says: 12c adds its field under v13 without another.

### The transport loop and the seek (`core/engine`)

* **`Transport.loop: { from, to } | null`**, set by **`arrangement/setLoop { loop }`** (`null` when there is no loop or
  it is off). `diffProject` sends it when the range or `enabled` changes; it reaches the engine only through the
  command, so session playback ignores it (the engine applies it only in arrangement mode).
* **The jump.** In `render`, a block never crosses the loop's end: with the arrangement playing, a loop set, and the
  position before `to`, a block is at most the frames to the last sample before `to`. When less than a sample remains,
  the engine seeks to `from` plus the part of a sample it overshot, so the phase stays exact over many passes. Events at
  exactly `to` (a region starting there) belong to the next pass's `to`, never sound before the jump.
* **Playing from outside.** From before the brace, playback runs into it and then loops; from after it, it plays on and
  never loops (the jump only happens when a block starts before `to`).
* **One seek** (`Engine.seekArrangement(beat)`), used by the jump and by `arrangement/play` while the arrangement
  already plays:
  * `transport.seek(beat)`;
  * instrument tracks: `cancelNotes()` (an all-off at the jump, so release tails start there) and `arrangement.reset()`;
  * audio tracks: `arrangement.reset()`, `fadeOutPlaying()` (a 5 ms tail) and `playing = null`, so the region under the
    new position starts there, in phase;
  * the recorded jump (`lastJump: { frame, beat }`, the frame within the current `render` call) for the clock.
* **The clock.** The worklet posts a clock packet after `arrangement/` commands too, and after a jump with the audio
  time of the jump's own frame (`currentTime + frame / sampleRate`). `RecordingClock` needs no change: the anchor's beat
  is off its prediction, so it is kept.
* **The bounce** sends `arrangement/setLoop { loop: null }` after its diff, so an export renders the whole timeline once.

### Subjects and actions (`state/actions/`)

Three new subject kinds, following the wave editor's marks:

| Subject | Actions |
|---|---|
| `arrangement-marker { markerId }` | *Go to* (the position there), *Rename* (`renameAction`, F2), *Loop to next marker* (the brace from it to the next marker; disabled at the last), *Delete* (verb `delete`) |
| `arrangement-loop` | *Loop* / *Stop looping* (the toggle), *Zoom to loop*, *Remove loop* (verb `delete`) |
| `arrangement-timeline { beat }` | *Add marker here*, *Loop* / *Stop looping* (with a brace) |

* **`region.set-loop`**, *Set loop to region*, in a region's menu: the brace over the region (to its loop end). Its
  title differs from the existing *Loop until next region*, which repeats the region's own clip.
* `subject-name` names them ("Marker *name*", "Loop 5.1 – 9.1", "Timeline at 5.1"); `rename` commits a marker's name.
* **The focused timeline** gives `arrangement-timeline` at the position (as the graph canvas gives its own subjects), so
  the palette lists *Add marker here* and the loop toggle there.

### The mark lane (`ui/arrangement/ArrangementMarks.tsx`)

* **Where:** a 20 px row under the ruler, sticky at the top with it (the head becomes 44 px; `scroll-padding-top` and
  the overlay's top follow). Its left cell, under the corner, says *Markers*.
* **DOM, not canvas.** Each marker is a focusable button, absolutely placed at its beat: a flag and its name (cut at the
  next marker). The brace is one element from `from` to `to`, with 6 px edge handles; dimmed and dashed while the loop
  is off. Faint lines down the lanes, one per marker and two for the brace, are drawn in 12a's overlay, under the
  regions' borders.
* **Gestures:**
  * a press on a marker and a drag moves it (snapped); a click without a drag puts the position there; a double-click
    renames it in place (`RenameField`);
  * a drag on the lane's empty space draws a new brace from the press to the pointer (snapped), replacing the old range
    in one undo step; a click without a drag sets the position, as in the ruler;
  * the brace's body drags it whole, its edges resize it, never under a beat;
  * Alt during any of them doesn't snap; a drag past the side auto-scrolls, as a region's does.
* **Menus:** a marker's, the brace's, and the empty lane's (`arrangement-timeline` at the clicked beat).
* **The toolbar:** *+ Marker* (at the position) and **⟳ Loop**, `aria-pressed`, disabled with no brace.

### Snapping, zoom and keys

* **Snap targets** gain the markers and the loop's edges: `timelineSnapping(project, moving)` replaces
  `regionSnapping`, with keys `marker:<id>`, `loop:from`, `loop:to` and the regions', so a drag leaves out what it moves.
  Region drags, marker drags and brace drags all use it.
* ***Zoom to selection*** (Z) shows the selected region, else the brace; disabled with neither, as the spec says.
* **Keys**, added to `timelineKeyAction` and to the *Arrangement* rows of `VIEW_KEYS`:

  | Key | Does |
  |---|---|
  | M | add a marker at the position |
  | L | loop on or off (with a brace) |
  | `[`, `]` | the position to the previous or next marker or loop edge |

  At the first or last mark, `[` or `]` is not a view key, as in the wave editor.

## Steps

Each step lands green: `npm test`, `npm run typecheck`, `npm run test:smoke` (outside the sandbox: it needs local
ports). Steps 2 and 4 also run `npm run test:audio`.

1. **The model and format v13.** `arrangement-marks.ts` and its edits, `arrangementContentEnd`, the view field in
   `withViewOf`, the store's actions (`editView` for `enabled`), the sanitizer, the migration, the fixture, the
   formats row.
   *Tests:* each edit as a table (add at the limit, the name's *n*, a move past the bound, a loop under a beat, reversed
   ends, no change keeps the project); undo of a marker drag is one step; undo doesn't change `enabled`; the fixture loads
   without warnings and round-trips; each sanitizer repair warns; a v12 file loads with neither field.
2. **The engine: the loop and the seek.** `Transport.loop`, the block split, `seekArrangement`, `arrangement/setLoop`
   in `diffProject`, the bounce's `loop: null`, the worklet's clock packets.
   *Tests:* the jump at block sizes 1, 97, 128 and 4096 lands within a sample of `from` and keeps its phase over ten
   passes; playing from before, inside and after the brace; a note held across the jump gets its off at the jump; an
   unwarped audio region restarts at the new position; a region starting at `to` doesn't sound before the jump; a seek
   while playing (`arrangement/play`) releases notes too; session playback ignores the loop; the bounce of a looping
   project is the length of the whole timeline; the clock packet's audio time is the jump's frame.
   *Audio* (`arrangement-loop.audio.spec.ts`): a one-bar loop over an audio region, captured for three passes through
   the real worklet; each pass after the first matches the offline render of that bar after its first 10 ms (the jump's
   tail).
3. **Subjects and actions.** The three kinds, their actions, `region.set-loop`, names, rename, the focused timeline's
   subject.
   *Tests:* every action's `enabled` and `run` (the last marker's *Loop to next marker* disabled, *Loop* disabled with
   no brace); the action lists keep the group order (the actions test); `subject-name` and rename for a marker.
4. **The mark lane.** `ArrangementMarks`, the lines in the overlay, the gestures, the menus, the toolbar's *+ Marker*
   and ⟳ *Loop*, `timelineSnapping`, *Zoom to selection* on the brace.
   *Browser:* add two markers from the toolbar, drag one onto a bar, rename it in place, undo the drag; draw a brace,
   resize its end, turn the loop on, play from before it, and see the playhead go back to its start (the status beat
   drops below `to` after passing it); *Set loop to region*; a region dragged near a marker snaps to it; the
   views-at-min-size spec with the mark lane.
   *Audio:* the step-2 spec, driven from the UI once.
5. **Keys.** M, L, `[` `]` in `timelineKeyAction`, the `VIEW_KEYS` rows.
   *Tests:* the table gains the rows, at the first and last mark, with and without a brace.
   *Browser:* M twice adds two markers at the position; `]` and `[` step between them; L toggles ⟳ *Loop*; the palette
   lists *Add marker here* with the timeline focused.
6. **Docs and the profile.** `architecture/clips-and-arrangement.md` (the marks, the loop, the seek),
   `architecture/persistence.md`, `reference/formats-and-versions.md`; this plan's "Changes made while implementing",
   sorted per [doc-workflow](../dev/doc-workflow.md); STATUS and BACKLOG; the profile in
   [baselines](../reference/baselines.md).

## Behavior changes

* The arrangement has a mark lane under the ruler, with markers and a loop brace; the toolbar has *+ Marker* and
  ⟳ *Loop*.
* With the loop on, arrangement playback repeats the brace's range. The bounce still renders the whole timeline.
* A click in the ruler while the arrangement plays now cuts held notes and restarts audio regions at the new place;
  before, notes kept sounding and unwarped audio played on from where it was.
* Region drags also snap to markers and the loop's edges.
* *Zoom to selection* works with no region selected when there is a brace.
* Projects are saved as **v13**; older builds refuse them.

## Verification

* `npm test`, `npm run typecheck`, `npm run test:smoke` at every step; `npm run test:audio` at steps 2 and 4.
* **Profiling:** `scripts/profile-status.cjs` `editor` and `groups` stay at 12a's 87 and 58 component renders a
  second: the marks subscribe to the project, not the status. A new setup, `loop` (the `editor` setup with a one-bar
  brace on and three markers), records the same with the arrangement looping.
* **Measure:** none new; the jump's precision is the step-2 unit tests.
* **Manual pass** in Chrome, and Firefox and Safari where they can be run (BACKLOG V3): drags in the mark lane on a
  trackpad, rename in place, listening to a loop of a few bars with held notes and an unwarped audio region across the
  jump. What isn't done joins BACKLOG V11.

## Decisions to sign off

Signed off 2026-11-04: every row as proposed.

| Question | Proposed | Alternative |
|---|---|---|
| How the marks are drawn | **DOM elements** in the native scroller, like the regions: presses, focus, menus and rename for free. The wave editor's mark geometry stays where it is. Differs from 12a's plan, which moved it here for canvas marks | A canvas mark lane like the wave editor's, with the shared geometry |
| Where the mark lane sits | **A 20 px row under the ruler**, sticky with it | In the ruler itself (Ableton's locators), 24 px shared with the bar numbers |
| Seeking while the arrangement plays | **Releases held notes and restarts audio regions at the new place**, one `seekArrangement` for the jump and the ruler's click | Only the loop's jump does; the ruler's click stays as 12a left it |
| Where the jump falls | **On the last sample before the loop's end;** the overshoot carried into `from`, so the phase stays exact | On the nearest sample, ending a block up to half a sample past `to` |
| Subjects | **Three kinds** (`arrangement-marker`, `arrangement-loop`, `arrangement-timeline`), as the wave editor has one per mark | One `arrangement-mark` kind with a discriminant |
| The region's loop entry | ***Set loop to region*** beside *Loop until next region* | Fold both into a *Loop* ▸ submenu |
| A click on the mark lane's empty space | **Sets the position**, as the ruler does; a drag draws a brace | Does nothing; only a drag draws a brace |
| Removing the brace | ***Remove loop*** (and Delete on the focused brace), undone | No removal: a brace once drawn stays, as in Ableton |
| A new marker's name | **"Marker *n*"**, the lowest *n* not taken | Its bar and beat ("5.1") |
| Where `enabled` is kept | **On the loop object** (`arrangementLoop.enabled`), carried by `withViewOf` | A separate project field |
| The bounce and the loop | **Ignores it** (the spec), by sending `loop: null` after its diff | Leaving `arrangement/setLoop` out of `diffProject` when bouncing |

## Changes made while implementing

### Step 1: the model and format v13

* **A new loop is off.** `setArrangementLoop` keeps `enabled` from the loop it replaces; a brace drawn where there was
  none starts off, so drawing never starts looping by itself. The plan's browser step (draw, then turn it on) assumed it.
* **The sanitizer names a nameless marker** *Marker N* (its place in the file) instead of dropping it: the name is not
  what makes a marker valid. It warns only for what it drops or re-ids, and for a loop it orders or stretches.
* **A loop squeezed at the timeline's end** stretches backwards (`MAX_TIMELINE_BEATS - 1` to the end), as a sample
  loop does at its sample's end.
* **`project-storage.test.ts` pinned the format version** (`toBe(12)`): a bump has to touch it too, as it does
  `sample-marks.test.ts`, which now checks against `CURRENT_VERSION`.
* `arrangementStops` and `nextArrangementMarker`, which the keys and *Loop to next marker* need, landed with the model.
