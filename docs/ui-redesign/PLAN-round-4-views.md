# Round 4: views that work anywhere

Status: **in progress**, 2026-10-24, decisions signed off as proposed. Part of the [UI redesign](README.md). Carries out
[roadmap § Round 4](DRAFT-roadmap.md#round-4-views-that-work-anywhere), the parts of the
[audit remediation proposal](PROPOSAL-audit-remediation.md) left after round 2 (§3, container queries and `minSize`;
what is left of §4, empty states; and §1's graph-view store), and the two rows the
[round-2 plan](PLAN-round-2-shell.md#decisions-to-sign-off) left for later.

Written as round 3 and renumbered on 2026-10-24, when the review of round 2's shell put a
[shell rework](PLAN-round-3-shell-rework.md) first. This plan builds on that rework: the panel is a tab group, the
sidebars run full height, the sample editor is the *Wave editor* view, Sounds sits in the secondary sidebar, sidebars
open at 300 px and the transport bar wraps. Checked against the merged rework (`fbd3f21`) on 2026-10-24: the
measurements were taken again on its shell, and the parts the rework settled or changed are updated below.

## Goal

Make every view usable at any size down to a minimum, in any region, so that tool views can live in a sidebar.
After this round:

* every view has a minimum size, and the shell never squeezes it below that by a sash, the keyboard or a drop;
* at its minimum, a view's main controls are visible and nothing scrolls sideways that isn't meant to (the session
  grid, the mixer's strips, timelines, canvases and waveforms are);
* views switch to narrow and short layouts with container queries on their own size; nothing lays itself out from the
  window's size, and a test keeps it that way;
* Library's folders are a tree, which also serves as its narrow layout;
* Samples and Library move to the primary sidebar by default;
* every empty state says what to do and offers the action, at any size;
* switching tracks brings back that graph's pan, zoom and open sub-patch;
* at the default layout and window size, every view looks as it does today.

**Out of scope:**

* the shell itself (round 3);
* context menus (round 5);
* drag and drop between views, and the arrangement's selected region in the selection store (round 6);
* a view open twice, such as two patchers (see the decisions). Round 9's pinned panels avoid needing it;
* the command registry and keybindings (round 10);
* restyling and icons (round 13). Narrow layouts reuse today's controls and styles;
* popout windows;
* the wave editor's new features (round 11).

## Measured

Before proposing anything, each view was docked into a sidebar, a narrow split and a short panel and checked for
overflow: first on round 2's dev build (`f90de1b`), then again on round 3's merged shell (`fbd3f21`), with the same
results to within a few pixels. The numbers below are round 3's.

**Setup.** Headless Chromium at 1440 × 900 with the starter project. Samples had the demo samples added, and the Wave
editor had the first one open; Clip was shown empty, with a MIDI clip open, and in automation mode; Instrument in both
Graph and Panel modes. Each view was docked alone in these places:

* the primary sidebar at 240, 280, 320 and 400 px wide;
* a split of the editor area at 280, 360 and 480 px;
* the panel (the tab group `panel`, sized by weights) at 200 and 240 px high;
* a box at about its proposed minimum (280 × 200 for tool views, 480 × 240 for editors).

The layouts were written straight into `sfxlab:layout` as version 2; the parser keeps tab and border attributes, so no
dragging was needed. For each view root the script recorded:

* every element that scrolls sideways, and what sticks out of it;
* content cut off by `overflow: hidden`;
* a screenshot.

The scripts, their raw output and the screenshots are kept outside the repo with the session notes
(`round-3-measure/` for round 2's shell, `round-4/` for round 3's). Step 2's smoke spec makes the important checks permanent.

### Per view

"Needs" is the narrowest width at which the view root, or a scroller inside it, stops scrolling sideways.

| View | Needs | Narrow: what breaks (280 px sidebar unless noted) | Short: what breaks (200 px panel) |
|---|---|---|---|
| Session | 682 px with three tracks: a column of at least 150 px per track and for the master, then the 56 px scene column | The grid scrolls, as intended, but only 1½ tracks show. The scene-launch column sits at the far right, off-screen, and the track headers scroll away with the grid. | Scrolls 38 px; fine. |
| Arrangement | 427 px (toolbar) | The toolbar doesn't wrap, and the view's `overflow: hidden` cuts it off below 427 px. At 280 px the right-click hint wraps a word per line, the toolbar grows to about 350 px tall, and the lanes start 390 px down. The 120 px name column stays. | Fine; the timeline scrolls. |
| Instrument, Effects | 368 px (toolbar: the Randomize, Mutate and Seed group doesn't wrap) | The 260 px property editor stays beside the canvas. The canvas is 20 px wide at 280, 60 at 320, 140 at 400 and 218 at 480. The 204 px zoom controls are cut off. Panel mode has the same toolbar. | Usable: the canvas is 150 px high. |
| Notes | 368 px | As Instrument, plus the heard-notes aside (30 %, at most 440 px): at 400 px the canvas is 20 px wide. The aside's clip picker overflows it at 320 px and below. | Usable. |
| Clip, notes | 667 px (toolbar: the shortcut hint at its end) | At 480 px the Length field is already cut off. | The velocity lane keeps its height, so the piano roll shows about 60 px of rows. |
| Clip, automation | Fits | The 240 px lane list leaves the curve 40 px at 280 px, and its hint wraps a word per line. | Fine at 200 (fixed 180 px canvas). `min-height: 260px` on the editor is taller than the panel. |
| Clip, empty | Fits | Fine. | Fine. |
| Mixer | 695 px with three tracks (120 px strips), scrolled by design | About two strips show. The master strip, pushed right by `margin-left: auto`, is off-screen. | Track names are squashed at 240 px and gone at 200; the faders shrink to about 60 px. |
| Samples, list | 305 px (toolbar), 454 px (rows) | The three toolbar buttons wrap to two or three lines and the drop hint to a word per line. In a row, the 160 px waveform leaves the name a narrow column, and *New audio track* and × (remove) end up past the right edge. | Fine. |
| Wave editor | Fits (the waveform scrolls) | The toolbar wraps to two or three rows; the waveform stays in view. | At 480 × 240 the two toolbar rows, the 150 px waveform and the hint all fit. Round 2 measured the sample editor inside Samples at 280 × 200, where the waveform was out of sight; as an editor it is now at least 480 × 240. |
| Sounds | 247 px | Fine at 280 px; 7 px over at 240. | Fine. |
| Library | 656 px (`180px minmax(180px, 1fr) minmax(260px, 1.5fr)`) | Its own panel scrolls sideways. At 280 px the items and details columns are off-screen; the toolbar wraps into a tall stack. | Fine (it scrolls). |

### The shell

* **No view reads the window size today.** `innerWidth`, `innerHeight` and `matchMedia` appear only in `QuickAdd` and
  `TooltipLayer`, which place popups against the window. `vw` and `vh` appear only in the `MidiSettings` and
  `ExportAudioDialog` overlays, and in round 3's `SaveLayoutDialog`. There is no `@media` rule in `src/`. So this round's job is to build the narrow
  layouts on container queries, and to add a rule test so nothing reads the window size later.
* **flexlayout's minimums are hard, and they overflow.** `minWidth` and `minHeight` on a tab become CSS `min-width`
  and `min-height` on its tab group's container (the largest of its tabs), and on a border's content (the open tab's).
  * Sash drags and keyboard steps stop at them. Measured: sixty ArrowLeft presses on the split between Session and
    Arrangement stopped Session at 480 px.
  * But when the window is smaller than the sum, the main layout's groups don't shrink: they slide under the right
    sidebar. Measured on round 3's shell at 1440 × 900 with both sidebars open at 280 px and Session beside
    Arrangement at 480 px each: Arrangement and the panel ran to x = 1318, under the Sounds sidebar, which starts at
    1133 (round 2's shell: 1317, under Mixer).
  * One rule fixes it: `min-width: 0 !important; min-height: 0 !important` on the main layout's elements that carry
    the inline minimums. With it, the two groups shrank to 387 px each, side by side, with no overlap (179 px each at
    1024 × 700). The sashes still stopped at the minimum, since flexlayout clamps them from the model, not from the
    CSS.
* **A collapsed panel can't hold a minimum height.** Round 3 collapses the panel with `maxHeight: 0`, but flexlayout
  raises a tab group's maximum to its minimum (`calcMinMaxSize`). With the minimums on the panel's tabs, a collapsed
  panel stayed 266 px high (240 and its strip): it no longer collapses.
* **Settled by round 3.** Sidebars open 300 px wide (`borderSize`, which round 2 shared with the panel's 460 px
  height), with `borderMinSize` = `MIN_SIDEBAR_SIZE` (180 px), and the transport bar wraps instead of making the page
  scroll sideways below about 1,124 px.
* **`container-type: size` on view roots is safe for the popups inside them.** `QuickAdd` is `position: fixed` and
  rendered inside the view. With `container: view / size` on every `[data-view]`, it opened in exactly the same place
  (`container-type` doesn't make the view root a containing block for fixed elements).

## Design

### Minimum sizes

* **Where they live.** `view-titles.ts` already holds what the layout needs to know about a view without loading it
  (titles and tooltips). It gains `viewMinSizes: Record<ViewId, { width, height }>`. `ViewDescriptor` gains
  `minSize`, composed from it as `title` is.
* **Values** (see the decisions):

  | | Views | Minimum |
  |---|---|---|
  | Tool views | Samples, Sounds, Library, Mixer | **280 × 200** |
  | Editors | Session, Arrangement, Wave editor, Instrument, Effects, Notes, Clip | **480 × 240** |

  Notes moves from the proposal's tool views to the editors. It is the same graph editor as Instrument, and it broke
  the same way in the measurements.
* **In the shell.**
  * `viewTab(id)` sets `minWidth` and `minHeight` on the tab. `parseStoredLayout` already rebuilds every saved tab
    from `viewTab`, so saved layouts get the minimums without a migration.
  * flexlayout then does the rest: a tab group's minimum is its largest tab's, and a border's minimum is the larger
    of `borderMinSize` and its open tab's. So a sidebar showing Instrument is at least 480 px wide, and the panel,
    now a tab group, is at least 240 px high while it holds any editor, whichever tab is open.
  * **The collapsed panel.** flexlayout raises a tab group's maximum to its minimum (measured above), so the
    driver keeps one rule after every change to the model: a tab in a group the collapsed panel squeezes (the panel,
    or the row it shares when split sideways) has `minHeight: 0`; every other tab has its view's minimum. Collapsing,
    expanding, a tab dragged out of a collapsed panel and a saved collapsed layout (whose tabs `viewTab` rebuilds with
    their minimums) all go through it. A tab group-level `minHeight` was considered; it is raised to the maximum the
    same way, and it wouldn't move with a tab.
* **When the window is too small.** `flex-theme.css` overrides the inline minimums in flexlayout's main layout
  (above), so its groups shrink with the window instead of sliding under a sidebar. Since round 3 the panel is a tab
  group in that layout, so it shrinks with the editor area (see the decisions); collapsing it is the user's way to make
  room. The sidebars, flexlayout's borders, keep theirs. Sashes and keyboard steps still stop at the minimum.
* **Below its minimum, a view scrolls; it doesn't reflow further.** `ViewHost` puts a frame inside the `data-view`
  root:

  ```tsx
  <div data-view={id} className={styles.view} …>                     {/* scrolls, as now */}
    <div className={styles.frame} style={{ '--min-width': …, '--min-height': … }}>
      <View />
    </div>
  </div>
  ```

  ```css
  .frame { container: view / size; height: 100%; min-width: var(--min-width); min-height: var(--min-height); }
  ```

  The frame is the query container, so a view's container queries never see less than its minimum. Each view is
  designed for widths and heights from its minimum up, and below that it is the same layout, scrolled.

### Container queries

* **The rule.** A view's layout depends only on its own size, through `@container view (…)` rules in its CSS module,
  or `cqw` and `cqh` units. It never uses `@media` for layout, `vw` or `vh`, or reads `innerWidth`, `innerHeight` or
  `matchMedia`.
  * `tests/architecture.test.ts` gains a case that checks this, with an allow-list for the five files that place popups and overlays against the window: the four above
    and `SaveLayoutDialog` (round 3's *Save layout as…* dialog, `100vw`).
  * `@media (prefers-reduced-motion)` and other `prefers-*` features stay allowed.
* **Breakpoints are per view**, written where they apply, with a comment saying what the layout gives up. A shared
  scale (narrow, compact) was considered. The views break at different widths (Library at 656 px, Samples at
  305 px), so shared names would hide the reason for each number.
* **Deliberate scrollers** carry `data-scroll="x"` (or `"y"`, `"both"`): the session grid, the mixer's strips,
  timelines, the piano roll, canvases and waveforms. They document intent, and the min-size spec skips them.
* **Measurement in components.** `useElementWidth` (a `ResizeObserver` on the element) already measures a container
  rather than the window; `AudioWaveform` keeps it. Nothing else needs to measure: CSS does the rest.

### View by view

The measurements above give the breakpoints. All of them are on the view's own frame.

| View | Narrow | Short |
|---|---|---|
| **Session** | The grid moves into its own scroller (`data-scroll="both"`). The scene-launch column is sticky on the right and the track headers are sticky at the top, so scenes can be launched and tracks named at any scroll position. Below 640 px, track columns shrink from a 150 px to a 120 px minimum. | Nothing: the grid scrolls. |
| **Arrangement** | The toolbar wraps. The right-click hint leaves the toolbar below 720 px and becomes the toolbar's `title` (round 6 replaces that workflow and the hint with it). Below 560 px, the name column narrows from 120 to 72 px, with an ellipsis. | Nothing: lanes keep their height and scroll. |
| **Instrument, Effects, Notes** (`GraphEditor`) | The toolbar's groups wrap separately, so the Randomize group goes onto its own line instead of holding the toolbar at 372 px. Below 720 px, the property editor (260 px) and a module's interface panel become an overlay drawer over the canvas's right edge, opened by a *Properties* toggle in the toolbar. Selecting a node doesn't open it; double-clicking a node does. The canvas then keeps the full width. Below 640 px, Notes' heard-notes aside moves under the canvas at `min(40cqh, 220px)`. The zoom controls lose their percentage readout below 360 px. | At 240 px high the canvas keeps at least 150 px, as measured; nothing changes. |
| **Clip, notes** | The toolbar's shortcut hint, which holds the toolbar at 667 px, shrinks to a short *Shortcuts* label below 720 px; the span already carries the full text as its `title`. Fields wrap as groups (Grid, Zoom, Length). | Below 320 px high, the velocity lane shrinks to `min(25cqh, its height)`, so the piano roll keeps most of the height. |
| **Clip, automation** | Below 600 px, the 240 px lane list collapses into a `<select>` of lanes above the curve, with the search box beside it. The canvas takes the full width. | The canvas height becomes `clamp(80px, 45cqh, 180px)` instead of a fixed 180 px, and the editor's `min-height: 260px` goes (the view's minimum covers it). |
| **Mixer** | The strips keep scrolling sideways (`data-scroll="x"`). The master strip is sticky on the right, so the master fader is always visible. | Names never shrink (`flex-shrink: 0`). Below 300 px high, the pan row and the sends drop out of track strips, keeping the name, mute and solo, the fader and the meter. |
| **Samples, list** | The toolbar's buttons don't wrap their labels, and the drop hint moves under them below 420 px. Below 420 px, a row becomes two lines: the waveform (`min(160px, 40cqw)`) and the name on the first; ▶, ✎, the two *New … track* buttons and × on the second. | Nothing: the list scrolls. |
| **Wave editor** (round 3 moved the sample editor here) | No change: the toolbar already wraps, and the waveform scrolls. | No change: at 480 × 240 everything fits (measured). The proposal's `min(150px, 40cqh)` waveform was for the sample editor at 200 px high inside Samples. |
| **Sounds** | No change: it fits at 280 px. Rows already wrap. | No change. |
| **Library** | The folder column becomes a **tree** at every width (folders are already nested, `parentId`): ARIA `tree` with expand and collapse, arrow keys, and the folder's item count. Three columns down to 640 px. Below that, two (tree and items side by side, details below). Below 440 px, one: the tree sits above the items, collapsed to the open folder's path until expanded, and details follow. Toolbar inputs take the full width. | No change: it scrolls. |

### Empty states

Round 1b gave the empty states that named another view an action (*Import samples…*, *Open effects*, *Show
session*), and a view no longer names another view in its text. What is left are states that explain without
offering anything:

| Where | Today | Change |
|---|---|---|
| `Patcher`, no instrument track | "Add an instrument track to edit its instrument." | A button **Add instrument track** (`addTrack`), as the session grid's *+* menu does. |
| `Patcher`, audio track selected | Text that says to select an instrument track or open a clip. | The track's clips as buttons (`openClip`), as Clip's empty state does, and **Show session**. |
| `FxPanel`, no track | "Add a track to give it effects." | **Add instrument track** and **Add audio track**. |
| `NoteEffectsPanel`: master, return or audio track, or no track | One line of text each | Keep the text, and add **Add instrument track** where there is none. For the master, a return or an audio track: **Open effects** (`openMasterEffects`, `openTrackView(id, 'effects')`), which is what that owner has instead. |
| `LibraryPanel`, empty catalog | The details column says to select an item; nothing says the library is empty. | "Your library is empty. Save the selected instrument, a clip or a sample to reuse it in other projects." with **Save asset + presets**, the toolbar's own action. |

Every empty state keeps to round 1b's rule and wraps at the view's minimum size: text first, then the buttons in a
wrapping row. The min-size spec checks each view's empty state too.

### Graph view per track (in memory)

`Patcher`, `FxPanel` and `NoteEffectsPanel` render `GraphEditor` with `key={track.id}`. Selecting another track
remounts it, so the canvas's pan and zoom (`PatchCanvas` state) and the open sub-patch (`GraphEditor`'s `path`) start
over on every switch. `<Activity>` doesn't help here: it keeps an instance, and this is a new one.

* **`state/graph-view-store.ts`**: `Record<string, { viewport: { x, y, zoom }; path: readonly string[] }>`, keyed by
  the target (`<trackId>:<graph>`, or `master:fx`). It is kept in memory only (see the decisions).
* `PatchCanvas` reads its starting viewport from the store, and writes it back when a pan or zoom gesture ends and
  when it unmounts. It doesn't write on every pointer move. `GraphEditor` does the same with `path`.
* A path that no longer exists (a module deleted, undo) falls back to the top level, as `enter` already does for a
  stale crumb.
* Selection, the picker and drafts stay component state.

### The VS Code-style default layout

Once the tool views fit 280 px, Samples and Library join the primary sidebar. After this round the default is:

* the **primary sidebar** holds Samples and Library. It is shown, but collapsed to its tab strip (about 25 px), so
  the editor area keeps its width until the user opens it, at 300 px. The activity bar's Library button, the
  sidebar toggle and `revealView` open it;
* the **secondary sidebar** keeps Sounds, collapsed (round 3);
* the **panel** keeps Instrument, Effects, Notes, Clip and Mixer;
* the **editor area** keeps Session, Arrangement and the Wave editor.

Saved layouts are kept, so existing browsers see no change until they choose *Reset layout* or load a named layout.
New browsers, and *Reset layout*, get the new default. *Import samples…* and the other intents reveal Samples in the
sidebar.

### Browser tests

* **`dockAtSize(page, title, { width?, height? })`** in `fixtures.ts`. It writes a stored layout that shows the view
  alone, then loads the page:
  * with a width, in the primary sidebar at that width (a border's size is exact);
  * with a height, in the panel, sized by weights (within 2 px);
  * with both, in an editor-area box sized by weights against the 1500 × 1000 viewport (within 2 px).

  This is the roadmap's "layout fixtures only where a spec needs a specific arrangement". Specs still import no
  `src/`, so the helper writes the layout JSON itself, and the parser repairs the views it leaves out.
* **New smoke spec `views-at-min-size.smoke.spec.ts`.** For each view, at its minimum width, at its minimum height,
  and at both:
  * the root doesn't scroll sideways;
  * no element inside it scrolls sideways unless it carries `data-scroll`;
  * the view's main controls are inside the view's box. Each view lists them (Session: the first scene's launch
    button and the first track's name; Mixer: the master fader and the first track's name; Instrument: *Add* and a
    canvas at least 200 px wide; Clip: Length; Samples: the first sample's ✎; Library: the search box and the first
    item; Sounds: *Save*);
  * its empty state's action is visible too, where the starter project gives one (Clip, Notes for the master).

  Views join the spec as their step lands. Step 2 adds the spec with Sounds and the empty Clip, which pass today.
* **`layout.smoke.spec.ts`** gains three checks:
  * a sash can't take a view below its minimum (keyboard steps);
  * at 1024 × 700 with both sidebars open, no editor group overlaps a sidebar;
  * the panel still collapses to its strip while it holds an editor.

## Steps

Each step is one commit and leaves `npm test`, `npm run typecheck` and `npm run test:smoke` green. Steps 3 to 9 are
independent of each other once step 2 has landed.

1. **Minimum sizes in the shell.**
   * `viewMinSizes` in `view-titles.ts` and `minSize` on `ViewDescriptor`.
   * `viewTab` sets `minWidth` and `minHeight`.
   * `ViewHost`'s frame, with the minimum as CSS variables.
   * The `flex-theme.css` override for the editor area.
   * The driver's rule for the collapsed panel's minimum heights (above), with unit tests.
   * Unit tests: the default layout's tabs carry the minimums, and a saved layout without them gets them.
   * The `layout.smoke.spec.ts` checks for sashes and overlap.
2. **Container queries, the rule test and the min-size spec.**
   * The frame becomes `container: view / size`.
   * The architecture test for `@media`, `vw`, `vh`, `innerWidth`, `innerHeight` and `matchMedia`.
   * `dockAtSize`, and `views-at-min-size.smoke.spec.ts` with Sounds and the empty Clip.
   * Re-run the `QuickAdd` placement check in the dev build (open it in a narrow Instrument near the window's edge).
3. **Library.** The folder tree (with keyboard unit tests for its expand state); three, two and one columns; the
   toolbar. Joins the spec.
4. **Samples and the Wave editor.** The Samples toolbar and two-line rows. Both join the spec (the Wave editor with a
   sample open, unchanged).
5. **Mixer.** The sticky master strip, names that keep their height, and the short strip. Joins the spec.
6. **Session and Arrangement.**
   * Session: the grid's own scroller, the sticky scene column and headers, and narrower columns.
   * Arrangement: the wrapping toolbar, the hint as a `title`, and the narrow name column.
   * Both join the spec.
7. **Graph editors.**
   * The toolbar's wrapping groups.
   * The property and interface drawer with its *Properties* toggle, and Notes' aside below the canvas.
   * Instrument, Effects and Notes join the spec, in Graph and Panel modes.
8. **Clip.**
   * The toolbar and its hint.
   * The short velocity lane.
   * The automation editor's lane `<select>`, its canvas height and its `min-height`.
   * Joins the spec in notes and automation modes.
9. **Empty states.** The table above, with a smoke assertion for the master's Notes (*Open effects*) and an empty
   project's Instrument (*Add instrument track*).
10. **Graph view per track.** `graph-view-store.ts` with unit tests (keys, stale paths). `PatchCanvas` and
    `GraphEditor` read and write it. A smoke spec: zoom Bass's canvas, select Lead, select Bass again, and the zoom is
    back.
11. **The default layout.**
    * `DEFAULT_LAYOUT` and `default-layout.ts` move Samples and Library to the primary sidebar, collapsed.
    * Update `layout.smoke.spec.ts`'s expectations: the panel's neighbour after Mixer leaves it, and what *Reset
      layout* shows.
    * Check the specs that assume the panel holds Samples or Library.
12. **Profiling and docs.**
    * Run `scripts/profile-status.cjs` (`editor` and `four`) against round 3's numbers. Container queries and sticky
      cells add style and layout work, not React work: component renders must stay at 145 a second.
    * ARCHITECTURE.md § Layout and navigation: minimum sizes, the frame, the container-query rule, `data-scroll`, the
      graph-view store and the default layout.
    * [README.md](README.md) marks round 4 done. The roadmap notes what moved.

## Changes made while implementing

What turned out different from the design above, step by step.

* **Step 1: the override names flexlayout's classes.** The measured rule matched `[style*="min-width"]`, which would
  also match the frame's `--min-width`; it selects `.flexlayout__row` and `.flexlayout__tabset_container` inside
  `.flexlayout__layout_main` instead.
* **Step 1: the collapsed panel's rule runs in `sync`.** The driver's `keepMinimumHeights` runs before each mirror,
  so it covers the driver's own actions and the user's (`onModelChange`) alike, and a saved collapsed layout on its
  first sync.
* **Step 2: `dockAtSize` holds a size with a tab group's maximums, not weights.** flexlayout's weights didn't give
  exact sizes (a box weighted to 480 px came out 544 px). A tab group's `maxWidth` and `maxHeight` (the strip not
  counted) give the size exactly, without first loading the page to measure it.
* **Step 2: the rule test also catches** `outerWidth`, `outerHeight` and the `dvh` / `svh` / `lvh` units, and checks
  itself on a sample.
* **Step 2: `QuickAdd` re-checked.** Opened from a 480 px Instrument in the right sidebar at 1440 × 900, the popup's
  box equals its `left` / `top` in window coordinates (1092, 81) and fits inside the window.
* **Step 2: the spec checks a view at its starting scroll position.** It scrolls everything in the view back to the
  top left before looking for the controls; a `prepare` step (saving a Library item) can scroll it.
* **Step 3: the tree's rows.** The root row keeps today's *All / root*. Clicking a folder opens and expands it; its
  twisty only expands or collapses it; the arrow keys move the open folder (selection follows focus) without
  expanding. A folder's row is named with its item count (*Nested, 3 items*), so specs find folders by a pattern. The
  aside around the tree and the folder actions is now *Library folder actions*; the tree is *Library folders*.
* **Step 3: the narrow tree** collapses to the open folder's path with an *All folders* toggle that only shows below
  440 px, by CSS on `data-on-path`, so no component measures its width.
* **Step 3: the search toolbar comes first below 440 px.** At 280 × 200 the three toolbars wrap to more than the
  view's height; with the search first it shows without scrolling. The first item is a scroll away there (the plan's
  "short: it scrolls"), so the spec looks for it only at the minimum width and the minimum height apart.
* **Step 3: the bundle import's file input shrinks** below 440 px: it held Library at 302 px.
* **Step 4: rows take two lines below 700 px, not 420.** With labels that no longer wrap, a row needs about 584 px
  plus the name, so it broke at 478 px. At 280 px the actions themselves take two lines (*New sampler track* and
  *New audio track* don't fit beside ▶ and ✎); nothing scrolls sideways. The drop hint moves under the buttons below
  420 px as planned.
* **Step 4: the waveform thumbnail narrows through `--thumb-width`** (`WaveformThumb`'s inline width is its default),
  and its drawing scales to fit.
* **Step 4: the Wave editor's waveform scroller carries `data-scroll="x"`**, and the spec checks that scroller, not
  the canvas inside it.
* **Step 5: the sticky master sits past the scroller's padding** (`right: calc(-1 * var(--padding))`); at `right: 0`
  the strips scrolling under it showed in the 10 px gutter beside it.
* **Step 5: the short strip also drops the effects badges and lets the fader row shrink to 40 px.** Without that, a
  strip at 200 px still needed more height than the view has; it keeps its name, mute and solo, fader, meter and
  value, as planned.
* **Step 6: the session grid's width is set from its column count.** The sticky scene column needs the grid box as
  wide as its columns; `width: max-content` made every track as wide as the widest header's content (about 150 px),
  so the narrower columns never showed. The grid gets `--columns` inline and is
  `max(100%, columns × (minimum + gap) + scene column + padding)` wide.
* **Step 6: the arrangement's hint is the toolbar's tooltip at every width**, since CSS can't move a `title`; below
  720 px the visible hint goes. The timeline's scroller carries `data-scroll="both"`.

## Behavior changes

Intended:

* A view can't be dragged, or stepped with the keyboard, below its minimum. When the window is smaller than the
  minimums, editor groups shrink and their views scroll; today they slide under a sidebar once minimums exist, and
  without minimums they shrink to nothing.
* Views have narrow and short layouts: wrapping toolbars, drawers, collapsed columns and lists, sticky scene and
  master columns. At the default layout and 1440 × 900 they look as today. The one exception is the Session grid's
  sticky headers and scene column, which only show a difference while scrolling.
* Graph editors get a *Properties* toggle when narrow.
* The remaining text-only empty states offer actions.
* Switching tracks brings back that graph's pan, zoom and open sub-patch for the session. Today each switch starts
  over.
* Library's folders become a tree.
* New browsers and *Reset layout* get Samples and Library in a collapsed primary sidebar (Sounds is in the
  secondary sidebar since round 3).

Anything else a reviewer notices is a bug in this round.

## Verification

* `npm test` (unit and architecture), `npm run typecheck` and `npm run test:smoke` all pass. Run `npm run test:audio`
  once before merging.
* **Before and after.** Re-run the measurement script on the finished branch: every view in every place it was
  measured, with the before and after screenshots side by side in the session notes. At the default layout and
  1440 × 900, the before and after screenshots of each view should match, apart from the changes listed above.
* Manual pass on the dev build:
  * each view docked into each sidebar, then its sash dragged to the minimum and back;
  * each view in a narrow editor split and in a short panel;
  * the window resized from 1500 px wide down to 1024, and from 1000 px high down to 700, with both sidebars open;
  * the drawer, the sticky scene column and the sticky master strip from the keyboard alone;
  * each empty state's action;
  * `QuickAdd`, Radix menus and `GroovePanel` opened in a narrow view near the window's edge;
  * Safari and Firefox once: container queries and `position: sticky` inside a scroller.
* Profiling as in step 12.

## Decisions to sign off

Signed off 2026-10-24: every row as proposed. The row on a window smaller than the minimums was changed when the plan
was checked against round 3's shell, before sign-off.

| Question | Proposed | Notes |
|---|---|---|
| Minimum sizes | **280 × 200** for Samples, Sounds, Library and Mixer; **480 × 240** for Session, Arrangement, Wave editor, Instrument, Effects, Notes and Clip | The proposal's values, signed off as proposed in round 2 but left to this plan. One change: **Notes is an editor**, not a tool view. It is a graph editor and broke like Instrument (a 20 px canvas at 400 px). Consequence: a sidebar showing an editor is at least 480 px wide. |
| When the window is smaller than the minimums | **The editor area's groups and the panel shrink and their views scroll**; the sidebars keep their minimums | flexlayout's own behavior lets groups slide under a sidebar (measured). Changed after round 3: the panel is now a tab group in the same layout as the editor area, and the rule covers that layout; keeping the panel's minimum would need a selector for its group in flexlayout's DOM. The panel still collapses to make room. The alternative is hiding sidebars automatically, as VS Code does, which needs code that watches the workbench's size and changes the user's layout behind their back. The override relies on flexlayout's inline styles, which the version pin and the `ui/layout`-only rule contain. |
| Patch canvas view per graph (round-2 row) | **In memory** | Persisting it would extend `sfxlab:layout` with project-specific track ids. Revisit if users ask. |
| VS Code-style default layout | **Yes**: Samples and Library in the primary sidebar, **shown but collapsed**; Sounds stays in the secondary sidebar (round 3); the panel keeps Instrument, Effects, Notes, Clip and Mixer | Round 2 deferred it; the user asked for Sounds on the right. Alternatives: the sidebar **open on Samples** (the editor area loses 300 px from the start), or **round 3's default** (Samples and Library stay in the panel). Saved layouts are untouched either way. |
| Library's folders | **A tree at every width** | The user asked for a tree. Folders are already nested. It replaces the `<select>` this plan first proposed for narrow widths. |
| Narrow Session and Mixer | **Keep scrolling sideways**, with the scene column, headers and master strip sticky | The alternative is reflowing them, for example a vertical mixer in a sidebar. That is a new design, not a narrow layout, and it would change how they look at every size. |
| Graph editors when narrow | **The property editor becomes a drawer** over the canvas, toggled from the toolbar, below 720 px | The proposal's §3. Alternatives: below the canvas (tall), or hidden with the selection shown in a popover. |
| Can a view be open twice (roadmap row) | **Not in round 4** | Nothing here needs it. Round 9's pinned panels show copies of a track's front panel inside one view instead. The graph-view store is keyed by target, so pinned per-track editors later can reuse it. |
| `regionId` in the selection store (proposal §1) | **Round 6** | Only linked selection needs it. |
