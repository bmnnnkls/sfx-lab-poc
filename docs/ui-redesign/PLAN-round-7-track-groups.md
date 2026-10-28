# Round 7: track groups and the Tracks tree

Status: **planned** 2026-10-28, decisions signed off as proposed. Part of the [UI redesign](README.md). Carries out
[roadmap § Round 7](DRAFT-roadmap.md#round-7-track-groups-and-the-tracks-tree), from an inventory of where tracks are
kept, ordered and listed, taken on `feat/ui-redesign` at `22a2c69` (round 6 merged). The roadmap asked for a short
SPEC of the model before this plan; § [Model](#model) below is that SPEC, and its open questions are rows of the
decisions table.

## Goal

Tracks can be put in order and in folders. After this round:

* **a group** is a folder of tracks: a name, a colour, a collapsed flag and an optional parent group. Groups nest.
  Round 8 adds an optional summing bus to the same group, with no second change to the file format;
* **reordering and regrouping** tracks and groups, by dragging and from round 5's menus, each as one undo step;
* **the session grid, the arrangement and the mixer** draw a group's members together under a group header, in the
  group's colour, and fold them away when the group is collapsed. A collapsed group in the session grid is one column
  whose cells launch its members' clips in that scene;
* **a Tracks view**: tracks and groups as an ARIA tree, in the primary sidebar, with an activity-bar button. Create,
  rename, delete, regroup, reorder, collapse, hide and show;
* **hidden tracks**: left out of the grid, the arrangement and the mixer, still playing. The tree and the grid mark
  that something hidden is sounding;
* **files without groups load unchanged**, and look as they do today.

**Out of scope:**

* the group's bus, its strip, fader, mute and solo, sends and output (round 8, see [What this leaves for round
  8](#what-this-leaves-for-round-8));
* selecting a group in the selection store (round 8, when a group has effects to edit);
* several tracks selected at once, and grouping several at once (see the decisions);
* copying and pasting tracks, and duplicating a group (see the decisions);
* drops that make tracks, and presets or library items dropped on a group;
* track colours (only groups have one this round);
* track headers docked beside the arrangement's lanes (round 12);
* keyboard shortcuts beyond the tree's own keys (round 10);
* changing the example projects.

## Inventory

### Where tracks are kept and ordered

| Where | What it does today |
|---|---|
| `Project.tracks` (`core/project/types.ts`) | The one list of tracks: instrument, audio and return. Its order is the only order there is. `addTrack` appends; `duplicateTrack` inserts the copy right after the original; `removeTrack` filters. Nothing moves a track. |
| `sessionOrder` (`ui/session-view/track-order.ts`) | The clip tracks in project order, then the returns. Used by `SessionView` (twice: the headers and each scene row) and `MixerPanel`. A new instrument track added after a return still shows before it. |
| `ArrangementView` | `project.tracks` without the returns: one lane each, in project order (the same order as `sessionOrder`'s clip tracks). |
| Pickers (Send, *notes from*, Track audio, Library destination, Sounds' scope) | Read `project.tracks` in its order. |
| `tracks[0]` fallbacks | `FxPanel`, `LibraryPanel` and `PresetsPanel` fall back to the first track when nothing is selected. |
| `diffProject` (`core/sync`) | Keys tracks by id. Reordering `tracks` produces **no engine command**; a changed track runs `diffTrack`, which compares named fields only, so a new field such as `groupId` sends nothing. |
| `Engine` | Keeps tracks in a `Map` in the order they were added, and runs and mixes them by `mixDependencies` (notes taken, sends, Track audio). Project order matters only when a loop between returns degrades to "the plain order", which is the engine's own order, not the project's. |

So order and folders are a model and UI matter: nothing in this round reaches the engine except launching a
collapsed group's cell.

### The track model

* `TrackBase`: `id`, `name`, `volume`, optional `pan`, `muted` and `soloed` (saved only when not the default), and
  `fx`. Instrument and audio tracks add `sends` and `clips`; returns add `automationSlots`.
* Tracks have no colour. `NAME_LIMITS` (`core/project/rename.ts`) has track, clip, scene and sample.
* Track ids are **owner ids**: `ControlOwner { kind: 'track', trackId }` names them in control values, MIDI
  mappings, automation lanes, snapshots and sample bindings. The sanitizer warns on a duplicate owner id.
* `MAX_TRACKS` is 64, the file format's limit too.

### The file format

* `CURRENT_VERSION` is 9 (`core/persistence/format.ts`). Optional fields have been added both ways: the mixer's
  `pan`, `muted`, `soloed` and `Project.arrangement` without a bump; MIDI mappings, automation, snapshots and library
  origins with one, whose migration **strips** the unknown old field ("do not reinterpret an unknown old field").
* `sanitizeProject` reads tracks one by one (`sanitizeTrack`), then repairs cross-track references
  (`repairTrackReferences`, `repairSendLevels`) and the arrangement, with a warning for each repair.

### Undo

* Every project store edit is one `commit` to the history, merged with the previous one when they share a `mergeKey`
  within 800 ms. Mute and solo are undo steps. There is no edit that changes the project without an undo step.

### Track actions and drops

* `state/actions/track.ts`: *Stop*, *Open instrument*, *Open effects*, *Open notes*, *Show automation*, *Rename*,
  *Duplicate*, *Mute*, *Solo*, *Delete*. The `track` subject is `{ kind: 'track', trackId }`, for instrument, audio and
  return tracks.
* `state/actions/drops.ts`: `track` is a **drop target** already: presets (`drop.sound-on-track`) and library graphs
  (`drop.library-item-on-track`) land on the session header, the mixer strip and the arrangement lane's name. Nothing
  drags a track: `DragPayload` is `clip`, `sample`, `sound` and `library-item`.
* The drag hooks (`ui/shared/drag`) take a target as a subject or as a function of the event (a lane's beat); a second
  function writes feedback on the element (a lane's `--drop-at`). That is how a track target can carry which side of
  it the pointer is on.

### The views that list tracks

* **Session grid** (`SessionView`): a CSS grid, one column per track in `sessionOrder`, then the master and the scene
  column. The headers are sticky at the top. Each `SceneRow` maps the tracks again. A scene launch
  (`engine.launchScene`) launches each track's clip in that row and **stops tracks whose slot is empty**, for clip
  automation too (`Automation.scene`).
* **Header** (`TrackHeader`): the name (a button that selects; `InPlaceRename`), fx and notes badges, the volume
  slider, stop and remove. The whole header is a drop target. A slider inside a `draggable` element competes with
  the drag, so only the name should be a drag handle.
* **Mixer** (`MixerPanel`): one `ChannelStrip` per track in `sessionOrder`, then a sticky `MasterStrip`.
* **Arrangement**: a `LaneName` (selects, carries the track menu, drop target) and a `LaneRow` per clip track.
* **A tree already exists**: the Library's `FolderTree` follows the WAI-ARIA tree pattern (roving focus, arrows,
  Right and Left to expand and collapse, in-place rename, a narrow mode). Its expansion is local state.
* **The activity bar** lists Session, Arrangement, Wave editor and Library. A view added to the registry is put into
  its default region in saved layouts by `checkModel`, so saved layouts need no migration.

### Selection

* The selection store holds one `trackId` (or `master`), `clipId`, `regionId`, `automationScene` and `sampleId`.
  There is no multi-selection of tracks, and no group.

### What the inventory changes in the roadmap's outline

* **The order of tracks already lives in one place,** `Project.tracks`. This plan keeps it the only order: a group's
  members sit together in it, and a group is drawn where its first track is. So there are **no empty groups**: a
  group is made around a track, and goes when its last track leaves (see the decisions).
* **Collapsing and hiding would flood undo.** Every project edit is an undo step today, and the tree collapses on
  Left. This plan saves `collapsed` and `hidden` with the project but keeps them out of undo, carried across undo and
  redo (see the decisions).
* **Grouping is one track at a time.** There is no multi-selection of tracks, so *Group* makes a group around one
  track, and others are dragged or moved in (*Move to group* ▸).
* **A track target needs a side.** Presets already land on the track as a whole. A track dropped on a track lands
  before or after it, so the `track` subject gains an optional `edge`, set only by drop targets, as a `lane` carries
  its beat.
* **A collapsed group's cell is a scene launch, restricted.** A scene launch stops tracks with an empty slot, so the
  group's cell does the same for its members. `scene/launch` gains an optional list of track ids, the one engine
  change of this round.
* **`sessionOrder` moves to `core`.** Actions (*Move up*, *Move down*) and three views need the same rows, so the
  order, with groups, is one function in `core/project`.
* **Copying tracks stays out.** Round 5 left copy and paste of tracks to "revisit with round 7's tree". The tree
  doesn't change why it was left out (a pasted track into another project needs its modules and samples), so it
  stays out, as does duplicating a group.
* **Group mute and solo wait for round 8.** Their rules are round 8's main risk and come with the bus. A folder's
  header has no M or S this round.

## Design

### Model

In `core/project`, a new file `track-groups.ts`:

```ts
/** A folder of tracks, and from round 8 optionally a summing bus. Returns and the master can't be grouped. */
interface TrackGroup {
  readonly id: string                // 'group_…', never the id of a track: round 8 makes it an owner
  readonly name: string
  readonly colour: GroupColour       // a name from GROUP_COLOURS, drawn through a CSS variable
  readonly collapsed?: boolean       // absent = expanded
  readonly parentId?: string         // the group it is nested in; absent = the top level
  // round 8: readonly bus?: GroupBus  (absent = a folder)
}

const GROUP_COLOURS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const
```

* `Project.groups?: readonly TrackGroup[]`: absent in a project without groups.
* Instrument and audio tracks gain `groupId?` (the group they are directly in) and every track gains `hidden?`
  (absent = shown). Returns never have a `groupId`.
* **One order.** `Project.tracks` stays the order of everything. A group's tracks, its nested groups' included, are
  contiguous in it, and the group is drawn where its first track is. The order of `groups` itself means nothing.
* **Invariants,** kept by every edit and repaired on load: a `groupId` names a group; a `parentId` names another
  group, with no cycles and at most `MAX_GROUP_DEPTH` (4) levels; every group has at least one track in it or in a
  nested group; members are contiguous; at most `MAX_GROUPS` (64) groups.
* **Rows.** `trackRows(project)` returns what the views draw, depth first: a row per group (`{ kind: 'group', group,
  depth, members }`) and per track (`{ kind: 'track', track, depth }`), clip tracks first and returns at the end, as
  `sessionOrder` does. It replaces `sessionOrder`. `visibleRows(rows)` leaves out hidden tracks, the members of
  collapsed groups, and groups whose tracks are all hidden. Both are memoized by the identity of `tracks` and `groups`.
* **Edits,** each returning the same project when nothing changes:
  * `groupTrack(project, trackId) → { project, groupId }`: a new group around the track, in the track's group,
    named "Group *n*", with the next colour;
  * `moveTrack(project, trackId, place)` and `moveGroup(project, groupId, place)`, where `place` is `{ before: item }`,
    `{ after: item }` or `{ inside: groupId }` (at its end), and an item is a track or a group. The moved thing takes
    the group of what it lands next to. A clip track never lands among the returns or a return among the clip tracks;
    a group never lands inside itself or deeper than `MAX_GROUP_DEPTH`. A group left with no tracks goes;
  * `ungroup(project, groupId)`: its tracks and nested groups move up one level, where they are;
  * `removeGroup(project, groupId)`: the group, its nested groups and their tracks, through `removeTrack`, in one edit;
  * `setGroupName` (`NAME_LIMITS.group`, 40), `setGroupColour`;
  * view edits: `setGroupCollapsed`, `setTrackHidden`, `setGroupHidden` (all its tracks).
* **Existing edits:** `removeTrack` drops a group it leaves empty; `duplicateTrack` already copies `groupId` and
  inserts after the original, so the copy joins its group; `addTrack` appends at the end, ungrouped, as today.
* **Engine:** none of this is sent. `diffTrack` ignores `groupId` and `hidden`; `diffProject` ignores order.

### Collapsed and hidden are saved but not undone

* `collapsed` and `hidden` are **view fields**: saved with the project, autosaved, but not undo steps. The project
  store's new `editView(change)` replaces the present without a commit.
* Undo and redo keep what is showing: after either, `withViewOf(restored, current)` copies `collapsed` of every group
  and `hidden` of every track found in both, so an undo of a note edit doesn't unfold a group. A group or track that
  undo brings back keeps the flags it had. It returns `restored` itself when nothing differs.
* Everything else about groups (create, move, ungroup, delete, rename, colour) is one undo step each.

### The file format

* `CURRENT_VERSION` becomes 10. Migration 9 strips `groups`, and `groupId` and `hidden` from tracks, as earlier steps
  strip unknown old fields.
* `sanitize-groups.ts` reads `groups` and repairs, each with a warning: a group without a usable id, or whose id is
  already a track's or another group's, is dropped; an unknown colour becomes the first; `collapsed` and `hidden`
  count only as a real `true`; a `parentId` to a missing group, or one that closes a cycle or goes past the depth,
  is cleared; a track's `groupId` to a missing group, or on a return, is cleared; a group with no tracks is dropped;
  members that aren't contiguous are moved together, keeping the order of the first member (a stable sort).
* `LIMITS.groups` is `MAX_GROUPS`.
* A project without groups is saved without `groups`, so it reads as before apart from the version.

### Actions

* **A `group` subject:** `{ kind: 'group'; groupId; edge? }`. `state/actions/group.ts`:
  * *Rename* (`renameAction('group')`, in place in the tree and on the grid's group header);
  * *Collapse* / *Expand*;
  * *Colour* ▸ the eight colours (choices);
  * *Hide tracks* / *Show tracks*;
  * *Move up* / *Move down*;
  * *Ungroup*;
  * *Delete group and tracks* (danger).
* **Track actions gain:**
  * *Group* (edit): a new group around this track; refused for a return and at `MAX_GROUPS` or the depth;
  * *Move to group* ▸ (edit): the groups it can go into, and *No group*; not on a return;
  * *Move up* / *Move down* (edit): before the previous row or after the next one at the same level, in the tree's
    terms (left and right in the grid). Disabled at the ends of its list;
  * *Hide* / *Show* (edit).
* The store gains the matching methods; the view edits go through `editView`.
* *Delete* on a track in a group that empties it removes the group too, in the same step.

### Dragging tracks and groups

* **Payloads gain `track` and `group`.** Targets: `track` and `group`, each with an `edge` computed from the pointer:
  `before` or `after` by the half it is over (vertical in the tree and the arrangement, horizontal in the grid and the
  mixer); on a group, the middle third of a tree row, or the grid's and the mixer's group header, is `inside`.
* **Drops,** in `drops.ts` like every other:
  * `drop.track-on-track`: `moveTrack` before or after it;
  * `drop.track-on-group`: `moveTrack` before, after or inside;
  * `drop.group-on-track` and `drop.group-on-group`: `moveGroup` the same way.
  Each accepts by the same check its edit makes (kinds, cycles, depth), so a refused place shows `refuse`. A move is
  one undo step. Alt does nothing: tracks are moved, not copied.
* **The edge on the element.** The feedback function writes `data-edge="before|after|inside"`, drawn as a line or an
  outline, as a lane writes `--drop-at`.
* **Sources:** a tree row; the track's name in the session header, the mixer strip and the lane name (not the whole
  header, whose slider would compete with the drag); a group's header in the grid, the mixer and the arrangement. A drag starts
  only past the browser's threshold, so clicks still select. While a name is renamed in place, its payload is `null`.
* **Presets and library items** keep landing on a track as before; they ignore `edge`.

### The Tracks view

`ui/tracks/TracksView.tsx`, view id `tracks`, title *Tracks*, a tool view (280 × 200). It starts in the primary sidebar
after Library, and the activity bar gains a *Tracks* button after Library.

* **The tree** draws `trackRows`, clip tracks then returns under a *Returns* label, following the WAI-ARIA tree pattern
  as `FolderTree` does: one row in the tab order, ↑ ↓ Home End move, → expands or goes to the first child, ← collapses
  or goes to the parent, Enter selects a track. **Alt+↑ and Alt+↓** run *Move up* and *Move down*, the keyboard route
  for reordering. Shift+F10 opens the row's menu.
* **A group row:** twisty, colour swatch, name, the number of tracks, an eye. **A track row:** name, *audio* or
  *return* tag, an eye, and while hidden a dot lit when it sounds. The selected track's row is `aria-selected`;
  clicking a track row selects the track, as the session header does.
* **Expansion is the group's `collapsed` flag.** Collapsing in the tree collapses the group in every view: one flag,
  as in Ableton (see the decisions).
* **Hidden rows** show dimmed with a crossed eye. A toolbar has *Show all* (while anything is hidden), *Collapse all*
  and *Expand all*.
* **Empty state:** "No tracks yet", with *Instrument track* and *Audio track* buttons, by the round-4 rule.
* Narrow is its normal width; nothing else to lay out at 280 px.

### The session grid

* **Columns** come from `visibleRows`: a track, or a collapsed group. `SceneRow` reads the same rows.
* **Group bands.** Above the headers, a sticky row per nesting level present draws each expanded group as a band
  across its members' columns: twisty, name (in-place rename), colour, menu, drag handle, and a drop target
  (`inside`). Member headers get a stripe in the group's colour.
* **A collapsed group** is one column: a header (twisty, name, colour, the number of tracks) and a **group cell** per
  scene. The cell shows ▶ when a member has a clip in that scene, is marked while one of those clips plays or is
  queued, and launches them: `engine.launchScene(scene, memberIds)`, which launches each member's clip in that scene
  and stops the members whose slot is empty, as a scene launch does. Hidden members are included: they still play.
  The cell has no menu this round.
* **`scene/launch` gains `trackIds?`.** Without it, as today; with it, only those tracks and their clip automation.
  `EngineControls.launchScene(scene, trackIds?)`.
* **Hidden tracks** have no column. After the last header, a **Hidden** button shows how many tracks are hidden, is
  lit while any of them sounds (its peak in the status is above -60 dB), and reveals the Tracks view. It subscribes
  through one selector that returns a boolean, so it renders only when that changes.
* With every clip track hidden, the grid shows its empty-state line with *Show all tracks*.

### The arrangement and the mixer

* **Arrangement:** a group lane before its members: twisty, name, colour, drop target, drag handle. Collapsed, the
  members' lanes are not drawn, and the group lane shows their regions as thin bars, not interactive. Hidden tracks
  have no lane; their regions still play. Member lane names get the colour stripe.
* **Mixer:** a band above member strips, as in the grid. A collapsed group is one narrow strip: name, twisty, colour
  and the number of tracks; its fader comes with round 8. Hidden tracks have no strip. Returns and the master are
  unchanged.
* Neither marks hidden sound: the grid and the tree do (the roadmap's two places).

### What this leaves for round 8

* `TrackGroup.bus?: GroupBus`, absent = a folder, read by the sanitizer from version 10 without a bump: version-10
  files written by this round never have it. Its shape: `volume`, `pan?`, `muted?`, `soloed?`, `fx` (from a **Group
  in** node), `sends`, and the output, which is the nearest enclosing group with a bus, or the master. Nesting is
  already `parentId`, so "nested buses sum inwards" needs no new field.
* A group as an owner: `ControlOwner { kind: 'group', groupId }`. Group ids are already kept apart from track ids.
* `groupId` in the selection store; presets and library items dropped on a group; the group strip's and the collapsed
  column's fader, mute and solo; the mute and solo rules through groups.
* The collapsed column's cells and the group bands are where round 8's header fader goes.

### Browser tests

Specs import nothing from `src/`.

* **New `tracks-tree.smoke.spec.ts`:**
  * The activity bar's *Tracks* opens the view in the primary sidebar; the tree lists the demo's tracks in the grid's
    order, then the returns.
  * *Group* on a track's menu adds a group row; the session grid shows a band over that track; *Rename* names it.
  * A track row dragged onto the group row (`inside`) joins it: the band spans both columns. Undo puts it back.
  * Alt+↓ on a track row moves it, in the tree and in the grid's columns.
  * ← on the group row collapses it: the grid shows one column, the mixer one strip, the arrangement one lane with
    bars. Undo of an earlier edit leaves it collapsed.
  * The collapsed group's cell launches its members' clips (expanded again, their slots show playing).
  * The eye hides a track: it leaves the grid, the mixer and the arrangement; the grid's *Hidden* button shows 1.
    Launching the scene lights the button and the tree's dot (`fixtures`' peak wait). *Show all* brings it back.
  * After a reload, groups, collapse and hidden tracks are as they were.
  * *Ungroup* keeps the tracks; *Delete group and tracks* removes them, and undo restores both.
* **`drag-and-drop.smoke.spec.ts`** gains: a session header's name dragged onto another header's right half reorders
  the columns; a lane name onto a group lane joins the group; a return's name onto a clip track's header is refused.
* **`context-menus.smoke.spec.ts`** checks the track menu's new entries and the group menu.
* **`layout.smoke.spec.ts`** lists the *Tracks* tab and the activity bar's fifth button; **`views-at-min-size`**
  gains Tracks.

## Steps

Each step is one commit and leaves `npm test`, `npm run typecheck` and `npm run test:smoke` green. Steps 1 to 4 come
first, in order; steps 5, 6 and 7 need step 4 and not each other.

1. **The model in `core`.** `TrackGroup`, `Project.groups`, `groupId` and `hidden`; `trackRows` and `visibleRows`
   replacing `sessionOrder` (the views call `trackRows` and draw what they drew before); the edits; `removeTrack`
   dropping empty groups; `withViewOf`. Unit tests: every edit, the invariants after random moves, cycles and depth
   refused, the same project for a no-op, `trackRows` on a project without groups equal to today's order.
2. **The file format.** Version 10, migration 9, `sanitize-groups.ts`, `LIMITS.groups`. Unit tests: a version-9 file
   loads unchanged; each repair with its warning; save and load keep groups, collapse and hidden.
3. **Store and actions.** The store's group methods and `editView`, undo and redo carrying view fields; the `group`
   subject and its actions; the track actions' new entries; `NAME_LIMITS.group` and renaming groups. Unit tests:
   `describeActions` for tracks, returns and groups; one undo step per edit, none for collapse and hide; undo keeping
   a collapse.
4. **Drops.** `track` and `group` payloads; `edge` on both targets; the four drops. Unit tests: before, after and
   inside, refused places (a return among clip tracks, a group into itself, past the depth).
5. **The Tracks view.** `ui/tracks/`, the registry, title and minimum size, the default layout and the activity bar;
   the tree with its keys, menus, eyes, rename, drags and the sounding dot. Smoke: the tree cases above, and the
   layout and minimum-size specs.
6. **The session grid.** Group bands, collapse, the collapsed column and its cells, `scene/launch` with `trackIds`
   (unit test in the engine), hidden columns and the *Hidden* button, draggable names and group headers. Smoke: the
   grid cases and the header reorder.
7. **The arrangement and the mixer.** Group lanes and bands, collapse, the bars of a collapsed lane, hidden lanes and
   strips, draggable names. Smoke: the arrangement and mixer cases.
8. **Docs.**
   * ARCHITECTURE.md: a § Tracks and groups (model, order, view fields, file format, actions, the tree) after § The
     master bus; § Mixer and § The arrangement mention groups and hidden tracks; § Drag and drop's table gains the
     track and group rows; § Layout and navigation lists the Tracks view; § Saving lists version 10.
   * [README.md](README.md) marks round 7 done; the roadmap notes what moved; the plan gets its "Changes made while
     implementing" and the profile.

## Behavior changes

Intended:

* Tracks can be grouped, nested, reordered, collapsed and hidden: from the new Tracks view, from menus and by dragging
  names and group headers.
* The track menu has *Group*, *Move to group* ▸, *Move up*, *Move down* and *Hide*.
* Collapsing and hiding are saved with the project but are not undo steps, and undo doesn't change them.
* A collapsed group's cell in the session grid launches its members' clips in that scene and stops the others.
* The session grid has a *Hidden* button while tracks are hidden.
* The activity bar has a fifth button, *Tracks*; the primary sidebar a third tab.
* Files are saved as version 10, which older builds refuse.

A project without groups or hidden tracks looks as it does today. Anything else a reviewer notices is a bug in this
round.

## Verification

* `npm test`, `npm run typecheck` and `npm run test:smoke` pass at every step. Run `npm run test:audio` once after
  step 6, for the scene launch's new filter.
* Manual pass on the dev build:
  * nested groups three deep, collapsed and expanded in each view, with the Tracks view in each sidebar and the panel;
  * a drag of each kind onto each edge, and onto refused places;
  * undo and redo through a mix of group edits, collapses and hides;
  * a hidden track playing in the session and on the arrangement;
  * a file edited by hand with a broken group (a cycle, a missing parent, split members) loads repaired with
    warnings.
* Profiling: `scripts/profile-status.cjs` on the demo project, which has no groups, must show the same component
  renders a second as round 6: 145 for `editor` and 173 for `four`. The *Hidden* button's selector returns a boolean,
  and the tree is in a collapsed sidebar. One more run with the Tracks view open and two groups, one collapsed, to
  record the numbers.

## Decisions to sign off

Signed off 2026-10-28: every row as proposed.

| Question | Proposed | Notes |
|---|---|---|
| A SPEC before the plan | **Folded into this plan** (§ Model and this table) | The roadmap asked for a short SPEC. Its questions are small enough to sign off here. |
| Where the order lives | **`Project.tracks` stays the only order;** members are contiguous in it, and a group is drawn where its first track is | An explicit tree (`Project.trackTree`) would allow empty groups, but makes a second order to keep in step with `tracks`, repaired on every load. Nothing that iterates `tracks` changes. |
| Empty groups | **None.** *Group* makes one around a track; a group goes with its last track | Follows from the row above. Ungrouping and deleting are explicit. An empty folder in the tree would have no place in the grid. |
| Grouping several tracks at once | **Not now.** *Group* wraps one track; others are dragged in or use *Move to group* ▸ | There is no multi-selection of tracks. Ableton's ⌘G groups the selected tracks; that waits for a track multi-selection. |
| What a collapsed group shows in the session grid | **One column with a cell per scene** that launches the members' clips in that scene and stops the others, as Ableton does | Just the header would make collapsing useless while performing. The cell is a scene launch restricted to the members, one optional field on `scene/launch`. |
| One collapsed flag, or one per view | **One**, shared by the tree, the grid, the arrangement and the mixer | As in Ableton. The tree could keep its own expansion, as `FolderTree` does, but then the tree and the views would disagree about the same group. |
| Collapse and hide in undo | **Saved with the project, not undo steps,** and kept across undo and redo | The tree collapses on ← while moving through it; each would be a step. Mute is an undo step, so hide could be one too; keeping both as view fields gives one rule: what is showing is not undone. |
| Hidden tracks: saved with the project or per browser | **With the project** (the roadmap's proposal) | The project's look travels with it, and "a hidden track still plays" is about the project's sound. Per browser would need a store keyed by project id. |
| Where hidden tracks are left out | **The grid, the arrangement and the mixer.** The tree, pickers and the Library's destination still list them | Pickers choose among the project's tracks; hiding is about rows, not existence. |
| Marking hidden sound | **The grid's *Hidden* button and the tree's dot**, lit by the track's peak (above -60 dB) | The peak is after mute and solo, so a muted hidden track doesn't light it. A playing clip alone would light it for a muted track. |
| Where tracks drag | **The tree, and the names in the session header, mixer strip and lane name**, plus group headers | Round 6 left "reordering and dragging tracks" to this round, and those names are already track targets. Only the name drags, since the header's slider would compete with the drag. |
| Keyboard reordering | ***Move up* / *Move down* in the menus, Alt+↑ / Alt+↓ in the tree** | HTML5 drags don't work by keyboard. The titles use the tree's direction; in the grid, up is left. |
| Group colours | **Eight named colours,** stored by name and drawn through CSS variables; each new group takes the next | Round 13's themes restyle the variables. Tracks get no colour this round. |
| Nesting depth and count | **4 levels, 64 groups** | Each level is one sticky band row in the grid and the mixer. Ableton allows deeper nesting; four keeps the header readable in a 200 px panel. |
| Group mute and solo | **Round 8,** with the bus | The rules through groups are round 8's main risk. A folder's header has no M or S. |
| Copy and paste of tracks, duplicate group | **Not now** | Round 5 left track copying to this round's tree. Pasting into another project still needs modules and samples to come along, which the Library does. *Duplicate* still covers a track within a project. |
| File format | **Version 10,** migration 9 strips the new fields; round 8's `bus` is read from version 10 without a bump | The earlier convention for new structures. Round 8 needs no second migration, as the roadmap asks. |

## Changes made while implementing

What turned out different from the design above, step by step.
