# Decisions

Why things are the way they are. One row per decision, newest round last. The source column links to the plan or
spec whose decisions table holds the alternatives and the full reasoning. Before reopening one of these, read that
table: most rows list what else was considered.

A new decision is a new row. A reversed decision keeps its row, marked *reversed by* the later one. Write a separate
file here (`NNNN-short-title.md`) only when a decision needs more than a row: context, options and consequences.

## Engine, audio and formats

| # | Decision | Why | Source |
|---|---|---|---|
| 1 | Accept the 3.265 ms first callback and the no-lane overhead for the demo release; the strict F1 gate stays open | Bounded demo scope; the failures stay recorded, not relaxed | [demo record](../measurements/demo-release/README.md), 2026-10-23 |
| 2 | Fix the F1 scheduling defect in the TypeScript engine, not by moving to Rust/Wasm | The defect is architectural, not a browser capacity limit | [capacity report](../archive/2026-10-perf-library/REPORT-browser-audio-capacity-and-rust-engine.md) |
| 3 | Structural signatures compare UTF-16 code units, never locale collation; the envelope versions (project v9, catalog v2, bundle v2) mark it | Locale-dependent order made saved assets differ between browsers | [persistence](../architecture/persistence.md#signature-canonicalization-and-the-v9-transition) |
| 4 | Fields that a file is never worse without may be added without a version bump (groups' bus, pins); otherwise bump with a migration and a fixture | Older builds drop unknown fields silently; one migration per real change | [round 7](../archive/ui-redesign/PLAN-round-7-track-groups.md#decisions-to-sign-off), [round 9](../archive/ui-redesign/PLAN-round-9-pinned-panels.md#decisions-to-sign-off) |
| 5 | Old projects stay bit for bit the same: a switched-off `Track in` runs the old mono math | Changing how old files sound is a regression, even in the last bit | [round 11a](../archive/ui-redesign/PLAN-round-11a-stereo-and-the-pyramid.md#decisions-to-sign-off) |
| 6 | Samples are stereo throughout (decoding, engine, preview, bounce); instruments stay mono; more than two channels are averaged | Stereo audio clips without rewriting every instrument | [wave editor spec](../active/SPEC-round-11-wave-editor.md#decisions-to-sign-off) |
| 7 | Edits are in place with undo: a new content-hash id, every use moved onto it in one step, `origin` to follow; *Edits make copies* is a toggle | Keeps content addressing; presets and revisions follow the edit | [wave editor spec](../active/SPEC-round-11-wave-editor.md#decisions-to-sign-off), [round 11b](../archive/ui-redesign/PLAN-round-11b-in-place-edits.md#decisions-to-sign-off) |
| 8 | Length-changing edits remap clip trims so clips play the same audio | Otherwise a delete earlier in a sample silently changes every clip | [wave editor spec](../active/SPEC-round-11-wave-editor.md#decisions-to-sign-off) |
| 9 | Edits write 32-bit float WAV; the bundle sample cap goes to 64 MiB | Exact, no requantizing at each edit | [wave editor spec](../active/SPEC-round-11-wave-editor.md#decisions-to-sign-off) |
| 10 | 128 MB of decoded audio for undo on each side (main thread, engine) | Bounded memory with long stereo samples; instant undo within it | [wave editor spec](../active/SPEC-round-11-wave-editor.md#decisions-to-sign-off) |
| 11 | Edit-made files are cleaned up a day after nothing names them; "named" means the id's text anywhere in a project slot, the catalog or this tab's history | An unreadable slot still protects its files | [round 11b](../archive/ui-redesign/PLAN-round-11b-in-place-edits.md#decisions-to-sign-off) |
| 12 | Default crossfade 5 ms linear at every join and selection edge | Clicks are the common failure of a butt splice | [wave editor spec](../active/SPEC-round-11-wave-editor.md#decisions-to-sign-off) |

## Mixing, tracks and groups

| # | Decision | Why | Source |
|---|---|---|---|
| 13 | `Project.tracks` stays the only order; a group's members are contiguous; no empty groups | One order to keep in step; an empty group has no place in the grid | [round 7](../archive/ui-redesign/PLAN-round-7-track-groups.md#decisions-to-sign-off) |
| 14 | Collapse, hide and pins are saved with the project but are not undo steps | Moving through the tree would otherwise fill the history; an undo of a knob shouldn't unpin a panel | [round 7](../archive/ui-redesign/PLAN-round-7-track-groups.md#decisions-to-sign-off), [round 9](../archive/ui-redesign/PLAN-round-9-pinned-panels.md#decisions-to-sign-off) |
| 15 | A bus's output follows the nesting; no output picker | Routing and folders can't disagree, and the output can never close a loop | [round 8](../archive/ui-redesign/PLAN-round-8-group-buses.md#decisions-to-sign-off) |
| 16 | Mute and solo through groups are effective flags worked out in `core`; a muted bus stays muted | Pure, table-testable rules | [round 8](../archive/ui-redesign/PLAN-round-8-group-buses.md#decisions-to-sign-off) |
| 17 | A group is a control owner for controls, learn, snapshots, presets and the bounce, but not for automation (until round 12) | A group has no clips or cells to hold lanes | [round 8](../archive/ui-redesign/PLAN-round-8-group-buses.md#decisions-to-sign-off) |
| 18 | Routing loops are refused when moving, and repaired in files by dropping the closing Send or Track audio | The only parts that can close a loop | [round 8](../archive/ui-redesign/PLAN-round-8-group-buses.md#decisions-to-sign-off) |

## Workbench

| # | Decision | Why | Source |
|---|---|---|---|
| 19 | Docking on flexlayout-react, pinned, imported only from `ui/layout/` | dockview failed keyboard splitters, charges for keyboard group navigation, and is twice the bundle | [round 2](../archive/ui-redesign/PLAN-round-2-shell.md#decisions-to-sign-off) |
| 20 | Hidden views stay mounted (`<Activity>`) | State, scroll and portals kept without lifting state into stores | [round 2](../archive/ui-redesign/PLAN-round-2-shell.md#decisions-to-sign-off) |
| 21 | Layouts, named layouts and key overrides are per browser; the project doesn't carry them | They belong to the person and the screen, not the song | [round 2](../archive/ui-redesign/PLAN-round-2-shell.md#decisions-to-sign-off), [round 10](../archive/ui-redesign/PLAN-round-10-commands-and-keys.md#decisions-to-sign-off) |
| 22 | The panel is a tab group that collapses to its strip (reverses round 2's bottom border) | Full-height sidebars and a splittable panel | [round 3](../archive/ui-redesign/PLAN-round-3-shell-rework.md#decisions-to-sign-off) |
| 23 | Maximize inside the window, not the browser's Fullscreen API | Element fullscreen hides Radix menus and tooltips | [round 3](../archive/ui-redesign/PLAN-round-3-shell-rework.md#decisions-to-sign-off) |
| 24 | Minimum view sizes 480 × 240 for editors, 280 × 200 for tool views; below them groups shrink and scroll | Views that work anywhere they're docked | [round 4](../archive/ui-redesign/PLAN-round-4-views.md#decisions-to-sign-off) |
| 25 | One action list per kind in `state/actions/`; menus, buttons, keys and the palette all run those actions | No drift between entry points | [round 5](../archive/ui-redesign/PLAN-round-5-actions.md#decisions-to-sign-off), [round 10](../archive/ui-redesign/PLAN-round-10-commands-and-keys.md#decisions-to-sign-off) |
| 26 | Rename is in place, where the name is drawn | One rename everywhere, light for a frequent action | [round 5](../archive/ui-redesign/PLAN-round-5-actions.md#decisions-to-sign-off) |
| 27 | Drags between views use HTML5 drag and drop with our own data type; only the target under the pointer shows feedback | Crosses regions without hit-testing; no re-render of every target per drag | [round 6](../archive/ui-redesign/PLAN-round-6-across-views.md#decisions-to-sign-off) |
| 28 | Selecting never changes which view is showing; double-click, Enter and *Edit* reveal | Views don't jump while you work | [round 6](../archive/ui-redesign/PLAN-round-6-across-views.md#decisions-to-sign-off) |
| 29 | Commands (no subject) live in a registry; subject actions come from the action lists | Copying actions into the registry is the drift round 5 avoided | [round 10](../archive/ui-redesign/PLAN-round-10-commands-and-keys.md#decisions-to-sign-off) |
| 30 | Keys act on the focus subject only, never on the selection | Delete must not remove something selected long ago in another view | [round 10](../archive/ui-redesign/PLAN-round-10-commands-and-keys.md#decisions-to-sign-off) |
| 31 | Never a key the browser keeps; ⌃⌘B / ⌃⌘J / ⌃⇧⌘B (Ctrl+Alt elsewhere) for the regions | VS Code's ⌘B and ⌘J are browser keys | [round 10](../archive/ui-redesign/PLAN-round-10-commands-and-keys.md#decisions-to-sign-off) |
| 32 | Pinned panels: one *Pinned* view holding a stack, play only, at most 16 | A view can't be open twice; editing doesn't fit 280 px | [round 9](../archive/ui-redesign/PLAN-round-9-pinned-panels.md#decisions-to-sign-off) |
