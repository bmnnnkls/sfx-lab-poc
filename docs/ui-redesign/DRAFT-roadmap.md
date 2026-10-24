# UI redesign roadmap (draft)

Status: **draft**, 2026-10-24. Part of the [UI redesign](README.md). Round 1 has its own
[plan](PLAN-round-1-untangling.md); every later round gets a plan of its own before it starts, and this outline is
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

**Done** 2026-10-24, see the [plan](PLAN-round-2-shell.md). The spike chose **flexlayout-react**, pinned to 0.11.1,
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

See the [plan](PLAN-round-3-shell-rework.md).

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

See the [plan](PLAN-round-4-views.md), written as round 3 from measurements of every view in a sidebar, a narrow
split and a short panel.

* Minimum sizes (280 × 200 for tool views, 480 × 240 for editors), and the shell never squeezes a view below its own.
* Container queries on each view's size; a rule test keeps window-size reads out.
* Narrow and short layouts, view by view. Library's folders become a tree.
* The empty states that still only explain offer the action that fills them.
* The patch canvas's pan, zoom and sub-patch kept per track, in memory.
* Samples and Library move to the primary sidebar by default.

Round 2 settled two bullets this outline had here: a hidden view keeps its state, since it stays mounted inside
`<Activity>`, and its per-frame work pauses, since its Effects are cleaned up while hidden.

## Round 5: actions and context menus

Right-click works throughout the app. Set up the structure now; the details of each menu come with it.

* **Actions per kind of thing**: track, return, master, clip, automation slot, scene, sample, library item and
  folder, node, module, arrangement region. Each kind has one list of actions (id, title, whether it applies,
  run), in `state` or `app`, not in the views.
* **Context menus** are built from those lists through the existing `ui/shared/context-menu` (Radix). A view only says
  what was right-clicked.
* **First entries:** rename, delete and duplicate wherever the project already has the action; open in (the intents:
  *Edit clip*, *Open effects*, *Open in wave editor*).
* **Copy and paste** per kind, one at a time, each with its own clipboard store like the note clipboard: clips and
  slots first, then tracks, then nodes. There is no generic clipboard.
* Round 10's command registry reuses the same action lists, so the command palette and the context menus can't drift
  apart.

## Round 6: working across views

The point of seeing several views at once.

* One drag-and-drop payload type for clips, samples, presets and library items, with drop targets in the session
  grid, arrangement lanes, tracks and the patcher.
* Drag a session slot onto an arrangement lane. This replaces the right-click workaround the architecture doc
  describes.
* Linked selection: selecting a region in the arrangement opens it in Clip (the arrangement's selected region moves
  to the selection store), and selecting a track anywhere updates the inspector.
* Drag targets and context menus share round 5's actions (a drop is "paste here").

## Round 7: track groups and the Tracks tree

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

* A **command registry**: every view, region toggle, layout, preset and common action, with an id and a title. It is
  built on round 5's action lists.
* A **command palette** (⌘⇧P / ⌘K), built on the matching already in the patcher's QuickAdd.
* Keybindings defined in one table, overridable by the user, shown in tooltips (`shortcut-labels.ts` exists). This is
  where the region toggles and maximize get their keys (VS Code's ⌘B and ⌘J collide with browser shortcuts in some
  browsers).
* Menus (File, View) generated from the same registry.

## Round 11: wave editor

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

Grows from the existing prototype. Follow-ups are already listed in [TASKS.md](../TASKS.md).

* Track headers (name, mute, solo, arm) docked beside the lanes, with vertical scroll kept in sync. Groups from
  rounds 7 and 8 fold here too.
* Automation lanes on the timeline, and recording into the arrangement (touch recording, slice 3c).
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
| What a collapsed group shows in the session grid | one column whose cells launch all members' clips in that scene, or only the header | round 7 SPEC |
| Hidden tracks: saved with the project or per browser | with the project | round 7 SPEC |
| Wave editor: destructive edits vs. derived samples | destructive with undo, original kept until project save | round 11 SPEC |
| Stereo samples throughout the engine, or only in the editor | throughout (needed for the wave editor to be honest) | round 11 SPEC |
