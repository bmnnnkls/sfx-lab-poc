# UI redesign

Branch: `feat/ui-redesign`. Started 2026-10-24.

The goal is a modern, customizable workbench in the spirit of VS Code: sidebars that toggle, views (tabs) that can
be moved and docked into other regions, saved layouts, and room for two large new views, a full **arrangement**
editor and a **wave editor** in the WaveLab tradition, reachable from a left-hand activity bar.

## Why

The shell has not grown with the app. `Workspace.tsx` stacks a transport bar, one main view (Session *or*
Arrangement, never both) and a bottom `EditorPanel` with eight hand-rolled tabs. Ten views compete for one bottom
slot, the sample editor is buried two clicks deep inside *Samples*, and the two main views being exclusive is the
documented reason a session slot cannot be dragged onto an arrangement lane.

The views themselves are in good shape for this: each is a self-contained folder that takes no props and reads
its data from zustand stores, so they can be mounted anywhere. What ties them to their current place is a thin
layer of navigation coupling, which round 1 removes.

## Documents

| Document | Status |
|---|---|
| [PLAN-round-1-untangling.md](PLAN-round-1-untangling.md) | **Done** 2026-10-24. Layout store, navigation intents, view registry, `openView`; container audit appended. Shipped behavior is in [ARCHITECTURE.md § Layout and navigation](../../ARCHITECTURE.md#layout-and-navigation). |
| [PROPOSAL-audit-remediation.md](PROPOSAL-audit-remediation.md) | Proposal. How to fix the round-1 container audit: keep-alive with `<Activity>`, narrow per-frame subscriptions, container queries and `minSize`, empty states with actions. **Round 1b done** 2026-10-24: the per-frame fixes with a guard test and profiling numbers (§2), empty states that offer actions (§4, rule in [ARCHITECTURE.md § Layout and navigation](../../ARCHITECTURE.md#layout-and-navigation)), and the arrangement zoom is persisted. Keep-alive landed in round 2; `minSize` and container queries remain for round 4. |
| [PLAN-round-2-shell.md](PLAN-round-2-shell.md) | **Done** 2026-10-24. The docking shell on **flexlayout-react** 0.11.1 (a spike against dockview chose it): tab groups that split, drag and dock, the panel and sidebars as borders, an activity bar and a status bar, the layout saved per browser with *Reset layout*, and hidden views kept mounted in `<Activity>`. The changes made on the way are listed in the plan. Shipped behavior is in [ARCHITECTURE.md § Layout and navigation](../../ARCHITECTURE.md#layout-and-navigation). |
| [PLAN-round-3-shell-rework.md](PLAN-round-3-shell-rework.md) | **Done** 2026-10-24. Added after reviewing round 2's shell. The panel is a tab group under the editor area, so the sidebars run full height (overriding a round-2 decision; round-2 layouts are migrated to layout version 2); it collapses to its tab strip. The editor area and the panel maximize inside the window, the region toggles sit in the panel's strip, the activity bar has Session, Arrangement, Wave editor and Library, the sample editor is the *Wave editor* view, Sounds starts in a collapsed right sidebar, layouts can be saved under a name, and the transport bar wraps. The changes made on the way are listed in the plan. Shipped behavior is in [ARCHITECTURE.md § Layout and navigation](../../ARCHITECTURE.md#layout-and-navigation). |
| [PLAN-round-4-views.md](PLAN-round-4-views.md) | **Done** 2026-10-24. Views that work anywhere: minimum sizes on every tab (480 × 240 for editors, 280 × 200 for tool views), kept by sashes and the keyboard, with groups that shrink rather than slide under a sidebar in a small window; each view in a size-container frame, with a rule test against window-size layout and a spec that docks every view at its minimum; narrow and short layouts view by view (sticky session scenes and headers, a sticky master strip, a properties drawer in graph editors, a Library folder tree); the last empty states offer their actions; each graph's pan, zoom and sub-patch kept per track; Samples and Library in a collapsed primary sidebar by default. The changes made on the way are listed in the plan. Shipped behavior is in [ARCHITECTURE.md § Layout and navigation](../../ARCHITECTURE.md#layout-and-navigation). |
| [PLAN-round-5-actions.md](PLAN-round-5-actions.md) | **Done** 2026-10-24. Actions and context menus, planned from an inventory of every menu and per-item action: one action list per kind in `state/actions/`, an `ActionMenu` that views give only what was right-clicked, and buttons that run the same actions; in-place rename (new for tracks, clips, scenes and samples), duplicate track, scene insert, duplicate and delete, and clipboards for clips, automation slots and nodes. The changes made on the way are listed in the plan. Shipped behavior is in [ARCHITECTURE.md § Actions and context menus](../../ARCHITECTURE.md#actions-and-context-menus). |
| [PLAN-round-6-across-views.md](PLAN-round-6-across-views.md) | **Done** 2026-10-28, decisions signed off as proposed. Working across views, planned from an inventory of every drag, drop and view-local selection: one drag payload (round 5's subjects) for session clips, samples, presets and library items; drops onto slots, lanes, tracks, the master and graph canvases, each running a round-5 action or its *Paste* body; spring-loaded tabs and activity-bar buttons, so a slot reaches a lane in the default layout; the region selection in the selection store, with Clip editing the region's own copy through a clip reference; lane names selecting their track. The changes made on the way are listed in the plan. Shipped behavior is in [ARCHITECTURE.md § Drag and drop](../../ARCHITECTURE.md#drag-and-drop) and § The arrangement. |
| [PLAN-round-7-track-groups.md](PLAN-round-7-track-groups.md) | **Planned** 2026-10-28, decisions not yet signed off. Track groups and the Tracks tree, planned from an inventory of where tracks are kept, ordered and listed: a group is a folder (name, colour, collapsed, parent) whose tracks sit together in `Project.tracks`, so there is still one order; grouping, reordering and regrouping from menus and by dragging; group bands and collapse in the session grid, arrangement and mixer, a collapsed group's cells launching its members; a Tracks view (ARIA tree) in the primary sidebar; hidden tracks that still play, marked when they sound; collapse and hide saved but not undone; file format version 10, ready for round 8's bus. |
| [DRAFT-roadmap.md](DRAFT-roadmap.md) | Draft outline of the rounds, reordered 2026-10-24 after reviewing round 2: shell rework (3), views (4), actions and context menus (5), working across views (6), track groups and the Tracks tree (7), group buses (8), pinned panels (9), commands and keys (10), wave editor (11), arrangement editor (12), visual refresh (13). Refined round by round. |

## Ground rules for the whole redesign

* **Behavior first, chrome second.** Each round lands green (unit, architecture, typecheck, smoke) and reviewable
  on its own. Rounds that change structure do not also change looks.
* **Layering stays.** Layout state lives in `state`, React and any docking library in `ui`, wiring in `app`
  (see [ARCHITECTURE.md § Layers](../../ARCHITECTURE.md#layers)). New third-party packages enter the allow-list in
  `tests/architecture.test.ts` on purpose, in the round that needs them.
* **Views do not know where they are docked.** A view never assumes its region, its size, or that another
  view is visible.
* **Shipped behavior moves to ARCHITECTURE.md** when a round lands; these documents keep the plan and decisions.
