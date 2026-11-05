---
status: active
date: 2026-11-05
note: "1-5 and 9 built on feat/user-testing-quick-wins (not merged); 6-8, 10 and 11 are backlog items C9-C11, M1-M2; 9 not checked on a physical controller (V5)."
---
# User testing feedback, November 2026

Notes from a manual testing session (originally `docs/review-notes.tmp.md`), each traced to the code it touches and
rated by **size** (XS under half a day, S up to a day, M 2-4 days, L about a week, XL several weeks) and
**complexity** (how risky or design-heavy the change is, not how long it takes).

## The notes

UI:

1. Selecting a track in the Tracks view (left sidebar) should scroll it into view in the Session view, and the same
   for the Arrangement.
2. Highlight the selected column in the Session view (a lighter background).
3. Highlight the selected row in the Arrangement view (a lighter background).
4. Graph view: (a) highlight selected nodes with the title bar colour and the node background; (b) a show-sockets
   toggle in the node title.
5. Front panel (instrument / effects): (a) no delete, just hide; (b) a *Cancel* next to *Done* that discards changes.
6. Group controls, with a visual frame and a label, maybe with vertical / horizontal and a number of items per row or
   column.
7. Pin individual controls to the Pinned view; they appear in their instrument's group. Groups should be pinnable as
   well, and submodules or their individual controls.

Modules in a graph:

8. A module that contains a control should expose a port; when it is connected, it overrides the internal control and
   hides it on panels.

MIDI:

9. MIDI control is slow and laggy.
10. How can we map MIDI channels to tracks?
11. How can I record MIDI clips in the Session, and directly in the Arrangement?

## Ratings

| # | Note | Size | Complexity |
|---|---|---|---|
| 1 | Tracks view selection scrolls Session and Arrangement | S | Low |
| 2 | Selected Session column highlight | S | Low |
| 3 | Selected Arrangement row highlight | S | Low |
| 4a | Selected node title bar and background | XS | Low |
| 4b | Per-node show-sockets toggle | S | Low-Med |
| 5a | Panel: hide, not delete | XS | Low |
| 5b | Panel: *Cancel* beside *Done* | S-M | Medium |
| 6 | Control groups (frame, label, direction, per line) | L | Med-High |
| 7 | Pin single controls, groups, submodules | L (XL with nested modules) | High |
| 8 | Module control ports that override the inner control | M-L | High |
| 9 | MIDI CC lag | S-M | Medium (diagnose first) |
| 10 | MIDI channels to tracks | M | Medium |
| 11 | MIDI clip recording (Session, Arrangement) | XL | High |

## Analysis

### 1-3. Selection in the Session and Arrangement views

