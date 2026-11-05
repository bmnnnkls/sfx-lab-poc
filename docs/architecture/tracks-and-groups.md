# Tracks and groups

Track groups as folders, group buses and the Tracks tree.

Tracks have one order, and can be put in folders: **groups** ([round 7](../archive/ui-redesign/PLAN-round-7-track-groups.md)).
A group is always a folder, and can also sum its tracks into a **bus** ([round
8](../archive/ui-redesign/PLAN-round-8-group-buses.md)).

* **Model** (`core/project/track-groups.ts`). `Project.groups?: TrackGroup[]`, each `{ id, name, colour, collapsed?,
  parentId?, muted?, soloed?, bus? }`: groups nest through `parentId`, at most `MAX_GROUP_DEPTH` (4) levels and `MAX_GROUPS` (64). Instrument and
  audio tracks have `groupId?`, the group they are directly in; returns and the master can't be grouped. Every track has
  `hidden?`. A group's colour is a name from `GROUP_COLOURS`, drawn through `--group-<name>` in `theme.css`. Group ids
  are never a track's, since a group is a control owner.
* **Buses** (`group-bus.ts`). `GroupBus { volume, pan?, fx, sends }` is what a group that sums its tracks has after
  them, as a track has after its instrument: a fader, pan, an insert graph from **Group in** to Track out
  (`createDefaultGroupGraph`) and post-fader send knobs. A group without `bus` is a folder. `setGroupBus(on)` adds a bus
  at unity with the default graph, or removes it (undo brings it back, effects and all); `setGroupVolume`, `setGroupPan`
  and `setGroupSend` clamp and refuse what a track's would; the graph is edited through `PatchTarget { groupId }`. Bus
  graphs count for modules ("Group *name*" in `moduleUsage`), samples (`usedSampleIds`, `removeSample`) and
  `removeTrack`'s cleanup of Sends, Track audio inputs and send knobs.
* **Mute and solo** sit on every group, a folder too (`setGroupMuted`, `setGroupSoloed`), and reach its members, nested
  groups' included (see "Mixer").
* **Routing** (`group-routing.ts`). `mixRouting(project)` gives every channel the engine mixes, each track and each bus,
  its `output`: the nearest enclosing group with a bus (a bus's own group doesn't count), or null for the master. So the
  output follows the nesting, with no picker, and moving a group in the tree changes it. It also gives the effective
  `muted` and `soloed`: the channel's own flag or any enclosing group's. Returns go to the master with their own flags.
  Memoized by `tracks` and `groups`, as `trackRows` is.
* **Loops.** `MixGraph` includes the groups, so `mixDependencies` knows that a bus mixes after what sums into it and a
  return after the buses that send to it, and `sendableReturns`, `audioSourceTracks` and `mixesAfter` apply the same
  rules to a bus's pickers and knobs. A bus is never a Track audio source or a send target. `hasMixLoop` finds a channel
  that would mix after itself (a track taking audio from a return that its bus sends to); `canMoveTrack`,
  `canMoveGroup` and `setGroupBus` refuse a result with one, so the drag shows refuse and *Move to group* disables the
  group.
* **One order.** `Project.tracks` stays the order of everything. A group's tracks, nested groups' included, sit together
  among the clip tracks, and a group is drawn where its first track is, so a group always has a track: *Group* makes one
  around a track, and a group goes when its last track leaves (`pruneGroups`, also run by `removeTrack`). The order of
  `groups` means nothing. Nothing of this reaches the engine: `diffProject` keys tracks by id and `diffTrack` ignores
  `groupId` and `hidden`.
