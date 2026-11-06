# The workbench

The docking shell, views and layouts, actions and context menus, commands and keys, and drag and drop.

## Layout and navigation

*Which view is showing* and *what is selected* are separate. Views are mounted from data, so they can move between
regions without knowing where they are docked (the [UI redesign](../archive/ui-redesign/README.md) builds on this).

* **The shell** (`ui/Workspace.tsx`): the transport bar on top, the activity bar beside the layout, the status bar
  below. The layout is [flexlayout-react](https://github.com/caplin/FlexLayout), pinned to an exact version and
  imported only from `ui/layout/` (the architecture test enforces both; upgrade on purpose, its 0.x minors break).
  * **Regions.** The main layout is a column: the editor area's tab groups above, the panel's tab group below.
    The editor area holds Session, Arrangement and the Wave editor by default and splits freely. The panel is the
    tab group with id `panel`, wherever it has been moved; every other tab group is the editor area, including
    one split off the panel. It holds the tool views and is never deleted, even when empty. The primary and
    secondary sidebars are flexlayout's left and right borders and run the full height, from the transport bar to
    the status bar (flexlayout spans top and bottom borders across the sidebars, which is why the panel isn't one).
    By default the panel holds Instrument, Effects, Notes, Clip and Mixer; Samples, Library and Tracks start in the
    primary sidebar and Sounds and Pinned in the secondary one, both collapsed to their strips; sidebars open 300 px
    wide. Layouts saved before Pinned existed get it in their secondary sidebar by the missing-view repair, so the
    layout version stayed 2. A border
    shows one tab at a time. Views can be dragged between all of them; tabs
    can't be closed, so every view is always somewhere.
  * **Collapsing.** Clicking the open tab of a sidebar or the panel collapses it to its tab strip; clicking a tab
    there opens it again. The panel collapses with `maxHeight: 0` (flexlayout adds the strip to a group's
    maximum) and keeps its weight, so it expands to the height it had. A panel split sideways collapses with the
    groups beside it (they share a row); one with nothing above or below it doesn't collapse. flexlayout ignores
    clicks on a group's open tab, so `Workbench` catches them first and calls the driver's `clickTab`.
  * **Maximize.** Every tab group has flexlayout's maximize button (*Maximize* / *Restore*, with the key), ⌃⌘M (Ctrl+Alt+M
    elsewhere) does it for the group the focus is in (`toggleMaximize(view)` on the store and the driver; flexlayout's
    active group with no view; nothing for a sidebar view), and double-clicking a
    tab strip does the same: the group fills the main layout, the sidebars stay. The panel counts as hidden while
    another group is maximized; showing a view elsewhere, or the panel, restores the layout. Not the browser's
    Fullscreen API, which would hide every Radix menu and tooltip (they render into `document.body`).
  * **`Workbench`** renders the layout and registers a `FlexLayoutDriver` (`layout-driver.ts`) with the layout
    store; `default-layout.ts` builds the default model from the store's `DEFAULT_LAYOUT`. The driver leaves
    replacing the model and named layouts to the shell (`LayoutShell`).
  * **Region toggles** (`RegionToggles`): primary sidebar ◧, panel ⬓ and secondary sidebar ◨, at the right end of
    the panel's tab strip before its maximize button (`onRenderTabSet`). The panel's own toggle collapses it to
    that strip. **Status bar** (`contentinfo`): the audio-failure alert, `SaveIndicator`, and a *Layout* menu with
    the same toggles, the built-in and named layouts and *Reset layout*, from the commands: the route when the panel's
    strip is off screen.
  * **Activity bar** (`nav` "Views"): Session, Arrangement, Wave editor, Library and Tracks, each marked while it shows. A
    button shows its view wherever it is docked; on a sidebar's open view it hides that sidebar instead.
  * **Keyboard.** Every global key goes through the dispatcher (§ Commands and keys). ⌃⌘B, ⌃⌘J and ⌃⇧⌘B (Ctrl+Alt
    elsewhere) toggle the primary sidebar, the panel and the secondary sidebar. Tabs follow the tab pattern and
    splitters are focusable separators (flexlayout's). F6 and Shift+F6 move the focus between the tab groups that
    show, the panel and sidebars included (`group-focus.ts`; flexlayout's own key skips borders). Tab toggles Session
    and Arrangement (the `workspace` scope): not in fields, the chrome (a tab, a splitter, the activity bar, the region
    toggles, a tab group's buttons, dialogs) or on a button, link or other element that uses Space or Enter.
* **Minimum sizes.** `viewMinSizes` in `ui/layout/view-titles.ts` (also `minSize` in the registry): 480 × 240 for the
  editors (Session, Arrangement, Wave editor, Instrument, Effects, Notes, Clip), 280 × 200 for the tool views
  (Samples, Sounds, Library, Tracks, Pinned, Mixer). `viewTab` puts them on each tab as flexlayout's `minWidth` and `minHeight`, so
  saved layouts get them too; a tab group takes its largest tab's, a sidebar its open tab's (and at least
  `MIN_SIDEBAR_SIZE`). Sashes and keyboard steps stop there. flexlayout raises a group's maximum to its minimum, so
  the driver (`keepMinimumHeights`, on every sync) clears the minimum height of the tabs a collapsed panel squeezes
  and gives every other tab its view's. When the window is smaller than the minimums, `flex-theme.css` overrides
  the inline minimums of the main layout's rows and groups, so they shrink beside the sidebars instead of sliding
  under them; the sidebars keep theirs.
* **Views at any size.** `ViewHost` puts each view in a frame (`container: view / size`) that is the root's size but
  never smaller than the view's minimum, so below it the root scrolls and the view keeps its smallest layout. A view
  lays itself out from its own size only: `@container view (…)` rules and `cqw` / `cqh` in its CSS module, with the
  breakpoints written where they apply. No `@media` (other than `prefers-*`), viewport units or window-size reads,
  except in the five files that place popups and overlays against the window; the architecture test enforces it.
  Elements meant to scroll sideways (the session grid, the mixer's strips, timelines, the piano roll, waveforms)
  carry `data-scroll="x" | "y" | "both"`. The narrow layouts: Session's grid scrolls under sticky track headers and a
  sticky scene column; the Mixer's master strip stays at the right edge and short strips drop pan, sends and
  badges; Arrangement's toolbar wraps and its names narrow; graph editors below 720 px show the property editor
  (and a module's interface) as a drawer over the canvas, opened by *Properties* or a double-click on a node, with
  Notes' heard notes under the canvas below 640 px; Clip's hint shortens, its velocity lane shrinks when short and
  the automation lanes become a `<select>`; Samples' rows take two lines and, under 300 px of height, the drop hint
  goes; the Library's tree (`LibraryTree`, the WAI-ARIA tree pattern) sits beside its details from 640 px and over
  them below, its header (search, type filter, ⋯) on one row.
* **One font everywhere.** Inter is bundled (`@fontsource-variable/inter`, imported in `main.tsx`), so text measures
  the same on every platform and these layouts wrap the same on a Linux CI runner as on a Mac. The first render
  waits for it (at most a second); the fallbacks in `theme.css` only cover glyphs Inter lacks (✎, ▶).
* **Keep-alive** (`ui/layout/ViewHost.tsx`). flexlayout renders a tab the first time it is shown and keeps it;
  `ViewTab` follows the tab's `visibility` event into `ViewHost`, which wraps the view in
  `<Activity mode={visible ? 'visible' : 'hidden'}>`. A collapsed panel keeps its open tab selected, so `ViewTab`
  also asks the layout store, which counts that view as hidden. A hidden view keeps its state and scroll offsets, and its
  Effects are cleaned up until it shows again, so subscriptions (playheads, meters) pause and window listeners
  (Shift+A) stop. Write a view's Effects to run again on every show: `PianoRoll` centres only when the clip changes.
  Just before hiding a view, `ViewHost` dispatches `view-hide` on its root; popups that should close with their
  view (`QuickAdd`, `GroovePanel`) listen with `onViewHide` (`view-events.ts`) rather than closing in an Effect
  cleanup, which StrictMode would trigger on open. Each view's root is `<div data-view={id}>`, its own scroll
  container and a landmark (`region`) named after the view, with the view's frame inside it.
* **Graph view per track** (`state/graph-view-store.ts`). Switching tracks remounts the graph editors, so the sub-patch
  open in each graph (`graphKey`: the track or `master`, and the graph) and the pan and zoom of each canvas
  (`canvasKey`: the graph's key and the open path) are kept in memory for the session. `GraphEditor` and `PatchCanvas`
  start from them and leave theirs when they change or unmount; a path whose modules are gone is cut where it breaks
  (`livePath`). Not saved: track ids belong to the project, and this is a way of looking.
* **Layout store** (`state/layout-store.ts`), a façade over the shell. The library owns the layout tree; the store
  keeps round 1's API and mirrors what shows: `groups` (each tab group with its region, views and active view),
  `visible` and `hiddenRegions` (a collapsed sidebar or panel counts as hidden). `revealView(id)` shows a view
  wherever it is docked (opening a collapsed region and restoring a maximized group first), `toggleMainView()`
  shows whichever of Session and Arrangement isn't showing (nothing when both are), `toggleRegion`, `resetLayout`,
  `saveLayoutAs(name)`, `loadLayout(name)`, `loadPreset(id)` and `toggleMaximize(view?)`. With a driver attached the
  actions go to it and the shell mirrors the model back through `sync` after each change; without one (unit tests,
  before the shell mounts) they update the mirror directly, and named layouts, presets and maximize do nothing. Read `visible` to know whether a view shows.
* **Persistence** (`ui/layout/layout-storage.ts`, `use-layout-persistence.ts`). The whole layout, every group's
  open tab included, is saved per browser under `sfxlab:layout` as `{ version: 2, model }`, 250 ms after the last
  change, and read once before the first render. `parseStoredLayout` rejects anything that isn't JSON, an unknown
  version, unknown views or node types, non-view tabs, duplicate ids, a top or bottom border and other than one
  panel (falling back to the default), and repairs what a later round can make stale: missing views go to their
  default region, missing sidebars are added, tabs take the registry's names and tooltips, the panel its
  attributes. A version-1 layout (round 2, the panel as the bottom border) is migrated and saved again at once:
  the border's tabs become the panel under the editor area with their order and open tab, its size the panel's
  weight against 1000 px, and a collapsed, hidden or empty border a collapsed panel. A browser without a saved
  layout gets one from the old `sfxlab:main-view` and `sfxlab:editor-height`. *Reset layout* saves the default.
  Replacing the project doesn't touch the layout.
* **Built-in layouts** (`presetLayout(id)` in `ui/layout/default-layout.ts`), above the named ones and made from the
  default, so every view is in each once: *Compose* (Session, the panel on Clip), *Arrange* (Arrangement, the panel on
  Mixer), *Sound design* (the editor area split: the Wave editor beside Instrument in group `editor-instrument`; the
  panel on Effects; the secondary sidebar open on Sounds) and *Mix* (Mixer in the editor area, the panel collapsed).
  `loadPreset(id)` on the store, the driver and the shell replaces the layout, as loading a named layout does. They
  can't be deleted or saved over; a named layout may share a preset's name.
* **Named layouts** (`ui/layout/named-layouts.ts`). *Save layout as…* in the *Layout* menu asks for a name (a name
  in use asks again before replacing) and saves the model under `sfxlab:layouts` as
  `{ version: 2, layouts: { [name]: model } }`. The menu lists the names to load, the way *Reset layout* loads the
  default, and deletes them from a *Delete…* submenu. Each goes through the same checks and migration as the
  layout when loaded; saving rewrites them all at today's version.
* **Selection store** (`state/selection-store.ts`): `trackId`, `master`, `clipId`, `regionId`, `automationScene`,
  `sampleId`. Selecting never changes the view. `selectRegion(regionId, trackId)` selects a region and its track
  instead of a session clip; every other `select…` but `selectSample`, and `reset`, clear `regionId`. A selected
  region moved to another lane, and a selected session clip moved to another slot, stay selected with their new
  track. A track is selected from the session header, the mixer strip, the arrangement lane's name and a region;
  "the inspector" is the views that follow `trackId` (Instrument, Effects, Notes, Clip, Sounds, the Library's
  destination). Launching a session clip doesn't select it.
* **Navigation intents** (`state/navigation.ts`) select *and* reveal: `openClip`, `openRegion` (a region's own copy
  in Clip), `openTrackView(trackId, view)`
  (the fx / notes badges, *New sampler track*), `openMasterEffects`, `openAutomationSlot`, `openSampleEditor` (✎ on
  a sample: the Wave editor, `ui/wave-editor/`, whose *Close* clears the selection; the Samples view always shows
  its list), `revealPin` (pins a panel, reveals Pinned and asks it to scroll to the pin) and `openPinnedEditor` (a
  pin's owner and its editor). Code
  that wants to show something calls an intent; code that only selects calls the `select*` action.
* **View registry** (`ui/layout/views.ts`): `Record<ViewId, { title, tooltip?, component }>`. A view takes no props
  and reads its data from the stores. The titles and tooltips live apart in `ui/layout/view-titles.ts`, which
  imports no components, so a view can use another view's title without an import cycle and the layout can name
  its tabs without loading the views. Adding a `ViewId` without a registry entry fails the typecheck.
* **Every empty state offers its action**, in a row that wraps under the text at the view's minimum size: *Add
  instrument track*, a track's clips, *Open effects*, *Save asset + presets*, *Show session*, and Pinned's *Pin Bass
  instrument* (the selected owner's panels).
* **The Pinned view** (`pinned`, title *Pinned*, a tool view) holds every pin, stacked, since a sidebar shows one tab
  at a time and a view can't be open twice. See § Front panel, Pinned panels.
* **A view never names another view in its text.** An empty state or menu that would say "in the Samples tab"
  offers an action instead (*Import samples…*, *Open effects*, *Show session*) that calls `revealView` or an intent,
  because the other view may be docked anywhere, or already visible. Where a label must name a view, it takes the
  title from `viewTitles`.
* **Browser tests** open views only through `openView(page, title)` in `tests/browser/support/fixtures.ts`, which clicks
  the view's tab and returns its root once visible; look inside that root, since hidden views stay in the DOM
  (`viewRoot(page, title)` finds a root without showing it); on a collapsed panel it clicks the open tab to expand
  it. `dragView` and `dragViewToSidebar` dock a tab with the stepped mouse moves flexlayout needs; `tabStrip`
  finds a group's strip and its buttons. `dockAtSize(page, title, { width?, height? })` loads the page with a view
  alone at a size (in the primary sidebar, the panel, or a group held by its maximums), and
  `views-at-min-size.smoke.spec.ts` checks every view there: nothing scrolls sideways without `data-scroll`, and its
  main controls and empty-state actions show inside its box. `ViewTitle` and the ids are kept in sync with `viewTitles` by hand.
* **Profiling** (`scripts/profile-status.cjs`): React renders and Chrome's main-thread counters while the
  transport plays; usage in its header.

## Actions and context menus

Right-click works throughout the app, from one list of actions per kind of thing. A view only says what was
right-clicked; what can be done to it lives in `state/actions/`.

* **Subjects.** What was right-clicked is a `Subject`: a small value with a `kind` and ids, never a component or a DOM
  element. The kinds: `track` (instrument, audio and return tracks), `group` (a group of tracks), `master`, `clip` (a session clip), `slot` (an
  empty session cell), `automation-slot`, `scene`, `sample`, `library-item`, `library-folder`, `library-root` (*My library* or the
  Library's trash), `project-graph` (an owner's instrument, effects or notes under the Library's *This project*: an
  owner and a domain), `nodes`, `canvas`,
  `module`, `region`, `lane`, `control` (a panel control or a mixer value), `sound` (a snapshot or preset, and in
  Sounds the selected owner it recalls onto), `pin` (a pinned front panel: an owner and a graph), `sample-selection` (a Wave editor pane's lanes: its sample's
  selection and cursor in that pane, and the clipboard, read from the stores), and `sample-marker`, `sample-region` and
  `sample-loop` (a marker, a region or the loop in a pane's mark lane, set from what the pointer is on). The four carry
  the `pane` (`main` or `second`) they were opened in, and act on that pane's view. `nodes`
  is the selection when the right-clicked card is selected, otherwise that card alone. `nodes` and `canvas` name the
  track's (or the master's) graph as `target` and the modules opened from there as `path`; the nodes are in the last
  module of `path` (`editTargetOf`). `canvas` and `lane` carry where the click landed, which is where *Paste* and *Add*
  put things; the view sets it from the trigger's own `onContextMenu`, which runs before the menu opens.
* **Actions.** One file per kind exports its list of `Action`s: an `id` (`clip.duplicate`, stable: the palette lists it), a
  `title` (text, or a function of the subject), a `group` (open, edit, clipboard, delete, process, marks, view: a separator
  between groups; a list keeps that order; `separated` asks for one before an action inside its group),
  `danger`, `applies` (hidden when false: *Stop* on a return), `enabled` (shown but disabled: *Paste* with an empty
  clipboard) and `run`. An action that asks which one has `choices` (a lane's session clips, an empty audio slot's
  samples, an XY pad's axes), drawn as a submenu (disabled, with the reason, while the action is) or, with `inline`
  (which can depend on the subject), one entry per choice; a choice may be `checked` (a fade's last used curve), drawn as a checkable entry. An action that moves the
  focus to a field of its own says `takesFocus`. `actionsFor(subject)` returns the kind's list; nothing else picks
  actions. `describeActions(subject, context)` is what a menu shows now, and unit tests call it too.
* **`ActionContext`** carries what actions can't import: the services that are React contexts (`EngineControls`,
  `SampleLibrary`, `PersonalLibrary`) and `origin`, the view the menu or button is in. `useActionContext()` in
  `ui/shared/menu` builds it; each view's host provides its id (`ViewOriginProvider`). The project, selection, status,
  clipboards and the Library's catalog are read from their stores when an action runs or the menu draws. `state` may
  import only `@core`, so actions are plain functions that tests run on a project without React.
* **Running.** `runAction(id, subject, context, { choice, report })` runs nothing that doesn't apply or isn't enabled.
  Project edits go through the project store, one undo step per action; library and layout actions aren't in project
  undo. An asynchronous action (the library's, the sounds') resolves with a message, or with `{ message, action }`
  (`ActionReport`: a button for its toast, *Show* after a save to the library), or throws; `runAction` reports it to
  the toasts (`usePersistenceStore.notify`), or to `report` (the Library's and Sounds' status lines, from their own
  buttons, which leave the button out), and returns a promise that settles after.
* **Verbs.** An action can name the edit key that runs it on the focused thing: `verb` is `delete`, `duplicate`,
  `copy`, `cut`, `paste` or `rename`, at most one action of a kind per verb (a unit test checks it). Every kind's
  *Rename* has `rename` (set in `renameAction`); the deletes that remove more than the thing itself (*Delete group and
  tracks*, *Clear this track*) have none. `runVerb(verb, subjects, context)` runs the innermost subject's action with
  that verb if it applies and is enabled, and says whether it ran one; only Paste walks out to the first subject that
  takes a paste (the graph's selected nodes paste on the canvas around them). `verbTarget` says what would run.
* **Names.** `subjectName(subject)` names a subject for the palette: the track's, group's, clip's, scene's (*Scene
  2* when unnamed), sample's or region's name, *Master*, *2 nodes* or a single node's title, a control's target label,
  *Lead instrument* for a pin, *My library* and *Trash* for the Library's roots, *Selection in Kick* for the Wave editor's lanes, *Hit in Kick* for a marker or region
  and *Loop in Kick* for a sample's loop, and the kind's word (*Track*) for a
  thing that is gone.
* **Buttons run actions too.** ×, ✎, ■, M and S, the sample row's buttons, the Library's main button, ▶ and empty-state
  save,
  the Sounds rows, a card's *Edit* and *Unlink*, the toolbar's *Group into module* and the module bar's buttons call
  `runAction` with the same subject, so a button and its menu entry share one implementation. A Sounds row's subject
  carries the selected owner (`onto`), so its click and its menu's *Recall* both recall onto the selection; *Set as A*
  and *Set as B* set the morph's ends in `sounds-store`. One exception keeps the view's choice: the automation cell's ▶
  and ■ launch directly.
* **Selection in views.** When an action removes what a view had selected (nodes), the view drops the stale id on its
  next render; actions don't reach into view state. A deleted region stays named in the selection store and shows as
  nothing. What a menu needs from a view lives in a store: the
  graph editor's open sub-patch and module-interface toggle and its *Add node…* request (`graph-view-store`), and the
  Library's catalog, active row, selection, preview and export or import request (`library-store`; the open folder
  is derived from the active row).

* **Pins.** A pin's menu is *Open* (tooltip "Open the full editor"), *Collapse* / *Expand*, *Move up*, *Move down*
  (disabled at the ends) and *Unpin* (not `danger`: nothing is lost); its header's buttons run them. The `open` group of
  a track gains *Pin panel ▸ Instrument, Effects, Notes* (inline *Pin effects panel* on an audio or return track; a
  pinned one disabled; hidden when all are pinned) and *Unpin panel ▸* (inline when one is pinned, *Unpin notes
  panel*); a bus's and the master's gain *Pin effects panel* / *Unpin effects panel*, after the *Open …* entries. At 16
  pins *Pin* is disabled, titled "… — 16 panels are pinned". Actions in `state/actions/pin.ts`.

### Menus

* **`ui/shared/menu`** holds `ContextMenu` (right-click, Radix context menu), `PopupMenu` (click, Radix dropdown),
  their shared entry renderer and stylesheet, and `ActionMenu`. Callers describe entries and never touch the library,
  so swapping it means changing this one folder. Radix supplies keyboard navigation, typeahead, focus return and
  keeping the menu inside the window. (Spartan, which was suggested once, is Angular-only.)
* **`ActionMenu`**: `<ActionMenu subject={…}>{trigger}</ActionMenu>`. It wraps `ContextMenu`, builds the entries from
  `describeActions` and runs the chosen one with `useActionContext()`. With a `null` subject it draws the trigger
  without a menu. Its entries come from `useActionEntries(subject, context, only?)`, which a `PopupMenu` may use for
  some of a subject's actions: the Wave editor's *Process ▾* and *View ▾* are its `process` group and its zooms.
* **Toasts can carry one button.** `notify(kind, message, details?, action?)`: the action is `{ label, run }`, kept in
  memory only. The toast draws it beside ×; running it dismisses the toast, and a toast with a button stays 10 s
  instead of 5 so it can be reached.
* **A choice's tooltip** reaches its submenu entry, so a disabled choice says why (a scene that has a clip).
* **Checkable entries.** A `MenuAction` with `checked` (true or false) is drawn as a Radix checkbox item
  (`menuitemcheckbox`) with a ✓ when true, in both kinds of menu.
* **Entries are built only while the menu is open,** in a component inside the menu's content: `ContextMenu` takes a
  function for `entries` and calls it there. It subscribes to the project, the status, the sample store and every
  clipboard (`subscribeToClipboards`), each through a signature of the entries, so *Paste* and *Restart* are right
  if something changes while the menu stays open, and the status's 30 updates a second re-render it only when an
  entry changes. Nothing is computed for closed menus.
* **The innermost menu opens.** A trigger stops the `contextmenu` event, so the fader inside a mixer strip opens its
  own menu, not the strip's.
* **Keyboard and touch.** Radix opens a menu on `contextmenu`, which browsers fire for the Menu key and, on Windows and
  Linux, Shift+F10, and on a long press. Chromium on macOS fires nothing for Shift+F10, so `ContextMenu` handles that
  key itself on the focused trigger (or inside it): it prevents the browser's handling and sends a `contextmenu` from
  the trigger's bottom-left corner. Every trigger is or holds a focusable element; the arrangement lane's name and
  regions are focusable for that, and carry their menus. Checked in Chromium; Firefox and Safari were not checked.
* **Focus after a rename.** Radix returns the focus to the trigger as a menu closes. `ActionMenu` and `PopupMenu`
  prevent that after an entry that `takesFocus` (an in-place rename, *Add node…*, an edit's settings popover;
  `notingFocus`).
* **Popups stay.** The *+* add-track popup, the empty audio slot's *+*, File, View, Library and the *Layout* menu are
  menus of a place, not of a thing. File, View, Library and *Layout* are built from commands (§ Commands and keys). The empty audio slot's *+* runs the same *Add audio clip* action as its right-click submenu.
* **View-local menus stay local.** The piano roll's (it acts on the note selection and the hover beat) and an input
  port's (*Create knob* needs `GraphEditor`'s `createControl`) build their entries through `ContextMenu`. The rule in
  `tests/architecture.test.ts`: outside `ui/shared/menu`, only `PianoRoll`, `GraphEditor` and `NodeView` may import
  `ContextMenu`; everything else uses `ActionMenu`.
* **A component child must forward the trigger's props.** The trigger is Radix's `asChild` child, so a custom
  component (unlike a plain `<div>`) has to spread the props it does not use itself (the menu's handlers,
  `data-state`, `ref`) onto its root element. The arrangement region dropped them once, and its menu never opened.
  `NodeView` wraps its own root in `ActionMenu` instead.

| Kind | Open | Edit | Clipboard | Delete |
|---|---|---|---|---|
| Track | Stop (instrument, audio), Open instrument, Open effects, Open notes, Show automation | Rename, Duplicate, Save to library ▸ Instrument + notes, Audio effects, Note effects (instrument) or Save effects to library (audio, return), Arm for recording / Disarm (instrument), Mute / Unmute, Solo / Unsolo | | Delete |
| Master | Open effects, Show automation | Save effects to library | | |
| Session clip | Stop recording (while a take records into it), Launch / Restart, Edit notes or Edit clip, Edit automation | Rename, Duplicate to empty slot, Place on arrangement, Save to library | Copy, Cut | Delete |
| Empty slot | | Create clip, Record a clip here (MIDI; disabled until the track is armed), Add audio clip ▸ samples (audio) | Paste | |
| Automation slot | Launch / Stop, Edit | Create (empty) | Copy, Paste (empty) | Delete |
| Scene | Launch | Rename, Insert scene before, Duplicate | | Delete |
| Sample | Preview, Open in wave editor | Rename, New sampler track, New audio track, Add to library | | Remove from project |
| Library item | Preview | Rename, Duplicate, Insert new instrument track, Replace selected graph / Add sample to project, Insert into Bass ▸ scenes and Replace clip in Bass ▸ scenes (clips), Move to ▸ My library and folder paths (not presets), Export as .sfxlib… | | Trash; in the trash: Restore |
| Library folder | Open | Rename, New folder inside, Duplicate (deep), Move to ▸, Export as .sfxlib… | | Trash; in the trash: Restore |
| Library root | | My library: New folder, Import .sfxlib…, Export all… | | Trash: Restore all |
| Nodes | Open module (one use) | Rename (one control), Bypass / Unbypass (note effects), Group into module, Unlink (one use) | Copy, Cut, Duplicate | Delete |
| Canvas | Add node… | Add sampler ▸ samples (an instrument graph, while the project has samples) | Paste | |
| Module | | Rename, Show / Hide interface | | Delete (disabled while used, the reason in its title) |
| Region | Edit (its own copy, in Clip), Edit session clip (its source, while it exists) | Duplicate, Loop until next region / Stop looping | Copy | Delete |
| Lane | | Add clip ▸ the track's session clips, Add audio clip ▸ samples (an audio track) | Paste | Clear this track |
| Control | | MIDI learn (per axis), Show automation | | |
| Sound | Recall | Update, Rename, Duplicate | | Delete |
| Sample selection | | | Cut, Copy, Paste, Delete, Crop | |

The sample selection's menu then has two groups of its own: *Process* (each `process` edit of the registry, *Fade in*
and *Fade out* with a curve submenu, *Insert silence…*) and *View* (*Select all*, *Zoom to selection*, *Zoom to fit*,
*Play selection* / *Play from cursor* / *Stop*). Its verbs are `cut`, `copy`, `paste` and `delete`.

*Open* entries are the navigation intents (`openClip`, `openRegion`, `openTrackView`, `openMasterEffects`,
`openAutomationSlot`, `openSampleEditor`) and `useAutomationEditor.show`: they reveal the view wherever it is docked. *Show automation* on a
track opens its volume lane, in the selected (or first) clip, or a return's slot (created when empty).

### In-place rename

* **`state/rename-store.ts`** holds what is being renamed: `{ subject, origin }` or nothing. Only *Rename* actions
  start it (`startRename`, which also reveals `origin`, or the kind's own view outside a view); the field stops it.
* **`ui/shared/RenameField`** is a text field for a name: it commits on Enter and on blur, cancels on Escape, refuses
  an empty name (keeping the old one) unless `allowEmpty`, and keeps the browser's own menu on right-click. An
  in-place field selects its text a task after it mounts, once the menu that started it is gone (its focus trap holds
  the focus until then). **`InPlaceRename`** draws a view's name, or the field in its place while the store names
  this subject in this view: a track renamed from the mixer edits in the mixer only. Where it shows: the session
  header and mixer strip (track), the slot (clip), the scene button, the sample row, the Library's item and folder
  rows, the sound row, a node card's title (controls). The module bar's and a panel control's (edit mode)
  name fields are always there; *Rename* selects the module bar's.
* **Committing** is `commitRename(subject, name, context)`: each kind's setter, one undo step. The new setters are in
  `core/project/rename.ts`: `setTrackName`, `setClipName` (session clips; a region's content is a copy and keeps its
  name), `setSceneName` (writes `sceneNames`, padding it; an empty name clears it) and `setSampleName`. Each trims the
  name and cuts it to `NAME_LIMITS` (track 40, clip 40, scene 24, sample 60), which the file sanitizer reads too. A
  library rename goes through `PersonalLibrary.update` and resolves with the catalog.

### Clipboards

* **`state/clipboard.ts`**: `createClipboard<T>(empty)` makes a subscribable store for one kind of copied thing, and
  `useClipboard(store)` reads it with `useSyncExternalStore`. There is no clipboard that holds "anything". Each kind
  of clipboard is per session, in memory: it survives switching tracks and loading another project, and isn't shared
  with the operating system's clipboard. A plain module variable once kept the piano roll's *Paste* greyed out after
  copying until something else re-rendered; a subscribable store doesn't.
* **Notes** (`ui/clip-editor/note-clipboard.ts`) and **automation points** (in `AutomationEditor`) are view-local
  clipboards made with the same factory; the automation editor's *Paste* enables as soon as points are copied.
* **Clips** (`clipClipboard`): a copy of the clip's value and its source track's kind, never ids, so a clip whose track
  is gone still pastes. Session clips and arrangement regions share it (a region's content is a clip). *Paste* goes
  into an empty slot of a track of the same kind (`pasteSessionClip`, `canPasteSessionClip`) and onto a lane at the
  clicked beat, as `clipCopyFor(project, clip, trackId)`: fresh clip, note, lane and point ids, the lanes moved to the
  destination track (a lane whose node isn't on that track shows as unavailable). An audio clip whose sample was
  removed doesn't paste. `copySessionClip` (*Duplicate to empty slot*) uses the same copy.
* **The library** (`libraryClipboard`): cut or copied, and the entries as they would be dragged (`LibraryClipEntry`),
  for the Library's *Paste here* (see [library-and-presets.md](library-and-presets.md)). Cutting a library folder
  leaves a copied clip alone.
* **Automation slots** (`automationSlotClipboard`): *Paste* into an empty cell of the master or any return, with fresh
  ids and the lanes moved to that owner.
* **Nodes** (`nodeClipboard`): the nodes and the wires between them (`copyNodes` in `core/project/node-copy.ts`), with
  the kind of graph they came from. A graph's fixed ends (*Track in*, *Track out*, *Clip notes*, *Note out*, *Return
  in*, *Master in*) are never copied, and wires to nodes outside the copy are dropped. `pasteNodes(patch, copied, at)`
  gives fresh node and wire ids, keeps the nodes where they were relative to each other with the group's top-left at
  the clicked point, and pastes nothing past `MAX_PATCH_NODES` (200). *Paste* is enabled only into the same kind of
  graph (instrument, effects or notes; a module's inside counts as the graph it was opened from), and not when it
  would put a module inside itself. The pasted controls start without automation or MIDI mappings, since nothing
  points at their new ids. *Duplicate* pastes 32 px down and right and leaves the clipboard alone.

### Edits behind the menus

* **`duplicateTrack(project, trackId)`** (`core/project/track-duplicate.ts`) adds "*name* copy" right after the
  original and the action selects it; disabled at `MAX_TRACKS` (64). It copies the graphs (node ids kept, so values
  and lanes only change owner) and their module uses, the clips (fresh ids, lanes moved to the copy), the mixer
  settings (volume, pan, mute, solo, sends, voices), a return's automation slots, and the track's `controlValues` and
  `sampleBindings`, so it sounds the same (an audio test pans the two apart and compares the channels). It leaves out
  what belongs to the original: MIDI mappings, snapshots and presets, arrangement regions, other tracks' sends to a
  return and other note graphs' "notes from this track" inputs.
* **Scenes** (`core/project/scenes.ts`): `insertScene(project, at)`, `duplicateScene(project, scene)` (inserted after,
  every clip and slot in the row copied with fresh ids, and its name) and `removeScene(project, scene)`. Each shifts
  every scene-indexed list together: each track's clips, the master's and the returns' automation slots (which may be
  shorter than the row count, and are only padded to put a slot past their end) and `sceneNames` (trailing empty
  names dropped). A project keeps 1 to `MAX_SCENES` (64) scenes. The selection store's `automationScene` follows its
  row, and resets to the first scene when its row goes. Clips that are playing keep playing: the launcher knows them
  by id.
* `MAX_TRACKS`, `MAX_SCENES` and `MAX_PATCH_NODES` live in `core/project`; the file format's `LIMITS` reads them.

## Commands and keys

Everything the app can do from a menu can be found by name and run from the keyboard. Subject actions stay in
`state/actions/`; commands are what has no subject.

* **Commands** (`state/commands/`). A `Command` has a stable `id` (`view.show.mixer`, `layout.toggle.panel`: key
  overrides are saved by it), a `category` (View, Layout, File, Transport, Track, Library, Edit, Help), a `title`
  (*Toggle panel*), a `label` for now (*Hide panel*), a `tooltip` that may be a function of the context (why it is
  disabled now: `commandTooltip`), `applies`, `enabled`, `choices` (one palette row each), `danger`,
  `takesFocus`, `repeat` (a held key runs it again: undo and redo), `palette: false` (the edit verbs) and `bindable:
  false` (*Load layout*, whose choices are names). `runCommand` runs nothing that doesn't apply or isn't enabled and
  reports like `runAction`. `CommandContext` is an `ActionContext` with the project's `files` and `focus`, the
  subjects the keyboard focus is on. `STATE_COMMANDS` holds those that need only `state` (regions, maximize, reset,
  files, examples, transport, Touch, undo, adding tracks, the edit verbs, and `LIBRARY_COMMANDS`); `viewCommands(viewTitles)` makes the 13
  *Show …* commands; `ui/commands/ui-commands.ts` has those that move the DOM focus or open dialogs (F6's, the palette,
  the shortcuts, *Save layout as…*, *Export audio*, the presets, the named layouts). `ui/commands/registry.ts` joins
  them into `COMMANDS`.
* **Subjects for keys.** `ActionMenu` records its subject on its trigger (a `WeakMap` in
  `ui/shared/menu/focus-subjects.ts`); `focusSubjects(element)` walks up from the focused element and returns the
  subjects around it, innermost first. A view can give an element subjects of its own with `useFocusSubjects(ref,
  read)`, in place of its menu's: the graph canvas (focusable, focused by a press on it or a card) gives its selected
  `nodes` and the `canvas` at the pointer, or the middle of what shows. **Keys use the focus subjects only**, so Delete
  never removes something selected long ago in another view. `selectionSubjects()` (`state/commands`) gives the
  selected region, else the selected session clip (each while it exists), else the group, master or track, and the
  selected sample; only the palette uses it.
* **Keys** (`ui/commands/keys.ts`, `keybindings.ts`, pure and tested as tables). A key is a string, modifiers then the
  key: `mod+shift+z`, `ctrl+mod+b`, `f6`, `space`. `mod` is ⌘ on Apple and Ctrl elsewhere, `ctrl` is ⌃ on Apple, `meta`
  the Windows key elsewhere. `keyOf(event, apple)` takes letters and digits from `event.key` when it is a Latin one,
  else from `event.code` (⌥B is "∫", AltGr and other layouts change the key, not the code); a Mac's ⌫ is `delete` and
  ⌦ `forwarddelete`. `keyLabel` draws "⌃⇧⌘B" on Apple, "Ctrl+Alt+Shift+B" elsewhere. `DEFAULT_KEYS` is the table:
  ⌘K and ⇧⌘P the palette; ⌘Z, ⇧⌘Z, ⌘Y; Tab (and Shift+Tab) Session and Arrangement; F6 and ⇧F6; ⌃⌘B, ⌃⌘J and ⌃⇧⌘B the
  regions, ⌃⌘M maximize (Ctrl+Alt elsewhere); Space play or stop; ⌫ ⌦ (Delete, Backspace), ⌘D, ⌘C, ⌘X, ⌘V and F2 the
  verbs.
* **Scopes,** three: `text` works everywhere (the palette, F6); `outside-text`, the default, not in a text entry (a
  text-like input, textarea, select or contenteditable); `workspace` also not in the chrome (a tab, a splitter, the
  activity bar, the region toggles, a group's buttons, dialogs) and not on an element that uses Space or Enter itself
  (a button, link, checkbox, switch, option, menu or tree item): Tab and Space.
* **The dispatcher** (`useKeybindings`, mounted once by `CommandHost`). One `keydown` listener on `window` in the
  bubble phase, so a view's own handler runs first (the piano roll's ⌘D). It ignores prevented and composing events,
  finds the commands bound to the key whose scope holds, runs the first that applies and is enabled with the focused
  view as `origin` and its subjects as `focus`, and prevents the browser's handling only then: ⌘C with nothing focused
  that copies is the browser's. A repeat runs only a command that allows it, and is swallowed otherwise.
* **Overrides** are saved per browser under `sfxlab:keybindings` as `{ version: 1, keys: { [commandId]: string[] } }`,
  each changed command's full list (`[]` for none). Anything unreadable is ignored; an unknown id is kept.
  `bindingsOf(defaults, overrides, apple)` gives the table in effect; a key set on one command moves off any other of
  the same scope (`assignKey`, `replaceKeys`). Keys a browser keeps (⌘N, ⌘T, ⌘W, ⌘Q, ⇧⌘N, ⇧⌘T, ⇧⌘W, ⌘Tab, ⌘1 to ⌘9,
  Firefox's ⇧⌘P) are refused when recording; keys it uses (⌘F, ⌘L, ⌘R, ⌘P, ⌘S, ⌘D, ⌘O, ⌘H, ⌘M) are warned about.
* **`CommandHost`** wraps the workspace: the bindings (read once, saved on each change), the listener, the services
  the commands run with, and `useKeyLabel(id)` and `withKey(text, label)` for tooltips ("Undo (⌘Z)", "Toggle panel
  (⌃⌘J)", flexlayout's *Maximize*, Session's and Arrangement's tabs). It renders only when the bindings change; its
  `HostDialogs` owns which of the palette, *Save layout*, *Export audio* and *Keyboard shortcuts* is open
  (`showDialog` in `ui/commands/dialogs.ts`).
* **The palette** (`CommandPalette`, behaviour in `palette-model.ts`, rows in `palette-rows.ts`). A combobox owning a
  listbox at the top middle of the window. Rows: the commands that apply ("*Category: label*", one per choice: *Load
  layout: Mix*), then `describeActions` for the focus subjects and then the selection subjects not already listed
  ("*Bass: Duplicate*", a test keeps them equal), a disabled row dimmed. Matching is QuickAdd's (`ui/shared/
  search-match.ts`: `norm` and `tierOf` over a label and further texts); ties go to the commands run recently (the last
  8, in memory), then commands before actions. With nothing typed: recent commands, the subjects' actions, then every
  command by category. Closing gives the focus back where it was (a menu's button, when opened from a menu), except
  after an action that takes it; its key again closes it.
* **Menus from commands.** `menuEntriesOf(items, context, keyOf)` turns a list of command ids, ids with a label or inline
  choices, submenus and separators into `MenuEntry`s, each with its key (drawn, `aria-hidden`, not part of its name).
  `useCommandEntries` builds them while a `PopupMenu` is open, following the stores. File (`FILE_MENU`), View
  (`VIEW_MENU`: the palette, the shortcuts, *Show ▸* every view, the region toggles, maximize, *Layouts ▸*) and the
  status bar's *Layout* (`LAYOUT_MENU`) are lists in `ui/commands/menus.ts`, and so is *Library* (`LIBRARY_MENU`),
  between View and MIDI.
* **The Library menu's commands** (`state/commands/library-commands.ts`). The five saves (*Save instrument of Bass to
  library*, *Save effects of Bass to library* (*of Master*, *of Drums bus*), *Save note effects of …*, *Save clip
  "Backbeat" to library*, *Add sample "Kick" to library*) find their subject in the selection store and run that
  subject's own *Save to library* action through `runAction`: `enabled` is `canRunAction`. With nothing of the right
  kind selected a save shows its title, disabled, with the reason as its tooltip ("Select an instrument track", "Sum
  the group to a bus first", "Bass has no note effects"). *New folder* runs the open folder's *New folder inside*, or
  *My library*'s at the top level; *Import .sfxlib…* runs *My library*'s; *Export library…* reads the catalog from
  storage and asks the Library to review an export of all of *My library*. The Library takes a request when it mounts,
  so one made while it was never shown waits for it.
* **Keyboard shortcuts** (`KeyboardShortcuts`, a `<dialog>`): a search, then every bindable command by category with its
  keys, *Change* (records the next key, Escape cancels; it replaces the command's keys), *Remove* and *Reset*; *Reset
  all*. A refused key says why, a used key warns, a moved key names the command that lost it. `VIEW_KEYS` lists the
  view-local keys read only: the piano roll's, the automation editor's, the Wave editor's, the arrangement's timeline's,
  QuickAdd's, the trees', the controls', Shift+A and Shift+F10. They stay in their views and run first.
* **Not checked by hand.** Whether Chrome, Firefox and Safari leave every default to the page was not tried with a
  real keyboard; Playwright's keys reach the page whatever a browser would do. See the round-10 plan.

## Drag and drop

Things picked up in one view land in another. A drop is "paste here": it runs a round-5 action, or the function the
action's *Paste* runs, so every drop has a menu twin and the two can't drift apart.

* **Payloads and targets are subjects.** What is dragged is a `DragPayload`: a `clip` (a session clip), a `sample`, a
  `sound` (a project preset; snapshots don't drag), a `library-item`, a `library-folder`, a `track`, a `group` or a `project-graph` (a graph
  of an owner, from the Library's *This project*), and `library-items { ids }`, several library items, the one payload
  that isn't a subject (nothing has a menu on it). Where
  it lands is a `DropTarget`: a `slot`, a `lane` (with the snapped beat under the pointer), a `track` or a `group` (with
  the `edge` the pointer is on: before, after, or a group's middle third, inside), the `master`, a `canvas` (with the
  canvas point), or in the Library's tree a `library-folder` or a `library-root`. A
  payload holds ids and is read when it lands, so something deleted mid-drag drops nothing.
* **One list of drops.** `state/actions/drops.ts` holds every `Drop`: its payload and target kinds, `accepts` (refused
  drops show the "no drop" cursor), `effect` (`move` or `copy`) and `run`. `dropFor(payload, target, context)` is the
  drop that accepts now; `runDrop` runs it and reports an asynchronous drop's message to the toasts, as `runAction`
  does. A drop that runs an action as it is accepts by `canRunAction` (the action applies, is enabled and has that
  choice). Where an action reads a clipboard, its body is a shared function that takes the value: `pasteClipInSlot`,
  `pasteClipOnLane`, `replaceGraph`, `insertLibraryClipAt` and `recallPresetOn`, with `canPasteClipInSlot`,
  `canPasteClipOnLane`, `graphFitsOwner`, `libraryClipFitsSlot` and `canRecallPresetOn` (over `core`'s
  `canRecallProjectPreset`) as the checks. One undo step per drop.

| Payload | Empty slot | Lane | Track (session header, mixer strip, lane name) | Group (band, collapsed header, bus strip, group lane) | Master (header, strip) | Canvas |
|---|---|---|---|---|---|---|
| Session clip | Moves it (`moveClip`, keeping its id; the selection follows); Alt copies it (*Paste*) | Copies it: on its own track as *Add clip* (linked to its source), on another track of its kind as *Paste* | | | | |
| Sample | On an audio track: *Add audio clip*, opened in Clip | On an audio track: *Add audio clip* | | | | In an instrument graph: *Add sampler* at the point |
| Project preset | | | Recalls it, in its own domain, when the track's graph matches its revision | On a bus, when its effects match | When the master's effects match | |
| Library item | A clip of the track's kind: as the Library's *Insert into empty slot* | | An instrument, note effect, audio effect or preset: replaces that graph (*Replace selected graph* with this owner) | On a bus: an audio effect made from Group in, or an effects preset | An audio effect or effects preset | The same into this graph, when its kind matches and the canvas is at the top level |
| Track, group | | | Moves it before or after the track (`moveTrack`, `moveGroup`), into that track's group | Before, after or inside it | | |
| Graph of the project | | | Copies it onto this track's graph of the same kind, when it fits (an instrument onto an instrument track, effects onto a track of the same input); its own track refuses | Effects of a bus onto another bus | | The same into this graph, of another owner |

In the Library's tree:

| Payload | Folder | *My library* | *Trash* |
|---|---|---|---|
| Item | Moves it there with its presets (`moveLibraryEntry`); Alt copies it (`libraryItemDuplicate`); a trashed one is restored there | The same, at the top level | *Trash*, with its presets; a trashed one refuses |
| Folder | Moves it inside, never into itself or a folder inside it; Alt deep-copies it (`duplicateLibraryFolder`); a trashed one is restored there | The same, at the top level | *Trash*, with its contents; a trashed one refuses |
| Preset under its sound | Refuses: it goes where its sound goes | Refuses | *Trash* |
| Instrument track | Saves *Instrument + notes* there | The same, at the top level | Refuses |
| Audio or return track | Saves its effects there | The same | Refuses |
| Group | With a bus, saves the bus's effects; a folder group refuses: "Sum the group to a bus first" | The same | Refuses |
| Session clip | Saves the clip there | The same | Refuses |
| Sample | Adds the sample there | The same | Refuses |
| Project preset | Saves it on its own there (`captureLibraryPreset`) | The same | Refuses |
| Graph of the project | Saves it there, as its owner's save for that graph does | The same | Refuses |
| Several items (a selected row of a selection) | Each as one item would land, in one catalog update (`libraryLanding`): My library's move (Alt copies), the Factory's are copied in; a preset whose sound is among them goes with it; if any one refuses, all do | The same, at the top level | *Trash* for each; refuses if any can't go |

A drop where the thing already is does nothing and refuses. The menu twins are *Move to ▸*, *Duplicate*, *Trash* and
*Restore*; the drops onto the trash run the *Trash* actions themselves. A thing from the project is saved with
`saveToLibrary(source, context, into)` into the folder dropped on, not the open one, always as a copy, and the toast's
*Show* reveals it; the menu twins are its *Save to library* entries. A graph that reads another track (`send`,
`trackAudio`, `trackNotes`, found by `externalRoutingIn`) is refused up front with the reason: "Uses Track audio from
Kick". A capture that still fails when it runs (sample bytes missing) reports its reason in the toast. A trashed folder
takes nothing from the project. Several items onto a slot, a track, a group, the master or a canvas refuse with "Drop
one sound at a time".

A graph of the project (a `project-graph` payload, dragged from *This project*) copies onto another owner as a library
insert: `projectGraphItem` captures it into a throwaway catalog, `graphFitsOwner(item, owner, catalog)` checks the
fit, and `PersonalLibrary.insert(…, catalog)` copies it with fresh node IDs, its own modules and its presets, in one
undo step. A drag asks on every move, so the capture is memoized per project object and graph, and a graph that reads
another track is never captured: every target refuses it with its reason, and it still drags so the target can say
so. A header's side (`edge`) is for tracks and groups being moved; a graph, like a library item, lands on either.

Everything else refuses: an occupied slot, a track of the other kind, a library clip on a lane, a canvas inside a
module, an effect made for another input (`trackIn`, `returnIn`, `masterIn`, `groupIn`), a preset on a graph that
differs, a preset or library effect on a folder, a clip track among the returns (or a return among the clip tracks), a
group into itself or deeper than four levels, and a move that would make the mix loop through a bus.

* **The hooks.** `ui/shared/drag/` holds the DOM side. `useDragSource(payload)` makes an element draggable: its
  `dragstart` writes the payload as JSON under `application/x-sfxlab-drag` and records it as the current drag; a
  `null` payload (a row being renamed in place) makes nothing draggable. A drag starts past the browser's movement
  threshold, so a click still launches, opens or selects. `useDropTarget(target)` takes a subject, or a function of
  the event for a lane's beat and a canvas's point. It looks only at drags carrying our type, so flexlayout's tab
  drags, files and the panel's control reorder pass through. It asks `dropFor`, prevents the default and sets
  `dropEffect` when a drop accepts, and on `drop` calls `runDrop` with `useActionContext()`. When none accepts, it asks
  `refusalFor`, the reason a drop of those kinds gives (its `refusal`), if any.
* **The current drag is a module variable,** not a store: `dragover` can't read `dataTransfer`'s data, only its types.
  The window ends it on `dragend` and, a task after the target's handler, on `drop`, both in the capture phase.
* **Feedback without rendering.** The target under the pointer gets `data-drop="accept"` or `"refuse"`, set on the
  element and cleared on leave, on drop and when another target takes over; a lane also gets `--drop-at`, where its
  marker is drawn. A refusal with a reason also sets it as the target's `title` and `data-drop-reason`; the target's
  own title comes back when the mark goes. A browser shows no tooltip during a drag, so a Library tree row draws the
  reason at its end, in place of its count. No target subscribes to anything, so a drag re-renders nothing. The innermost target stops
  `dragover` and `drop`, refused ones too, so it decides.
* **Track and group targets** use `useEdgeTarget(subject, axis)`: the edge comes from the pointer along the axis (x in
  the session grid and the mixer, y in the tree and the arrangement) and shows as `data-edge` while a track or a group is
  over it. Presets and library items land on the track as before and ignore the edge.
* **Sources and targets.** Sources: a filled session slot, a sample row, a project preset's row in Sounds, a library
  item's or folder's row, a graph, clip, sample or preset row under *This project*, a Tracks tree row, a track's name (session header, mixer strip, lane name; not the whole header, whose
  slider keeps its gesture) and a group's band, collapsed header, strip or lane. Targets: every session slot (a filled one shows `refuse`), a lane's whole row (so a drop over a region
  lands too), the session header, the mixer strip, the lane name, the master's header and strip, a graph
  editor's canvas, and the Library's folder and root rows. Resting a drag on the Library's tab or activity-bar button
  shows the Library, so a Tracks row or a session clip reaches a folder even while the Library is hidden.
* **Spring-open rows.** `useSpringOpen(open)` opens a closed Library row (a folder, a sound with presets, a root) once
  a drag of ours has rested on it for `SPRING_LOAD_MS`; leaving it, dropping or ending the drag first cancels.
  `mergeDragProps` runs several sets of drag props on one element, so a tree row that is a source, a target and springs
  open spreads them without naming a drag handler.
* **Spring-loaded tabs.** A drag of ours resting 500 ms (`SPRING_LOAD_MS`) on the tab of a view that isn't showing,
  or on an activity-bar button, shows that view (`revealView`), a collapsed sidebar or panel included; moving off
  first cancels. `useSpringLoad` listens on the workbench's root (a tab's button carries its view in flexlayout's id)
  and on the activity bar's strip. A tab group keeps hidden views mounted, so the source is still there when its view
  is hidden mid-drag.
* **The rule.** `tests/architecture.test.ts`: outside `ui/shared/drag/`, only `ControlCell` (the control reorder, with
  its own type `application/x-sfxlab-control`), `SamplesPanel` and `LibraryPanel` (operating-system files, `Files`
  only: audio files, and an `.sfxlib` to review) and `RegionToggles` (which cancels drags) may use `dataTransfer`, `draggable` or `onDrag…`/`onDrop` handlers.
* **Not yet.** Dragging regions out of the arrangement, drops that make tracks, files outside Samples and the Library,
  library samples, several things at once outside the Library, keyboard and touch drags (the menus cover both), and popout windows (turned off). Checked
  in Chromium only.
