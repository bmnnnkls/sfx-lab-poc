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
| [PLAN-round-1-untangling.md](PLAN-round-1-untangling.md) | Plan, ready to implement. No visible change. |
| [DRAFT-roadmap.md](DRAFT-roadmap.md) | Draft outline of rounds 2+ (shell, views, wave editor, …). To be refined round by round. |

## Ground rules for the whole redesign

* **Behavior first, chrome second.** Each round lands green (unit, architecture, typecheck, smoke) and reviewable
  on its own. Rounds that change structure do not also change looks.
* **Layering stays.** Layout state lives in `state`, React and any docking library in `ui`, wiring in `app`
  (see [ARCHITECTURE.md § Layers](../../ARCHITECTURE.md#layers)). New third-party packages enter the allow-list in
  `tests/architecture.test.ts` on purpose, in the round that needs them.
* **Views do not know where they are docked.** A view never assumes its region, its size, or that another
  view is visible.
* **Shipped behavior moves to ARCHITECTURE.md** when a round lands; these documents keep the plan and decisions.
