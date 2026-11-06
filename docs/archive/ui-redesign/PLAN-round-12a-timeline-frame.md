---
status: done
date: 2026-11-04
shipped_in: architecture/clips-and-arrangement.md
note: "Part 1 of the round 12 spec: headers beside the lanes, zoom, snap, a position, follow, view keys, and the timeline geometry shared with the wave editor. The hand pass in browsers is BACKLOG V11."
---
# Round 12a: the timeline frame

Status: **done** 2026-11-04; plan signed off 2026-11-01, every decision as proposed. Written 2026-11-01. Part of the [UI redesign](README.md).
Carries out part 1 of the signed-off [round 12 spec](SPEC-round-12-arrangement-editor.md) (§ Suggested split): its
§ 1, the timeline frame and the headers, and the two fixes its inventory found. The inventory was taken on
`feat/ui-redesign` at `49804e9` (round 11 done, its spec archived). The spec's decisions are settled and not repeated
here; this plan only adds the ones it raises. Where it differs from the spec, it says so.

## Goal

The arrangement is a timeline that can be moved around in. After this part:

* **headers stay at the left** while the timeline scrolls sideways, and scroll up and down with their lanes. A track's
  and a group's header has its name, **M** and **S**; a group's has its fold twisty. The column is resizable;
* **one zoom** goes from the whole song in the width down to 256 px per beat: ⌘ or Ctrl with the wheel and a pinch
  around the pointer, the slider, keys, *Zoom to fit* and *Zoom to selection*;
* **middle-drag pans,** and a region dragged past the side scrolls the timeline;
* **a grid setting** (bar to 1/16, or off) snaps drops, moves and resizes, and region edges snap to each other; Alt
  doesn't snap;
* **a position** in the ruler: a click sets it (and seeks while playing), ▶ plays from it, ■ returns to it;
* **follow playhead** keeps the playhead in view, until the user scrolls;
* **view keys** on the focused timeline;
* **the timeline's geometry is shared** with the wave editor in `ui/shared/timeline/`;
* **fixed on the way:** a looping region keeps its loop after a reload; the arrangement's playhead no longer moves while
  the session plays; a region can no longer be dragged onto a lane of the wrong kind.

