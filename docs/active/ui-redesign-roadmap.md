---
status: active
date: 2026-11-04
note: "Rounds 1-11 are done (11d, the spectrum, in two parts: the spectrogram and spectral edits); 12 (arrangement editor) is under way, 12a done; 13 (visual refresh) comes after."
---
# UI redesign roadmap (draft)

Status: **draft**, 2026-10-24. Part of the [UI redesign](../archive/ui-redesign/README.md). Round 1 has its own
[plan](../archive/ui-redesign/PLAN-round-1-untangling.md); every later round gets a plan of its own before it starts, and this outline is
revised with what the previous round taught us.

## Target workbench

Revised 2026-10-24 after using round 2's shell: the sidebars run the full height, and the panel sits between them.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Transport: ▶ ■ ● Touch · BPM · position · meter · undo/redo · File · MIDI   │
├──┬───────────────┬─────────────────────────────────────────┬───────────────┤
│A │ Primary       │ Editor area (tab groups, splittable) ⛶  │ Secondary     │
│c │ sidebar       │  Session · Arrangement · Wave editor    │ sidebar       │
│t │  Samples,     │                                         │  Sounds,      │
│i │  Library      │                                         │  pinned       │
│v │  (tree),      ├─────────────────────────────────────────┤  panels       │
│i │  Tracks       │ Panel: Instrument · Effects · Notes ·   │  (inspector)  │
│t │  (tree)       │        Clip · Mixer       ◧ ⬓ ◨ ⛶       │               │
│y │               │                                         │               │
├──┴───────────────┴─────────────────────────────────────────┴───────────────┤
│ Status bar: save state · audio load · MIDI · notifications · Layout ▾       │
└────────────────────────────────────────────────────────────────────────────┘
```

* **Activity bar** (left icon strip): Session, Arrangement, Wave editor, Library, and later Tracks. A button shows its
  view wherever it is docked; clicking the button of a sidebar's open view collapses that sidebar.
* **Every region toggles**: from the right end of the panel's tab strip (◧ ⬓ ◨), and from the status bar's
  *Layout* menu. The panel collapses to its tab strip rather than disappearing. Every view can be dragged into another
  region or tab group.
* **Maximize** (⛶) the editor area or the panel inside the window.
* **Named layouts** saved per browser, plus **Reset layout**. Built-in presets can join them later: *Compose*
  (session + clip), *Arrange* (arrangement + mixer), *Sound design* (patcher + panel + wave editor), *Mix* (mixer
  large).
* **Right-click** anything for what can be done to it: rename, delete, duplicate, copy and paste where it applies.
* Large views open in the editor area by default; tool views in the sidebars and panel. Defaults only:
  the user can put anything anywhere.

## Round 2: the shell

**Done** 2026-10-24, see the [plan](../archive/ui-redesign/PLAN-round-2-shell.md). The spike chose **flexlayout-react**, pinned to 0.11.1,
over dockview: dockview failed keyboard splitters, keeps keyboard group navigation in a paid package and cost twice
the bundle. The outline below is what the round started from.

Replace `Workspace` with a docking workbench that mounts the round-1 view registry.

* **Library decision (spike first).** Candidate: [dockview](https://dockview.dev) (React, no dependencies,
  tab groups, drag-to-dock, floating groups, popout windows, JSON-serializable layouts). Fallbacks: flexlayout-react,
  or our own fixed regions with toggles and tab drag (no free nesting). The spike is a throwaway branch that mounts
  three real views and is judged on:
  * pointer-capture gestures inside panels: node drag, piano roll, faders, region drag;
  * Radix context menus and dropdowns inside panels;
  * theming through our CSS variables;
  * keyboard and screen-reader access to tabs and splitters;
  * a render-only-visible mode;
  * bundle size;
  * Playwright selectors.
* **Layout model.** The docking library owns the layout tree. `state/layout-store` becomes a façade:
  `revealView` delegates to the library's API, and the store mirrors which views are visible for code that needs
  it. Callers from round 1 do not change.
* **Persistence.** The whole layout is saved per browser, versioned and validated, falling back to the default on
  anything unreadable, the same as `useStoredState`. The panel-tab question from round 1 is settled here.
* **Regions.** Activity bar, primary and secondary sidebars, editor area, panel, status bar. Move
  `SaveIndicator`, toasts and the audio-failure banner into the status bar where that reads better.
* **Rules.** The architecture test's `ui` allow-list gains the docking package. Consider a rule that only
  `ui/layout/` may import it.
* **Tests.** The `openView` helper learns the new chrome. Add a smoke spec for:
  * toggling regions,
  * moving a view and reloading,
  * reset layout,
  * a corrupt saved layout falling back to the default.

## Rounds, reordered 2026-10-24

Using round 2's shell led to a review with new requests: full-height sidebars, maximize buttons, the region toggles
moved, a wave editor and Library in the activity bar, context menus throughout, track groups (with an optional
summing bus) and a Tracks tree, named layouts, Sounds on the right, and track panels pinned into the right sidebar.
The rounds below are reordered around them. The views plan, written as round 3, is now round 4. Old round numbers in
earlier plans refer to the old order: old round 4 is now 6, 5 is 10, 6 is 11, 7 is 12 and 8 is 13.

## Round 3: shell rework

**Done** 2026-10-24, see the [plan](../archive/ui-redesign/PLAN-round-3-shell-rework.md) and its changes made while implementing. The
outline below is what the round started from.

* **The panel becomes a tab group** in the layout instead of flexlayout's bottom border, so the sidebars can run the
  full height (flexlayout always spans its top and bottom borders across the sidebars). This overrides a round-2
  decision. Saved round-2 layouts are migrated.
* The panel collapses to its tab strip; the editor area and the panel can be maximized.
* The region toggles move to the right end of the panel's tab strip; *Reset layout* to the *Layout* menu.
* The activity bar: Session, Arrangement, Wave editor, Library.
* **Wave editor** view: today's sample editor, moved out of Samples into the editor area. Round 11 grows it.
* Sounds in the secondary sidebar by default; sidebars open at 300 px.
* Named layouts per browser.
* The transport bar wraps instead of making the page scroll sideways.

## Round 4: views that work anywhere

**Done** 2026-10-24; see the [plan](../archive/ui-redesign/PLAN-round-4-views.md), written as round 3 from measurements of every view in a
sidebar, a narrow split and a short panel, and checked against round 3's shell before it started.

* Minimum sizes (280 × 200 for tool views, 480 × 240 for editors), and the shell never squeezes a view below its own.
* Container queries on each view's size; a rule test keeps window-size reads out.
* Narrow and short layouts, view by view. Library's folders become a tree.
* The empty states that still only explain offer the action that fills them.
* The patch canvas's pan, zoom and sub-patch kept per track, in memory.
* Samples and Library move to the primary sidebar by default.

Round 2 settled two bullets this outline had here: a hidden view keeps its state, since it stays mounted inside
`<Activity>`, and its per-frame work pauses, since its Effects are cleaned up while hidden.

What moved while it ran: the panel, a tab group since round 3, shrinks with the editor area in a window smaller than
the minimums (only the sidebars keep theirs); the Wave editor needed no narrow layout of its own; a narrow Library
tree shows the open folder's path and the folders in it. Still open from the proposal: `regionId` in the selection
store (round 6) and a view open twice (round 9's pinned panels).

## Round 5: actions and context menus

Right-click works throughout the app. Set up the structure now; the details of each menu come with it.

**Done** 2026-10-24; see the [plan](../archive/ui-redesign/PLAN-round-5-actions.md), signed off as proposed. Its inventory changed the outline
below: tracks, clips, scenes and samples couldn't be renamed, so the round added the setters; scenes got insert,
duplicate and delete; tracks got *Duplicate*, and copying tracks waits for round 7's tree; controls and sounds joined
the kinds; *Save to library* from menus is a follow-up.

* **Actions per kind of thing**: track, return, master, clip, automation slot, scene, sample, library item and
  folder, node, module, arrangement region. Each kind has one list of actions (id, title, whether it applies,
  run), in `state` or `app`, not in the views.
* **Context menus** are built from those lists through `ui/shared/menu` (Radix). A view only says what was
  right-clicked.
* **First entries:** rename, delete and duplicate wherever the project already has the action; open in (the intents:
  *Edit clip*, *Open effects*, *Open in wave editor*).
* **Copy and paste** per kind, one at a time, each with its own clipboard store like the note clipboard: clips and
  slots first, then tracks, then nodes. There is no generic clipboard.
* Round 10's command registry reuses the same action lists, so the command palette and the context menus can't drift
  apart.

What moved while it ran: the lists live in `state/actions/` (the services they need come in an `ActionContext`, so
nothing went to `app`); actions that ask which one (a lane's clips, an XY pad's axes) have choices; the Library's
catalog and the graph editor's open sub-patch moved into stores so menus can act on them; Shift+F10 is handled by
`ContextMenu`, since Chromium on macOS fires no `contextmenu` for it. Firefox and Safari were not checked. Keyboard
delete and duplicate for graph selections wait for round 10.

## Round 6: working across views

The point of seeing several views at once.

**Done** 2026-10-28; see the [plan](../archive/ui-redesign/PLAN-round-6-across-views.md), signed off as proposed. Its inventory changed the
outline below: the default layout shares one tab group between Session and Arrangement, so drags hold over a tab to
show its view; a region opens in Clip as its own copy, through a clip reference in `core`, and selecting it doesn't
reveal Clip; "the inspector" is the views that already follow the selected track; project presets drop only on a
matching graph; a sample gets *Add audio clip* on audio lanes and *Add sampler* on instrument canvases, so every drop
has a menu twin; *Place on arrangement* stays as the keyboard's route to the timeline.

* One drag-and-drop payload type for clips, samples, presets and library items, with drop targets in the session
  grid, arrangement lanes, tracks and the patcher.
* Drag a session slot onto an arrangement lane. This replaces the right-click workaround the architecture doc
  describes.
* Linked selection: selecting a region in the arrangement opens it in Clip (the arrangement's selected region moves
  to the selection store), and selecting a track anywhere updates the inspector.
* Drag targets and context menus share round 5's actions (a drop is "paste here").

What moved while it ran: every drop is in one list in `state/actions/drops.ts`, run through round 5's actions or the
bodies of their *Paste*; the two drops that had no action (a sample on an audio lane, on an instrument canvas) got
*Add audio clip* ▸ and *Add sampler* ▸; the workbench and the activity bar spring-load from one listener each; Clip
edits a region through `ClipRef` and `editClipAt` in `core`, without automation or a playhead until round 12. Firefox,
Safari and touch were not checked. Popouts stay off; the round that turns them on checks drags between windows.

## Round 7: track groups and the Tracks tree

**Done** 2026-10-28; see the [plan](../archive/ui-redesign/PLAN-round-7-track-groups.md), signed off as proposed. It folds the SPEC into its
§ Model and decisions. Its inventory changed the outline below: `Project.tracks` stays the only order, so a group's
tracks sit together in it and there are no empty groups; *Group* wraps one track, since tracks have no
multi-selection; collapse and hide are saved but not undo steps; a collapsed group's cell is a scene launch for its
members (the round's one engine change); group mute and solo wait for round 8; copying tracks stays out.

What moved while it ran: the moves rebuild the project from a tree of the rows; the grid's count of hidden tracks sits
under its + rather than after the last header; the mixer became a grid so bands span strips; a v10 fixture was added.
The manual pass, Firefox and Safari were not done. Round 8 adds `bus?` to `TrackGroup` without a version bump.

A **group** is one concept with two steps: always a folder, optionally a summing bus (round 8). The project format is
designed for both in this round, so round 8 needs no second migration. Needs a short SPEC for the model before its
plan.

* **Model.** Groups nest. A track belongs to at most one group; a group has a name, a colour, a collapsed flag and,
  from round 8, an optional bus. Returns and the master can't be grouped. Undo, save, load and repair like every
  other project edit; files without groups load unchanged.
* **Session grid, arrangement and mixer** draw a group's members together under a group header, and collapse them.
  What a collapsed group shows in the session grid is the open question: one column with a cell per scene that
  launches all members' clips (as Ableton does), or just the header. The SPEC decides.
* **Tracks tree** (a new view, in the primary sidebar, with an activity-bar button): tracks and groups as an ARIA
  tree. Create, rename, delete and regroup (drag, and round 5's context menu), reorder, collapse.
* **Show and hide tracks** from the tree. A hidden track still plays, so the tree and the grid mark that something
  hidden is sounding. Whether hiding is saved with the project (proposed) or per browser is the SPEC's call.

## Round 8: group buses

**Done** 2026-10-29; see the [plan](../archive/ui-redesign/PLAN-round-8-group-buses.md), signed off as proposed. Its inventory changes the outline
below: the engine has no folders, so `core` works out each channel's effective mute, solo and output and the engine
applies the rules to those; every group gets mute and solo, a folder too; the output follows the nesting, so there is
no output picker; a bus is a new runtime, since returns have no send knobs; a move can now close a loop and is refused;
a group's controls can be learned and kept in presets but not automated, which waits for round 12's lanes; the format
stays version 10.

What moved while it ran: a return and a bus share one runtime base (`StereoBus`); the mix order's dependencies are
worked out once per project; file repairs judge tracks among themselves first, then a bus's pointers with the routing;
a switched-off bus keeps its controls' mappings, unavailable, for undo; actions gained a tooltip; *Move to group*
refuses a group the move would make loop, as the drag does. The manual pass, Firefox and Safari were not done.

A group can be switched to **sum to a bus**: its members' output goes into the group instead of the master, and the
group gets what a track has after its instrument.

* **Model.** The group's bus: volume, mute and solo, an insert graph starting at a **Group in** node (stereo, the
  same implementation as *Return in* and *Master in*), send knobs, and its own output (the master, or a parent group's
  bus). Switching the bus off routes the members back to the master and keeps the bus settings for undo.
* **Engine.** The members' post-fader output is added into the group's buffer (the returns' `AudioBoard`
  primitive) instead of the master mix; the group mixes after its members (`mixDependencies`). Nested buses sum
  inwards.
* **Mute and solo through groups:** muting a group silences its members; soloing a member keeps its group's bus
  audible; soloing a group solos its members. These rules are the main risk and get unit tests and audio tests.
* **Rules and repair:** no loops (a group sending to a return that feeds back into it; a group's output into its
  own member); files with a broken route are repaired on load, with a warning, like sends.
* **Everywhere a track is an owner:** automation slots and lanes, touch recording, MIDI learn, snapshots and
  presets, the Track audio node, the offline bounce.
* **UI.** A group strip in the mixer, the group header's fader in the session grid, and an output picker.
* **Tests.** Real-audio tests that a bus sums its members and that mute and solo follow the rules above.

## Round 9: pinned panels

**Done** 2026-10-29; see the [plan](../archive/ui-redesign/PLAN-round-9-pinned-panels.md), signed off as proposed. Its inventory changes the
outline below: round 4 left no narrow front panel, so wide controls are capped at the columns a panel has, in every
panel; a pin is an owner and a graph, so a bus's effects (round 8), the master's and a track's notes can be pinned too;
pins are view edits, not undone, so a pin whose graph is gone is kept unshown (undo shows it again) instead of being
dropped; a pin is play only; `PanelView`'s subscription narrows, for several panels on screen; the layout needs no
version bump.

What moved while it ran: the narrower subscription is a hook in `state` (`useProjectSelect`), since `ui` can't import
zustand, and `EffectiveValue` was narrowed with it, or every control's feedback re-rendered on any edit; undoing *New
project* brings back the old project's master pin too; an action's `inline` can depend on the subject, and a track whose
panels are all pinned doesn't offer *Pin*. The manual pass, Firefox and Safari were not done.

Pin a track's front panel (its knobs, sliders and pads) into the secondary sidebar as a copy; the original stays where
it is. Pinned panels stack vertically.

* One **Pinned** view holds the stack. It isn't one tab per pin, because a sidebar shows one tab at a time and a view
  can't be open twice.
* Each pinned panel is `PanelView` for that track's instrument or effects graph, with a header: the track's name,
  *Open* (the full editor) and *Unpin*. Copies stay in sync for free: everything reads the same stores.
* Pins are saved with the project (track ids); a removed track drops its pins.
* Front panels only, not graph editors: a second live canvas of the same graph, 280 px wide, with its own selection,
  would not be usable.
* Pin from round 5's context menu on a track and from the instrument and effects views.
* Needs round 4's narrow front panel.

## Round 10: commands and keys

**Done** 2026-10-29; see the [plan](../archive/ui-redesign/PLAN-round-10-commands-and-keys.md), signed off as proposed. Its inventory changes
the outline below: subject actions stay in round 5's lists and the registry reads them, adding only what has no
subject; keys act on the *focus subject* (what the keyboard focus is on), the palette also on the selection; graph
delete and duplicate come as verbs (*delete*, *duplicate*, *copy*, *cut*, *paste*, *rename*) that every kind can
name; maximize gets a store action; the File menu is rebuilt as a shared menu; the four layout presets are new; the
region keys are ⌃⌘B, ⌃⌘J and ⌃⇧⌘B (Ctrl+Alt elsewhere), since VS Code's are browser keys.

What moved while it ran: only Paste walks out from the focused thing; every other verb is the innermost thing's, so
Delete on a fader in a mixer strip leaves the track; the graph canvas became focusable and gives its own subjects; the
view commands are made in `state` from `ui`'s titles, and the region names moved to `state`; a menu's key is shown but
not part of the entry's name; *Maximize* and Session's and Arrangement's tab tooltips read the key in effect; presets
load through the layout store like named layouts. Not done: the keys were not checked by hand in Chrome, Firefox or
Safari (Firefox isn't installed on the machine), and the manual pass.

* A **command registry**: every view, region toggle, layout, preset and common action, with an id and a title. It is
  built on round 5's action lists.
* A **command palette** (⌘⇧P / ⌘K), built on the matching already in the patcher's QuickAdd.
* Keybindings defined in one table, overridable by the user, shown in tooltips (`shortcut-labels.ts` exists). This is
  where the region toggles and maximize get their keys (VS Code's ⌘B and ⌘J collide with browser shortcuts in some
  browsers).
* Menus (File, View) generated from the same registry.

## Round 11: wave editor

**Spec signed off** 2026-10-29; see the [spec](../archive/ui-redesign/SPEC-round-11-wave-editor.md). It splits the round into 11a (stereo and
the pyramid), 11b (in-place edits) and 11c (markers, regions and keys), and keeps every decision behind one seam so it
can be changed later. **11a is done** 2026-10-29; see its [plan](../archive/ui-redesign/PLAN-round-11a-stereo-and-the-pyramid.md), signed off as
proposed: samples are stereo through the engine (old projects bit for bit the same), format v11, edits as data, the peak
pyramid and the new view. **11b is done** 2026-10-29; see its [plan](../archive/ui-redesign/PLAN-round-11b-in-place-edits.md), signed off as
proposed: edits change the sample in place with one undo step (trims, markers and regions remapped), undo is instant
within the caches' budgets, edit-made files are cleaned up, and the editor has the six processes, cut, copy, paste,
delete, crop and insert silence with crossfades, and ways in from clips, regions and the sampler. A second spec,
[handling and spectrum](../archive/ui-redesign/SPEC-wave-editor-handling-and-spectrum.md) (signed off 2026-10-29), splits 11c into handling,
markers and regions, and a second pane, and adds 11d (the spectrum). **11c part 1, handling, is done** 2026-10-31; see
its [plan](../archive/ui-redesign/PLAN-round-11c-1-handling.md), signed off as proposed: a grouped toolbar, the
right-click menu and edit keys through a `sample-selection` subject, view keys, middle-drag, edge drags, auto-scroll, a
status bar with peak and RMS, and a level scale. **11c part 2, markers and regions, is done** 2026-10-31; see its
[plan](../archive/ui-redesign/PLAN-round-11c-2-markers-and-regions.md): markers, regions and the loop in a mark lane,
snap, *Revert to original* through a lineage of position maps, the sampler's loop points, and format v12. **11c part 3,
a second pane, is done** 2026-10-31; see its [plan](../archive/ui-redesign/PLAN-round-11c-3-second-pane.md), signed off
as proposed: views keyed by pane and origin, the editor's subjects carrying their pane, a working copy per pane (shared
on one sample), edits moving every pane on their sample, one toolbar on the active pane, title rows and a splitter. **11d part 1,
the spectrogram, is done** 2026-10-31; see its [plan](../archive/ui-redesign/PLAN-round-11d-1-spectrogram.md), signed off as proposed: the
spectral core, a spectrum pyramid computed in a Web Worker, *Waveform*, *Spectrogram* and *Split* lanes, and columns
on demand when zoomed in. **11d part 2, spectral selection and edits, is done** 2026-10-31; see its
[plan](../archive/ui-redesign/PLAN-round-11d-2-spectral-edits.md), signed off as proposed: a box drawn in the spectrogram
selects a frequency band, and *Band gain…* and *Keep band* filter only that band, in the spectrum worker. Round 11 is
done.
The outline below is what the spec started from.

The biggest single piece, mostly beyond the UI. It needs its own SPEC before planning. Round 3 already gives it its
view, its activity-bar button and its entry points; this round replaces what is inside.

* **Data:**
  * a multi-resolution peak pyramid instead of today's 800 buckets per sample;
  * when zoomed in, draw the actual samples from the decoded buffer;
  * stereo samples (the model is mono-only today).
* **Editing:**
  * destructive, in-place edits with undo, replacing today's "every edit is a new library sample";
  * selections, markers and regions;
  * processing a selection (gain, fades with curves, normalize, reverse, silence, DC offset);
  * crossfades at edit points.
* **Views:**
  * waveform overview plus a detail view, with a time ruler in time and in beats;
  * a spectrogram once the FFT utility (H1 in TASKS) exists.
* **Entry points:**
  * the activity bar;
  * ✎ on a sample (round 1's `openSampleEditor` intent);
  * an audio clip or an arrangement region ("edit source").
* **Link:** the granular sampler (TASKS: sample editor stage 2) shares this view.

## Round 12: arrangement editor

**Spec signed off** 2026-11-01, every decision as proposed; see the [spec](SPEC-round-12-arrangement-editor.md). Its inventory
changes the outline below: opening a region in Clip and in the wave editor exists already (Clip lacks a region's
playhead and lanes); there is nothing for a per-track arm to arm, since touch is the only recording, so headers get M, S
and a lanes twisty; timeline automation is a new holder per owner, in song beats, so returns, the master and group buses
get rows; a loop needs the engine's transport, not only the view. It splits the round into 12a (headers and the timeline
frame), 12b (markers and the loop, format v13), 12c (automation on the timeline, groups included) and 12d (touch
recording into the arrangement). **12a is done** 2026-11-04; see its [plan](../archive/ui-redesign/PLAN-round-12a-timeline-frame.md), signed off as
proposed: headers beside the lanes with M and S, a zoom from the whole song to 256 px a beat, a grid and region-edge
snap, a position to play from, follow, view keys, and the timeline geometry shared with the wave editor; returns' and
the master's rows wait for 12c's lanes. The outline below is what the spec
started from.

Grows from the existing prototype. Follow-ups are listed in [BACKLOG.md](../BACKLOG.md).

* Track headers (name, mute, solo, arm) docked beside the lanes, with vertical scroll kept in sync. Groups from
  rounds 7 and 8 fold here too.
* Automation lanes on the timeline, and recording into the arrangement (touch recording, slice 3c). This includes
  what [round 8](../archive/ui-redesign/PLAN-round-8-group-buses.md) left out for group buses: lanes for a group owner, and touch recording
  into a group's fader, pan, sends and effect knobs.
* Loop brace, markers, follow-playhead, horizontal zoom to fit or to the selection.
* Opening a region in the clip editor and in the wave editor.

## Round 13: visual refresh and themes

Deliberately last, so it restyles a stable structure.

* Design tokens: spacing, type scale, radii, elevation and colour roles, built on the variables in `theme.css`.
* Remove the hard-coded colours (e.g. `MidiSettings.module.css`).
* A light theme, high-contrast, user accent colour; a density setting.
* One icon set for the activity bar, toolbars, region toggles and node categories.

## Cross-cutting

* **Performance.** More views on screen means more React work per transport-status update. Status consumers
  stay narrow selectors, hidden views do not render, and a profiling pass with Session + Arrangement + Mixer
  visible is part of rounds 2, 3 and 4. The DSP runs in the worklet, so the risk is UI smoothness, not dropouts.
* **Accessibility.**
  * Regions are landmarks; tabs follow the tab pattern.
  * Splitters are keyboard-operable, as `Splitter` is today.
  * Focus moves sensibly when views are revealed.
* **Popout windows** (second monitor). flexlayout supports them, and popouts share the JS realm, so the zustand
  stores just work. Later, after round 4, since every view must already be size-agnostic.
* **Tests.** Fresh browser contexts already give every spec the default layout; keep it that way, and add layout
  fixtures only where a spec needs a specific arrangement.

## Decisions to make (tracked here until settled)

| Question | Proposed | Decide in |
|---|---|---|
| Docking library or own regions | **Settled in round 2:** flexlayout-react 0.11.1 (the spike reversed the dockview proposal) | round 2 |
| Layout saved per browser or per project | **Settled in round 2:** per browser | round 2 |
| Can a view be open twice (e.g. two patchers on different tracks)? | not yet: one instance of each view; round 9's pinned panels show copies inside one view; pinned per-entity editor tabs later | round 4 |
| The panel: bottom border or tab group | **Settled 2026-10-24 by the user:** a tab group, for full-height sidebars (overrides round 2) | round 3 |
| A track group: folder or summing bus | **Settled 2026-10-24 by the user:** always a folder, optionally converted to a summing bus, in two rounds (7 and 8) | rounds 7 and 8 |
| What a collapsed group shows in the session grid | **Settled in round 7:** one column whose cells launch the members' clips in that scene | round 7 |
| Hidden tracks: saved with the project or per browser | **Settled in round 7:** with the project, outside undo | round 7 |
| A group's output: picked, or following the nesting | **Settled in round 8's plan:** following the nesting (nearest enclosing bus, else the master), no picker | round 8 |
| Automation of a group's controls | **Settled in round 8's plan:** not in round 8; on the arrangement's lanes (round 12) | round 8 |
| Pinned panels: saved with the project or per browser, and undone or not | **Settled in round 9's plan:** with the project, as view edits that undo doesn't change (round 7's rule for collapse and hide) | round 9 |
| Key overrides: saved with the project or per browser | **Settled in round 10's plan:** per browser (`sfxlab:keybindings`), like layouts | round 10 |
| Wave editor: destructive edits vs. derived samples | **Settled in round 11's [spec](../archive/ui-redesign/SPEC-round-11-wave-editor.md):** in place with undo; an edit writes a new file and moves every use onto it; bytes are never changed, only added | round 11 SPEC |
| Stereo samples throughout the engine, or only in the editor | **Settled in round 11's spec:** throughout, instruments staying mono; old audio tracks sound the same | round 11 SPEC |
| Arrangement automation: per owner on the timeline, or inside regions | **Settled in round 12's [spec](SPEC-round-12-arrangement-editor.md):** per owner, in song beats, for tracks, returns, the master and group buses; a region's own clip lanes play inside it, and a timeline lane on the same target wins | round 12 SPEC |
| A per-track arm in the arrangement's headers | **Settled in round 12's spec:** none; touch's global arm stays the only one until notes are recorded | round 12 SPEC |