* **Rows.** `trackRows(project)` is what the views draw, depth first: a row per group (with its tracks' ids, deep)
  before its members, and per track; clip tracks first, returns after them at depth 0. `tracksInOrder` is its tracks;
  `visibleRows` leaves out hidden tracks, what is inside a collapsed group, and groups whose tracks are all hidden. All
  three are memoized by the identity of `tracks` and `groups`, so a selector can return them.
* **Edits.** `groupTrack`, `moveTrack` and `moveGroup` to a `TrackPlace` (`{ before: item }`, `{ after: item }` or
  `{ inside: groupId }`, at its end; the moved thing joins the group of what it lands next to), `ungroup` (members move
  up a level, in place), `removeGroup` (with its tracks, through `removeTrack`), `setGroupName`, `setGroupColour`.
  `canMoveTrack` and `canMoveGroup` keep clip tracks and returns apart, a group out of itself and within the depth.
  `neighbourPlace` is *Move up* and *Move down*: before the previous item or after the next one at the same level. The
  moves rebuild the project from a tree of the rows, so members always end up together. Each is one undo step.
* **View fields.** `collapsed` and `hidden` are saved with the project but are not undo steps: the project store's
  `editView` replaces the present without a commit, and `undo` and `redo` pass the restored project through
  `withViewOf(restored, current)`, which keeps what shows now for every group and track both have. So an undo of a note
  edit doesn't unfold a group, and the Tracks tree can collapse on ← without filling the history. One flag per group,
  shared by every view.
* **Files.** Format version 10; the v9→v10 migration strips `groups`, `groupId` and `hidden`. `sanitize-groups.ts` drops
  a group without an id of its own (or with a track's), makes an unknown colour the first, clears a parent that is
  missing, closes a cycle or nests too deep, and a group on a return or to a missing group; then `normalizeTrackGroups`
  drops groups without tracks and brings members together. Each repair warns. Round 8 added `muted`, `soloed` (only a
  real `true`) and `bus` to a group without a bump: `sanitizeGroups` clamps the fader and pan, reads the graph through
  `sanitizePatch` (none: the default, silently) and the sends through `readSends`, and keeps only the fields it knows.
  `repairTrackReferences` and `repairSendLevels` take the groups: tracks are judged among themselves, then a bus's
  Sends, Track audio inputs and knobs with the routing, so a loop through a bus loses the bus's pointer, with a warning
  naming the group. A round-7 build reading a round-8 file drops the bus and the flags silently. The fixtures
  `v10-track-groups` and `v10-group-buses` load without warnings.
* **Actions.** A `group` subject (`state/actions/group.ts`): *Collapse*/*Expand*, *Open effects* (with a bus), *Rename*,
  *Sum to a bus*/*Remove bus* (its tooltip says that removing discards the bus's effects), *Mute*/*Unmute*,
  *Solo*/*Unsolo*, *Colour* ▸, *Move up*, *Move down*, *Hide tracks*/*Show tracks*, *Ungroup*, *Delete group and tracks*.
  The mixer's M and S and the fx badge run them. Tracks gain *Group*, *Move to group* ▸ (the groups by path, and *No
  group*), *Move up*, *Move down* and *Hide*/*Show*. Grouping is one track at a time: there is no
  multi-selection of tracks.
* **Selection.** The selection store's `groupId` (`selectGroup`, which clears the track, the master and the region) is
  set by clicking a group's name: the band, the collapsed header, the bus strip, the tree row. Effects then edits the
  bus's graph (`GraphEditor` takes a bus group as its owner; its palette is a return's), or shows a folder's empty state
  with *Sum to a bus*; Instrument, Notes and Clip say a group has none; Sounds and the Library act on the bus's effects
  and mixer, as on the master; MIDI notes go nowhere, as for a return. Presets and Group in effects drop on a bus's
  band, collapsed header, strip and lane (`drop.sound-on-group`, `drop.library-item-on-group`); a folder refuses them.
* **The Tracks view** (`ui/tracks/`, view `tracks`, in the primary sidebar, an activity-bar button): the rows as a WAI-ARIA
  tree. One row is in the tab order; ↑ ↓ Home End move, → and ← expand and collapse a group (its `collapsed` flag) or move
  to the first child and the parent, Enter selects a track or a group, a bus's row has a *bus* tag, **Alt+↑ and Alt+↓** run *Move up* and *Move down*. A row
  drags onto another: before or after by halves, into a group by its middle third. Each row has an eye; a hidden row is
  dimmed, with a dot lit while it sounds. A toolbar has *Show all*, *Collapse all* and *Expand all*. Choosing a row (a
  click, Enter or Space) also asks the Session and Arrangement views to scroll it into view: `requestReveal` in the
  selection store, a request with a serial that each view answers (`useRevealRequest`, `ui/shared/reveal.ts`), so a view
  shown later still lands on the last row chosen. The views mark their columns and lanes with `data-reveal`
  (`t:<id>`, `g:<id>`) and scroll the first that exists of the row and then its groups from the innermost out
  (`revealKeys`), so a track in a collapsed group lands on that group's column or lane. The scroll is by the least that
  shows it, beside the sticky scene column and under the ruler (the scrollers' `scroll-padding`).
* **In the other views.** The session grid and the mixer draw `visibleRows` through `groupedColumns` and `bandsOf`
  (`ui/shared/group-columns.ts`): an expanded group is a band over its members, one row of bands per level, and members
  carry a stripe of its colour; a collapsed group is one column. In the session grid that column's cell per scene
  launches the members' clips in that scene and stops the members whose slot is empty (`launchScene(scene, trackIds)`,
  `scene/launch` with `trackIds`), hidden members included; it is marked while one of those clips plays or is queued. In
  the mixer, a bus is a strip before its members, and a collapsed bus group is that strip with a twisty; a folder is a
  narrow strip when collapsed (see "Mixer"). In the session grid, a bus group's band and collapsed header have the bus's
  volume slider, and a muted group's name is struck through. The arrangement draws a group lane before its members;
  collapsed, it shows their regions as thin bars. Hidden tracks have no column, strip or lane, and still play.
  **The selection** is lighter in both: in the session grid the selected track's cells, a collapsed group's that holds
  it, every column of a selected group and, with the master selected, the master's cells (each column's header and cells
  sit in a `display: contents` wrapper carrying `data-selected`; a playing or queued cell keeps its own colour); in the
  arrangement the selected track's lane, a selected group's own lane, or a collapsed group's that holds the track.
* **Hidden sound.** The grid's corner shows how many tracks are hidden, lit while one sounds (`useSounding`: its peak in
  the status above -60 dB, after mute and solo); it reveals the Tracks view. Both it and the tree's dot subscribe through
  a boolean selector, so the status's 30 updates a second render nothing until that changes.
