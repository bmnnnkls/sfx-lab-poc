# Round 5: actions and context menus

Status: **signed off** 2026-10-24, every decision as proposed. Part of the
[UI redesign](README.md). Carries out [roadmap § Round 5](DRAFT-roadmap.md#round-5-actions-and-context-menus), from an
inventory of every menu and per-item action in the app, taken on `feat/ui-redesign` at `13f5e81` (round 4 merged).

## Goal

Right-click works throughout the app, from one list of actions per kind of thing. After this round:

* every kind of thing in the roadmap's list has a context menu: tracks, returns, the master, session clips and empty
  slots, automation slots, scenes, samples, library items and folders, nodes, modules, arrangement regions and lanes,
  plus two the inventory added: controls (MIDI learn, *Show automation*) and sounds (snapshots and presets);
* each kind's actions (id, title, whether it applies, run) live in `state/actions/`, not in the views. A view only
  says what was right-clicked;
* the buttons that already do these things (✎, ×, *Rename item*, *Delete module*) run the same actions, so a button
  and its menu entry can't drift apart;
* **rename** works in place for every kind that has a name, **duplicate** and **delete** wherever they apply, and
  **open in** offers the round-1 intents;
* **copy and paste** work for clips (session slots and arrangement regions share one clipboard), automation slots and
  nodes, each with its own clipboard store;
* at the default layout, everything a view shows looks as it does today. Menus are new or longer; only their labels
  change where they already exist (see [Behavior changes](#behavior-changes)).

**Out of scope:**

* keyboard shortcuts for the new actions, and the command palette (round 10). Menus show the shortcuts that already
  exist (the piano roll's);
* drag and drop between views (round 6). Round 6's drops reuse this round's paste actions;
* copying and pasting tracks (see the decisions; *Duplicate* covers the common case);
* reordering tracks and grouping them (round 7);
* *Save to library* from a menu (see the decisions);
* pinning a panel (round 9 adds *Pin panel* to the track menu);
* restyling the menu (round 13).

## Inventory

Every `ContextMenu`, `PopupMenu` and per-item button in `src/ui`, and every edit in `ProjectActions`, `core` and the
library service, checked kind by kind. "Model" means a function in `core` or a store action that exists today.

### Menus today

`ui/shared/menu` (ARCHITECTURE.md still calls it `ui/shared/context-menu`) holds `ContextMenu` (right-click, Radix
context menu) and `PopupMenu` (click, Radix dropdown), both drawing `MenuEntry[]`: actions with a label, display-only
shortcut, `disabled` and `danger`; separators; submenus. Seven places use them:

| Where | Menu | Entries |
|---|---|---|
| `MidiClipSlot`, `AudioClipSlot` | right-click a clip | Launch / Restart clip, Edit notes / Edit clip, Edit automation, Duplicate to empty slot, Place on arrangement, Delete clip |
| `MidiClipSlot` | right-click an empty MIDI slot | Create clip |
| `AudioClipSlot` | *+* on an empty audio slot (popup) | one entry per sample, or *Import samples…* |
| `ArrangementView` | right-click a region | Duplicate, Loop until next region / Stop looping, Delete |
| `ArrangementView` | right-click an empty lane | Add *clip* for each of the track's session clips, Clear this track |
| `PianoRoll` | right-click the roll | Copy, Cut, Paste, Duplicate, Delete, Select all, Quantize, Humanize (shared with its keys through `commands`) |
| `NodeView` (from `GraphEditor`) | right-click an input port | Create knob, Create slider, Disconnect |
| `MidiTargetMenu` | right-click a panel control or a mixer pan, volume, send or master fader | MIDI learn (one per XY axis), Show automation |
| `SessionView` | *+* in the header row (popup) | Instrument track, Audio track, Return track |
| `StatusBar` | *Layout ▾* (popup) | region toggles, named layouts, Reset layout |

Every menu builds its entries inline in the view, from store actions, `core` functions and intents. The clip slots'
two menus are copies of each other, and both compute *Duplicate to empty slot*'s `disabled` with `getState()` during
render.

### Per kind

| Kind | Right-click today | Elsewhere today | In the model, missing from the UI | Missing from the model |
|---|---|---|---|---|
| **Track** (instrument, audio) | nothing | Session header: select (name), *fx* / *notes* badges (open Effects, Notes), ■ stop, × remove (no undo prompt; undo works). Mixer strip: select, mute, solo, pan, sends | `setTrackMuted` / `setTrackSoloed` outside the mixer | **rename** (a name is set only when the track is made), **duplicate** |
| **Return** | nothing | as a track, without ■ | | rename, duplicate |
| **Master** | nothing | Session header and mixer: click opens Effects | | (nothing: no rename, delete or duplicate applies) |
| **Session clip** (MIDI, audio) | the clip menu above | ✎, ×; the Library's *Save clip* | `copySessionClip(…, move)` can copy or move a clip to any empty slot of a track of the same kind | **rename**; copy and paste |
| **Empty slot** | MIDI: *Create clip*. Audio: none (the *+* popup only) | *+* | | paste |
| **Automation slot** (master, returns) | nothing | ▶, ■, ✎, ×, *+* (create); Clip's *Delete slot* | `editAutomationSlot` | duplicate, copy and paste |
| **Scene** | nothing | ▶ launch. `sceneNames` is saved and shown, but never edited ([TASKS](../TASKS.md): "Add scene renaming") | | **rename, insert, duplicate, delete** (`sceneCount` is fixed after creation) |
| **Sample** | nothing | Samples row: ▶ preview, ✎ (wave editor), *New sampler track*, *New audio track*, × remove. Wave editor: derived copies. Library: *Save sample* | | **rename** |
| **Library item** | nothing | Details column: Preview, Insert new instrument track, Replace selected graph / Add sample to project, Insert clip at scene, Rename item and Move item (both read shared toolbar fields), Duplicate item, Trash item + associated presets, Restore. All async through `PersonalLibrary`, with a busy flag and a status message | | |
| **Library folder** | nothing | Rename folder and Move folder (shared fields again), Trash folder and contents, Restore folder | | |
| **Node** | an input port's menu | × on the card, *Open* / *Unlink* on a module use, *Group into module* (toolbar, on the selection), Bypass (property editor), a control's name (Panel mode) | `setNodeName`, `setNodeBypassed`, `groupNodesAsModule`, `unlinkModuleNode` | **copy and paste** of nodes with their wires; keyboard delete and duplicate are in [TASKS](../TASKS.md) |
| **Module** (definition) | nothing | `ModuleBar`: name field, *Delete module* (only when unused), interface toggle | `renameModule`, `removeModule` | |
| **Arrangement region** | the region menu above | drag, resize, select | | copy and paste |
| **Arrangement lane** | the lane menu above | | | paste |
| **Control** | `MidiTargetMenu` | | | |
| **Sound** (snapshot, preset) | nothing | Sounds rows: Recall, Update, Rename (reads the shared *Sound name* field), Duplicate, Delete | | |

### Clipboards today

* **Notes:** `ui/clip-editor/note-clipboard.ts`, a subscribable module store read with `useSyncExternalStore`, so
  *Paste* enables as soon as something is copied. ARCHITECTURE.md § Context menu records why.
* **Automation points:** a plain module variable in `AutomationEditor.tsx`, behind toolbar buttons (Copy, Cut,
  Paste, Duplicate). It isn't reactive: the bug the note clipboard had.
* Nothing else can be copied.

### What the inventory changes in the roadmap's outline

* **Rename needs model work** for tracks, clips, scenes and samples: none of them can be renamed today. The roadmap's
  "rename … wherever the project already has the action" would leave the right-click menu of the most-clicked things
  without *Rename*. This plan adds the four setters (see the decisions).
* **Scenes have no actions at all** beyond launching. Insert, duplicate and delete need `core` edits that shift
  every scene-indexed list.
* **Duplicating a track needs a `core` function** that copies a track's graphs, clips and authored values and leaves
  out what belongs to the original (see the decisions).
* **Two kinds the outline didn't list** already have per-item actions: controls (`MidiTargetMenu`) and sounds.
* **Library and Sounds rename from a shared field.** *Rename item* takes the name typed in the toolbar's name field,
  and the Sounds rows take the *Sound name* field. In-place rename replaces that.
* **Library actions are asynchronous** and report a message, so an action's `run` can return a promise and a
  message.

## Design

### Subjects

What was right-clicked is a **subject**, a small value with a `kind` and ids, never a component or a DOM element:

```ts
type Subject =
  | { kind: 'track'; trackId: string }                 // instrument, audio and return tracks
  | { kind: 'master' }
  | { kind: 'clip'; trackId: string; clipId: string }  // a session clip
  | { kind: 'slot'; trackId: string; scene: number }   // an empty session cell
  | { kind: 'automation-slot'; owner: ControlOwner; scene: number }
  | { kind: 'scene'; scene: number }
  | { kind: 'sample'; sampleId: string }
  | { kind: 'library-item'; itemId: string }
  | { kind: 'library-folder'; folderId: string }
  | { kind: 'nodes'; target: PatchTarget; path: readonly string[]; nodeIds: readonly string[] }
  | { kind: 'canvas'; target: PatchTarget; path: readonly string[]; at: { x: number; y: number } }
  | { kind: 'module'; moduleId: string }
  | { kind: 'region'; regionId: string }
  | { kind: 'lane'; trackId: string; beat: number }
  | { kind: 'control'; targets: readonly ControlTarget[] }
  | { kind: 'sound'; soundId: string; preset: boolean }
```

* Returns are tracks: a track's actions say which kinds of track they apply to, as `track.kind` does in the views.
* `nodes` is the selection when the right-clicked node is selected, otherwise that node alone, as the piano roll
  already does with notes.
* `canvas` and `lane` carry where the click landed, which is where *Paste* and *Add* put things.

### Actions

`state/actions/` holds one file per kind, each exporting its list:

```ts
interface Action<S extends Subject> {
  readonly id: string                                     // 'clip.duplicate': round 10's command ids
  readonly title: string | ((subject: S, context: ActionContext) => string)
  /** Entries are drawn in groups, with a separator between groups: open, edit, clipboard, delete. */
  readonly group: 'open' | 'edit' | 'clipboard' | 'delete'
  readonly danger?: boolean
  /** Hidden when false: the action makes no sense here (Stop on a return). */
  applies?(subject: S, context: ActionContext): boolean
  /** Shown but disabled when false: it makes sense, but not now (Paste with an empty clipboard). */
  enabled?(subject: S, context: ActionContext): boolean
  run(subject: S, context: ActionContext): void | Promise<string | void>
}
```

* **`ActionContext`** carries what the actions can't import: the services that are React contexts today
  (`EngineControls`, `SampleLibrary`, `PersonalLibrary`), and the view the menu was opened in (`origin`, for rename).
  The project, selection, status and clipboards are read from their stores with `getState()` when the action runs or
  the menu draws.
* **`actionsFor(subject)`** in `state/actions/index.ts` returns the kind's list. Nothing else picks actions.
* **Asynchronous actions** (the library's) return a promise. A message they resolve with, or an error they throw,
  goes to the toasts (`usePersistenceStore.notify`), so the menu doesn't need the Library view's status line.
* **Undo.** Project edits go through the project store as today, one undo step per action. Library and layout actions
  aren't in project undo, as today.
* **Selection in views.** When an action deletes what a view had selected (a region, nodes), the view drops the
  stale id on its next render; actions don't reach into view state.
* **Layering.** `state` may import only `@core`, which is all the actions need. They are plain functions, so unit
  tests call them on a project without React.

### Menus

* **`ActionMenu`** in `ui/shared/menu`: `<ActionMenu subject={…}>{trigger}</ActionMenu>`. It wraps `ContextMenu`,
  builds the entries from `actionsFor(subject)` (title, `applies`, `enabled`, `danger`, a separator between groups),
  and runs the chosen action with the context from `useActionContext()`.
* **Entries are built while the menu is open**, in a component inside the menu's content that subscribes to the
  project, the status store and the clipboards. So *Paste* and *Restart clip* are right even if the menu stays open
  while something changes, and nothing is computed for menus that are closed. This replaces the slots' `getState()`
  during render.
* **A subject that depends on the click** (the lane's beat, the canvas position, the nodes) is set from the trigger's
  `onContextMenu`, which runs before the menu opens, as today.
* **Buttons run actions too.** ×, ✎, *Delete module*, *Rename item* and the like call `runAction(id, subject)`, so a
  button and its menu entry share one implementation.
* **Titles name the action, not the kind**: *Rename*, *Duplicate*, *Copy*, *Paste*, *Delete*, as the piano roll and
  regions already do. The thing is the one right-clicked.
* **Popups stay.** The *+* add-track and add-audio-clip popups and the *Layout* menu are menus of a place, not of a
  thing; they stay `PopupMenu`s. The empty audio slot's sample list also joins its right-click menu, as a submenu
  (*Add audio clip* ▸).
* **View-local menus stay local.** The piano roll's (it acts on the view's note selection and hover beat) and the
  input port's (*Create knob* needs `GraphEditor`'s `createControl`) keep building their entries, through
  `ContextMenu` as today. They are the exceptions the rule test allows.
* **The rule.** `tests/architecture.test.ts` gains a case: outside `ui/shared/menu`, only the piano roll and
  `GraphEditor` / `NodeView` may import `ContextMenu`. Everything else uses `ActionMenu`.
* **Keyboard and touch.** Radix opens a context menu on the `contextmenu` event, which browsers fire for Shift+F10 and
  the Menu key on the focused element, and on long-press. So every trigger is a focusable element (the track's name
  button, a slot's launch button, the scene button, a region); step 1 checks Shift+F10 in Chromium, Firefox and
  Safari. A lane body isn't focusable; its actions are also on the lane's track name.

### In-place rename

* **`state/rename-store.ts`** holds what is being renamed: `{ subject, origin: ViewId } | null`. The *Rename*
  action sets it (and reveals `origin` if it is hidden); nothing else does.
* **`ui/shared/RenameField`**, grown from the panel's `RenameField` in `ControlCell`: a text input that replaces the
  name in place, selects its text on mount, commits on Enter and on blur, cancels on Escape, and refuses an empty
  name (it keeps the old one). Committing calls the kind's setter; either way it clears the store.
* **Where it shows**: the view that opened the menu draws the field where it draws the name: the session header or
  the mixer strip for a track, the slot for a clip, the scene button, the sample row, the library row, the sound row,
  the module bar, a panel control. A track renamed from the mixer edits in the mixer, not also in the session grid.
* **New setters** in `core`, each one undo step, with the length limit the file sanitizer already applies to that
  name: `setTrackName`, `setClipName` (session clips; a region's content is a copy and keeps its own name),
  `setSceneName` (writes `sceneNames`, padding it), `setSampleName`.
* **Library and Sounds** drop "rename from the shared field": *Rename item*, *Rename folder* and the Sounds rows'
  *Rename* start an in-place rename instead. The toolbar fields stay for *Save*.

### Clipboards

* **`state/clipboard.ts`** exports `createClipboard<T>()`, the note clipboard's subscribable store made generic, and
  `useClipboard(store)`. Each kind gets its own store; there is no clipboard that holds "anything".
* The note clipboard moves onto it, and the automation editor's points get one, which makes its *Paste* reactive.
* **Clips.** `clipClipboard` holds a copy of the clip's value and its source track's kind, not ids, so a deleted
  source still pastes.
  * *Copy* on a session clip or an arrangement region (a region's content is a clip).
  * *Cut* on a session clip: copy, then delete.
  * *Paste* on an empty slot of a track of the same kind, and on a lane at the clicked beat. Pasting gets fresh clip
    and note ids, and the automation lanes move to the destination track, as `copySessionClip` does today (a lane whose
    node isn't on that track shows as unavailable). An audio clip whose sample has been removed can't be pasted.
  * `core` gains `pasteSessionClip(project, clip, trackId, scene)`, which `copySessionClip` then uses;
    `addArrangementClip` already takes a clip value.
* **Automation slots.** `automationSlotClipboard`: *Copy* on a slot, *Paste* on an empty automation cell of the master
  or any return, with the lanes moved to that owner.
* **Nodes.** `nodeClipboard` holds the nodes and the wires between them, and the graph's domain (instrument patch,
  effects, note graph).
  * *Copy*, *Cut* and *Duplicate* on `nodes`; *Paste* on `canvas` at the clicked point.
  * `core` gains `copyNodes(patch, nodeIds)` and `pasteNodes(patch, copied, at)`: fresh node and wire ids, positions
    kept relative to each other, wires to nodes outside the copy dropped. A graph's fixed ends (*Track in*, *Track
    out*, *Clip notes*, *Note out*, *Return in*, *Master in*) are never copied.
  * Paste is enabled only into a graph of the same domain whose node types accept the nodes, and a module use only
    where its module exists (it always does within a project), and only while the graph stays within 200 nodes
    (`LIMITS.nodesPerPatch`). The pasted nodes' controls start without automation or MIDI mappings.
* **Clipboards are per session**, in memory, as the note clipboard is: they survive switching tracks and loading
  another project, and aren't shared with the operating system's clipboard.

### Duplicating a track

`core` gains `duplicateTrack(project, trackId)`. The copy goes right after the original, named "*name* copy", and is
selected; *Duplicate* is disabled at the file format's 64 tracks (`LIMITS.tracks`). It copies:

* the track's graphs (patch, effects, note graph) and its module uses;
* its clips, with fresh clip and note ids and their automation lanes moved to the copy;
* its mixer settings: volume, pan, mute, solo, sends, voices;
* the authored values of its controls (`controlValues` for its owner), so it sounds the same;
* a return's automation slots.

It leaves out what belongs to the original: MIDI mappings (one controller knob would move two tracks), snapshots and
presets of it, its arrangement regions, other tracks' sends to a return, and "notes from this track" inputs in other
tracks' note graphs.

### Scenes

`core` gains `insertScene(project, at)`, `duplicateScene(project, scene)` (insert after, copying every clip and
automation slot in the row with fresh ids) and `removeScene(project, scene)`. Each shifts every scene-indexed list
together: each track's clips, the master's and the returns' automation slots, and `sceneNames`. A project keeps at
least one scene and at most the file format's 64 (`LIMITS.scenes`), so *Insert* and *Duplicate* are disabled at 64.
Each is one undo step. The selection store's `automationScene` resets when its scene goes; the
engine gets the new project through the usual sync, and clips that are playing keep playing (the launcher knows them
by id).

### Menus, kind by kind

Groups are separated; *danger* entries are last.

| Kind | Open | Edit | Clipboard | Delete |
|---|---|---|---|---|
| Track | *Stop* (instrument and audio), *Open instrument* (instrument), *Open effects*, *Open notes* (instrument), *Show automation* | Rename, Duplicate, Mute / Unmute, Solo / Unsolo | | Delete |
| Master | *Open effects*, *Show automation* | | | |
| Session clip | Launch / Restart, *Edit notes* or *Edit clip*, *Edit automation* | Rename, Duplicate to empty slot, Place on arrangement | Copy, Cut | Delete |
| Empty slot | | *Create clip* (MIDI), *Add audio clip* ▸ samples (audio) | Paste | |
| Automation slot | Launch / Stop, *Edit* | Create (empty) | Copy, Paste (empty) | Delete |
| Scene | Launch | Rename, Insert scene before, Duplicate | | Delete |
| Sample | Preview, *Open in wave editor* | Rename, New sampler track, New audio track | | Remove from project |
| Library item | Preview | Rename, Duplicate, Insert new instrument track, Replace selected graph / Add sample to project | | Trash (with associated presets); in the trash: Restore |
| Library folder | Open | Rename, New folder inside (the toolbar's *New folder*, in this folder) | | Trash with contents; in the trash: Restore |
| Nodes | *Open module* (one use) | Rename (controls), Bypass / Unbypass, Group into module, Unlink (module use) | Copy, Cut, Duplicate | Delete |
| Canvas | Add node… (opens QuickAdd at the point) | | Paste | |
| Module | | Rename, Show / Hide interface | | Delete (disabled while used, with the reason as the title) |
| Region | *Edit clip* (opens its session source when it still exists) | Duplicate, Loop until next region / Stop looping | Copy | Delete |
| Lane | | Add *clip* ▸ the track's session clips | Paste | Clear this track |
| Control | | MIDI learn (per axis), Show automation | | |
| Sound | Recall | Update, Rename, Duplicate | | Delete |

*Open* entries are the round-1 intents (`openClip`, `openTrackView`, `openMasterEffects`, `openAutomationSlot`,
`openSampleEditor`) and `useAutomationEditor.show`; they reveal the view wherever it is docked.

### Browser tests

* **New smoke spec `context-menus.smoke.spec.ts`.** For each kind, right-click its trigger in the starter project and
  check the menu's entries by role and name, then run one entry that changes something and check the result:
  rename a track (Enter) and a scene (Escape keeps the name), duplicate a track, copy a clip into an empty slot and
  onto a lane, insert and delete a scene, copy nodes into another track's instrument, trash and restore a library
  item. One check opens a menu with Shift+F10.
* **Existing specs** that click today's labels (*Delete clip*, *Duplicate to empty slot*, the region and lane menus in
  `arrangement.smoke.spec.ts`, *Rename item* in `library.smoke.spec.ts`, Sounds' *Rename* in
  `presets.smoke.spec.ts`) move to the new labels and the in-place field.

## Steps

Each step is one commit and leaves `npm test`, `npm run typecheck` and `npm run test:smoke` green. Steps 1 to 3 come
first, in order; steps 4 to 8 are independent of each other once they have landed.

1. **Actions and `ActionMenu`.**
   * `state/actions/` with the types, `actionsFor`, `runAction` and `ActionContext`; `useActionContext()` in `ui`.
   * `ActionMenu`, with entries built while the menu is open.
   * Move the existing menus onto it unchanged in content: clip, empty MIDI slot, region, lane, control
     (`MidiTargetMenu` becomes `ActionMenu` with a `control` subject). The clip slots' two menus become one list.
   * The architecture rule for `ContextMenu`.
   * Unit tests: each moved list on a demo project (`applies`, `enabled`, `run`). Check Shift+F10 in three browsers.
2. **Clipboards.** `createClipboard` and `useClipboard`; the note clipboard moves onto it, the automation points get
   one. Unit tests for the factory; a smoke check that the automation editor's *Paste* enables right after *Copy*.
3. **In-place rename.**
   * `setTrackName`, `setClipName`, `setSceneName` and `setSampleName` in `core`, with unit tests (limits, undo, files
     round-trip).
   * `rename-store`, `ui/shared/RenameField`, and the field in the session header, mixer strip, slots, scene button
     and sample row.
   * Library, Sounds, the module bar and panel controls rename in place through the same actions.
4. **Tracks and the master.**
   * `duplicateTrack` in `core`, with unit tests for what is copied and what is left out (above), and an audio test
     that the copy renders the same as the original.
   * Menus on the session header, the mixer strip and the arrangement lane's name; the master's on its header and
     strip. × runs *Delete*.
5. **Scenes.** `insertScene`, `duplicateScene` and `removeScene` with unit tests (every scene-indexed list shifts,
   at least one scene stays, undo). The scene button's menu.
6. **Clips, slots and regions: copy and paste.** `pasteSessionClip` in `core`; the clip clipboard; *Copy*, *Cut* and
   *Paste* on clips, empty slots, regions and lanes; the automation slot's menu and clipboard; the empty audio slot's
   *Add audio clip* submenu.
7. **Samples, Library and Sounds.** Their menus, with the rows' and details column's buttons running the same actions.
   Library's asynchronous actions report through the toasts from a menu, and through the status line from the view's
   own buttons, as today.
8. **Nodes and modules.** `copyNodes` and `pasteNodes` in `core`, with unit tests (wires inside and outside the copy,
   fixed ends, domains, module uses). The node and canvas menus, and the module bar's actions.
9. **Docs.**
   * ARCHITECTURE.md: § Context menu becomes § Actions and context menus (subjects, action lists, `ActionMenu`, the
     rule, rename, clipboards) and fixes the folder's name; the session, arrangement, patcher, Library and Sounds
     sections name their menus, and the new `core` edits (renames, scenes, `duplicateTrack`, node copy and paste).
   * TASKS.md: scene renaming done; keyboard delete and duplicate for graph selections left for round 10.
   * [README.md](README.md) marks round 5 done; the roadmap notes what moved.

## Behavior changes

Intended:

* Right-click opens a menu on tracks, returns, the master, empty audio slots, automation slots, scenes, samples,
  library items and folders, nodes, the patch canvas, modules and sounds, where today nothing happens (or the
  browser's own menu opens).
* Tracks, clips, scenes and samples can be renamed; tracks duplicated; scenes inserted, duplicated and deleted; clips,
  automation slots and nodes copied and pasted.
* Existing menus change labels: *Delete clip* becomes *Delete*, *Launch clip* / *Restart clip* become *Launch* /
  *Restart*, and they gain entries (*Rename*, *Copy*, *Cut*).
* Library's and Sounds' *Rename* buttons rename in place instead of taking the toolbar's name field.
* The automation editor's *Paste* enables as soon as points are copied.

Anything else a reviewer notices is a bug in this round.

## Verification

* `npm test`, `npm run typecheck` and `npm run test:smoke` pass at every step. Run `npm run test:audio` once before
  merging (step 4 adds an audio test).
* Manual pass on the dev build:
  * every kind's menu with the mouse, with Shift+F10 and with long-press in a touch emulation;
  * rename with Enter, Escape, blur and an empty name, in the session grid and the mixer;
  * undo after each project action;
  * copy a clip, delete its track, paste it into another track of the same kind;
  * copy nodes from an instrument into effects (refused) and into another instrument (pasted);
  * a menu left open while the transport runs (*Launch* turns into *Restart*);
  * Safari and Firefox once.
* Profiling: menus aren't rendered while closed, so `scripts/profile-status.cjs` (`editor`, `four`) must show the
  same component renders a second as round 4 (145 and 173). One run each is enough.

## Decisions to sign off

Signed off 2026-10-24: every row as proposed.

| Question | Proposed | Notes |
|---|---|---|
| Rename for tracks, clips, scenes and samples, which the model can't do today | **Yes**, four small setters in `core` | The roadmap said "wherever the project already has the action", which would leave tracks, clips and scenes without *Rename*. Scene renaming is in TASKS already. |
| How rename looks | **In place**: the name becomes a field where it is drawn, in the view the menu was opened from | Alternatives: a small dialog like *Save layout as…* (simpler, one implementation, but heavier for a frequent action), or keep "rename from a shared field" (today's Library and Sounds). |
| Library's and Sounds' rename | **In place too**, replacing the shared-field rename | Keeps one rename everywhere. Their toolbar name fields stay for saving. |
| Duplicate track | **In this round**, copying graphs, clips, mixer settings and authored control values; not MIDI mappings, snapshots, arrangement regions or other tracks' references to it | The most expected entry on a track. MIDI mappings stay with the original so one knob doesn't move two tracks. |
| Copy and paste of tracks | **Not in this round**; *Duplicate* covers it within a project | Pasting a track into another project would need its modules and samples to come along, which is what the Library does. Revisit with round 7's tree (drag to reorder and regroup). |
| Scenes: insert, duplicate, delete | **In this round** | A scene's menu with only *Launch* and *Rename* would be thin, and the edits are pure `core` functions over the scene-indexed lists. |
| Nodes: copy and paste | **In this round**, within a session and only into a graph of the same domain | The roadmap's order was clips and slots, then tracks, then nodes; with tracks left to *Duplicate*, nodes come next. |
| One clipboard for session clips and regions | **Yes** | A region's content is a clip value; round 6's drag of a slot onto a lane is the same paste. |
| *Save to library* from menus | **Not in this round** | `PersonalLibrary.saveClip`, `saveSample` and `saveAsset` exist, but they need a name and a folder, which the Library view's toolbar supplies today. A follow-up once the lists exist. |
| Where view-local menus go | **The piano roll and the input port keep their own entries** through `ContextMenu`, as allowed exceptions | They act on view state (the note selection and hover beat; `GraphEditor`'s `createControl`). Moving that state into stores only to fit the pattern isn't worth it. |
| Shortcuts in menus | **Only the ones that exist** (the piano roll's) | Round 10 adds keys from the same action ids, and their labels then appear in the menus. |