**Out of scope** (the spec's later parts):

* the mark lane, markers and the loop brace (12b). Snapping to markers and loop edges comes with them;
* rows for returns and the master, the lanes twisty, and everything about automation (12c). This differs from the
  spec's split, which puts the rows here: see § Decisions;
* touch into the timeline (12d).

## Inventory

What 12a touches, beyond the [spec's inventory](SPEC-round-12-arrangement-editor.md#inventory).

### The view's structure

* `ArrangementView` renders the toolbar, then `.scroll` (`overflow: auto`), then a sticky `.rulerRow` and one `.lane`
  per row. A `.lane` is a two-column grid: `.name` (`--name-width: 120px`) and `.row`. Nothing is sticky at the left,
  so names scroll away.
* **`ArrangementPlayhead` is rendered once per lane.** Each instance subscribes to `status.beat` while playing, so a
  ten-lane project renders ten components 30 times a second. The `editor` profile setup (Arrangement and Mixer, the
  arrangement playing, three regions on the Starter's tracks) counts them in its 145 renders a second
  ([baselines](../../reference/baselines.md#ui-work-per-second-while-playing)).
* The lane name and the group lane's name carry the subject's `ActionMenu`, `useDragSource`, `useEdgeTarget` (drag to
  reorder) and, for a group, the twisty. They move to the header unchanged.
* The empty states (no tracks; every track hidden) stay.

### Snap and drag

* `snap()` in the view rounds to a quarter beat for drops (`LaneRow`) and the right-click's *Add clip* beat.
  `ArrangementRegion` rounds moves and resizes the same way, inline.
* **A region dragged onto another lane is moved without a check.** `endDrag` calls `updateArrangementClip(id, {
  trackId })` for any `[data-lane]`, so a MIDI region dropped on an audio track's lane moves there and plays nothing.
  Drops from the session already check: `canPasteClipOnLane` (`state/actions/lane.ts`) asks `clipFitsTrack`
  (`core/project/clip-copy.ts`: a MIDI clip on an instrument track, audio on an audio track, never a return). The region
  move should ask the same.
* Regions resize only at the right edge, which changes `content.lengthBeats`.

### The model and the engine

* `sanitizeArrangement` rebuilds a region without `loop` (spec inventory). `arrangement-clip.test.ts` and the
  persistence tests don't round-trip a looping region.
* `startBeat` has a lower bound (0) and no upper one.
* `EngineStatus` (`core/engine/status.ts`) is built by `Engine.status()`; the worklet posts it, `useStatusStore` holds
  it. A new field reaches the UI with no protocol change beyond the type.
* `engine-controls.ts`'s `playArrangement(fromBeat = 0)` sends `arrangement/play`; `stop()` sends `transport/stop`.

### Settings

* `sfxlab:arrangement-zoom` (8 to 64 px per beat) is the only arrangement setting, through `useStoredState`.
* The wave editor keeps its view settings in a store with a storage hook in `ui` (`use-wave-edit-settings-storage.ts`),
  read once and written on change.

### Keys

* View-local keys are listed read only in `VIEW_KEYS` (`ui/commands/keybindings.ts`), per view, and handled in the
  view's `onKeyDown`, as the wave editor's and the piano roll's are. Round 11c-1 settled that they are not rebindable.
  The spec's § 1 says the arrangement's keys are "rebindable through round 10's table"; this plan follows 11c-1
  instead (§ Decisions).
* A focused region already gives the `region` subject (its `ActionMenu`); its verbs (Delete, ⌘C, ⌘D) work.

### The wave editor's geometry

All in frames, on `WaveView { startFrame, framesPerPixel, width }` from `core/sample/pyramid.ts`, used in 25 files (153
references):

* `wave-geometry.ts`: `fitFramesPerPixel`, `clampView`, `resolveView`, `zoomAround`, `zoomTo`, `resolveZoom`,
  `showFrame`, `frameAt`, `xOf`, `autoScrollFrames`, `WHEEL_ZOOM`, and the selection and box hit tests (the wave
  editor's own);
* `ruler-ticks.ts`: the private `ticksEvery`, `formatTime`, `formatBeat`, `rulerTicks`;
* `snap.ts`: `snapFrame`, `SnapTarget`, `Snapping`, `SNAP_PX`, and `waveSnapping` (the wave editor's own).

Renaming `WaveView`'s fields would touch every one of those files for nothing the arrangement needs. The shared code
takes an axis of its own, and the wave editor's functions become wrappers.

### Tests that touch the arrangement

* `tests/browser/arrangement.smoke.spec.ts`: placing and playing, looping and moving across tracks, a slot placed, the
  bounce. They find lanes by `[data-lane]`, names by text, the zoom by its `title`.
* `drag-and-drop`, `linked-selection`, `context-menus`, `tracks-tree`, `layout` and `views-at-min-size` open the view
  or use its lanes and names.
* `scripts/profile-status.cjs` finds lanes by `[data-lane]` and plays with *Play arrangement*.

## Design

### Shared timeline geometry (`ui/shared/timeline/`)

Pure functions over an **axis**, in whatever unit the caller counts:

```ts
/** What a timeline shows: from `start`, `perPixel` units per column, `width` columns. */
interface Axis { readonly start: number; readonly perPixel: number; readonly width: number }
```

| File | Functions | From |
|---|---|---|
| `axis.ts` | `clampAxis(axis, length, minPerPixel)`, `fitPerPixel(length, width, minPerPixel)`, `zoomAxisAround(axis, factor, x, length, minPerPixel)`, `zoomAxisTo(from, to, width, length, minPerPixel)`, `xOf(axis, at)`, `unitAt(axis, x)`, `autoScrollUnits(distancePx, perPixel, width)`, `WHEEL_ZOOM` | `wave-geometry.ts` |
| `ticks.ts` | `ticks(axis, unitsPerLabel, steps, label)`, `formatTime`, `formatBeat`, `BEAT_STEPS` | `ruler-ticks.ts` |
| `snap.ts` | `snapTo(value, snapping, axis, ignore?)`, `SnapTarget { at, key }`, `Snapping`, `SNAP_PX` | `snap.ts` |

* The wave editor's `clampView`, `zoomAround`, `zoomTo`, `fitFramesPerPixel`, `xOf`, `autoScrollFrames`, `rulerTicks`
  and `snapFrame` keep their names and signatures, each a line that maps `WaveView` to an `Axis` and back
  (`axisOf(view)`, `viewOf(axis)`), with `MIN_FRAMES_PER_PIXEL` as the minimum. `SnapTarget.frame` becomes `at` in the
  wave editor too (four call sites). Its tests stay where they are and pass unchanged; the shared functions get their
  own tests in beats.
* The **mark geometry** (`markAt`, `markEdgeAt`, `markLines`) moves in 12b, with the markers that use it. The spec
  lists it under 12a; nothing in 12a reads it.
* The arrangement's axis is in beats: `start = scrollLeft / pxPerBeat`, `perPixel = 1 / pxPerBeat`, `width` the
  visible lanes' width. The timeline is a native scroller, so the axis is read from it, not stored.

### The arrangement-view store (`state/arrangement-view-store.ts`)

In memory, like `wave-editor-store`; a storage hook in `ui` (`use-arrangement-view-storage.ts`) reads and writes the
per-browser part under one key, `sfxlab:arrangement-view`, and reads the old `sfxlab:arrangement-zoom` once when the new
key is absent.

| Field | Saved per browser | Default |
|---|---|---|
| `pxPerBeat` | yes | 24 (today's), or the old key's value |
| `grid` (`'bar' \| 'beat' \| '1/2' \| '1/4' \| '1/8' \| '1/16' \| 'off'`) | yes | `'1/4'` |
| `follow` | yes | on |
| `headerWidth` | yes | 180 |
| `position` (beats) | no | 0 |
| `following` (follow suspended by a scroll during this playback) | no | true |
| `zoomTo` (a pending zoom, as the wave editor's) | no | none |

Actions: `setZoom`, `setGrid`, `setFollow`, `setHeaderWidth`, `setPosition`, `suspendFollow`, `resumeFollow`, `zoom(to)`
and `takeZoom()`. Not in the project, not undone.

### `core`

* **`arrangementRows(project)`** (`core/project/arrangement-rows.ts`): `visibleRows(trackRows(project))` without the
  returns, each track row with the colour of the group it is in (the `stripe` today's view works out). Memoized by
  `tracks` and `groups`, as `trackRows` is. 12c adds the returns and the master here.
* **`timelineEnd(project)`**: the last region's loop end (`arrangementLoopEnd`), 0 for none. 12b adds the loop and
  markers to it. The drawn width stays today's rule: at least 32 bars, 4 bars past the end.
* **`MAX_TIMELINE_BEATS = 4096`** in `core/project/limits.ts`. `createArrangementClip` and `updateArrangementClip`
  clamp `startBeat` to `[0, MAX_TIMELINE_BEATS − length]`; the sanitizer drops a region past it, with a warning.
* **The region move asks `clipFitsTrack`**, the check drops already use; no new function.
* **The sanitizer keeps `loop`** (only a real `true`), with a round-trip test.
* **`EngineStatus.mode: 'session' | 'arrangement'`**, from `Engine.playbackMode`. Old status packets don't exist (the
  worklet and the page are one build), so it is required.

### The layout

The view is the toolbar over one scroller. Inside it, a grid with two columns, `var(--header-width)` and the timeline:

```
┌────────────┬───────────────────────────────────────────┐  ← sticky top
│ corner     │ ruler (canvas, the visible width)          │
├────────────┼───────────────────────────────────────────┤
│ header     │ lane: regions, grid lines                  │
│ (sticky    │                                           │
│  left)     │                                           │
│ …          │ …                                         │
└────────────┴───────────────────────────────────────────┘
                 playhead and position lines over the lanes
```

* **Headers** are `position: sticky; left: 0`, above the lanes in the stacking order; the corner is sticky on both
  axes. So a horizontal scroll moves only the timeline, and a vertical one moves headers and lanes together, with no
  script.
* **The header** (`ArrangementHeader`), 56 px high, one per row:
  * a track: the name (selects the track; its menu, drag and drop as today's `LaneName`), the group stripe and indent,
    and `MuteSolo`;
  * a group: the fold twisty, the name (its menu, drag and drop as today's `GroupLane`), a *bus* tag for a bus, and
    `MuteSolo` with `kind="group"`.
  * `MuteSolo` and `useRoute` move from `ui/mixer/ChannelStrip.tsx` to `ui/shared/MuteSolo.tsx`, unchanged; the mixer
    imports them from there. A muted row's name is struck through, as in the session's group header.
* **The header column's width** is dragged by the shell's `Splitter` at its right edge, from 120 to 320 px, and kept.
  Under 600 px of view width it is drawn at 120 px whatever is kept, so the editors' 480 px minimum leaves 360 px of
  timeline.
* **The ruler** is a canvas the size of the visible timeline, inside a box that is sticky at the left edge of the
  timeline column, redrawn in an animation frame on scroll, zoom and resize, as the wave editor's ruler is. It draws
  `ticks(axis, 1, BEAT_STEPS, formatBeat)`: bar numbers when zoomed out, then beats, then sixteenths. Bar lines are
  longer than beat lines.
* **Grid lines in the lanes** are CSS: a `repeating-linear-gradient` on each lane, with `--bar-px` and `--grid-px` set
  on the view from the zoom and the grid. They scroll with the content for free and cost nothing per frame. Under 4 px
  between grid lines, only bar lines are drawn; under 4 px between bars, every fourth bar.
* **One playhead** and **one position line** are absolutely placed over all lanes (an overlay inside the scroll content,
  as tall as the lanes), not one per lane. The playhead shows only while `status.mode === 'arrangement'` and playing;
  it owns its status subscription, as today.
* **Regions** keep `left` and `width` in pixels from `pxPerBeat`. At the closest zoom a region of 256 beats is 65,536 px
  wide, and the content at most 4096 × 256 ≈ 1 M px, under every browser's element size limit (Firefox's is about
  17.9 M px). Note previews already cap at 200 notes.

### Zoom and scroll

* **The range** is from `fitPerPixel(timelineWidthBeats, width)` (but never below 0.05 px per beat) to **256 px per
  beat**. Today's slider range (8 to 64) is inside it.
* **⌘ or Ctrl with the wheel**, and a pinch (Chrome and Safari send it as a wheel with `ctrlKey`), zoom by `WHEEL_ZOOM`
  per 100 px of delta around the pointer: `zoomAxisAround`, then `scrollLeft` set so the beat under the pointer stays.
  The listener is non-passive, so the browser's page zoom doesn't run. The plain wheel and Shift+wheel scroll natively.
* **The slider** is logarithmic over the range (its value is `log2(pxPerBeat)`), labelled *Zoom*.
* **Zoom to fit** (toolbar, Shift+Z): the timeline from 0 to `timelineEnd` (or 32 bars when empty) across the width.
  **Zoom to selection** (toolbar, Z): the selected region with a bar of margin on each side; disabled without one (the
  loop brace joins in 12b). Both go through the store's `zoom`/`takeZoom`, applied by the view once it knows its width.
* **Middle-drag pans** both axes (`scrollLeft`, `scrollTop`), from a pointerdown with `button === 1` on the lanes, with
  pointer capture and `preventDefault`, so the browser's auto-scroll doesn't start (the wave editor's rule).
* **Auto-scroll:** while a region is dragged within 24 px of the timeline's left or right edge, or past it, the view
  scrolls by `autoScrollUnits` each animation frame, and the drag keeps following the pointer's beat.

### Grid and snap

* **The grid** is a `select` in the toolbar: *Bar*, *Beat*, *1/2*, *1/4*, *1/8*, *1/16*, *Off*, in beats 4, 1, 0.5,
  0.25, 0.125, 0.0625. It replaces `snap()` everywhere it is used: drops, *Add clip* at the right-click, region moves and
  resizes, and the position.
* **Region edges:** while a region is moved or resized, its start and end also snap to every other region's start and
  end on any lane within `SNAP_PX` (8 px), through `snapTo`, so regions can be butted without zooming in. With the grid
  off, only region edges snap.
* **Alt** held during a drag (or at the drop) doesn't snap at all.
* A move snaps the region's start; if its end is nearer a target than its start is, the end snaps instead (so a region
  can be dragged to end at a bar).

### The position and playback

* **The position** (`position`, in beats) is drawn as a line over the lanes and a marker in the ruler.
* **A click in the ruler** sets it, snapped to the grid (Alt: not). While the arrangement plays, the click also seeks:
  `playArrangement(position)`, which plays what is under the playhead.
* **▶ *Arrangement*** plays from the position. **■** stops; the position stays. ■ while stopped sets it to 0.
  `stopArrangement()` in `state/engine-controls.tsx` holds this rule (the spec's seam).
* The toolbar's ▶ and ■ are the only ones that do this; the transport bar's ▶ and Space are unchanged (the spec's
  decision). Space stops the arrangement as before; the position stays.
* `ArrangementView`'s comment that ▶ resumes goes; it was never true.

### Follow

* **The rule** is the piano roll's: when the playhead leaves the visible timeline, `scrollLeft` is set so it sits 15%
  in. It runs in the playhead's effect, as `clip-editor/Playhead.tsx` does, so no other component renders.
* **A scroll the user makes** while the arrangement plays and follow is on (a wheel or trackpad scroll sideways, a
  middle-drag, a zoom, a drag of the scrollbar) sets `following` to false, and the toggle shows it half lit, titled
  "Follow is paused until the next ▶". The playhead's own scrolls are told apart by a flag set around them.
  ▶, and turning the toggle on, set `following` back to true.
* **The toggle** is a button in the toolbar, *Follow*, `aria-pressed`, F.

### Keys

The timeline's lane area is focusable (`tabIndex={0}`, a visible focus ring) and takes the focus on a press that isn't
on a region. Its `onKeyDown` asks one pure function, `timelineKeyAction(key, state, timeline)`, as `waveKeyAction` does:

| Key | Does |
|---|---|
| ← → | the position a grid step back or on (a beat with the grid off) |
| Alt+← Alt+→ | the position a tenth of the visible timeline |
| Home, End | the position to 0, or to `timelineEnd` |
| + (=), − | zoom by two wheel notches around the position (the middle when it is out of view) |
| Z, Shift+Z | zoom to the selected region, to fit |
| F | follow on or off |

* A key that moves the position out of view scrolls by the least that shows it.
* The rows go into `VIEW_KEYS` under *Arrangement*, read only in the shortcuts dialog. Space, Tab and the global keys
  are not taken. 12b adds M, L, `[` and `]`.
* A focused region keeps its own keys; the arrows don't move regions in 12a.

## Steps

Each step lands green: `npm test`, `npm run typecheck`, `npm run test:smoke` (outside the sandbox: it needs local
ports). Step 2 changes the engine's status and step 6 the transport's use, so they also run `npm run test:audio`.

1. **Shared timeline geometry.** `ui/shared/timeline/` (`axis.ts`, `ticks.ts`, `snap.ts`); the wave editor's functions
   become wrappers; `SnapTarget.frame` → `at`.
   *Tests:* the axis functions in beats (clamp at both ends and at the minimum, zoom around a column keeps its beat,
   `zoomAxisTo` shows the range, `autoScrollUnits` zero inside, growing, capped); `ticks` in beats at 1, 24 and 256 px
   per beat; `snapTo` (nearest within `SNAP_PX`, `ignore`, none). The wave editor's existing geometry, ruler and snap
   tests pass unchanged.
   *Browser:* the wave editor specs pass unchanged.
2. **`core` and the engine.** `arrangementRows`, `timelineEnd`, `MAX_TIMELINE_BEATS` and the clamps, the sanitizer's
   `loop` and bound, `EngineStatus.mode`.
   *Tests:* `arrangementRows` (stripes, nesting, hidden and collapsed left out, returns left out, memoized);
   a looping region round-trips through save and load; a region past the bound is dropped
   with a warning; `status().mode` after `arrangement/play`, `transport/play`, `clip/launch` and `scene/launch`.
   *Audio:* the arrangement specs pass; the bounce hashes in `old-projects.test.ts` hold.
3. **The layout and the headers.** `arrangement-view-store` with its storage hook, the grid with sticky headers and
   ruler, `ArrangementHeader` with `MuteSolo` (moved to `ui/shared/`), the header splitter, the ruler canvas, CSS grid
   lines, one playhead overlay shown in arrangement mode only, the region move asking `clipFitsTrack`.
   *Tests:* the storage hook reads the old zoom key once and refuses bad values (a fixture with today's JSON).
   *Browser* (`arrangement.smoke.spec.ts`): after scrolling the timeline 2000 px sideways, the first track's header is
   still at the view's left edge and its M mutes the track (the mixer's M is lit); scrolling down moves a header and its
   lane by the same amount; a group's S half-lights its members'; a MIDI region dragged onto an audio lane stays on its
   own (the lane shows refuse); the playhead is absent while a scene plays. The existing arrangement, drag-and-drop,
   linked-selection, context-menus and tracks-tree specs pass, with selectors changed only where the name moved into the
   header. `views-at-min-size` passes with the arrangement at 480 × 240.
4. **Zoom and scroll.** The range, ⌘-wheel and pinch, the logarithmic slider, fit and selection, middle-drag,
   auto-scroll on a region drag.
   *Tests:* the arrangement's zoom range from `fitPerPixel` and the bounds; `pxPerBeat` ↔ slider value.
   *Browser:* ⌘-wheel over bar 9 zooms in and bar 9 stays under the pointer; *Zoom to fit* shows the last region's end
   inside the view; *Zoom to selection* on a selected region fills the width with it; a middle-drag to the left scrolls
   right; dragging a region past the right edge scrolls and drops it beyond the old view.
5. **Grid and snap.** The grid setting, `snap()` replaced, region edges as targets, Alt.
   *Tests:* the arrangement's `regionSnapping(regions, moving)` (edges of others, not its own); a move whose end is
   nearer a target snaps its end.
   *Browser:* with *Bar*, a region dropped mid-bar lands on the bar; with *Off*, a region dragged near another's end
   butts against it; with Alt, it lands where it was dropped.
6. **The position, playback and follow.** The position line and ruler marker, a click sets and seeks, ▶ from it, ■'s
   rule in `stopArrangement`, follow and its pause.
   *Tests:* `stopArrangement` (playing: stop, position kept; stopped: position 0); the follow rule as a function of the
   playhead's x and the view (inside: no scroll; past either edge: 15% in).
   *Browser:* a click at bar 5 then ▶ plays from beat 16 (the status's beat is ≥ 16 within the first status);
   ■ then ▶ starts at bar 5 again; ■ twice then ▶ starts at 0; zoomed in, the view scrolls with the playhead; a
   sideways scroll during playback pauses follow, and ▶ resumes it.
   *Audio:* the arrangement's audio specs pass.
7. **Keys.** `timelineKeyAction`, the focusable lane area, the `VIEW_KEYS` rows.
   *Tests:* `timelineKeyAction` as a table for every row, at 0 and at the end, with the grid on and off, with and
   without a selected region; the view follows the position past either edge.
   *Browser:* with the timeline focused, → four times at *Beat* moves the position to beat 4; Shift+Z then Z with a
   selected region; F toggles follow; the shortcuts dialog lists the *Arrangement* rows; → in the project name field
   doesn't move the position.
8. **Docs and the profile.** `architecture/clips-and-arrangement.md` (§ The arrangement: the headers, zoom, snap, the
   position, follow, keys, `arrangementRows`, the sanitizer), `architecture/samples-and-wave-editor.md` (the geometry's
   new home), `architecture/workbench.md` (the *Arrangement* view keys); this plan's "Changes made while implementing",
   sorted per [doc-workflow](../../dev/doc-workflow.md); STATUS and BACKLOG; the profile in
   [baselines](../../reference/baselines.md).

## Behavior changes

* Track and group names stay at the left while the timeline scrolls sideways; each has M and S. The column is wider
  (180 px) and resizable.
* The zoom slider covers a far wider range and is logarithmic; ⌘ or Ctrl with the wheel and a pinch zoom the timeline
  instead of the page.
* The ruler shows beats and sixteenths when zoomed in, not only bar numbers.
* Snap follows a grid setting (default 1/4, today's) and region edges; Alt turns it off for a drag.
* A click in the ruler sets where ▶ starts; ■ no longer rewinds to the start (■ twice does).
* The view follows the playhead by default.
* The arrangement's playhead is hidden while the session plays.
* A looping region stays looping after a reload.
* A region can't be dragged onto a lane of the other kind of track.
* The zoom kept in `sfxlab:arrangement-zoom` carries over; the key is no longer written.

## Verification

* `npm test`, `npm run typecheck`, `npm run test:smoke` at every step; `npm run test:audio` at steps 2 and 6.
* **Profiling:** `scripts/profile-status.cjs` `editor` and `groups`. Component renders should **fall**: one playhead
  instead of one per lane, and the headers' `MuteSolo` reads `mixRouting`, not the status. The new numbers go into
  baselines with the reason. Follow's scrolling must not render React components (it writes `scrollLeft` in the
  playhead's effect). `wave` stays at 56 (the shared geometry is the same arithmetic).
* **Measure:** a 4096-beat timeline at 256 px per beat (a project with a region at beat 4000): scroll and ⌘-wheel zoom
  stay smooth in Chromium (no long task over 50 ms in a 5 s trace while zooming), recorded in "Changes made while
  implementing".
* **Manual pass** in Chrome, and Firefox and Safari where they can be run (BACKLOG V3): sticky headers on a trackpad
  scroll in both axes; pinch zoom; middle-drag on a mouse; auto-scroll; every key with the focus on the timeline, on a
  region and in the project name field. What isn't done goes to BACKLOG V2 and V10's kind of item.

## Decisions to sign off

Signed off 2026-11-01: every row as proposed.

| Question | Proposed | Alternative |
|---|---|---|
| Returns' and the master's rows | **In 12c, with the lanes they exist to hold:** in 12a they would be empty rows with only M and S (and none for the master). Differs from the spec's split | In 12a, as the spec's split says |
| The arrangement's view keys | **View-local, listed read only in `VIEW_KEYS`,** as round 11c-1 settled for the wave editor. Differs from the spec's "rebindable" | Commands in round 10's table, rebindable; more to build for keys one view uses |
| Where the shared geometry's unit comes from | **An `Axis { start, perPixel, width }` of its own;** the wave editor's functions wrap it, `WaveView` keeps its names | Rename `WaveView` to the generic axis everywhere (25 files) |
| The mark geometry | **Moves in 12b,** with the markers | Moves now, unused until 12b |
| How the timeline scrolls | **A native scroller;** the axis is read from `scrollLeft` and the zoom, regions stay DOM elements in pixels | A virtual view in a store with canvases, as the wave editor; far more to rebuild for regions that are DOM today |
| Grid lines in the lanes | **CSS gradients** sized by variables; no drawing per frame | A canvas per lane, the visible size, redrawn on scroll |
| Snap targets besides the grid | **Other regions' edges, on every lane** | Only the same lane's |
| A region dragged onto the wrong kind of lane | **Refused, shown as refuse** (the session drops' rule) | Allowed, as today; it plays nothing there |
| Follow paused by the user's scroll | **Until the next ▶ or the toggle;** shown half lit | Resumes once the playhead re-enters the view |
| The header column's width | **180 px, 120 to 320 by a splitter, kept per browser;** 120 px under 600 px of view | Fixed at 120 px, as today |
| Arrangement settings in storage | **One key, `sfxlab:arrangement-view`,** reading the old zoom key once | A key per setting, as `useStoredState` does |
| The timeline's bound | **4096 beats, clamped in edits, dropped with a warning on load** (the spec's number, enforced here since zoom to fit and the scroller need it) | Clamped on load as well, moving the region instead of dropping it |

## Changes made while implementing

* **Step 1: the wave editor keeps `SnapTarget.frame`.** The plan renamed it `at` in the wave editor too; its wrapper maps
  `frame` to the shared `at` instead, so the wave editor's snap tests run unchanged. Its `BEAT_STEPS` stays sixteenths to
  64 beats; the arrangement's ruler has its own steps up to 2048 beats (`TIMELINE_BEAT_STEPS`), since a whole 4096-beat
  timeline at the farthest zoom needs labels that far apart.
* **Step 2: `EngineStatus.mode` is required**, as planned; two test fixtures that build a status by hand got it. The
  bound is `clampStartBeat`, used by `createArrangementClip` and `updateArrangementClip`. The audio specs passed
  (22).
* **Step 3: no shared splitter.** The plan named "the shell's `Splitter`"; the shell's splitters are flexlayout's, and
  the only one of ours is the wave editor's `PaneSplitter`. The header column has its own `HeaderSplitter` on the same
  pattern (a `separator`, ← and →, a double-click for the default).
* **Step 3: group rows stay 28 px**, as before; the plan's 56 px is a track row.
* **Step 3: `GroupMuteSolo` moved with `MuteSolo` and `useRoute`** to `ui/shared/MuteSolo.tsx`, with their CSS; the
  headers draw them `compact`.
* **Step 3: the ruler's label clashed.** "Bars and beats" made the export dialog's `getByLabel('Bars')` match twice; the
  canvas is *Timeline ruler*.
* **Step 3: scrolling a lane into view put it under the headers.** Playwright's drops (and anything calling
  `scrollIntoView`) aligned a lane's start with the scroller's edge, behind the sticky header column. The scroller's
  `scroll-padding` is now the header column and the ruler.
* **Step 3: the lane highlight while dragging a region never showed.** The region set `data-drag-over` on the lane
  body, while the CSS styled `.row[data-drag-over]`. It is now `[data-lane][data-drag-over='accept' | 'refuse']`.
* **Step 3: the ruler canvas's width is set when it draws**, from the scroller less the ruler cell's offset, since a
  CSS width for "the visible timeline" isn't available; it redraws when the header width changes too.
* **Step 4: `useTimelineZoom` returns the zoom**, so the slider zooms around the middle of the view and the keys around
  the position, through the same path as the wheel.
* **Step 5: a moved region's end only wins when it snapped.** Left where it was, an end that is near nothing is always
  "nearer" than a start that snapped; the browser test caught it, and a unit test now holds it.
* **Step 6: follow's own scroll can come after the user's.** Setting `scrollLeft` by hand and follow's next frame both
  happen before the scroll event, so the event alone can't tell them apart. Follow keeps where it last scrolled to on
  the scroller (`data-follow-left`) and checks it before scrolling (`movedSinceFollow`); it forgets it when playback
  stops and when follow is turned on again, or ▶ would pause it again at once.
* **Step 6: the test reads `data-paused`.** The Follow button's paused state is also its title, but the test reads an
  attribute meant for it.
* **Step 7: only a key on the timeline itself is a view key.** The scroller holds the headers' buttons and the regions,
  whose keys bubble to it; it acts only when the event's target is the scroller.
* **Step 7: *Zoom to fit* can zoom in.** It shows from 0 to the content's end, so a single short region at the start
  fills the width. That is the plan's rule; the browser test places the region at bar 6.
* **Profile** (`scripts/profile-status.cjs`, 2026-11-04, `9ac535f`, load average 9 to 10): `editor` 87 component renders
  a second (145 before: three playheads, one per lane, now one), 14.2 script ms; `groups` 58 (87 before: the
  arrangement's playheads ran while scene 1 played, and now don't), 10.0 ms; `wave` 56, unchanged, 11.3 ms.
* **Measure** (`scripts/measure-long-timeline.cjs`, production build, headless Chromium): a region at beat 4000 at
  256 px a beat makes the lane 1,025,976 px wide; five seconds of sideways scrolls and ⌘-wheel zooms gave no long task.
* **Not done:** the manual pass in browsers (BACKLOG V11).
