# Round 6: working across views

Status: **planned** 2026-10-24, decisions signed off as proposed. Part of the [UI redesign](README.md). Carries out
[roadmap § Round 6](DRAFT-roadmap.md#round-6-working-across-views), from an inventory of every drag, drop and
view-local selection in the app, taken on `feat/ui-redesign` at `048bf83` (round 5 merged).

## Goal

The point of seeing several views at once: things picked up in one view land in another, and what is selected in one
view shows in the others. After this round:

* **one drag payload** for session clips, samples, presets and library items: the subject of the thing picked up,
  the same `Subject` round 5's menus use;
* **drop targets** in the session grid (empty slots), the arrangement (lanes), tracks (the session header, the mixer
  strip, the arrangement lane's name, the master) and the patcher (the canvas);
* **a drop is "paste here"**: each drop runs a round-5 action, or the same function the action's *Paste* runs, so a
  drop and its menu entry can't drift apart. Every drop has a menu twin;
* **a session slot drags onto an arrangement lane**, even in the default layout, where Session and Arrangement share
  one tab group: holding a drag over a tab shows that view;
* **linked selection**: clicking a region selects it in the selection store, and Clip edits it (the region's own copy,
  not its session source). Clicking a track anywhere selects it, and every view that edits the selected track follows;
* at the default layout, everything a view shows looks as it does today, apart from the arrangement's hint and the
  selected lane name's mark (see [Behavior changes](#behavior-changes)).

**Out of scope:**

* dragging regions out of the arrangement (onto a slot). Regions keep their pointer drag inside the timeline;
* drops that make a track (a sample or an instrument dropped on the grid's empty space). The menus have *New sampler
  track*, *New audio track* and *Insert new instrument track*;
* operating-system files dropped anywhere but Samples;
* library samples: they drag nowhere this round (their menu's *Add sample to project* stays);
* dragging nodes between graph editors: there is one editor of each kind, and pasting needs the same kind of graph;
* dragging several things at once (a multi-selection of clips or regions);
* keyboard drag and drop. The menus are the keyboard route (see the decisions);
* touch drags: not checked, and not designed for. The menus work on touch (long-press);
* reordering and dragging tracks (round 7);
* an inspector view (see the decisions; round 9's Pinned view is where one can grow);
* a playhead, automation lanes or the wave editor for a region open in Clip (round 12);
* popout windows (see the decisions).

## Inventory

Every drag, drop and pointer gesture in `src/ui`, every selection kept in view state, and every round-5 paste action
and clipboard a drop could reuse.

### Drag and drop today

Two mechanisms are in use. **HTML5 drag and drop** (`draggable`, `dataTransfer`) moves things between elements;
**pointer capture** (`setPointerCapture`) runs a gesture inside one element.

| Where | Mechanism | What it does | Notes |
|---|---|---|---|
| `ControlCell` (panel edit mode) | HTML5. The ⠿ handle is `draggable` and sets `text/plain` to the node id; the cell is the target | Reorder controls on the front panel: the drop calls `actions.dropped(id)` | The cell's `onDragOver` accepts **any** drag while editing, and the drop reads whatever `text/plain` holds. A drag of another kind would highlight it. |
| `SamplesPanel` | HTML5, target only | Operating-system files dropped on the view are imported (`library.importFiles(dataTransfer.files)`) | Its `onDragOver` accepts and highlights **any** drag, files or not. |
| flexlayout tab drags | HTML5. flexlayout 0.11.1 sets `text/plain` to `--flexlayout--` and handles `dragenter`, `dragover` and `drop` on the layout's root | Move a view between tab groups and regions | It ignores drags it didn't start: without `onExternalDrag` (the app passes none) its handlers return early. During its own drag it shows an overlay over the tab contents, so views see none of it. `RegionToggles` cancels `dragstart` on its buttons. Popouts and floating are off (`default-layout.ts`; `layout-storage.ts` rejects saved popouts). |
| `ArrangementRegion` | Pointer capture | Drag the body to move (quarter-beat snap), the edge to resize; across lanes by `elementFromPoint` and `data-lane`, highlighted with `data-drag-over`. One undo step per drag (merge keys) | Not focusable (no `tabIndex`), so Shift+F10 doesn't reach its menu, despite round 5's design. |
| Patcher: `use-node-drag`, `PatchCanvas`, `NodeView` | Pointer capture | Node drag, canvas pan, wire drags, marquee | Inside one canvas. |
| Clip: `use-piano-roll-interaction`, `VelocityLane`, `GroovePanel`, `AutomationEditor`, `AudioWaveform` | Pointer capture | Note, velocity, automation point and region-handle gestures | Inside one editor. |
| `SampleEditor`, controls (`use-control-gesture`, `use-control-input`, `Toggle`), Sounds' morph pad | Pointer capture | Waveform selection, knobs, faders, pads | Inside one control. |

Nothing drags between views. The arrangement's own text says otherwise in two places: `ArrangementView`'s comment
("Session slots drag onto a lane") and ARCHITECTURE.md's reason for *Place on arrangement* ("the two main views are
exclusive"), which round 2 made untrue. The default layout still puts Session, Arrangement and the Wave editor in one
tab group (`DEFAULT_GROUPS` in `layout-store.ts`), so out of the box only one of them shows.

### Selections kept in view state

The selection store (`state/selection-store.ts`) holds `trackId`, `master`, `clipId`, `automationScene` and
`sampleId`. Everything else selected lives in a view:

| View | State | Who else would need it |
|---|---|---|
| Arrangement | `picked`: the selected region. `placedAt`: the beat a lane was right-clicked at | **Clip**, for linked selection (proposal §1's `regionId`, deferred to this round by rounds 4 and 5) |
| Graph editors | `picked`: the selected nodes | Nobody: per graph, and the menus get them as a `nodes` subject |
| Clip (piano roll, automation editor) | the selected notes and points | Nobody |
| Library | `selected`: the item shown in the details column; `checked`: items picked for a bundle. The open folder is in `library-store` | Nobody: a drag takes its own row |
| Sounds | the morph's A and B, the scope chosen at the top | Nobody |
| Notes | `chosen` in the heard-notes list | Nobody |
| Wave editor | the selected range | Nobody |

**Track selection** is already shared. The session header and the mixer strip select a track on click and mark the
selected one. Instrument, Effects, Notes, Clip (its empty state lists the track's clips), Sounds (its owner) and
Library (its destination) read `trackId`. Two places show a track without selecting it: the arrangement lane's name
(focusable since round 5, carrying the track's menu) and a region. A session slot's main button launches its clip
and doesn't select it; ✎ selects and opens.

There is **no inspector**. The roadmap's workbench sketch labels the secondary sidebar "pinned panels (inspector)":
that is round 9's Pinned view.

### What a drop could reuse

| From round 5 | What it does | A drop that reuses it |
|---|---|---|
| `slot.paste` | `canPasteSessionClip` + `pasteClip` (`pasteSessionClip`): an empty slot of a track of the clip's kind, the sample still in the project, fresh ids (`clipCopyFor`), lanes moved | A clip copied into a slot (Alt) |
| `copySessionClip(…, move)` (`core`) | Copies or **moves** a clip to an empty slot of a track of the same kind; moving keeps its ids | A clip moved into a slot (no modifier) |
| `lane.add-clip` | Adds a session clip of the lane's own track at a beat, keeping its id, so the region's *Edit clip* finds the source | A clip dropped on its own track's lane |
| `lane.paste` | `clipFitsTrack` and the sample check, then `addArrangementClip(trackId, beat, clipCopyFor(…))` | A clip dropped on another track's lane |
| `clip.place-on-arrangement` | Appends a copy at the end of the track's timeline: the keyboard's route to the arrangement | (none: the drop places at the pointer) |
| `slot.add-audio-clip` | `choices` are the project's samples; `run` gets the chosen id | A sample dropped on an empty audio slot, as that choice |
| `library-item.replace` + `insertionScope(item)` | `library.insert(item, { mode: 'replace', scope })`, the scope's owner taken from the **selection** | A library graph dropped on a track or a canvas, with that track as the owner |
| `LibraryPanel`'s *Insert into empty slot* | `library.insert(item, { mode: 'replace', scope }, scene)`. A view button, not an action (it needs a scene) | A library clip dropped on an empty slot |
| `sound.recall` + `recallSavedSound(sound, scope?)` | Recalls a preset onto its own scope from the menu, or the view's chosen scope from the button. `recallProjectPreset` throws when the graph differs from the preset's revision | A project preset dropped on a track |
| `canvas` subject, `pasteNodes` | Places at the clicked canvas point | A sample dropped on a canvas adds a sampler there |
| Clipboards (`clipClipboard`, `nodeClipboard`, `automationSlotClipboard`) | One per kind, holding values, not ids | None directly: a drop carries ids of things that exist, and reads them when it lands |

Nothing in the lists adds a sample to a lane or a sampler to a canvas, so those drops would have no menu twin.

### What the inventory changes in the roadmap's outline

* **The default layout defeats the headline drag.** Session and Arrangement share a tab group, so a slot can't be
  dragged onto a lane without splitting the editor area first. This plan adds spring-loaded tabs: a drag held over a
  tab (or an activity-bar button) shows that view.
* **"Opens it in Clip" needs a decision on what Clip edits.** A region's content is a copy of a session clip, and Clip
  edits session clips by track and clip id. This plan proposes that Clip edits the region's own copy, through a clip
  reference in `core`; the region's menu keeps a way to its session source.
* **Selecting doesn't reveal.** The layout rule is that selecting never changes the view; intents do both. A region is
  selected on pointer down, at the start of every drag, so revealing Clip then would switch the panel away from Mixer
  on every move. Clicking selects; double-click, Enter and the menu's *Edit* open.
* **"The inspector" doesn't exist.** This plan reads it as the views that edit the selected track, which already
  follow `trackId`; the arrangement lane's name and regions join the places that select a track.
* **A preset recalls only onto a matching graph.** `recallProjectPreset` refuses a graph that differs from the
  preset's revision, so a project preset can be dropped only on tracks whose graph matches. Library presets replace
  the graph, so they drop anywhere of their kind.
* **Two drops have no action to share.** A sample onto an audio lane and onto an instrument canvas. They get actions,
  *Add audio clip* ▸ on audio lanes and *Add sampler* ▸ on instrument canvases, so they have menu twins.
* **The two existing HTML5 targets accept anything.** The control reorder and the Samples drop get type checks.
* **The keyboard can't reach a lane's *Paste*.** The lane body isn't focusable, so *Place on arrangement* stays as the
  keyboard route to the timeline (see the decisions).

## Design

### Payloads and targets

What is dragged is a **payload**, and where it lands is a **target**. Both are round 5's subjects:

```ts
/** What is dragged: the subject of the thing picked up. */
type DragPayload = SubjectOf<'clip' | 'sample' | 'sound' | 'library-item'>

/** Where it lands: the subject of the place under the pointer. */
type DropTarget = SubjectOf<'slot' | 'lane' | 'track' | 'master' | 'canvas'>
```

* A payload holds ids, not values. It is read when it lands, so a drop of something deleted mid-drag does nothing.
* A `lane` target carries the beat under the pointer, snapped to a quarter beat as region drags are. A `canvas`
  target carries the canvas point under the pointer. The view computes both from the drop event, as it does from
  `onContextMenu` for its menu.
* `sound` payloads are project presets only (`preset: true`). A snapshot belongs to its owner and has no target to
  recall onto.

### Drops

`state/actions/drops.ts` holds one list of drops, the way each kind has one list of actions:

```ts
interface Drop<P extends DragPayload, T extends DropTarget> {
  readonly id: string                                   // 'drop.clip-on-lane'
  readonly payload: P['kind']
  readonly target: T['kind']
  /** Whether it can land here now. Refused drops show the "no drop" cursor. */
  accepts(payload: P, target: T, context: ActionContext): boolean
  /** The cursor: a move, or a copy (Alt held, or a drop that always copies). */
  effect(payload: P, target: T, modifiers: { alt: boolean }): 'copy' | 'move'
  run(payload: P, target: T, context: ActionContext, modifiers: { alt: boolean }): void | Promise<string | void>
}
```

* **`dropFor(payload, target, context)`** returns the drop that accepts, or nothing. **`runDrop`** runs it and reports
  an asynchronous drop's message to the toasts, as `runAction` does. Unit tests call both on a demo project.
* **Each `run` is a round-5 action or its body.** Where an action fits as it is, the drop calls
  `runAction(id, target, context, { choice })`. Where an action reads a clipboard, its body moves into a function that
  takes the value, and both the action (with the clipboard's value) and the drop (with the dragged one) call it. Its
  `enabled` becomes the same function's check, which is the drop's `accepts`.
* **Undo:** one step per drop, as for actions. A move is one step.
* **Layering:** plain functions in `state`, importing only `@core`.

### Drops, payload by payload

| Payload | Empty slot | Lane | Track (header, strip, lane name) | Master (header, strip) | Canvas |
|---|---|---|---|---|---|
| **Session clip** | Moves it to a slot of a track of its kind (`copySessionClip(…, move)`); with Alt, copies it (`slot.paste`'s body) | Copies it to the beat: on its own track as `lane.add-clip` (linked to its source), on another track of its kind as `lane.paste`'s body | | | |
| **Sample** | On an audio track: `slot.add-audio-clip` with the sample as the choice | On an audio track: **new** `lane.add-audio-clip` | | | In an instrument graph: **new** `canvas.add-sampler`, at the point |
| **Preset** (Sounds) | | | Recalls it onto this track, in its own domain, when the track's graph matches its revision | An effects or track preset of the master, when it matches | |
| **Library item** | A clip item, on a track of its kind: inserted as `LibraryPanel`'s *Insert into empty slot* does | | An instrument, note effect, audio effect or preset: replaces that graph on this track (`library-item.replace` with this owner) | An audio effect or an effects preset: replaces the master's effects | The same, into this graph, when its kind matches and the canvas is at the top level |

Everything else refuses: an occupied slot (as *Paste* does), a clip onto a track of the other kind, a sample onto an
instrument lane, a library clip onto a lane, a canvas inside a module.

* **Shared functions** that round 5's actions call too: `pasteClipInSlot` / `canPasteClipInSlot` and
  `pasteClipOnLane` / `canPasteClipOnLane` (`slot.paste` and `lane.paste`); `replaceGraph(item, scope, context)`
  (`library-item.replace`), with `insertionScope(item, domain, owner?)` taking an explicit owner; `insertLibraryClipAt`
  (the Library's *Insert into empty slot* button); `recallPresetOn(preset, owner)` (Sounds' *Recall* with the view's
  scope). `core` gains `canRecallProjectPreset(project, preset, scope)`, the checks `recallProjectPreset` makes before
  it throws, so `accepts` can say no without trying.
* **`moveClip(fromTrack, clipId, toTrack, scene)`** joins the project store, over `copySessionClip(…, move = true)`.
  When the moved clip is the selected one, the selection follows it.
* **New actions, so every drop has a menu twin:**
  * `lane.add-audio-clip` on an audio track's lane: *Add audio clip* ▸ the project's samples, at the clicked beat,
    as `createAudioClip(sample, tempo)` (the slot's own action makes the same clip);
  * `canvas.add-sampler` on an instrument graph's canvas (at the top level or inside a module opened from it): *Add
    sampler* ▸ the samples, a sampler node at the point with that sample (`setNodeSample`), refused past
    `MAX_PATCH_NODES`.
* A drop does what its menu entry does, including what follows it: a sample dropped on a slot opens the new clip in
  Clip, as *Add audio clip* does.

### Dragging in the views

`ui/shared/drag/` holds the DOM side. Views say what they are, as they do for menus:

* **`useDragSource(payload)`** returns the props for a draggable element: `draggable`, and a `dragstart` that writes
  the payload as JSON under `application/x-sfxlab-drag` and records it as the current drag. `dragend` clears it. A
  `null` payload (a slot being renamed in place) makes nothing draggable.
* **`useDropTarget(target)`** returns the props for a target: `target` is a subject, or a function of the event for a
  lane (the beat) and a canvas (the point). On `dragover` it looks only at drags whose types include
  `application/x-sfxlab-drag`; anything else (a flexlayout tab, files, a control reorder) passes through untouched. For
  ours it asks `dropFor`, and if a drop accepts it prevents the default and sets `dropEffect`. On `drop` it parses the
  payload and calls `runDrop` with `useActionContext()`.
* **The current drag** is a module variable, not a store: `dragover` can't read `dataTransfer` data (only its types),
  so the payload is kept from `dragstart`. A window-level `drop` and `dragend` clear it too, in case the source has
  gone.
* **Feedback** is on the target under the pointer only: `data-drop="accept"` or `"refuse"` while a drag of ours is
  over it, cleared on leave and drop. No target subscribes to anything, so a drag re-renders nothing until it is over
  a target. A lane also draws a thin marker at the snapped beat.
* **The innermost target wins**: a target stops `dragover` and `drop` once it has handled them, as `ContextMenu`
  stops `contextmenu`. A lane name inside a lane, a header inside the grid.
* **Sources:** a filled session slot, a sample row, a project preset's row in Sounds, a library item's row. Each is
  also a menu trigger; a drag starts only after the browser's own movement threshold, so a click still launches,
  opens or selects.
* **Targets:** an empty slot (`MidiClipSlot`, `AudioClipSlot`), a lane body, the session header, the mixer strip, the
  arrangement lane's name, the master's header and strip, and a graph editor's canvas.
* **The existing HTML5 targets get type checks.** `ControlCell`'s reorder uses its own type,
  `application/x-sfxlab-control`, and accepts only that. `SamplesPanel` accepts and highlights only drags that carry
  `Files`.
* **The rule.** `tests/architecture.test.ts` gains a case: outside `ui/shared/drag/`, only `ControlCell` (control
  reorder), `SamplesPanel` (files) and `RegionToggles` (which cancels drags) may use `dataTransfer`, `draggable` or
  `onDrag…` handlers. Everything else uses the two hooks.

### Spring-loaded tabs

So a slot can be dragged onto a lane in the default layout, where Session and Arrangement share a group:

* While a drag of ours is over a tab's label, or an activity-bar button, of a view that isn't showing, for 500 ms,
  that view is shown (`revealView`), as macOS's spring-loaded folders open. This opens a collapsed sidebar or panel
  too. Leaving the tab first cancels it.
* `Workbench` and `ActivityBar` listen for it; tab labels carry their view id (`onRenderTab` content). flexlayout's
  own tab drags are not ours and don't spring-load.
* The source view may be hidden by this mid-drag. The drag goes on: the payload doesn't depend on the source element,
  and the window-level `drop` and `dragend` clear it. Step 4 checks this in Chromium.

### Linked selection

**The region is selected in the store.**

* `useSelectionStore` gains `regionId` and `selectRegion(regionId, trackId)`, which also selects the region's track
  and clears `clipId` and `master`. Every other `select…` and `reset` clear `regionId`. A region moved to another
  lane is selected again, with its new track.
* The intent **`openRegion(regionId)`** selects it and reveals Clip.
* `ArrangementView` reads the selected region from the store and drops its `picked`. A region deleted from its menu
  or by undo stops showing as selected, since it no longer exists; Clip shows its empty state.
* Pointer down on a region selects it (its drag already does). Double-click and Enter open it. Regions become
  focusable (`tabIndex={0}`), which also lets Shift+F10 reach their menu.

**Clip edits the region's own copy.**

* `core` gains a **clip reference**: `ClipRef = { kind: 'session'; trackId; clipId } | { kind: 'region'; regionId }`,
  and `editClipAt(project, ref, change)`, which edits a session clip in its slot or a region's `content`, keeping the
  project unchanged for a no-op edit. `setClipNotes`, `setClipLength`, `doubleClip` and `updateAudioClip` take a ref
  instead of a track and clip id. The project store's setters take one too; session callers pass a session ref.
* `ClipEditor` checks `regionId` first: a region shows `MidiClipEditor` or `AudioClipEditor` on its content, with a
  region ref, and its title says it is on the arrangement (*Bass / Root · arrangement, bar 3*). A region shows no
  automation toggle (the timeline doesn't play lanes yet) and no playhead (the piano roll's follows the session
  launcher). Both come with round 12.
* Lengthening a region in Clip lets it overlap the next one, as resizing its edge does.
* The region's menu: **Edit** (new, *open* group) opens the region in Clip; **Edit session clip**, formerly *Edit
  clip*, opens its session source while it exists.

**Selecting a track anywhere.**

* The arrangement lane's name selects its track on click and shows it as selected, as the session header and the
  mixer strip do. Selecting a region selects its track.
* "The inspector" is the views that edit the selected track: Instrument, Effects, Notes, Clip, Sounds and the
  Library's destination. They all read `trackId` already; nothing in them changes.
* A session slot's launch button still launches without selecting (see the decisions).

### Browser tests

Specs import nothing from `src/`.

* **`dragTo(page, source, target, { hold?, alt? })`** in `tests/browser/fixtures.ts`: an HTML5 drag with stepped mouse
  moves (Chromium's Playwright drives native drag and drop from mouse events), optionally resting on a `hold` element
  for 600 ms on the way (a tab, for spring-loading) and holding Alt.
* **New `drag-and-drop.smoke.spec.ts`:**
  * Session and Arrangement side by side (`dragView`): a slot onto its lane at bar 3 makes a region at beat 8 whose
    *Edit session clip* is enabled; onto another instrument track's lane, a region there; onto an audio lane, nothing.
  * The default layout: a slot onto the Arrangement tab, held, then onto a lane.
  * A slot onto an empty slot of another instrument track moves it; with Alt it copies; onto an occupied slot or an
    audio track's slot, nothing changes and the target showed `data-drop="refuse"`. Undo after each.
  * A sample row onto an empty audio slot, onto an audio lane, and onto the Instrument canvas (a sampler card with the
    sample's name).
  * A library instrument onto a session header replaces that track's instrument; undo restores it. A library MIDI
    clip onto an empty slot.
  * A project preset onto its own track recalls it; onto a track with another graph it is refused.
  * Nothing else is disturbed: a flexlayout tab dragged across the session grid docks as before and changes no slot;
    the panel's control reorder still works; a file dropped on Samples still imports (a `DataTransfer` built in the
    page).
* **New `linked-selection.smoke.spec.ts`:**
  * Clicking a region with Clip showing shows its notes; a note added there changes the region and not its session
    source.
  * Double-clicking a region with Mixer showing reveals Clip; Enter on a focused region does the same.
  * Clicking a lane's name marks it and shows that track in Instrument; the session header is marked too.
  * Deleting the selected region empties Clip; selecting a session clip deselects the region.
* **Existing specs:** `context-menus.smoke.spec.ts` checks the region menu's new entries, and the lane and canvas
  menus' new submenus; `arrangement.smoke.spec.ts` clicks *Edit session clip* where it clicked *Edit clip*.

## Steps

Each step is one commit and leaves `npm test`, `npm run typecheck` and `npm run test:smoke` green. Steps 1 and 2 come
first, in order, and step 4 needs step 3. Steps 7 and 8, in that order, don't depend on the drags.

1. **Drops in `state`.**
   * `DragPayload`, `DropTarget`, `drops.ts` with `dropFor` and `runDrop`.
   * The shared functions (`pasteClipInSlot`, `pasteClipOnLane`, `replaceGraph`, `insertLibraryClipAt`,
     `recallPresetOn`), with `slot.paste`, `lane.paste`, `library-item.replace` and Sounds' *Recall* button calling
     them; `insertionScope` takes an owner; `canRecallProjectPreset` in `core`; `moveClip` in the project store.
   * Unit tests: every cell of the table above, accepted and refused, on a demo project; undo is one step per drop.
2. **Drag glue.** `ui/shared/drag/` (`useDragSource`, `useDropTarget`, the current drag, `data-drop`); the type checks
   in `ControlCell` and `SamplesPanel`; the architecture rule; the `dragTo` fixture. Smoke: the control reorder, the
   file drop and a tab dragged across the grid behave as before.
3. **Session clips.** Filled slots drag; empty slots and lanes accept, with the lane's beat marker. The arrangement's
   hint and comment, and the clip action's comment, stop calling *Place on arrangement* a workaround. Smoke: the slot
   cases above, with Session and Arrangement side by side.
4. **Spring-loaded tabs.** Tab labels and activity-bar buttons show their view after 500 ms. Smoke: the default-layout
   case; a check that the drag survives its source view being hidden.
5. **Samples.** Sample rows drag. `lane.add-audio-clip` and `canvas.add-sampler`, with their menu entries; empty audio
   slots, audio lanes and instrument canvases accept samples. Unit tests for the two actions; smoke for the three
   drops and the two submenus.
6. **Presets and library items.** Project presets' rows in Sounds and library item rows drag. The session header, the
   mixer strip, the lane name and the master's header and strip accept them; empty slots accept library clips;
   canvases accept library graphs. The Library's *Insert into empty slot* button runs `insertLibraryClipAt`. Smoke:
   the library and preset cases.
7. **Clip references and the region selection.** `ClipRef` and `editClipAt` in `core`, with the four setters moved
   onto it (unit tests: session and region edits, no-op identity, undo); the project store's setters take a ref;
   `regionId`, `selectRegion` and `openRegion` (unit tests: what each `select…` clears).
8. **Linked selection in the views.** `ArrangementView` reads the store; regions select, open on double-click and
   Enter, and are focusable; lane names select and mark their track; `ClipEditor` edits regions; the region menu's
   *Edit* and *Edit session clip*. Smoke: `linked-selection.smoke.spec.ts`.
9. **Docs.**
   * ARCHITECTURE.md: a § Drag and drop (payloads, targets, the drop list, the hooks, the rule, spring-loaded tabs)
     after § Actions and context menus, whose table gains the new entries; § The arrangement loses the "views are
     exclusive" reason and describes dragging slots, selecting and opening regions; § Layout and navigation's
     selection store gains `regionId` and `openRegion`; the clip editor's section mentions clip references.
   * TASKS.md: "Consider library drag/drop" is done for inserting into the project.
   * [README.md](README.md) marks round 6 done; the roadmap notes what moved; the plan gets its "Changes made while
     implementing".

## Behavior changes

Intended:

* Session clips, samples, project presets and library items can be dragged; empty slots, lanes, tracks, the master
  and graph canvases accept what fits (the table above). A drop does what its menu entry does.
* Dragging one of these over a tab or an activity-bar button for half a second shows that view.
* Clicking a region selects it in the selection store, with its track: Instrument, Effects, Notes and Sounds follow
  the track, and Clip shows the region if Clip is showing. Double-click or Enter opens the region in Clip.
* Clip edits a region's own copy. Before, a region couldn't be edited at all; *Edit clip* opened its session source.
* The region menu's *Edit clip* is now *Edit session clip*, after a new *Edit*. Regions are focusable.
* Clicking an arrangement lane's name selects its track, and the selected track's name is marked there.
* An audio lane's menu has *Add audio clip* ▸; an instrument canvas's menu has *Add sampler* ▸.
* The arrangement's hint mentions dragging slots onto lanes.
* Samples highlights only for files dragged in; a panel control in edit mode only for another control.

Anything else a reviewer notices is a bug in this round.

## Verification

* `npm test`, `npm run typecheck` and `npm run test:smoke` pass at every step. Run `npm run test:audio` once before
  merging: step 7 moves the clip setters that every audio test's clips go through.
* Manual pass on the dev build:
  * every cell of the drop table with the mouse, in the default layout and with views moved into each sidebar and
    the panel;
  * a drag held over a collapsed sidebar's tab, and over the activity bar;
  * a drag released outside the window, and with Escape: nothing changes and no target stays highlighted;
  * undo after each drop;
  * a region edited in Clip while the arrangement plays;
  * Safari and Firefox once (HTML5 drag images and `dropEffect` differ there).
* Profiling: drop targets subscribe to nothing and the drag isn't a store, so `scripts/profile-status.cjs` must show
  the same component renders a second as round 5: 144–145 for `editor` and 173 for `four`. One run each is enough.
  `ArrangementView` now subscribes to `regionId`, which changes only on a click.

## Decisions to sign off

Signed off 2026-10-24: every row as proposed. On popouts the user noted they may be turned on at some point; that
round checks HTML5 drags between windows.

| Question | Proposed | Notes |
|---|---|---|
| Drag mechanism between views | **HTML5 drag and drop**, with our own data type | It crosses tab groups and regions without hit-testing, the browser draws the drag image and auto-scrolls, and flexlayout already ignores drags it didn't start. Pointer capture (as regions use) would need our own hit-testing, ghost and scrolling across every region. HTML5 drags don't work by keyboard, and on touch only in some browsers; the menus cover both. |
| Drags between views docked in different regions, and in popouts | **Every region:** sidebars, the panel and every editor group, collapsed ones through spring-loading. **Popouts: nothing to do**, since they are turned off | Every region is one document, so nothing is region-specific. Popouts share the JS realm, so the payload would survive, but HTML5 drags between windows need checking in the round that turns popouts on. |
| What the inspector is | **No new view.** The views that edit the selected track (Instrument, Effects, Notes, Clip, Sounds, the Library's destination); the arrangement's lane names and regions join the places that select a track | They already follow `trackId`. A track inspector (name, colour, mixer values, instrument summary) would be a new view; round 9's Pinned view in the secondary sidebar is where it can grow. |
| What Clip edits for a selected region | **The region's own copy**, through `ClipRef` in `core`; *Edit session clip* still opens the source | Opening the source (today's *Edit clip*) would edit something the region doesn't play. Read-only would make "opens it in Clip" a viewer. The cost is a ref on four `core` setters and two editors. |
| Does selecting a region reveal Clip? | **No.** Clicking selects, and Clip follows if it shows; double-click, Enter and *Edit* reveal it | Selecting never changes the view (the layout rule). A region is selected at the start of every drag, so revealing then would switch the panel away from Mixer on each move. |
| Getting a slot onto a lane in the default layout | **Spring-loaded tabs and activity-bar buttons** (500 ms) | Alternatives: split Session and Arrangement in the default layout (changes the default for everyone), or leave it to the user to split first (the headline drag wouldn't work out of the box). |
| A session clip dropped on an empty slot | **Moves** it; **Alt copies** | As Ableton does, and as dragging a region moves it. A move is *Cut* then *Paste*, one undo step. Copy-always would leave the grid full of duplicates after rearranging. |
| *Place on arrangement* | **Stays**, no longer described as a workaround | It is the keyboard's only route to the timeline: the lane body isn't focusable, so its *Paste* and *Add clip* are mouse-only. The roadmap said the drag replaces it. |
| Does launching a session clip select it? | **No**, as today; ✎ and the menu's *Edit* select | Launching is a performance action; selecting would swap Clip's content mid-set. Ableton selects on click, so this is the question most likely to be wanted the other way. |
| Project presets (Sounds) as drags | **Yes**, onto tracks (and the master) whose graph matches the preset's revision; refused elsewhere | `recallProjectPreset` refuses other graphs. Library presets replace the graph, so they drop on any track of their kind. Snapshots don't drag: they belong to their owner. |
| A library graph dropped on a track or canvas | **Replaces that graph** without asking, as *Replace selected graph* does; undo restores | A canvas inside a module refuses, so a drop never replaces a whole graph from inside one of its modules. |
| Feedback while dragging | **Only the target under the pointer** shows accept or refuse | Marking every possible target at drag start would re-render every slot and lane once per drag and need targets to subscribe. |
| Drops not in this round | **Not now:** regions dragged out of the arrangement, drops that make tracks, OS files outside Samples, library samples, several things at once | Each needs either new model work (a region's value into a slot keeps no source) or a new target kind (the grid's empty space). They fit the same drop list later. |

## Changes made while implementing

What turned out different from the design above, step by step.

* **Step 1: the sample drops onto a lane and a canvas come with step 5,** with the two actions they run. Step 1 has
  every other cell of the table, and its tests.
* **Step 1: `canRunAction(id, subject, context, choice?)`** says whether `runAction` would run an action now, the
  chosen choice included. A drop that runs an action as it is (*Add clip*, *Add audio clip*) accepts by it, so its
  `accepts` is the action's own check. `settle(result, report?)` is `runAction`'s reporting, shared with `runDrop`.
* **Step 1: the drop list is exported from `state/index.ts`,** not from the actions' index, since it imports
  `runAction` from there.
* **Step 1: `recallPresetOn(preset, owner, domain?)`.** The domain is the preset's own by default; Sounds' *Recall*
  button passes the view's, so a scope of another kind still refuses with the same message as before.
  `canRecallPresetOn` is the drop's check over `canRecallProjectPreset`.
* **Step 1: `graphFitsOwner(item, owner)`** is the check for a library graph dropped on a track, the master or a
  canvas: an instrument or note effect on an instrument track, an audio effect on an owner that provides the input it
  was made for (`trackIn`, `returnIn` or `masterIn`). Without it, an instrument's effects dropped on the master would
  show as accepted and fail with a toast. `libraryClipFitsSlot` is the slot's check for a library clip.
* **Step 1: graphs match by node ids,** so a project preset fits its own track and copies of it (*Duplicate track*),
  not the starter's other instruments, whose default patches are alike but made apart.
* **Step 2: feedback is set on the element, not rendered.** `useDropTarget` writes `data-drop` (and a lane's
  `--drop-at`) on the element under the pointer and clears the one before, so a drag re-renders nothing at all. A
  target handles `dragenter` as it does `dragover`, which Firefox needs to send `dragover` to it.
* **Step 2: a target stops a drag of ours even when it refuses it,** so the innermost target decides and shows
  `refuse`, rather than a target around it.
* **Step 2: the window ends a drag in the capture phase,** on `dragend` and, a task after the target's handler, on
  `drop`, since a target stops the `drop` it handles. A source hidden mid-drag sends `dragend` to nothing, so the
  current drag stays until the next one starts; it is only read while a drag carries our type.
* **Step 2: the rule ignores comments,** since two components describe a "draggable" selection or handle in theirs.
* **Step 3: the lane's whole row is the target,** not just the lane body under the regions, so a slot dropped over a
  region lands too. The beat comes from the row, which starts where the body does.
* **Step 3: a filled slot is a target too,** of its slot subject, so it shows `refuse` when a clip is dragged over it.
* **Step 4: the workbench listens, not each label.** A tab's button already carries its view in flexlayout's id
  (`flexlayout-tabbutton-…`, read by `viewOfTab` for F6), so `Workbench` spring-loads through one `useSpringLoad` on
  its root instead of a handler on each label from `onRenderTab`. The activity bar does the same on its strip, its
  buttons marked with `data-view-button`. `useSpringLoad` lives in `ui/shared/drag`, so the rule holds for both.
* **Step 4: the source view stays mounted when it is hidden.** A tab group keeps its hidden views in the DOM, so in
  Chromium the dragged slot is still there, and `dragend` reaches it. The smoke spec checks that Session is hidden
  while the pointer is over the lane and that the region lands; a spec also checks that passing over a tab without
  resting there shows nothing.
* **Step 5: the two submenus show only when the project has samples,** as they would otherwise be empty; the slot's
  *Add audio clip* offers *Import samples…* instead, since an empty slot has nothing else to offer. *Add sampler* is
  in the canvas menu's *edit* group, between *Add node…* and *Paste*, and is disabled at `MAX_PATCH_NODES`.
* **Step 5: a sampler's card doesn't show its sample,** so the smoke spec opens the new card's properties and finds
  the sample chosen there.