The headers already know the selection (`TrackHeader`, `ArrangementHeader` read `useSelectionStore`); the cells and
lanes do not. Scrolling needs a one-shot request from the Tracks view (the Pinned view's `pinRequest` is the pattern),
answered by each view with a scroll into view. A track inside a collapsed group has no column or row of its own, so
its group's is used.

### 4. Node cards

(a) is CSS only: a selected card has an accent border today (`Patcher.module.css` `.selected`). (b) The card's shape
comes from `visibleShape(shape, nodeId, patch, showSockets)` with the canvas-wide *Sockets* toggle. A per-node toggle
makes that flag "global or this node". Every reader of the shape (the card, the wire layer, `nodeHeight`, port
positions, the marquee) must agree, or wires end in the wrong place. Kept a way of looking (browser-only), like the
global toggle.

### 5. Front panel edit mode

(a) Remove the delete tool in `ControlCell`; hide and the hidden tray exist. (b) Edit-mode changes are applied live,
each its own undo step, and some land outside the graph (a module stand-in is moved and renamed inside the module
definition). *Cancel* keeps a copy of the patch and the module library from when *Edit panel* was pressed and puts
them back as one undo step.

### 6. Control groups

A new optional saved field: the groups of a patch (label, direction, per line, order) and each control's group. The
board is one flat ordered grid today (`panelItems`, `fitSpan`); a group becomes a nested grid that has to fit the
narrow-board rules and the play-only pinned board. Edit UI: create, rename, move controls in and out, reorder, set
direction and count, remove (the controls fall out). Groups made inside a module should show on the panel of a graph
that uses it. Recommended: one level, no groups inside groups.

### 7. Pinning parts of a panel

Pins are whole graphs (`PanelPin { owner, graph }`, `core/project/pins.ts`). Needed: pins for one control, one group
(after 6), a module use with its controls, and a control inside a module, shown under their instrument's heading.
Rules for a graph pinned whole and in part. A pin whose control is gone stays hidden, as today, so undo brings it back.
Controls of a module nested inside a used module are not on the parent panel at all yet (backlog C2); pinning those
means addressing values one level deeper, which is what makes it XL.

### 8. Module control ports

Today an inner socket has to be ticked to become a module input, and a control node has no input. The change: every
control inside a module gets an input on the use, and a wire into it replaces what the control drives. `expandModuleUse`
(`core/patch/flatten.ts`) maps one inner port per input today and needs a fan-out to the control's wires. Then: the
stand-in leaves the panel, MIDI mappings and automation of that control report it as wired, note-graph modules do the
same, and the clamp question (is the wire held to the control's range?) is decided. It should fold into the ticked
inputs rather than sit beside them.

### 9. MIDI CC lag

Every CC message ran the whole edit path at once (`app/midi-controls.ts`): target resolution, a `flattenPatch` for
the momentary check, `editControlBases`, a history commit, then `connectEngine` diffing the whole project, compiling
and stringifying automation, and React re-rendering. Pointer drags pass through `createFrameThrottle` because "every
value that reaches the project is re-flattened and diffed"; MIDI did not. A knob sends tens to a hundred messages a
second, and note-ons (sent straight to the worklet) queue behind that work. The fix: keep every message for pickup and
feedback, but write only the latest value per mapping once per animation frame. If notes lag with no knob moving, the
cause is elsewhere (output latency, Bluetooth); no physical device has been tried (V5).

### 10. MIDI channels to tracks

Not possible today: one channel filter for all input, notes go to the pinned or selected instrument. Needs a per-track
input (device or any, channel or any) saved in the project, a control on the track header or mixer strip, and routing
per message in `app/midi-input.ts` (a press already remembers its track, so note-off is safe).

### 11. Recording MIDI clips

Nothing exists: no arm, metronome or count-in, and live notes never edit the project. Reusable: `RecordingClock` /
`AudioHost.recordingBeat` (event time to transport beat, built for touch automation), the loop-wrap split in
`core/automation/record`, the clip and region models, launch quantisation. Phases: record into an empty Session slot,
quantised, then loop (about a week); record a region in the Arrangement with punch (about a week); overdub, metronome,
count-in and takes (about a week). Depends on 10 (arming implies an input route).

## Order

1. 1-5 and 9 together (this branch).
2. 10, then 11.
3. 6, then 7.
4. 8 on its own.

## Changes made while implementing

Built on `feat/user-testing-quick-wins`. Described in
[tracks-and-groups](../architecture/tracks-and-groups.md), [control-nodes-and-panels](../architecture/control-nodes-and-panels.md)
and [midi](../architecture/midi.md); decisions 124-127 in [decisions](../decisions/README.md).

* **1.** The scroll answers a request from the Tracks view (`requestReveal`, with a serial), not every selection change,
  so a click on a clip in a half-visible column doesn't move the grid. A view that mounts later (switching to the
  Arrangement tab) answers the last request, which lands on the row chosen. The session's scroller got
  `scroll-padding-inline-end` so a revealed column doesn't end under the sticky scene column. What is scrolled to is the
  marked element's first child: a session column's wrapper has no box, and an arrangement lane is as wide as the
  timeline (its sticky header is what has to show).
* **2-3.** Each session column's header and cells are wrapped in a `display: contents` element that carries the marks.
  The drag-and-drop smoke spec found cells by index among the grid's children; its `slotOf` now takes the wrapper's child.
  A selected expanded group lightens all its columns in the session (it has no column of its own) and its own lane in the
  arrangement.
* **4b.** Kept in the graph-view store per canvas (`canvasKey`), for the session only, like the viewport. While the
  toolbar's Sockets is on, the card's toggle shows pressed and disabled.
* **5b.** The edit mode only ever changes this patch (a module's controls are moved and hidden inside the module), so
  the snapshot is the patch alone. Cancel keeps current parameters of every node still there, which keeps the values
  turned meanwhile; edits made elsewhere to the same graph during edit mode would be undone too (only value changes are
  possible from elsewhere, and those stay).
* **9.** The cause found in the code, not profiled on hardware: every CC message ran the whole edit path. The fix keeps
  every message for pickup and writes once per frame. A value waiting to be written is treated as where the control is,
  otherwise pickup would rearm on its own output (unit-tested). The legacy `docs/browser-checks/panel.mjs` was updated
  for Cancel and not run.
