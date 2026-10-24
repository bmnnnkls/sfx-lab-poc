# Round 1: untangling navigation from selection

Status: **done**, 2026-10-24 (planned and implemented the same day). Part of the [UI redesign](README.md).

## Goal

Make every view movable without changing what the user sees. After this round:

* "which view is showing" lives in one place (a layout store), separate from "what is selected";
* code that wants to *show* something says so with an explicit intent (`openClip`, `revealView('effects')`, …)
  instead of relying on a side effect of selecting it;
* views are listed in a registry, so a docking shell in round 2 can mount them from data;
* browser tests open views through one helper, so round 2 can change the tab chrome without touching every spec.

**Out of scope:** any visual change, a docking library, new regions, resizing behavior, new views.
The app must look and behave exactly as it does now; deliberate exceptions are listed under
[Behavior changes](#behavior-changes).

## Current state (what we are untangling)

`state/selection-store.ts` mixes two things: the selection (`trackId`, `master`, `clipId`, `automationScene`) and
the bottom panel's active tab (`tab: EditorTab`). Three selection actions also switch the tab:

| Action | Selects | Also does |
|---|---|---|
| `selectClip(trackId, clipId)` | track + clip | `tab: 'clip'` |
| `selectMaster()` | master | `tab: 'fx'` |
| `selectAutomation(owner, scene)` | owner + scene, clears clip | `tab: 'clip'` |
| `selectTrack(trackId)` | track | nothing |
| `reset()` | clears all | `tab: 'device'` |

Explicit `setTab` calls outside the panel:

| Call site | Intent |
|---|---|
| `ui/session-view/TrackHeader.tsx:38` | fx badge: select track, show Effects |
| `ui/session-view/TrackHeader.tsx:51` | notes badge: select track, show Notes |
| `ui/mixer/ChannelStrip.tsx:64` | fx badge: select track, show Effects |
| `ui/samples/SampleRow.tsx:24` | new sampler track: select it, show Instrument |
| `state/automation-store.ts:24` | `useAutomationEditor.show()`: show Clip |

Implicit navigation through `selectClip` / `selectMaster` / `selectAutomation`: `AudioClipSlot`, `MidiClipSlot`,
`MasterHeader`, `MasterStrip`, `AutomationSlotCell`, `MidiTargetMenu`, `SampleRow` (audio track), and
`app/project-files.ts` (`reset()` on project replace).

The main view (`'session' | 'arrangement'`) is separate again: local state in `ui/Workspace.tsx`, persisted under
`sfxlab:main-view`, toggled by the transport bar and a Tab-key handler in `Workspace`.

The sample editor's target is component state (`editing`) inside `ui/samples/SamplesPanel.tsx`, so it is lost
whenever the Samples tab unmounts and cannot be shown anywhere else.

`EditorPanel.tsx` hard-codes eight buttons and a nested ternary that picks the component.

## Design

### Layout store (`state/layout-store.ts`, new)

```ts
/** Every view the workbench can show. The ids are stable: layouts are saved by them. */
export type ViewId =
  | 'session' | 'arrangement'
  | 'instrument' | 'effects' | 'notes' | 'clip' | 'mixer' | 'samples' | 'sounds' | 'library'

/** Where a view can sit. Round 1 has the two regions that exist today; round 2 adds sidebars. */
export type RegionId = 'main' | 'panel'

interface RegionState { readonly views: readonly ViewId[]; readonly active: ViewId }

interface LayoutState {
  readonly regions: Readonly<Record<RegionId, RegionState>>
  /** Make a view visible: activate it in the region that holds it. */
  revealView(id: ViewId): void
  /** The Tab key / transport toggle between the main region's views. */
  toggleMainView(): void
  /** Put the bottom panel back on its default view (used when a project is replaced). */
  resetPanel(): void
}
```

* The default layout is today's: `main: { views: ['session', 'arrangement'], active: 'session' }`,
  `panel: { views: ['instrument', 'effects', 'notes', 'clip', 'mixer', 'samples', 'sounds', 'library'], active: 'instrument' }`.
* `revealView` looks up the region that contains the view and sets `active`. The region shape
  (ordered views + active) is the shape of a tab group in round 2, so callers do not change then.
* The tab ids get user-facing names (`device` → `instrument`, `fx` → `effects`, `presets` → `sounds`). The bottom
  tab is not persisted today, so renaming breaks no saved state.
* `ViewId` lives in `state` because `state` cannot import `ui`; the `ui` registry is typed
  `Record<ViewId, ViewDescriptor>`, so adding an id without a view (or the reverse) fails the typecheck.

**Persistence.** Only the main region's active view is persisted, under the existing `sfxlab:main-view` key and
with the same values, so a user's choice survives the change. A `useLayoutPersistence()` hook in `ui/layout/`
(mounted once in `Workspace`) reads the key on start and writes on change, with the same guarded,
validating access as `useStoredState`. Persisting the whole layout is round 2's job, once the format is known.

### Navigation intents (`state/navigation.ts`, new)

Selection and showing become separate steps. The selection store keeps only selection; intents compose the two:

```ts
openClip(trackId, clipId)          // selectClip + revealView('clip')
openTrackView(trackId, view)       // selectTrack + revealView(view), for the fx / notes / instrument badges
openMasterEffects()                // selectMaster + revealView('effects')
openAutomationSlot(owner, scene)   // selectAutomation + revealView('clip')
```

* `selectClip`, `selectMaster`, `selectAutomation` stop touching any tab; `reset()` stops resetting it.
  `EditorTab`, `tab` and `setTab` are removed from `selection-store.ts` and from `state/index.ts`.
* Every call site that navigated before calls the matching intent, so behavior is unchanged. A call site that
  only wants the selection (none today) uses the plain `select*` action.
* `useAutomationEditor.show()` calls `revealView('clip')` instead of `setTab('clip')`, and
  `openAutomationSlot` instead of `selectAutomation`.
* `app/project-files.ts` calls `useLayoutStore.getState().resetPanel()` after `reset()`. That keeps today's
  "a replaced project opens on Instrument".

### View registry (`ui/layout/views.ts`, new)

```ts
interface ViewDescriptor {
  readonly title: string            // tab label, also the accessible name tests use
  readonly tooltip?: string
  readonly component: ComponentType // lazy where it is today (Library)
}
export const views: Record<ViewId, ViewDescriptor>
```

* `EditorPanel` renders its tab buttons and body from `regions.panel` + `views`, keeping today's labels, tooltips,
  class names and the `Suspense` fallback for Library. The nested ternary goes away.
* `Workspace` renders the main region from `regions.main` + `views`. The transport bar's Session | Arrangement
  buttons read and set the layout store instead of taking `view` / `onView` props.
* The Tab-key handler moves from `Workspace` into `ui/shortcuts/use-view-shortcuts.ts`, which calls
  `toggleMainView()`. Its rules for when to ignore the key (typing target, modifiers) stay as they are.
* `MainView` is no longer exported from `Workspace`.

### Sample editor target in state

`selection-store` gains `sampleId: string | null` with `selectSample(id | null)`, and an intent
`openSampleEditor(id)` (= `selectSample` + `revealView('samples')`). `SamplesPanel` reads it instead of local
`editing`; ✎ on a row calls the intent and *Close* calls `selectSample(null)`. `reset()` clears it. This is the
seam round 2 uses to promote the sample editor to its own view without touching `SamplesPanel` again.

The one visible effect is that an open sample editor stays open across tab switches. This is listed under
behavior changes.

### Browser test helper

`tests/browser/fixtures.ts` gains:

```ts
/** Show a view wherever it is docked. The only place specs know how views are opened. */
export const openView = async (page: Page, title: ViewTitle) => { … }
```

Round 1 implements it as today's button click (`getByRole('button', { name: title, exact: true })`). The
~45 direct tab and view-button clicks across `tests/browser/*.spec.ts` move to `openView`. In round 2 the helper
alone changes (role `tab`, activity bar, collapsed sidebars). `ViewTitle` is a string union of the registry's
titles. Specs import no `src/`, so it is kept in sync by hand, with a comment pointing at `ui/layout/views.ts`.

### Container audit (a document, not code)

A table, appended to this plan as the round's last step, with one row per view. Columns:

* **Size assumptions:** reads `window` size or an ancestor's; fixed widths or heights; behavior below ~320 px
  width or ~200 px height.
* **Local state lost on unmount:** zoom, scroll, selection, open sub-editor.
* **Shown-elsewhere assumptions:** expects the session grid or another view to be visible.
* **Per-frame work while mounted:** playhead, meters, `requestAnimationFrame` loops.

Known entries to start from: `Splitter` sizes from `window.innerHeight` (anchored to the bottom),
`Workspace` clamps the panel with `window.innerHeight`, and `ArrangementView` keeps zoom and the selected region in
component state. Popups positioned against the window (`QuickAdd`, tooltips, `MidiSettings`) are fine as they are.
The audit is the input for round 3; round 1 fixes nothing it finds unless it blocks the steps above.

## Steps

Each step is one commit and leaves everything green.

1. **Layout store and intents (state only).** Add `layout-store.ts` and `navigation.ts`, export them from
   `state/index.ts`, with unit tests: the default layout, `revealView` per region, `toggleMainView`,
   `resetPanel`, each intent setting selection *and* active view. Nothing uses them yet.
2. **Registry and panel.** Add `ui/layout/views.ts`; `EditorPanel` and `Workspace` render from the layout store;
   transport bar and Tab key go through the store; `useLayoutPersistence` keeps `sfxlab:main-view`.
3. **Migrate call sites and drop `tab`.** Replace the explicit `setTab` calls and implicitly navigating
   `select*` calls with intents (tables above), switch `automation-store` and `project-files`, then remove
   `tab` / `setTab` / `EditorTab`. Update `automation-slots.test.ts` to assert on the layout store.
   `grep -rn "setTab\|EditorTab" src` is empty afterwards.
4. **Sample editor target.** `sampleId` / `selectSample` / `openSampleEditor`; `SamplesPanel` reads from state.
5. **Test helper.** `openView` in `fixtures.ts`; migrate the specs. Smoke suite passes unchanged in count.
6. **Docs.** ARCHITECTURE.md: a short "Layout and navigation" section (layout store, intents, registry), and
   *Common changes → Add a UI feature* becomes "register a view in `ui/layout/views.ts`". Append the container
   audit to this plan. Mark round 1 done in [README.md](README.md).

## Behavior changes

Intended to be none, apart from:

* **An open sample editor survives switching tabs** (its target moved from component to store). It still closes
  on *Close* and on project replace.

Anything else a reviewer notices is a bug in this round.

## Verification

* `npm test` (unit and architecture), `npm run typecheck`, `npm run test:smoke`: all pass. The audio suite is not
  affected by this round; run it once before merging anyway.
* Manual pass on the dev build:
  * every tab button;
  * fx / notes badges in the session grid and the mixer;
  * ✎ on MIDI and audio clips;
  * Master header and master strip;
  * automation slot cells and *Edit automation* from a slot and from a MIDI-learn target menu;
  * *New sampler track* and *New audio track* from Samples;
  * Tab key and the Session | Arrangement buttons, then reload (the main view is kept);
  * File → New / Examples (the panel returns to Instrument).

## Open questions

* **Persist the bottom panel's tab?** Today it always opens on Instrument. Keeping that is the conservative
  choice for round 1; round 2's full layout persistence decides for good.
* **Layout per browser or per project?** Proposed per browser (like VS Code's workbench). This matters from
  round 2, but if any reviewer wants per-project, the persistence hook is where it would change.

## Container audit (round 1 result)

Collected while implementing round 1, as input for round 3. Nothing here was fixed in this round. "Lost on unmount"
means lost when the view's tab is switched away today, and when its group is hidden or closed after round 2.

### The shell

* `Splitter` sizes the panel from `window.innerHeight - clientY`, so it assumes the panel is anchored to the bottom of
  the window. `Workspace` clamps the saved panel height with `window.innerHeight` and `MIN_SESSION_HEIGHT` (140 px).
  Both go away with the docking library's own sashes.
* The main area is one `<main>` with `overflow: auto`. Session and Arrangement share that scroll container, so a
  toggle keeps the previous view's scroll offset (clamped) instead of each view keeping its own.
* Popups positioned against the window (`QuickAdd`, tooltips, `MidiSettings`) are fine wherever their anchor is docked.

### Per view

| View | Size assumptions | Lost on unmount | Shown-elsewhere assumptions | Per-frame work while mounted |
|---|---|---|---|---|
| Session | None of its own; cells have a 34 px minimum height and the grid scrolls in the main area. | Nothing (selection is in stores). Scroll offset is the main area's. | The empty audio-cell menu says "import some in the Samples tab". ✎ and badges reveal other views through intents. | Every cell subscribes to its own playing / queued flags; re-renders only when they change. |
| Arrangement | 120 px track-name column, 56 px lanes, 24 px ruler; reads lane bounds on click (fine). | Zoom (`pxPerBeat`), the selected region, the placement beat. | Clips reach the timeline through *Place on arrangement* in the session grid, because the two views are exclusive today; dragging a slot onto a lane needs both visible. | Subscribes to `status.beat` at the top: the whole view re-renders on every status update (~30/s) while playing. |
| Instrument (`Patcher`) | 260 px property editor beside the canvas; a 180 px module bar. Below ~320 px width the canvas has no room. | Canvas pan / zoom, selected nodes, the open sub-patch path, the picker, the interface toggle. Graph / panel view and sockets are kept in localStorage (`sfxlab.view.*`, `sfxlab.sockets`). | For the master and a return, its text points to "the Effects tab". | `EffectiveValue` and the property editor follow the control store (playback values), so they re-render while automation plays. |
| Effects (`FxPanel`) | Same `GraphEditor` as Instrument. | Same as Instrument. | Edits the master's graph when the master is selected. | Same as Instrument. |
| Notes | The preview aside is 30% (at most 440 px); fixed 214 px and 220 px columns. | The chosen heard-notes entry, plus the `GraphEditor` state above. | None. | Same as Instrument. |
| Clip | 270 px side settings; the automation editor has a 240 px lane list, a fixed 180 px canvas and a 260 px minimum height. | Note selection and drafts; the piano roll's scroll (re-centred on the notes when it mounts); all automation-editor state (lane, selection, zoom, step, search, paste beat). Grid, zoom, follow, audition and velocity lane are in localStorage. Notes / Automation is in `useAutomationEditor` (kept). | Empty states say "Select a clip with ✎" and "Create a slot in the session grid", assuming the session grid is visible. | The piano-roll `Playhead` follows `status.beat` (and auto-scrolls with *Follow*); the audio waveform's playhead likewise; `AutomationEditor` subscribes to the whole status and re-renders on every update. |
| Mixer | Fixed-width strips (28 px fader, 10 px meter) in a row; the fader row needs at least 80 px height, so below ~200 px height the strips scroll. | Nothing. | The fx badge reveals Effects through an intent. | Every `LevelBar` subscribes to the whole status: each strip's meter re-renders on every update. |
| Samples | The sample editor's waveform is a fixed 150 px high. | Drag highlight; in the editor, zoom, the selection and the busy flag. The edited sample is in the selection store since this round. | None. | None. |
| Sounds (`PresetsPanel`) | 140 px inputs, 160 px minimum row labels. | The whole form: domain, name, A / B picks, morph amount, the last message. | None. | None. |
| Library | Three columns of 180 px + at least 180 px + at least 260 px: overflows below ~650 px width. | Everything: the catalog (re-read from IndexedDB on mount), folder, selection, search and filters, trash toggle, bundle progress, messages. | None. | None. Lazy-loaded on first show. |

### What this suggests for round 3

* **Keep views mounted when hidden** (or lift the state above): Library, Sounds, the automation editor and the
  arrangement lose the most. A docking library's "render only when visible" mode must be weighed against this.
* **Per-frame subscriptions** that re-render a whole view (Arrangement, `AutomationEditor`, every `LevelBar`) should
  move to a small playhead / meter component, as the piano roll's `Playhead` already does. This matters once several
  views are visible at once.
* **Fixed side columns** (property editor, clip settings, library columns) need a narrow layout or a collapse for
  sidebars.
* **Texts that name a tab** ("the Samples tab", "the Effects tab") should name the view, or offer a button that reveals it.

