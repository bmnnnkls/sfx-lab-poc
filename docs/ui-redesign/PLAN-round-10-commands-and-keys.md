# Round 10: commands and keys

Status: **planned** 2026-10-29, decisions signed off as proposed. Part of the [UI redesign](README.md). Carries out
[roadmap § Round 10](DRAFT-roadmap.md#round-10-commands-and-keys), from an inventory of every keyboard handler and
shortcut label in `src/`, the action lists and their subjects, the selection store, the layout store and its driver,
named layouts, the File and Layout menus and the QuickAdd matcher, taken on `imp/inspiring-boyd-f8a32a` at `5286ffe`
(round 9 done, not merged into `feat/ui-redesign` yet).

## Goal

Everything the app can do from a menu can be found by name and run from the keyboard. After this round:

* **one command registry** names every view, region toggle, layout, layout preset and common action, each with a
  stable id and a title. Subject actions are not copied into it: the registry reads round 5's action lists, so the
  palette, the context menus and the buttons run the same code;
* **a command palette** (⌘K, and ⌘⇧P where the browser lets it through) finds any command by typing, with the matching
  of the patcher's QuickAdd. It also lists what can be done to what is focused or selected: *Bass: Duplicate*, *2
  nodes: Delete*;
* **one table of keys.** Every global key is a row in it: the palette, undo and redo, Tab, F6, the region toggles,
  maximize, Space for play and stop, and the edit keys (Delete, ⌘D, ⌘C, ⌘X, ⌘V, F2). The user can change any row,
  per browser. Tooltips and menus show the keys from the table;
* **graph selections answer Delete, ⌘D, ⌘C, ⌘X and ⌘V,** as round 5 left for this round. The same keys work on whatever
  focused thing has the matching action: a session clip, a region, a scene, a tree row;
* **the File menu and a new View menu are built from the registry,** and so is the status bar's *Layout* menu;
* **four built-in layouts** (*Compose*, *Arrange*, *Sound design*, *Mix*) sit above the named ones.

**Out of scope:**

* key sequences (VS Code's ⌘K ⌘S chords);
* conditions on keys beyond the three scopes below (no `when` language);
* the view-local keys: the piano roll's, the automation editor's, QuickAdd's, the trees' arrows, the controls' arrows,
  Shift+A on a canvas, Shift+F10. They stay in their views and are listed, read only, in the shortcuts dialog;
* an Edit or Help menu, and a menu bar beyond File and View;
* sound presets and snapshots as commands (Sounds and the menus recall them);
* exporting or importing key bindings as a file;
* touch: nothing here changes for a touch screen;
* the known `graphKeyOf` bug (see "Noticed").

## Inventory

### Keys today

Every `keydown` handler in `src/`, by where it listens.

| Where | Keys | What | Scope |
|---|---|---|---|
| `ui/shortcuts/use-undo-shortcuts.ts` (window) | ⌘Z, ⌘⇧Z, ⌘Y (Ctrl on others) | Undo, redo | Not in text entry (`isTextEntry`: text-like inputs, textarea, contenteditable), and not with Alt |
| `ui/shortcuts/use-view-shortcuts.ts` (window) | Tab | `toggleMainView` (Session ↔ Arrangement) | Not in fields (`isTypingTarget`: input, textarea, select) and not in the chrome (tabs, splitters, activity bar, region toggles, tab group buttons, dialogs) |
| `ui/layout/Workbench.tsx` (window) | F6, Shift+F6 | Focus the next or previous tab group | Everywhere |
| `ui/shared/menu/ContextMenu.tsx` (trigger) | Shift+F10 | Opens the menu (Chromium on macOS fires no `contextmenu` for it) | The focused trigger |
| `ui/patcher/PatchCanvas.tsx` (document) | Shift+A | Opens QuickAdd at the pointer | Pointer over the canvas, not in a field |
| `ui/patcher/QuickAdd.tsx` (its field) | ↑ ↓ Enter Backspace Escape | The picker (`quick-add-model.ts`, pure) | Its field; stops propagation |
| `ui/clip-editor/use-piano-roll-interaction.ts` (surface) | ⌘A ⌘C ⌘X ⌘V ⌘D, Delete/Backspace, Q, arrows (⇧ an octave), Escape | Notes | The focused roll |
| `ui/automation/AutomationEditor.tsx` (canvas) | ⌘A ⌘C ⌘X ⌘V, Delete/Backspace | Points | The focused drawing area |
| `ui/tracks/TracksView.tsx` (tree) | ↑ ↓ Home End ← → Enter Space, Alt+↑ ↓ | ARIA tree; Alt+↑ ↓ run the row's `<kind>.move-up` / `.move-down` | The tree |
| `ui/library/FolderTree.tsx` (tree) | Tree keys (`treeKey`) | ARIA tree | The tree |
| `ui/arrangement/ArrangementRegion.tsx` | Enter | `openRegion` | The focused region |
| `ui/controls/*` (Knob, Fader, XYPad, Toggle) | Arrows, Page keys, Space/Enter (momentary toggle) | Values | The focused control |
| `NumberField`, `TextField`, `RenameField`, `LengthField` | Enter, Escape | Commit, cancel | The field |
| `TooltipLayer`, `GroovePanel`, `MidiSettings` | Escape | Close | Document |

* **Nothing is bound to Space, Delete in a graph, ⌘D in a graph, or the region toggles.** Play and stop are buttons only.
  The graph editor's node selection is `useState` in `GraphEditor` (`picked`), reachable by its menu and toolbar, not by
  keys.
* **Two "is this a text field" rules.** `isTextEntry` (undo) and `isTypingTarget` (Tab) differ: one counts
  contenteditable and only text-like inputs, the other every input and select.
* Smoke specs press `ControlOrMeta+z` (5), `Tab` (3), `F6` and `Shift+F6`, `Shift+F10`, `Alt+ArrowDown`, and widget
  keys.

### Labels and tooltips

* `ui/shared/shortcut-labels.ts` has one function: `shortcut('C')` gives "⌘C" on Apple, "Ctrl+C" elsewhere. Only the
  piano roll's menu uses it (`MenuAction.shortcut`, display only).
* Every other key in the UI is written by hand: Undo "Undo (Ctrl/⌘+Z)", Redo "Redo (Ctrl/⌘+Shift+Z)", the transport's
  "Session view (Tab)" and "Arrangement view (Tab)", and `viewTooltips` for the two tabs.
* Two tooltip mechanisms: `data-tooltip` (`TooltipLayer`, 24 uses) and `title` (94 uses). The region toggles use
  `title`; the maximize button's text is flexlayout's (`'flexlayout.ui.maximize.tabset': 'Maximize'` in `Workbench`).

### Actions and their subjects

* `Action` (`state/actions/types.ts`): `id` (the comment already says "round 10's command ids"), `title` (text or a
  function of the subject), `group`, `danger`, `tooltip`, `takesFocus`, `applies`, `enabled`, `choices` with `inline`,
  and `run(subject, context, choice)`. `actionsFor`, `describeActions`, `runAction` and `canRunAction` are the only way
  in.
* 19 subject kinds. **Every action needs a subject;** there is no action without one. A palette with nothing
  right-clicked needs a rule for which subject it gets.
* `ActionContext` is `engine`, `samples`, `library` (React contexts) and `origin`, the view a menu is in, from
  `ViewOriginProvider`. `useActionContext()` in `ui/shared/menu` builds it.
* **What is selected** lives in `state/selection-store.ts`: `trackId`, `master`, `groupId` (one of the three), `clipId`,
  `regionId` (with its `trackId`), `sampleId`, `automationScene`. Nodes are not there. Nothing records which thing has
  the keyboard focus, but every `ActionMenu` trigger holds a focusable element (round 5's rule), and 32 places draw an
  `ActionMenu` with a subject.
* Delete-group actions are all `danger`: `track.delete`, `group.delete` (the group *and its tracks*), `clip.delete`,
  `automation-slot.delete`, `scene.delete`, `sample.remove`, `nodes.delete`, `module.delete`, `region.delete`,
  `lane.clear` (*Clear this track*), `sound.delete`, and the Library's `*.trash`. Project edits are one undo step each;
  the Library's go to its Trash.
* Rename is `renameAction(kind)`, id `<kind>.rename`, `takesFocus`.

### Layout

* `useLayoutStore` (`state/layout-store.ts`): `revealView`, `toggleMainView`, `toggleRegion('primary' | 'panel' |
  'secondary')`, `resetLayout`, `loadLayout(name)`, `saveLayoutAs(name)`, all through the shell's `LayoutDriver`.
  **No maximize:** maximizing is flexlayout's own tab-group button (`tabSetEnableMaximize`), and the driver only reacts
  to it (`intercept` expands a collapsed panel first, `reveal` restores a maximized group).
* `ViewId` has 13 views; `viewTitles` and `viewTooltips` (`ui/layout/view-titles.ts`) name them. The activity bar has
  Session, Arrangement, Wave editor, Library and Tracks.
* `TOGGLED_REGIONS` (`ui/layout/regions.ts`) names the three toggles and their glyphs (◧ ⬓ ◨); `RegionToggles` and the
  status bar's *Layout* menu both read it.
* `groupToFocus` and `viewOfElement` (`ui/layout/group-focus.ts`) find the view holding an element and the next group.

### Named layouts and presets

* Saved per browser under `sfxlab:layouts` (`ui/layout/named-layouts.ts`), checked and migrated on load like the current
  layout (`sfxlab:layout`, layout version 2). The names are read by the status bar through `persistence.names()`;
  `state` doesn't know them.
* **No built-in presets yet.** Round 3's plan and the roadmap's target workbench say *Compose*, *Arrange*, *Sound
  design* and *Mix* can join the list later.

### Menus today

* **File** (`ui/file-menu/FileMenu.tsx`) is a `<details>` with buttons, not the shared menu, so it has no menu keyboard
  (arrows, typeahead, focus return). Entries: *Export to file…*, *Export audio (WAV)…* (a dialog), *Import from file…*,
  *New project*, the examples with their taglines and *Starter*, *Restore previous* (disabled without a backup). It runs
  `ProjectFiles` (`state/project-files.tsx`), a React context implemented in `app/`.
* **Layout** (`ui/layout/StatusBar.tsx`) is a `PopupMenu`: the three region toggles (*Hide panel* / *Show panel*), the
  named layouts, *Save layout as…* (a dialog), *Delete… ▸*, *Reset layout*.
* **Add track** (+ in Session) is a `PopupMenu` over `addTrack`, `addAudioTrack`, `addReturnTrack`.
* `MenuAction` has `label`, `shortcut` (display only), `disabled`, `danger`, `tooltip`. No checked state.
* Specs open File with `page.getByText('File', { exact: true })` (`fixtures.ts`) and click its buttons by role.

### The QuickAdd matcher

* `searchCatalog` (`ui/patcher/node-catalog.ts`) ranks entries by `tierOf(query, entry)` (prefix, word start, contained,
  …; `norm` folds case and accents), then label length, then catalog order. `quick-add-model.ts` is a pure `step` over
  `input`, `key`, `hover` and `activate`, tested without a DOM. Both are specific to catalog entries.

### Noticed, not this round's

* `graphKeyOf` (`state/actions/nodes.ts`) maps a group's graph to the master's. Known; left alone.
* `title` and `data-tooltip` stay two mechanisms. This round only changes their text.

### What the inventory changes in the roadmap's outline

* **Commands are not a second list of actions.** Subject actions stay where round 5 put them. The registry adds what
  has no subject (views, regions, layouts, files, transport, history) and *reads* the action lists for the rest.
* **Keys need a subject rule.** Two subjects are worth knowing: the **focus subject** (what the keyboard focus is on)
  and the **selection subject** (the selection store). Keys use the first only, so Delete never removes something the
  user isn't looking at; the palette shows both.
* **Maximize needs a store action.** It is flexlayout's button today; the driver gains `toggleMaximize`.
* **Graph delete and duplicate come with one rule for every kind,** not as a graph-only shortcut: an action can name
  its *verb*, and Delete runs the focused thing's `delete` verb.
* **The File menu is rebuilt,** since it isn't a shared menu. Specs that click its buttons change.
* **Layout presets are new.** The registry asks for them, and none exist.

## Design

### Commands

In `state/commands/`, exported through `@state`:

```ts
/** Something the palette, a key or a menu can run that needs no subject. Subject actions stay in `state/actions/`. */
interface Command {
  readonly id: string                   // stable: overrides are saved by it. 'view.show.mixer', 'layout.toggle.panel'
  readonly category: CommandCategory    // 'View' | 'Layout' | 'File' | 'Transport' | 'Track' | 'Edit' | 'Help'
  readonly title: string                // the static name, as the shortcuts dialog lists it: 'Toggle panel'
  readonly label?: (context: CommandContext) => string // what a menu or the palette shows now: 'Hide panel'
  readonly tooltip?: string
  readonly palette?: boolean            // false: keys and menus only (the edit verbs)
  applies?(context: CommandContext): boolean
  enabled?(context: CommandContext): boolean
  choices?(context: CommandContext): readonly ActionChoice[] // the palette shows one row per choice
  run(context: CommandContext, choice?: string): void | Promise<string | void>
}

interface CommandContext extends ActionContext {
  readonly files: ProjectFiles
  /** What the keyboard focus is on, innermost first (see below). Empty when nothing focused has a subject. */
  readonly focus: readonly Subject[]
}
```

* `runCommand(command, context, choice)` runs nothing that doesn't apply or isn't enabled, and reports through
  `settle`, as `runAction` does.
* Commands that need only `state` are defined in `state/commands/`. Commands that open a dialog, move the DOM focus or
  read the named layouts are defined in `ui/commands/`, since those live in `ui`. `ui/commands/registry.ts` joins both
  into one list, `COMMANDS`. A unit test checks the ids are unique.

The commands:

| Ids | Category | Title | Where | Notes |
|---|---|---|---|---|
| `view.show.<ViewId>` (13) | View | *Show Session*, … *Show Pinned* | state | `revealView`. A `Record<ViewId, …>`, so a new view without one is a type error |
| `view.toggle-main` | View | *Switch Session and Arrangement* | state | `toggleMainView` |
| `layout.toggle.primary`, `.panel`, `.secondary` | Layout | *Toggle primary sidebar*, … | state | `label`: *Hide panel* / *Show panel*, as the status bar says now |
| `layout.maximize` | Layout | *Maximize or restore group* | state | `toggleMaximize(view)`, below |
| `layout.focus-next-group`, `.focus-previous-group` | Layout | *Focus next group*, … | ui | F6's `groupToFocus` |
| `layout.reset` | Layout | *Reset layout* | state | |
| `layout.preset.compose`, `.arrange`, `.sound-design`, `.mix` | Layout | *Compose layout*, … | ui | Below |
| `layout.load` | Layout | *Load layout* | ui | Choices: the named layouts. Not bindable (names change) |
| `layout.save-as` | Layout | *Save layout as…* | ui | Opens `SaveLayoutDialog` |
| `layout.delete` | Layout | *Delete layout* | ui | Choices: the named layouts |
| `file.export`, `file.import`, `file.new`, `file.restore-previous` | File | As the File menu names them | state | `ProjectFiles`; *Restore previous* enabled with a backup |
| `file.open-example` | File | *Open example* | state | Choices: the examples and *Starter*; the tagline is the choice's tooltip |
| `file.export-audio` | File | *Export audio (WAV)…* | ui | Opens `ExportAudioDialog` |
| `transport.play-stop`, `transport.play`, `transport.stop` | Transport | *Play or stop*, *Play*, *Stop* | state | `engine.play` / `engine.stop`; *Play or stop* reads `status.playing` |
| `transport.touch` | Transport | *Arm Touch automation* | state | `label`: *Disarm …* while armed |
| `history.undo`, `history.redo` | Edit | *Undo*, *Redo* | state | Enabled with something to undo or redo |
| `track.add-instrument`, `.add-audio`, `.add-return` | Track | *Add instrument track*, … | state | The + popup's three |
| `edit.delete`, `.duplicate`, `.copy`, `.cut`, `.paste`, `.rename` | Edit | *Delete*, … | state | Verbs on the focus subject, below. `palette: false` |
| `palette.show` | Help | *Show all commands* | ui | |
| `help.shortcuts` | Help | *Keyboard shortcuts* | ui | Opens the dialog, below |

### Subjects for commands and keys

* **The focus subject.** `ActionMenu` records its subject on its trigger element (a `WeakMap` in `ui/shared/menu`).
  `focusSubjects(document.activeElement)` walks up from the focused element and returns the subjects of the triggers
  around it, innermost first. A view can put subjects of its own in front, for a focused element that isn't a trigger:
  `GraphEditor` gives its canvas `[nodes]` (the selection, when it has one) and `[canvas]` (at the pointer if it is
  over the canvas, otherwise the middle of what shows), through `useFocusSubjects(ref, () => subjects)`.
* **The selection subject.** `selectionSubjects()` in `state/commands/`: the selected region, else the selected session
  clip (while it exists), else the selected group, master or track; and the selected sample. At most two.
* **Keys use the focus subject only.** Delete on a focused clip deletes it; Delete while the focus is in the mixer and
  a track happens to be selected does nothing. With no focus subject, the edit keys don't take the key, so ⌘C still
  copies selected page text.
* **The palette shows both**, focus first, without repeats (below).

### Verbs

`Action` gains `verb?: 'delete' | 'duplicate' | 'copy' | 'cut' | 'paste' | 'rename'`. `runVerb(verb, subjects,
context)` runs the first subject's action with that verb that applies and is enabled, and says whether it ran one.

| Kind | delete | duplicate | copy | cut | paste | rename |
|---|---|---|---|---|---|---|
| track | `track.delete` | `track.duplicate` | | | | ✓ |
| group | | | | | | ✓ |
| clip | `clip.delete` | `clip.duplicate` | `clip.copy` | `clip.cut` | | ✓ |
| slot | | | | | `slot.paste` | |
| automation-slot | `automation-slot.delete` | | `automation-slot.copy` | | `automation-slot.paste` | |
| scene | `scene.delete` | `scene.duplicate` | | | | ✓ |
| sample | `sample.remove` | | | | | ✓ |
| library-item | `library-item.trash` | `library-item.duplicate` | | | | ✓ |
| library-folder | `library-folder.trash` | | | | | ✓ |
| nodes | `nodes.delete` | `nodes.duplicate` | `nodes.copy` | `nodes.cut` | | ✓ (one control) |
| canvas | | | | | `canvas.paste` | |
| module | `module.delete` | | | | | ✓ |
| region | `region.delete` | `region.duplicate` | `region.copy` | | | |
| lane | | | | | `lane.paste` | |
| sound | `sound.delete` | `sound.duplicate` | | | | ✓ |
| pin | `pin.unpin` | | | | | |
| master, control | | | | | | |

* **Two deletes get no verb:** `group.delete` takes the group's tracks with it, and `lane.clear` empties a whole lane.
  Both stay in their menus.
* Every other delete is one undo step or goes to the Library's Trash, so a key may run it.
* A unit test checks that every verb names an action of its own kind, and that each kind has at most one action per verb.

### Keys

In `ui/commands/` (pure files with tests, like `quick-add-model.ts`):

* **A key** is a string: modifiers then the key, lower case, joined by `+`: `mod+shift+z`, `ctrl+mod+b`, `f6`,
  `shift+f6`, `delete`, `space`, `tab`. `mod` is ⌘ on Apple and Ctrl elsewhere; `ctrl` is ⌃ on Apple. `alt` is ⌥.
* **`keyOf(event, apple)`** turns a `KeyboardEvent`-shaped value into that string. Named keys come from `event.key`.
  Letters and digits come from `event.key` when it is a single Latin letter or digit, and **from `event.code` otherwise**
  (`KeyB` → `b`): ⌥ on a Mac and AltGr elsewhere change `event.key` (⌥B is "∫"), and so does a non-Latin layout. On
  Apple, Backspace and Delete both give `delete` unless the user binds them apart.
* **`keyLabel(key, apple)`** draws it: "⌃⇧⌘B" on Apple (in Apple's order ⌃⌥⇧⌘), "Ctrl+Alt+Shift+B" elsewhere.
  `shortcut-labels.ts` keeps `shortcut()` for the piano roll and gains `keyLabel`.
* **The table** (`keybindings.ts`): `DEFAULT_KEYS: readonly { command: string; key: string; apple?: string; scope?:
  KeyScope }[]`. `apple` is the key on Apple when it differs. A command may have several rows.
* **Scopes,** three, no more:
  * `text`: also while typing in a field (the palette's keys only);
  * `outside-text` (the default): not in a text entry. One rule replaces the two: inputs of a text-like type, textarea,
    select and contenteditable;
  * `workspace`: also not in the workbench's chrome (today's Tab rule, `isChromeTarget`), and not on an element that
    uses Space or Enter itself: a button, link, checkbox, switch, option, menu item or tree item. Tab and Space use it.
* **One dispatcher,** `useKeybindings()` in `ui/commands/`, mounted once in `Workspace`. It replaces
  `use-undo-shortcuts.ts`, `use-view-shortcuts.ts` and the F6 handler in `Workbench`. One `keydown` listener on
  `window`, in the bubble phase, so a view's own handler runs first:
  * it ignores events that are `defaultPrevented` (the piano roll took ⌘D), composing (`isComposing`), or repeats,
    except for commands that allow repeats (none by default);
  * it finds the commands bound to the key whose scope holds, and runs the first that applies and is enabled, with a
    `CommandContext` whose `focus` is `focusSubjects(document.activeElement)` and whose `origin` is the focused view;
  * it calls `preventDefault` **only when something ran.** An edit verb with no subject leaves the key to the browser.

### Default keys

| Command | Key (Apple) | Key (others) | Scope | Notes |
|---|---|---|---|---|
| `palette.show` | ⌘K, ⇧⌘P | Ctrl+K, Ctrl+Shift+P | text | Firefox keeps ⌘⇧P / Ctrl+Shift+P for a private window, so there only ⌘K opens it |
| `history.undo` | ⌘Z | Ctrl+Z | outside-text | As today. Fields keep the browser's own undo |
| `history.redo` | ⇧⌘Z | Ctrl+Shift+Z, Ctrl+Y | outside-text | As today; ⌘Y on Apple too, as today |
| `view.toggle-main` | Tab | Tab | workspace | As today |
| `layout.focus-next-group`, `.focus-previous-group` | F6, ⇧F6 | F6, Shift+F6 | text | As today (everywhere) |
| `layout.toggle.primary` | ⌃⌘B | Ctrl+Alt+B | outside-text | VS Code's letter, with ⌃ added |
| `layout.toggle.panel` | ⌃⌘J | Ctrl+Alt+J | outside-text | VS Code's letter, with ⌃ added |
| `layout.toggle.secondary` | ⌃⇧⌘B | Ctrl+Alt+Shift+B | outside-text | VS Code uses ⌥⌘B, which is Chrome's bookmark manager |
| `layout.maximize` | ⌃⌘M | Ctrl+Alt+M | outside-text | |
| `transport.play-stop` | Space | Space | workspace | New |
| `edit.delete` | ⌫, ⌦ | Delete, Backspace | outside-text | New outside the piano roll and automation editor |
| `edit.duplicate` | ⌘D | Ctrl+D | outside-text | ⌘D is the browser's *bookmark this page*; taken only when something ran |
| `edit.copy`, `.cut`, `.paste` | ⌘C, ⌘X, ⌘V | Ctrl+C, X, V | outside-text | Only with a focus subject; otherwise the browser's |
| `edit.rename` | F2 | F2 | outside-text | Windows' and VS Code's |

No defaults for the views (except Tab), the layouts, the files, Play, Stop, Touch, adding tracks, pinning or any subject
action. Each can be bound in the dialog.

**Why ⌃⌘ (Ctrl+Alt elsewhere) for the regions.** VS Code's ⌘B is Firefox's bookmarks sidebar, and ⌘J is the
downloads window in Firefox on macOS and in Chrome on Windows and Linux. ⌥⌘ is taken by the developer tools in Chrome
and Safari (⌥⌘I, ⌥⌘J, ⌥⌘C) and by Chrome's bookmark manager (⌥⌘B). Browsers leave ⌃⌘ to the page; macOS uses ⌃⌘F
(full screen), ⌃⌘Q (lock), ⌃⌘D (look up) and ⌃⌘Space (characters), none of ours. On Windows and Linux, Ctrl+Alt is
AltGr on many layouts, which only matters while typing, and these keys don't run in fields. Matching letters by
`event.code` keeps AltGr and ⌥ from changing them. Every default is checked by hand (Verification).

### Overrides

* **Saved per browser,** under `sfxlab:keybindings`, as `{ version: 1, keys: { [commandId]: string[] } }`: the full key
  list of each changed command, `[]` for none. Not in the project, not in exports. Read like a layout: anything
  unreadable is ignored and the defaults apply; an id this build doesn't know is kept for the build that does.
* `bindingsOf(defaults, overrides, apple)` gives the table in effect. Pure, tested as a table.
* **Conflicts:** a key set on one command is taken off any other command with the same scope; the dialog says so
  ("Was *Toggle panel*").
* **Keys a browser keeps** are refused when recording, with the reason: ⌘N, ⌘T, ⌘W, ⌘Q, ⇧⌘N, ⇧⌘T, ⇧⌘W, ⌘Tab, ⌘1 to
  ⌘9, and Firefox's ⇧⌘P (Ctrl on others). **Keys the browser uses** (⌘F, ⌘L, ⌘R, ⌘P, ⌘S, ⌘D, ⌘O, ⌘H, ⌘M) are allowed
  with a warning.
* `useKeyLabel(commandId)` reads the first key in effect, through a React context the dispatcher's host provides, so a
  tooltip re-renders only when the bindings change.

### The palette

* **`CommandPalette`** (`ui/commands/`), mounted once in `Workspace`'s command host. A popup at the top middle of the
  window, 520 px wide (the window's width less 32 px when narrower), over everything. A `combobox` field owning a
  `listbox`, with `aria-activedescendant`, as QuickAdd.
* **Opening** remembers the focused element, its view (`origin`) and the focus subjects first, then moves the focus to
  the field. **Closing** (Escape, a press outside, running a row) returns the focus there, except after an action that
  `takesFocus` (*Rename*).
* **Rows,** built when it opens and after each keystroke:
  * **Commands** that apply and have `palette` not false: "*Category: label*", the key on the right. A command with
    choices gives one row per choice: *Load layout: Mix*, *Open example: Bass drop*;
  * **Subject actions** from `describeActions` for the focus subjects, then the selection subjects not already listed:
    "*Subject name: title*", one row per choice as in a menu. `subjectName(subject)` (new, `state/actions/`) names it:
    the track's, group's, clip's, scene's, sample's or region's name, *Master*, *2 nodes*, the control's name, …;
  * a disabled entry shows dimmed with its title (which says why, as *Pin* at the limit does), and doesn't run.
* **Matching.** `tierOf` and `norm` move from `node-catalog.ts` to `ui/shared/search-match.ts`, taking a label and
  keywords, and both QuickAdd and the palette use them. The palette ranks by tier, then commands run recently, then the
  order above. With nothing typed: up to 8 commands run in this session, newest first, then the subject actions, then
  every command by category.
* **The model is pure,** `palette-model.ts` with a `step` like QuickAdd's, tested without a DOM.
* **No drift:** a unit test checks that a subject's rows are exactly `describeActions` for it (ids, titles, enabled,
  choices).

### Menus

* **File** becomes a `PopupMenu` built from the `File` commands, in today's order, with *Open example ▸* as a submenu
  (taglines as tooltips). The project name field stays beside it. The trigger is a button named *File*.
* **View** (new, after File in the transport bar), a `PopupMenu`:
  *Show all commands*, *Keyboard shortcuts* · *Show ▸* (the 13 views) · the three region toggles · *Maximize or restore
  group* · *Layouts ▸* (the four presets, the named layouts, *Save layout as…*, *Delete… ▸*, *Reset layout*).
* **Layout** in the status bar is built from the same commands as *Layouts ▸* and the region toggles.
* `menuEntriesOf(commands, context, bindings)` builds `MenuEntry` lists from commands; every entry shows its key
  (`MenuAction.shortcut`).
* `SaveLayoutDialog` and `ExportAudioDialog` move to the command host, which owns which dialog is open; the File menu
  and the status bar no longer hold that state.

### Tooltips

* Undo, Redo, Play, Stop, Touch, the transport's Session and Arrangement buttons, the region toggles and the maximize
  button take their key from `useKeyLabel`: "Undo (⌘Z)", "Toggle panel (⌃⌘J)". A command without a key has no key in its
  tooltip.
* `viewTooltips`' "(Tab)" for Session and Arrangement comes from the table too.
* flexlayout's maximize text is set through its i18n mapper in `Workbench`, which reads the label.

### Keyboard shortcuts

* **A dialog** (`ui/commands/KeyboardShortcuts.tsx`, a `<dialog>` like `ExportAudioDialog`), from *View ▸ Keyboard
  shortcuts* and the palette. A search field, then the commands by category: title, keys (chips), *Change*, *Remove*,
  and *Reset* when changed. *Reset all* at the bottom.
* *Change* records the next key pressed (Escape cancels). A kept key is refused; a used key is warned about; a
  conflict names the command that loses it.
* **View keys,** read only, at the end: the piano roll's, the automation editor's, QuickAdd's, the trees', the
  controls', Shift+A and Shift+F10, from a static list `VIEW_KEYS` beside the table.

### Maximize

* `LayoutDriver` gains `toggleMaximize(view: ViewId | undefined)` and the store `toggleMaximize(view?)`: it maximizes
  or restores the tab group holding `view`, else flexlayout's active tab group. A view in a sidebar has no group to
  maximize, so it does nothing. A collapsed panel expands first, as `intercept` does for the button.
* `layout.maximize` passes the focused view.

### Layout presets

* `presetLayout(id)` in `ui/layout/default-layout.ts` builds each from the default layout, so every view is in it once:
  * *Compose:* Session in the editor area, the panel on Clip; sidebars collapsed (the default, with Clip open);
  * *Arrange:* Arrangement in the editor area, the panel on Mixer;
  * *Sound design:* the editor area split, Instrument (moved from the panel) beside the Wave editor; the panel on
    Effects; the secondary sidebar open on Sounds;
  * *Mix:* Mixer moved to the editor area and open; the panel collapsed.
* Loading a preset replaces the layout, as loading a named layout does. Presets can't be deleted or saved over; a
  named layout may share a preset's name (they are separate lists).

### Browser tests

Specs import nothing from `src/`. A spec helper picks the region keys by `process.platform` (`Control+Meta+b` on
macOS, `Control+Alt+b` elsewhere).

* **New `commands.smoke.spec.ts`:**
  * `ControlOrMeta+k` opens the palette; "mixer", Enter: Mixer shows; Escape closes it and the focus returns;
  * `ControlOrMeta+Shift+P` opens it too (Chromium);
  * with Bass selected, "dup", Enter on *Bass: Duplicate*: *Bass copy* appears;
  * *Load layout* rows list a saved layout; *Compose layout* loads (Clip open in the panel);
  * the region keys hide and show each region; the maximize key fills the window with the editor area and restores it;
  * Space plays (the position moves) and stops; Space on a focused button presses the button only;
  * in Lead's instrument graph: select a node, `Delete`: it goes; `ControlOrMeta+z`: it is back; `ControlOrMeta+d`:
    a copy 32 px down and right; `ControlOrMeta+c` then `ControlOrMeta+v` with the pointer over the canvas: a copy at
    the pointer;
  * a focused session clip: `Delete` deletes it; `F2` renames it in place;
  * Delete with the focus in the Mixer and a track selected: nothing is deleted;
  * typing "z" with ⌘ in the project name field undoes the text, not the project.
* **New `keyboard-shortcuts.smoke.spec.ts`:** the dialog lists *Toggle panel* with its key; *Change* to `Alt+P` (a
  free key); `Alt+P` toggles the panel and the old key doesn't; the region toggle's tooltip shows the new key; after a
  reload the change is kept; *Reset* brings the default back; recording `ControlOrMeta+t` is refused with a reason.
* **Changed:** `fixtures.ts`' File helper opens the new menu, and the specs that pick File's entries by `button` role
  pick them by `menuitem` (`project`, `bundle`, `startup`, `library`, `arrangement`, `group-bus.audio`).
* **`layout.smoke.spec.ts`** gains *View ▸ Show ▸ Mixer* and a preset from the status bar's menu.
* The Tab, F6 and undo cases of today's specs pass unchanged: they are the proof that the dispatcher replaced the three
  handlers.

## Steps

Each step is one commit and leaves `npm test`, `npm run typecheck` and `npm run test:smoke` green. Steps 1 and 2 need
nothing; step 3 needs both; steps 4, 5 and 7 need 3; step 6 needs 5.

1. **Commands, verbs and subjects in `state`.** `Command`, `CommandContext`, `runCommand`; the state commands from the
   table; `Action.verb` set on the action lists; `runVerb`; `subjectName`; `selectionSubjects`; `toggleMaximize` on the
   store and the driver. Unit tests: every verb names an action of its kind, one per verb; `runVerb` on each kind and
   with no subject; `subjectName` per kind; `selectionSubjects` (region over clip over track, a stale clip); each state
   command's `applies`, `enabled` and `label` (*Hide panel*, *Restore previous* without a backup); `toggleMaximize`
   with a driver test (the panel's group, an editor group, a sidebar view, a collapsed panel). No UI change.
2. **Keys as data in `ui/commands`.** `keyOf`, `keyLabel`, `DEFAULT_KEYS`, the scopes' element rules, `bindingsOf`,
   reading and writing `sfxlab:keybindings`, conflicts, kept and used keys. Unit tests as tables: `keyOf` for ⌥ and
   AltGr letters, AZERTY's ⌘A, Backspace on Apple, F-keys, Space; labels on both platforms; overrides that are
   malformed, unknown ids kept, `[]`; a conflict moving a key; every default naming a command in `COMMANDS`. No UI
   change.
3. **The dispatcher and the focus subjects.** `useKeybindings` replaces `use-undo-shortcuts.ts`, `use-view-shortcuts.ts`
   and the F6 handler; the ui commands (`layout.focus-*`); `ActionMenu` records subjects; `useFocusSubjects` in
   `GraphEditor`; the command host and its context for labels. The new keys work: regions, maximize, Space, the edit
   verbs, F2. Smoke: today's Tab, F6 and undo cases; `commands.smoke.spec.ts` without the palette cases.
4. **The palette.** `search-match.ts` out of `node-catalog.ts` (QuickAdd's tests unchanged and green);
   `palette-model.ts`; `CommandPalette`; `palette.show`; recent commands. Unit tests: the model's `step`; ranking;
   rows for a subject equal `describeActions`; choices as rows; disabled rows. Smoke: the palette cases.
5. **Menus and tooltips.** File as a `PopupMenu`; the View menu; the status bar's menu from commands;
   `menuEntriesOf`; the dialogs moved to the command host; tooltips and flexlayout's text from `useKeyLabel`. Smoke: the
   File helper and specs moved to `menuitem`; the View menu case.
6. **Layout presets.** `presetLayout`, the four commands, their entries. Unit tests: each preset passes `checkModel`
   unchanged, holds every view once, and opens the views it names. Smoke: a preset from the status bar's menu and from
   the palette.
7. **Keyboard shortcuts.** The dialog, recording, conflicts, reset; `help.shortcuts`; `VIEW_KEYS`. Smoke:
   `keyboard-shortcuts.smoke.spec.ts`.
8. **Docs and the profile.**
   * ARCHITECTURE.md: a new § Commands and keys (the registry, the subjects, verbs, scopes, the dispatcher, overrides,
     the palette, the menus); § Actions and context menus gains verbs and `subjectName`; § Layout and navigation gains
     the keys, `toggleMaximize` and the presets. The Common changes section says how to add a command and a key.
   * `scripts/profile-status.cjs`: `WATCHED` gains `CommandPalette` and the command host.
   * [README.md](README.md) marks round 10 done; the roadmap notes what moved; this plan gets its "Changes made while
     implementing" and the profile.

## Behavior changes

Intended:

* ⌘K (and ⇧⌘P outside Firefox) opens a command palette.
* New keys: ⌃⌘B, ⌃⌘J, ⌃⇧⌘B (Ctrl+Alt on others) toggle the regions; ⌃⌘M maximizes; Space plays and stops; Delete,
  ⌘D, ⌘C, ⌘X, ⌘V and F2 act on the focused thing, graph selections included.
* Keys can be changed per browser, in a Keyboard shortcuts dialog.
* The File menu is a real menu (arrow keys, typeahead); a View menu is new; the status bar's menu gains the presets.
* Four built-in layouts.
* Tooltips and menus show the keys in effect.

Undo, redo, Tab and F6 work as today, with the same rules about fields. The context menus are unchanged. Anything else
a reviewer notices is a bug in this round.

## Verification

* `npm test`, `npm run typecheck` and `npm run test:smoke` pass at every step. Smoke tests need local ports, which the
  sandbox refuses, so they run outside it. Nothing reaches the engine but Play and Stop, which already exist, so
  `npm run test:audio` runs once at step 3 as a check.
* **The keys, by hand, in Chrome, Firefox and Safari on macOS:** each default in the table (and ⌘K, ⇧⌘P), with the
  focus on the page's background, on a button, in the project name field and on a graph canvas. Recorded as a table in
  "Changes made while implementing". A default a browser keeps is changed in that step, before the round is done.
  Windows and Linux are not checked unless a machine is at hand; the plan says so.
* Manual pass on the dev build:
  * the palette from every region, with a track, a group, the master, a clip and a region selected, and with a graph's
    nodes focused;
  * Delete and ⌘D on nodes inside a module, and with nothing selected (the key does nothing);
  * a rebinding that collides, one that is refused, *Reset all*;
  * the File and View menus by keyboard only;
  * each preset, and a named layout saved after loading one.
* **Profiling:** `scripts/profile-status.cjs`, as round 9 ran it (one run each, 10 s after 2 s of warm-up, headless
  Chromium, 1500 × 1000, the servers outside the sandbox, nothing else running). The palette is closed and the dialog
  shut, so `editor`, `four`, `groups` and `pinned` must match round 9: **145**, **173**, **86** to **87** and **144**
  component renders a second, and the command host must render 0 times a second.

  | Per second | Round 9 `editor` | Round 10 `editor` | Round 9 `four` | Round 10 `four` | Round 9 `groups` | Round 10 `groups` | Round 9 `pinned` | Round 10 `pinned` |
  |---|---|---|---|---|---|---|---|---|
  | Component renders (dev) | 145 | | 173 | | 86 | | 144 | |

## Decisions to sign off

Signed off 2026-10-29: every row as proposed.

| Question | Proposed | Notes |
|---|---|---|
| Commands and actions | **Two kinds of thing:** commands (no subject) in a registry, subject actions read from round 5's lists | Copying actions into the registry is the drift the roadmap warns about. The palette and the menus call `describeActions`; a test checks it. |
| Where commands are defined | **`state/commands/` for those that need only `state`; `ui/commands/` for dialogs, DOM focus and named layouts;** one list joined in `ui` | `state` can't open a `ui` dialog or read `ui`'s `localStorage` names. |
| Which subject a key acts on | **The focus subject only:** what the keyboard focus is on (an `ActionMenu` trigger, or a view's own, like the graph's selection) | Using the selection store would let Delete remove a track selected long ago in another view. |
| Whether the palette shows subject actions | **Yes,** for the focus subjects and then the selection subjects, each row named by its subject (*Bass: Duplicate*) | With nothing focused, the selected track, group, master, clip, region or sample still offers its actions. That is what "nothing right-clicked" gets. |
| Graph delete and duplicate (round 5's leftover) | **Through verbs on every kind,** not a graph-only shortcut | One rule: Delete runs the focused thing's `delete` verb. The graph is one of the kinds that get it. |
| Keys on `danger` actions | **Yes,** since each is one undo step or goes to the Trash; **except** *Delete group and tracks* and *Clear this track*, which get no verb | Those two remove more than the focused thing. |
| Palette keys | **⌘K and ⇧⌘P** (Ctrl on others) | Firefox keeps ⇧⌘P for a private window, so there only ⌘K works. ⌘K is the page's in all three browsers. |
| Region toggle and maximize keys | **⌃⌘B primary, ⌃⌘J panel, ⌃⇧⌘B secondary, ⌃⌘M maximize;** Ctrl+Alt instead of ⌃⌘ on Windows and Linux | VS Code's ⌘B and ⌘J are browser keys (Firefox's bookmarks sidebar and downloads, Chrome's downloads on Windows and Linux); ⌥⌘ is the developer tools'. Alternative: VS Code's own keys, accepting the clashes. |
| Which keys are safe | **Never the keys browsers keep; every default checked by hand in Chrome, Firefox and Safari on macOS,** and changed in the round if a browser keeps it | No test can check it: Playwright's keys reach the page whatever the browser would do. Windows and Linux are unchecked unless a machine is at hand. |
| Space for play and stop | **Yes,** outside fields and widgets that use Space (buttons, checkboxes, switches, options, menu and tree items) | Every DAW has it. A button keeps Space, so Space right after clicking Play presses Play again. The user can rebind it. |
| Matching letters | **By `event.key` when it is a Latin letter or digit, else by `event.code`** | ⌥ and AltGr turn letters into symbols (⌥B is "∫"); AZERTY's ⌘A still means A. |
| Where overrides are saved | **Per browser,** `sfxlab:keybindings`, like layouts; not in the project | Keys belong to the person and the keyboard, not the song. |
| How overrides are edited | **A Keyboard shortcuts dialog:** search, record a key, remove, reset, reset all | A JSON file would be the only text editing in the app. A view would need a `ViewId`, a place and a minimum size for a settings page. |
| Conflicts | **The key moves:** the other command loses it, and the dialog says so. Kept keys refused; used keys warned | VS Code allows two bindings and picks by `when`; with three scopes, two commands on one key would just shadow. |
| Scopes | **Three:** `text`, `outside-text`, `workspace` | Enough for every key in the table. A `when` language waits for a key that needs it. |
| View-local keys (piano roll, automation editor, QuickAdd, trees, controls, Shift+A, Shift+F10) | **Stay in their views,** listed read only in the dialog | They act on view-local state (the note selection, the hover beat, the tree's active row). Moving them costs more than this round gains. Their keys run first, so a global key never steals them. |
| Default keys for views, files, transport buttons, adding tracks and pinning | **None** but Tab; all bindable | Few safe keys are left, and the palette reaches them in three keystrokes. Round 9 left pinning keys here: bindable, no default. |
| File and View menus | **File rebuilt as a `PopupMenu` from the File commands; a new View menu;** the status bar's *Layout* menu from the same commands | The roadmap's "menus generated from the same registry". The File menu gains menu keyboard on the way. Specs move from `button` to `menuitem`. |
| Layout presets | **Four built-in** (*Compose*, *Arrange*, *Sound design*, *Mix*), read only, above the named layouts | The roadmap lists presets in the registry; none exist. Alternative: leave them for later and register only the named layouts. |
| Sound presets as commands | **No** | They belong to an owner and a scope chosen in Sounds; the selected track's *Sound* rows already have menus. |
| Named layouts and keys | **In the palette, not bindable;** presets are bindable | A name can change or be deleted; a preset's id can't. |
| Maximize which group | **The group the focus is in, else flexlayout's active group;** nothing for a sidebar view | Maximizing a group the user isn't in would be a surprise. |
| Recent commands | **In memory, this session, the last 8** | Nothing else about the palette is saved. Per browser would be one more key to version. |
| Undo in text fields | **Unchanged:** fields keep the browser's undo | As today. |

## Changes made while implementing

What turned out different from the design above, step by step.
