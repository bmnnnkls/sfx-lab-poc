# Round 8: group buses

Status: **planned** 2026-10-28, for sign-off. Part of the [UI redesign](README.md). Carries out
[roadmap § Round 8](DRAFT-roadmap.md#round-8-group-buses), from an inventory of how the engine mixes and of everything
that switches on a control owner, taken on `feat/ui-redesign` at `eaa26c7` (round 7 merged). It builds on
[round 7's model](PLAN-round-7-track-groups.md#model) and its [§ What this leaves for round
8](PLAN-round-7-track-groups.md#what-this-leaves-for-round-8).

## Goal

A group can sum its tracks. After this round:

* **a group can be switched to sum to a bus**: its members' sound, after their faders, goes into the group instead of
  the master. The bus has a fader, pan, an insert graph that starts at a **Group in** node, send knobs to the returns,
  and a meter;
* **the bus's output follows the nesting**: the nearest enclosing group with a bus, or else the master. Nested buses
  sum inwards;
* **every group has mute and solo**, a folder as well as a bus. Muting a group silences its members; soloing a member
  keeps its group's bus audible; soloing a group solos its members. These rules have unit tests and real-audio tests;
* **a group is a control owner**: its fader, pan, sends and effect knobs can be learned by MIDI, are kept by
  snapshots and presets, and are in the offline bounce;
* **a group can be selected**: the Effects view then edits the bus's graph, and Sounds and the Library act on it.
  Presets and library effects drop on a group's strip and header;
* **the mixer** draws a bus as a strip before its members, and the session grid's group header has its fader;
* **files without buses load and sound unchanged**, and the format stays version 10.

**Out of scope:**

* automation of a group's controls: session slots, clip lanes and touch recording (see the decisions; round 12's
  arrangement lanes are the place);
* picking a group's or a track's output: the output follows the nesting (see the decisions);
* a bus as a source for *Track audio* (a sidechain from a drum group), and sends to a group;
* grouping returns, pre-fader sends, send knobs on returns;
* library effects made for another input (`Return in`, `Master in`) on a group;
* mute and solo buttons in the session grid's headers, and in the Tracks tree;
* stems per group in the audio export;
* duplicating a group, copying tracks, several tracks selected at once (unchanged from round 7);
* changing the example projects.

## Inventory

### How the engine mixes today

| Where | What it does today |
|---|---|
| `Engine.mixSegment` (`core/engine/engine.ts`) | For each stretch of a block: clears the sends board and the audio taps, runs every track in `mixTracks()` order with `track.mixInto(left, right, blockOffset + cursor, frames, mix)`, then `processMaster` on the same stretch of `left`/`right`. **Every track adds straight into the master buffers.** |
| `ChannelStrip.mixInto` (`channel-strip.ts`) | Scales the track's stereo signal by fader and pan and adds it to the `left`/`right` arrays it is given, at an offset; adds nothing when `audible` is false. Its peak is what it added. Post-fader send knobs go through `strip.send` and the `SendGate`. |
| `AudioBoard` (`audio-board.ts`) | One planar stereo buffer per return, at offset 0 of the stretch, cleared per stretch; `add` and `read`. A return reads its slot as its input. |
| `ReturnTrackRuntime` | Input from its board slot, its `FxGraph`, taps before and after, then its strip into the master. **`setSends()` is a no-op:** a return has no send knobs, only Send nodes. |
| `Engine.mixTracks` / `sorted` | The mix order from `needs`: a track after its Track audio sources, a return after every track that sends to it. A loop degrades to "put last". |
| `Engine.updateMixState` | Mute and solo, from the strips' flags: `audible`, then under solo the returns fed by a heard track grow heard, then each strip's blocked sends. Runs when `mixStateStale`, never per sample. Rules in ARCHITECTURE.md § Mixer. |
| `mix-order.ts` (`core/project`) | `mixDependencies`, `mixesAfter`, `sendableReturns`, `audioSourceTracks` over `MixGraph = Pick<Project, 'tracks' \| 'modules'>`. Used by the send knobs, the Send and Track audio pickers, `resolveControlTarget` and `repairTrackReferences`. |
| `Return in`, `Master in` (`dsp/nodes/return-in.node.ts`) | One `StereoIn` class under two types. `GraphEditor`'s `START` table picks each owner's start node; the master's palette leaves out Send and Track audio. `FIXED_ENDS` in `node-copy.ts`, the fx counts in `TrackHeader`, `ChannelStrip` and `MasterStrip`, and `EFFECT_INPUTS` in the Library list the start nodes by name. |
| `diffProject` (`core/sync`) | Keys tracks by id; `diffTrack` compares named fields, including the track's **own** `muted` and `soloed`. Groups send nothing (round 7). `renderProject` builds its engine with `diffProject(null, project)`, so whatever the diff sends is in the bounce. |
| `EngineStatus` | `tracks` and `peaks` keyed by id, for every entry in the engine's track map (returns get an idle launcher status). The UI only looks entries up by id. |

### Control owners

* `ControlOwner` is `{ kind: 'track', trackId } | { kind: 'master' }` (`core/control/types.ts`). It names the owner in
  control targets, control values, MIDI mappings, automation lanes and slots, snapshots, presets, sample bindings, the
  touch store and the selection's `selectAutomation`.
* About 50 files outside tests mention it, mostly as `owner.kind === 'master' ? … : … owner.trackId`. A third kind
  makes each of those a type error, so the typecheck lists them.
* `resolveControlTarget` looks the owner up in `project.tracks`; `controlGraph` gives a track's three graphs or the
  master's fx; `enumerateControlTargets` walks every track and the master; `controlTargetKey` writes `trackId` or
  null; `editControlBase` and `projectWithControlValues` write back to a track or the master.
* `PatchTarget` (`module-edit.ts`) is `{ trackId, graph? } | { master: true } | { moduleId }`: every graph edit, module
  use, *Group into module* and remap goes through it.
* Automation: clip lanes address only their own track; return and master slots are session cells. A group has no
  clips and no cells, so nothing could play a group lane today, and touch recording only captures an owner whose clip
  or slot plays.
* The Library and Sounds: `graphFitsOwner` and `library/assets.ts` decide an effect's fit by its input node
  (`trackIn`, `returnIn`, `masterIn`); `insertionScope` falls back to `fx` for the master.

### Round 7's groups

* `TrackGroup { id, name, colour, collapsed?, parentId? }`, `Project.groups?`, tracks' `groupId?` and `hidden?`
  (`core/project/track-groups.ts`, `group-membership.ts`). One order in `Project.tracks`, members together, **no
  empty groups**: `pruneGroups` drops a group when its last track leaves, also inside `moveTrack`.
* `sanitizeGroups(raw, tracks, warn)` rebuilds each group from its **known fields only**, so a version-10 file with a
  `bus` loads in a round-7 build without it. It takes no modules or sample ids, which a bus's graph needs.
* `repairTrackReferences(tracks, modules, warn)` works on tracks only, before `repairSendLevels`.
* The mixer (`ui/mixer/MixerPanel.tsx`) is a CSS grid: band rows over strips, a collapsed group as a 72 px
  `GroupStrip` with name, twisty and count. An expanded group has **no strip of its own**, only its band.
* The session grid (`ui/session-view/GroupHeader.tsx`): `GroupBand` (title, menu, drop target), `CollapsedGroupHeader`
  and `GroupCell` (launches the members). Track headers have a volume slider and **no M or S**.
* `state/actions/group.ts`: collapse, rename, colour, move, hide, ungroup, delete. `drops.ts`: tracks and groups onto
  tracks and groups; presets and library items land on a track or the master, not a group.
* The selection store holds `trackId` or `master`; no group.

### What the inventory changes in the roadmap's outline

* **The engine has no folders.** Folder mute and solo can't be worked out in the engine, which sees only tracks. So
  `core` works out each track's and each bus's **effective** mute and solo (its own, or any enclosing group's) and its
  output, and the engine applies the existing rules to those, plus one new edge: a track's output into a bus.
* **Every group gets mute and solo,** not only a bus. The rules are about membership, and a folder's members can be
  muted together just as well. So `muted?` and `soloed?` sit on `TrackGroup`, not in the bus that round 7 sketched.
* **No output picker.** Round 7 already made the output "the nearest enclosing group with a bus, or the master". A
  picker would let routing and folders disagree. The strip shows where it goes (*→ Drums*, *→ Master*); moving the
  group in the tree changes it.
* **A bus is a new runtime, not a return.** A return has no send knobs (`setSends` is empty), and a bus needs them.
  The bus runtime shares the return's input, graph and taps code, and adds the knobs.
* **Members add into a buffer at offset 0, the master at the stretch's offset.** The engine hands each track its
  destination: the master's arrays, or the bus's slot on a second board.
* **A move can now close a loop.** Track T takes *Track audio* from return R, and bus B sends to R: moving T into B
  makes B wait for T, T for R, and R for B. Moves that would do that are refused, and files are repaired.
* **Group automation waits.** A group has no clips and no session cells, and touch recording needs one playing. As in
  Ableton, where a group track holds no clips, a group's controls are automated on the arrangement (round 12).
* **The format needs no bump,** as round 7 promised: version-10 files written so far have no `bus`, `muted` or
  `soloed` on groups. A round-7 build reading a round-8 file drops them silently, as builds before the mixer once
  dropped `pan`, `muted` and `soloed`.

## Design

### Model

In `core/project/types.ts` and `track-groups.ts`:

```ts
interface TrackGroup {
  readonly id: string
  readonly name: string
  readonly colour: GroupColour
  readonly collapsed?: boolean
  readonly parentId?: string
  readonly muted?: boolean          // new: absent = false; mutes the members
  readonly soloed?: boolean         // new: absent = false; solos the members
  readonly bus?: GroupBus           // new: absent = a folder
}

/** What a group that sums its tracks has after them, as a track has after its instrument. */
interface GroupBus {
  readonly volume: number           // 0..1, as a track's
  readonly pan?: number             // -1..1, absent = centre
  readonly fx: Patch                // Group in -> … -> Track out
  readonly sends: SendLevels        // post-fader, as a track's knobs
}
```

* **Group in** (`groupIn`, `GROUP_IN_TYPE`): the same `StereoIn` as Return in and Master in, a third name, insert only.
  `createDefaultGroupGraph()` is Group in wired to Track out.
* **Edits,** each returning the same project when nothing changes, each one undo step:
  * `setGroupBus(project, groupId, on)`: on adds a bus at volume 1 with the default graph and no sends; off removes
    `bus`, so the members go back to the master. Undo restores the bus with its graph (see the decisions);
  * `setGroupVolume`, `setGroupPan`, `setGroupSend` (clamped; a send that would loop is refused, as `setTrackSend`
    does), `setGroupMuted`, `setGroupSoloed`;
  * the bus's graph is edited through `PatchTarget { groupId }`: `patchAt`, `setPatchAt`, module uses, *Group into
    module*, unlink and the control-route remaps all take it.
* **Routing** (`core/project/group-routing.ts`): `mixRouting(project)` gives, for every clip track and every bus, its
  `output` (the id of the nearest enclosing group with a bus, or `null` for the master; a bus's own group doesn't
  count), and its effective `muted` and `soloed` (its own flag, or any enclosing group's). Returns: `output` null and
  their own flags. Memoized by the identity of `tracks` and `groups`, as `trackRows` is.
* **Mix order with buses.** `MixGraph` becomes `Pick<Project, 'tracks' | 'groups' | 'modules'>`, and its ids are
  tracks' and buses'. `mixDependencies(graph, groupId)` is the tracks and buses whose output is the bus, plus the
  tracks its graph takes audio from; a return's dependencies gain the buses that send to it. `mixesAfter`,
  `sendableReturns` and `audioSourceTracks` work unchanged on the new ids, so the bus's Send and Track audio pickers
  and its knobs get the loop rules for free. `hasMixLoop(graph)` is true when any id is mixed after itself.
* **Loops refused.** `canMoveTrack`, `canMoveGroup` and `setGroupBus` refuse a result with `hasMixLoop`. *Track
  audio* offers tracks only; a bus is never a source and never a send target.
* **Existing edits:**
  * `removeGroup`, `ungroup` and `pruneGroups` (a group losing its last track) drop the bus with the group, and the
    owner references to it (control values, MIDI mappings), as `removeTrack` does for a track's. One undo step;
  * `removeTrack` clears Send and Track audio pointers in bus graphs, and a removed return's entry in bus sends;
  * `moduleUsage` lists a group ("Group *name*"), `usedSampleIds` and `projectSampleDependencies` walk bus graphs,
    `removeSample` clears them;
  * `duplicateTrack` keeps `groupId`, so a copy in a bus group sums into it.

### Mute and solo through groups

The rules are ARCHITECTURE.md § Mixer's, applied to effective flags, with buses as a third kind of channel. In full:

* **Effective flags.** A track or a bus is muted when it or any enclosing group is muted, and soloed when it or any
  enclosing group is soloed. So muting a group silences its members everywhere they are heard, sends included (a
  muted track's sends are closed); soloing a group solos its members and its bus.
* **No solo anywhere:** heard = not muted, for tracks, returns and buses.
* **Under solo,** a channel is heard when it is soloed; then, growing until nothing changes:
  * a **bus fed by a heard channel** (its output is the bus) is heard unless muted. So a soloed member keeps its
    group's bus audible, and that bus's parent bus, however deep;
  * a **return fed by a heard channel** through an open send is heard unless muted, as today, now with buses as
    senders.
* **A muted bus stays muted,** as a muted return does: a soloed member of a muted bus group is heard only through its
  own sends (solo wins on its strip, then its sound reaches a muted bus).
* **Sends:** a send from X to return R is open when X is soloed, or X is not muted and (X is heard or R is soloed), for
  tracks and buses alike. A member's output into its bus is not a send: it follows the member's `audible`.
* **Known consequence:** soloing a return keeps the sends of tracks that are not heard, but a bus that sends to it gets
  nothing from members that are not heard, so its share of the wet signal goes. Accepted; written into the rules.
* **Where it is worked out:** `mixRouting` in `core/project` (effective flags and outputs), and a pure
  `mixState(channels)` in `core/engine/mix-state.ts` (heard, and blocked sends) that `Engine.updateMixState` calls.
  Both are pure, so the rules get table tests without an engine.

### The engine

* **A bus is a channel in the engine's map,** keyed by its group id, as a return is keyed by its track id (group ids
  are never track ids). `GroupBusRuntime` implements `PlayableTrack` with the return's no-ops for clips, takes its
  input from its slot on a second `AudioBoard` (`outputs`), runs its `FxGraph`, writes its taps, and mixes through its
  own `ChannelStrip` with real send knobs. The return's input, graph and tap code moves to a shared helper.
* **Outputs.** Each channel has an `output` (a bus id or null). In `mixSegment` the engine hands each channel its
  destination: the master arrays at the stretch's offset, or the bus's slot at offset 0. `AudioBoard` gains
  `channels(id)`, left and right views of a slot made at `sync`, so nothing allocates while rendering. The `outputs`
  board is cleared per stretch with the others.
* **Order.** `mixTracks` adds, for each channel with an output, an edge from it to its bus, so a bus mixes after its
  members and a parent bus after its children. Returns keep coming after their senders, buses among them.
* **Commands.**
  * `track/add` gains a `group` variant (`trackId` is the group id; `fx`, `volume`, `pan`, `muted`, `soloed`, `sends`),
    and every variant an `output`;
  * `track/setOutput { trackId, output }`, new; it invalidates the order and the mix state;
  * a bus's graph, knobs, fader, pan and sends use the existing `track/setFx`, `setParam`, `setSample`, `setVolume`,
    `setPan`, `setSends`, `setMute`, `setSolo` and `track/remove` with the group id.
* **`diffProject`.** Adds, removes and diffs buses like tracks (`diffPatch('fx', groupId, …)`, volume, pan, sends).
  Mute, solo and output are compared through `mixRouting(prev)` and `mixRouting(next)` for every channel, so a group's
  mute sends one `track/setMute` per member, and a track moved into a bus group one `track/setOutput`. `diffTrack` no
  longer compares the track's own `muted` and `soloed`. `track/add` carries the effective flags.
* **Status.** `peaks` and `tracks` gain an entry per bus (a bus's launcher is idle). A bus's peak is what it added to
  its output.
* **The bounce** gets buses through `diffProject(null, project)`. `bounce.ts`'s list of graphs for `hasDelay` and
  `usedSampleIds` include bus graphs. A clip scope still runs every bus, as it runs the returns.

### A group as a control owner

* `ControlOwner` gains `{ kind: 'group'; groupId }`. `controlTargetKey` writes the group id in the owner's place, so
  a group's keys never equal a track's.
* **Resolves:** mixer volume, pan and send (a folder has no bus, so its targets are missing: "The group has no bus"),
  and graph targets in domain `fx`; `patch` and `notes` are incompatible, as on a return. `enumerateControlTargets`
  walks the buses; `editControlBase` and `projectWithControlValues` write back to the bus.
* **This round's reach:**
  * panel controls of the bus's graph and the group strip's fader, pan and sends: gestures, effective values,
    overrides;
  * MIDI learn, from the same right-click as any mixer value or panel control; the MIDI settings name the group;
  * snapshots and project presets of the bus's effects (`SnapshotScope { owner: group, domain: 'fx' }`), and sample
    bindings in its graph;
  * the parsers of control values, MIDI mappings, snapshots, presets and bindings accept the new owner kind;
  * `remapControlTarget` takes group ids in its owner map.
* **Not this round:** automation lanes and slots on a group, and so touch recording into a group's controls. The
  automation sanitizers keep refusing a group owner with their existing unsupported-owner warning. Touch on a group
  control while armed authors the base, as on any owner with nothing playing.
* The engine's `writeAutomation` and `mixSegment` resolve a group owner to its bus channel, so overrides would reach
  it; nothing produces them this round.

### Selection and the panels

* The selection store gains `groupId: string | null` and `selectGroup(groupId)`, which clears `trackId`, `master`
  and `regionId`; `selectTrack` and `selectMaster` clear `groupId`. Clicking a group's name (the band, the collapsed
  header, the mixer strip, the tree row) selects it.
* **Effects:** a group with a bus opens its graph (`GraphEditor` takes a group as its owner; `START` gains `groupIn`;
  the palette is a return's, with Send and Track audio). A folder shows an empty state: "This group is a folder", with
  *Sum to a bus*, by the round-4 rule.
* **Instrument, Notes and Clip** say a group has none, as they do for a return.
* **Sounds** scopes the bus's effects; **the Library** saves a bus's effects (an audio effect from `groupIn`) and
  offers buses as destinations. `EFFECT_INPUTS` and `library/assets.ts` gain `groupIn`; an effect made for another
  input still refuses.
* **MIDI note routing** treats a selected group like a return: no notes.
* A group removed while selected stays named in the selection and shows as nothing, by the existing rule.

### Actions and drops

* **Group actions gain:** *Sum to a bus* / *Remove bus* (edit; *Remove bus* says it discards the bus's effects in
  its title's tooltip), *Open effects* (open, with a bus), *Mute* / *Unmute* and *Solo* / *Unsolo* (edit). The
  strip's M and S buttons and its fx badge run them, by the rule that buttons run actions.
* **Drops:** `drop.sound-on-group` (a project preset whose revision fits the bus's effects) and
  `drop.library-item-on-group` (an audio effect from `groupIn`, or an effects preset), on the band, the collapsed
  header, the group strip and the group lane. A folder refuses both. They ignore `edge`, as presets on a track do.
* **Moves** refuse a place that would close a loop (`canMoveTrack`, `canMoveGroup`), so the drag shows `refuse`.

### The file format

* Version stays **10**. `sanitizeGroups(raw, tracks, sampleIds, modules, warn)` also reads:
  * `muted` and `soloed`, only a real `true`;
  * `bus`: `volume` clamped (anything else is 1), `pan` finite and clamped, `fx` through `sanitizePatch` in the sound
    domain as "Group *name* effects" (missing: the default group graph, silently, as a track's), `sends` through
    `readSends`.
* `repairTrackReferences` takes the groups too: a Send or Track audio node in a bus graph that points at a missing
  track, at a track of the wrong kind, or that closes a loop through the routing is dropped with a warning, as for
  tracks; `repairSendLevels` checks bus sends. Files can't make a member's output loop: the output comes from the
  nesting.
* A bus with an unknown field keeps only what it knows. A group without `bus` is a folder, as before.
* A new fixture, `v10-group-buses.sfxlab.json`: nested buses, a folder between them, a muted group, a soloed member,
  a bus send and a learned group fader; loaded without warnings.

### The mixer

* **A bus is a strip before its members,** under the group's band, as a group track sits before its tracks in
  Ableton: the group's name (selects; drag handle; in-place rename), the fx badge, pan, one knob per return, M, S, the
  fader, the meter, and its output under the name (*→ Drums*, *→ Master*). It reuses `ChannelStrip`'s parts through a
  small owner adapter, so a track's strip and a bus's draw the same controls.
* **Collapsed,** the bus strip replaces the 72 px `GroupStrip`, with a twisty. A collapsed folder keeps the narrow
  strip and gains M and S.
* **An expanded folder's band** gains M and S, so a folder can be muted without collapsing it. A bus's band doesn't
  repeat them (the strip has them).
* **Members** show their output under their name when it isn't the master. A strip muted or soloed only through its
  group shows its M or S half lit, so the cause is visible on the group.

### The session grid and the Tracks view

* **The band** of a group with a bus, and its collapsed header, get the bus's volume slider, as a track header has;
  a muted group's name is struck through, as a muted track's is. No M or S in the grid, as for tracks.
* **The Tracks view** marks a bus row with a *bus* tag beside the count; its menu is the group menu above.
* **The arrangement's** group lane is a drop target for presets and library effects; its controls come with round 12.

### Browser tests

Specs import nothing from `src/`.

* **New `group-bus.smoke.spec.ts`:**
  * *Sum to a bus* on a group's menu: the mixer shows a strip before the members, with fader, pan, M, S, meter and
    *→ Master*; a member's strip shows *→ Group 1*. Undo removes the bus, redo brings it back.
  * Clicking the group's name selects it: Effects shows Group in wired to Track out; a node added there is kept
    after a reload. A folder's Effects shows the empty state, whose button makes the bus.
  * A nested bus group shows *→* its parent; moving it out of the parent changes that to *→ Master*.
  * The band's slider moves the bus fader, and the mixer's fader follows.
  * M on a folder's band strikes through its members' names in the grid and half-lights their M.
  * A move that would close a loop is refused (a seeded project with a Track audio node on a return).
  * Right-click the bus fader, *MIDI learn*: a simulated CC moves it (the MIDI specs' fake ports).
* **New `group-bus.audio.spec.ts`,** with the audio tap, on the starter project with a reverb return added:
  * a bus at unity sums its members: the output matches the same scene without the bus (peak difference under
    0.0001);
  * the bus fader at 0 silences the members, and their sends to a reverb still sound (post-fader on the members);
  * muting the group silences the members and their reverb;
  * soloing a member: only it is heard, through the bus; the bus fader at 0 then silences it;
  * soloing the group: its members are heard, the other tracks are not;
  * a nested bus at 0 silences only its own members;
  * the live output with buses matches the offline scene export of the same project (as the preset tests compare).
* **`drag-and-drop.smoke.spec.ts`** gains a project preset dropped on a bus strip, and refused on a folder.
* **`context-menus.smoke.spec.ts`** checks the group menu's new entries, for a folder and for a bus.

## Steps

Each step is one commit and leaves `npm test`, `npm run typecheck` and `npm run test:smoke` green. Steps 1 to 5 come
in order; steps 6 and 7 need step 5 and not each other.

1. **The model in `core`.** `GroupBus`, the group flags, `groupIn` and the default group graph, the edits,
   `PatchTarget { groupId }`, `mixRouting`, the mix order with buses and `hasMixLoop`, loops refused in moves, the
   cleanups in `removeGroup`, `ungroup`, `pruneGroups` and `removeTrack`, module and sample usage. Unit tests: every
   edit and its no-op, routing through folders and nested buses, effective flags, each loop refused, cleanup of owner
   references.
2. **The file format.** `sanitizeGroups` reads the flags and the bus; `repairTrackReferences` and `repairSendLevels`
   with groups; the fixture. Unit tests: a round-7 file loads unchanged; each repair with its warning; save and load
   keep buses, flags and sends.
3. **The engine.** `mixState` and `Engine.updateMixState` on it, `GroupBusRuntime`, the `outputs` board and
   destinations, the order, the commands, the status, `diffProject` and the bounce. Unit tests:
   * `mixState` as a table: every rule above, with folders, nested buses, a muted bus with a soloed member, a soloed
     return with a bus sender;
   * the engine: a pass-through bus at unity equals no bus within float rounding; fader, pan and sends of a bus;
     nested buses; each mute and solo rule on rendered audio; tails ring on after a bus is muted;
   * `diffProject`: commands for bus on and off, a move into and out of a bus group, a group mute;
   * the bounce: a project with buses renders the same bytes twice.
4. **The group owner.** `ControlOwner` kind `group` through control targets, values, MIDI learn, snapshots, presets,
   sample bindings, remap and the parsers; the Library's `groupIn`. Unit tests: resolve and enumerate group targets,
   a folder's missing, a snapshot recalled onto a bus, a mapping kept through save and load, a group owner refused by
   the automation parsers.
5. **Store, selection, actions and drops.** The store's group methods; `groupId` in the selection store; the group
   actions; the two drops. Unit tests: `describeActions` for a folder and a bus; one undo step each; the drops'
   accepts.
6. **The mixer.** The bus strip, the collapsed bus strip, the folder band's and strip's M and S, outputs, half-lit
   flags. Smoke: the mixer cases of `group-bus.smoke.spec.ts`. Then `npm run test:audio` with
   `group-bus.audio.spec.ts`.
7. **The other views.** The grid's band and collapsed header slider and strike-through; the Tracks view's tag;
   Effects, Instrument, Notes, Clip, Sounds and the Library with a group selected; the folder's empty state. Smoke:
   the remaining cases, the drag-and-drop and context-menu additions.
8. **Docs.**
   * ARCHITECTURE.md: § Tracks and groups gains the bus, the flags and the routing; § Mixer's rules gain groups and
     buses; § Return tracks and sends and § The master bus mention Group in; § Shared control targets the group
     owner; § Drag and drop's table the group column; § Exporting audio buses in the bounce.
   * [README.md](README.md) marks round 8 done; the roadmap notes what moved; the plan gets its "Changes made while
     implementing" and the profile.

## Behavior changes

Intended:

* A group's menu has *Sum to a bus*; a bus group sums its members, and its output is the nearest enclosing bus or the
  master.
* Every group can be muted and soloed, in the mixer and from its menu; a member muted or soloed through its group shows
  it half lit.
* The mixer has a strip per bus, before its members; the grid's group header has the bus's volume slider.
* Groups can be selected; Effects, Sounds and the Library act on a bus.
* Presets and library effects drop on a bus group.
* A move that would make the mix loop is refused.
* Learned MIDI controls, snapshots and presets can name a group.

A project without buses, and without muted or soloed groups, sounds and looks as it does today. Anything else a
reviewer notices is a bug in this round.

## Verification

* `npm test`, `npm run typecheck` and `npm run test:smoke` pass at every step. `npm run test:audio` after step 3 (the
  existing audio specs, for the mix order and the mute and solo rewrite) and after step 6 (with the new spec). Smoke
  and audio tests need local ports, which the sandbox refuses, so they run outside it.
* Manual pass on the dev build:
  * three nested buses with a folder between two of them, the outputs shown, a drum loop through each;
  * every mute and solo rule by ear, including a soloed member of a muted bus and a soloed return;
  * a bus's effects with a reverb tail while the bus is muted and unmuted;
  * undo and redo through bus on, off, moves into and out of bus groups, and group mutes;
  * a hand-edited file with a bus Send that closes a loop loads repaired, with a warning.
* Profiling: `scripts/profile-status.cjs` on the demo project, which has no groups, must show the same component
  renders a second as round 7: 145 for `editor` and 173 for `four`. The `groups` setup (87 in round 7) gains a bus on
  the expanded group, so its strip and meter join the mixer; record the numbers, and check that no group strip renders
  more than once per status update.

## Decisions to sign off

| Question | Proposed | Notes |
|---|---|---|
| Mute and solo on folders | **Every group has them,** stored on `TrackGroup`, not in the bus | The rules are about membership, and muting a folder's tracks together is useful without summing them. Round 7 sketched `muted?` and `soloed?` inside the bus. |
| Mute and solo through groups | **Effective flags** (own or any enclosing group's), then today's solo-in-place rules with buses: a bus fed by a heard channel is heard; **a muted bus stays muted**, as a muted return does | The main risk. Pure functions in `core` (`mixRouting`, `mixState`) with table tests, engine tests on rendered audio, and a real-audio spec. A soloed member of a muted bus group is then heard only through its own sends. |
| Soloing a return with a bus as a sender | **Accepted:** the bus gets nothing from members that aren't heard, so its part of the wet signal goes | Keeping it would need "heard for the return only", a second kind of audible, for an edge case. |
| Where the output goes | **Follows the nesting:** the nearest enclosing group with a bus, else the master. **No output picker;** the strip shows it | The roadmap's outline had a picker. A picker would let routing and folders disagree, and need a loop check per choice. Moving the group in the tree changes the output. |
| A group as a control owner | **Yes, `{ kind: 'group', groupId }`** | Round 7 kept group ids apart from track ids for this. Reusing `kind: 'track'` with a group id would put groups in every "find the track" lookup. |
| How far the owner reaches this round | **Controls, MIDI learn, snapshots, presets, sample bindings and the bounce. Not automation:** no lanes or slots on a group, so no touch recording into it | A group has no clips and no session cells, so a group lane would need new cells. Ableton's group tracks hold no clips either; their automation is on the arrangement, round 12's lanes. |
| Switching the bus off | **Removes `bus`;** undo restores it, effects and all | The roadmap's "keeps the bus settings for undo". Keeping a dormant bus would keep an unheard graph that modules, samples and the sanitizer would all have to count. |
| A bus group losing its last track | **It goes, with its bus,** as a folder does (round 7's "no empty groups"); one undo step | Refusing to move the last track out would keep the effects, but make that move unlike every other. |
| Engine representation | **A channel in the engine's track map,** keyed by group id, added with `track/add` kind `group`; the existing `track/*` commands; a new `track/setOutput` | Gets the mix order, sends, taps, status and peaks the returns already use. Group ids never collide with track ids. |
| Group in | **A new node type `groupIn`,** the same implementation as Return in and Master in | As the roadmap says. A graph's start node is how the Library tells which owner an effect fits. |
| What a bus's graph offers | **A return's palette:** Send and Track audio, with the loop rules | `mixDependencies` with buses gives the pickers their rules. The master's exclusions don't apply: a bus mixes per stretch, as a return does. |
| Send knobs on a bus | **Yes,** post-fader, as a track's | The roadmap's "send knobs". The bus runtime has real knobs; returns still don't. |
| Loops through the routing | **Refused** in moves (the drag shows refuse); **repaired** in files by dropping the Send or Track audio node that closes it | The output can't be the loop's culprit, since it comes from the nesting. |
| `groupId` in the selection store | **Yes,** `selectGroup`; Effects edits a bus's graph, a folder shows *Sum to a bus* | Round 7 left it to this round. Instrument, Notes and Clip treat a group as a return. |
| Presets and library items on groups | **Yes, on a group with a bus:** effects presets and audio effects made from Group in; a folder refuses | The same checks as the master's (`graphFitsOwner`, `canRecallPresetOn`). Effects made for Return in or Master in still refuse; relaxing the three stereo inputs to fit each other is a later change. |
| Where the bus strip goes in the mixer | **Before its members, under the band;** collapsed, it replaces the narrow strip | As Ableton's group track. A folder keeps no strip when expanded; its band gets M and S. |
| Controls in the session grid | **The bus's volume slider** on its band and collapsed header; **no M or S,** as on track headers | Round 7 promised the header's fader. M and S in the grid would be new for tracks too. |
| *Track audio* from a bus | **Not now** | A sidechain from a drum bus is a real use. The engine could write a bus's taps as a return's; the picker, repair and cleanup are what is left. |
| File format | **Stays version 10,** as round 7 promised | Version-10 files so far have no bus or group flags. A round-7 build drops them silently, as builds before the mixer dropped pan, mute and solo. |

## Changes made while implementing

What turned out different from the design above, step by step.
