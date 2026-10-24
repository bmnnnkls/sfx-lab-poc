# Round 3: views that work anywhere

Status: **plan**, 2026-10-24, decisions open. Part of the [UI redesign](README.md). Carries out
[roadmap § Round 3](DRAFT-roadmap.md#round-3-views-that-work-anywhere), the round-3 parts of the
[audit remediation proposal](PROPOSAL-audit-remediation.md) (§3, container queries and `minSize`; what is left of §4,
empty states; and §1's graph-view store), and the two rows the [round-2 plan](PLAN-round-2-shell.md#decisions-to-sign-off)
left for this round. Builds on round 2 (`claude/round-2-shell-147985`, not merged yet when this was written).

## Goal

Make every view usable at any size down to a minimum, in any region, so that tool views can live in a sidebar.
After this round:

* every view has a minimum size, and the shell never squeezes it below that by a sash, the keyboard or a drop;
* at its minimum, a view's main controls are visible and nothing scrolls sideways that isn't meant to (the session
  grid, the mixer's strips, timelines, canvases and waveforms are);
* views switch to narrow and short layouts with container queries on their own size; nothing lays itself out from the
  window's size, and a test keeps it that way;
* every empty state says what to do and offers the action, at any size;
* switching tracks brings back that graph's pan, zoom and open sub-patch;
* at the default layout and window size, every view looks as it does today.

**Out of scope:**

* drag and drop between views, and the arrangement's selected region in the selection store (round 4);
* a view open twice, such as two patchers (see the decisions);
* the command registry, keybindings and layout presets (round 5 and later);
* restyling and icons (round 8). Narrow layouts reuse today's controls and styles;
* popout windows;
* the wave editor.

## Measured

Before proposing anything, each view was docked into a sidebar, a narrow split and a short panel on round 2's dev
build (`f90de1b`) and checked for overflow.

**Setup.** Headless Chromium at 1440 × 900 with the starter project. Samples had the demo samples added; Clip was
shown empty, with a MIDI clip open, and in automation mode; Instrument in both Graph and Panel modes. Each view was
docked alone in these places:

* the primary sidebar at 240, 280, 320 and 400 px wide;
* a split of the editor area at 280, 360 and 480 px;
* the panel at 200 and 240 px high;
* a box at its proposed minimum (280 × 200, or 480 × 240 for Session and Arrangement).

The layouts were written straight into `sfxlab:layout`; the parser keeps tab and border attributes, so no dragging
was needed. For each view root the script recorded:

* every element that scrolls sideways, and what sticks out of it;
* content cut off by `overflow: hidden`;
* a screenshot.

The scripts, their raw output and 148 screenshots are kept outside the repo with the session notes
(`round-3-measure/`). Step 2's smoke spec makes the important checks permanent.

### Per view

"Needs" is the narrowest width at which the view root, or a scroller inside it, stops scrolling sideways.

| View | Needs | Narrow: what breaks (280 px sidebar unless noted) | Short: what breaks (200 px panel) |
|---|---|---|---|
| Session | 682 px with three tracks: a column of at least 150 px per track and for the master, then the 56 px scene column | The grid scrolls, as intended, but only 1½ tracks show. The scene-launch column sits at the far right, off-screen, and the track headers scroll away with the grid. | Scrolls 38 px; fine. |
| Arrangement | 427 px (toolbar) | The toolbar doesn't wrap, and the view's `overflow: hidden` cuts it off below 427 px. At 280 px the right-click hint wraps a word per line, the toolbar grows to about 350 px tall, and the lanes start 390 px down. The 120 px name column stays. | Fine; the timeline scrolls. |
| Instrument, Effects | 372 px (toolbar: the Randomize, Mutate and Seed group doesn't wrap) | The 260 px property editor stays beside the canvas. The canvas is 20 px wide at 280, 60 at 320, 140 at 400 and 218 at 480. The 204 px zoom controls are cut off. Panel mode has the same toolbar. | Usable: the canvas is 150 px high. |
| Notes | 372 px | As Instrument, plus the heard-notes aside (30 %, at most 440 px): at 400 px the canvas is 20 px wide. The aside's clip picker overflows it at 320 px and below. | Usable. |
| Clip, notes | 667 px (toolbar: the shortcut hint at its end) | At 480 px the Length field is already cut off. | The velocity lane keeps its height, so the piano roll shows about 60 px of rows. |
| Clip, automation | Fits | The 240 px lane list leaves the curve 40 px at 280 px, and its hint wraps a word per line. | Fine at 200 (fixed 180 px canvas). `min-height: 260px` on the editor is taller than the panel. |
| Clip, empty | Fits | Fine. | Fine. |
| Mixer | 695 px with three tracks (120 px strips), scrolled by design | About two strips show. The master strip, pushed right by `margin-left: auto`, is off-screen. | Track names are squashed at 240 px and gone at 200; the faders shrink to about 60 px. |
| Samples, list | 305 px (toolbar), 454 px (rows) | The three toolbar buttons wrap to two or three lines and the drop hint to a word per line. In a row, the 160 px waveform leaves the name a narrow column, and *New audio track* and × (remove) end up past the right edge. | Fine. |
| Samples, sample editor | 305 px | The toolbar wraps to three rows. | At 280 × 200 the toolbar takes about 130 of 196 px and the waveform is out of sight. |
| Sounds | 247 px | Fine at 280 px; 7 px over at 240. | Fine. |
| Library | 656 px (`180px minmax(180px, 1fr) minmax(260px, 1.5fr)`) | Its own panel scrolls sideways. At 280 px the items and details columns are off-screen; the toolbar wraps into a tall stack. | Fine (it scrolls). |

### The shell

* **No view reads the window size today.** `innerWidth`, `innerHeight` and `matchMedia` appear only in `QuickAdd` and
  `TooltipLayer`, which place popups against the window. `vw` and `vh` appear only in the `MidiSettings` and
  `ExportAudioDialog` overlays. There is no `@media` rule in `src/`. So this round's job is to build the narrow
  layouts on container queries, and to add a rule test so nothing reads the window size later.
* **flexlayout's minimums are hard, and they overflow.** `minWidth` and `minHeight` on a tab become CSS `min-width`
  and `min-height` on its tab group's container (the largest of its tabs), and on a border's content (the open tab's).
  * Sash drags and keyboard steps stop at them. Measured: sixty ArrowLeft presses on the split between Session and
    Arrangement stopped Session at 480 px.
  * But when the window is smaller than the sum, the editor area's groups don't shrink: they slide under the right
    sidebar. Measured at 1440 × 900 with both sidebars open at 280 px and Session beside Arrangement at 480 px each:
    Arrangement ran to x = 1317, under the Mixer sidebar, which starts at 1133.
  * One rule fixes it: `min-width: 0 !important; min-height: 0 !important` on the editor area's elements that carry
    the inline minimums. With it, the two groups shrank to 386 px each, side by side, with no overlap. The sashes still
    stopped at the minimum, since flexlayout clamps them from the model, not from the CSS.
* **Sidebars open at 460 px.** `GLOBAL_ATTRIBUTES.borderSize` is the panel's default height, and it applies to every
  border, so a view dropped into a sidebar opens 460 px wide. `borderMinSize` (180 px) applies to the sidebars too.
* **The transport bar is about 1,124 px wide and doesn't wrap.** In a narrower window the whole page scrolls
  sideways, whatever the layout (measured at 1100 and 1024 px; fine at 1180).
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
  | Editors | Session, Arrangement, Instrument, Effects, Notes, Clip | **480 × 240** |

  Notes moves from the proposal's tool views to the editors. It is the same graph editor as Instrument, and it broke
  the same way in the measurements.
* **In the shell.**
  * `viewTab(id)` sets `minWidth` and `minHeight` on the tab. `parseStoredLayout` already rebuilds every saved tab
    from `viewTab`, so saved layouts get the minimums without a migration.
  * flexlayout then does the rest: a tab group's minimum is its largest tab's, and a border's minimum is the larger
    of `borderMinSize` and its open tab's. So the panel can't be made shorter than 240 px while Instrument shows, and
    a sidebar showing Instrument is at least 480 px wide.
* **When the window is too small.** `flex-theme.css` overrides the editor area's inline minimums (above), so its
  groups shrink with the window instead of sliding under a sidebar. The sidebars and the panel keep theirs: hiding
  them is the user's way to make room. Sashes and keyboard steps still stop at the minimum.
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
* **Sidebars open at 300 px.** `borderSize` becomes 300 and the panel's own `size` (460 by default, or migrated)
  is set on the panel border, as it already is in `defaultLayout`. The parser gains one repair: a saved panel border
  without a `size` gets the panel's default, so it doesn't drop to the sidebars' 300 px.

### Container queries

* **The rule.** A view's layout depends only on its own size, through `@container view (…)` rules in its CSS module,
  or `cqw` and `cqh` units. It never uses `@media` for layout, `vw` or `vh`, or reads `innerWidth`, `innerHeight` or
  `matchMedia`.
  * `tests/architecture.test.ts` gains a case that checks this, with an allow-list for the four popup files above.
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
| **Arrangement** | The toolbar wraps. The right-click hint leaves the toolbar below 720 px and becomes the toolbar's `title` (round 4 replaces that workflow and the hint with it). Below 560 px, the name column narrows from 120 to 72 px, with an ellipsis. | Nothing: lanes keep their height and scroll. |
| **Instrument, Effects, Notes** (`GraphEditor`) | The toolbar's groups wrap separately, so the Randomize group goes onto its own line instead of holding the toolbar at 372 px. Below 720 px, the property editor (260 px) and a module's interface panel become an overlay drawer over the canvas's right edge, opened by a *Properties* toggle in the toolbar. Selecting a node doesn't open it; double-clicking a node does. The canvas then keeps the full width. Below 640 px, Notes' heard-notes aside moves under the canvas at `min(40cqh, 220px)`. The zoom controls lose their percentage readout below 360 px. | At 240 px high the canvas keeps at least 150 px, as measured; nothing changes. |
| **Clip, notes** | The toolbar's shortcut hint, which holds the toolbar at 667 px, shrinks to a short *Shortcuts* label below 720 px; the span already carries the full text as its `title`. Fields wrap as groups (Grid, Zoom, Length). | Below 320 px high, the velocity lane shrinks to `min(25cqh, its height)`, so the piano roll keeps most of the height. |
| **Clip, automation** | Below 600 px, the 240 px lane list collapses into a `<select>` of lanes above the curve, with the search box beside it. The canvas takes the full width. | The canvas height becomes `clamp(80px, 45cqh, 180px)` instead of a fixed 180 px, and the editor's `min-height: 260px` goes (the view's minimum covers it). |
| **Mixer** | The strips keep scrolling sideways (`data-scroll="x"`). The master strip is sticky on the right, so the master fader is always visible. | Names never shrink (`flex-shrink: 0`). Below 300 px high, the pan row and the sends drop out of track strips, keeping the name, mute and solo, the fader and the meter. |
| **Samples, list** | The toolbar's buttons don't wrap their labels, and the drop hint moves under them below 420 px. Below 420 px, a row becomes two lines: the waveform (`min(160px, 40cqw)`) and the name on the first; ▶, ✎, the two *New … track* buttons and × on the second. | Nothing: the list scrolls. |
| **Samples, sample editor** | The toolbar wraps without breaking labels. | The waveform is `min(150px, 40cqh)` high (the proposal's rule), so it stays in view at 280 × 200. The editor's hint line goes below 280 px high. |
| **Sounds** | No change: it fits at 280 px. Rows already wrap. | No change. |
| **Library** | Three columns down to 640 px. Below that, two (folders and items side by side, details below). Below 440 px, one: the folder tree becomes a `<select>` above the items, and details follow. Toolbar inputs take the full width. | No change: it scrolls. |

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

### The transport bar

It holds the page at about 1,124 px wide. It gets `flex-wrap` and lets the project name shrink to 120 px, so the
page stops scrolling sideways down to 1024 px. Nothing moves and nothing is restyled: below about 1100 px it simply
wraps to a second row. This is the only change outside `ui/layout` and the views (see the decisions).

### A VS Code-style default layout

Once the tool views fit 280 px, the default can have a primary sidebar. Proposed:

* the **primary sidebar** holds Samples, Sounds and Library. It is shown, but collapsed to its tab strip (about
  25 px), so the editor area keeps today's width until the user opens it, at 300 px. The activity bar's sidebar toggle
  and `revealView` open it, as they do for any collapsed border today;
* the **panel** keeps Instrument, Effects, Notes, Clip and Mixer;
* the **editor area** keeps Session and Arrangement;
* the secondary sidebar stays empty and hidden.

Saved layouts are kept, so existing browsers see no change until they choose *Reset layout*. New browsers, and *Reset
layout*, get the new default. `openSampleEditor`, *Import samples…* and the other intents reveal Samples in the
sidebar.

### Browser tests

* **`dockAtSize(page, title, { width?, height? })`** in `fixtures.ts`. It writes a stored layout that shows the view
  alone, then loads the page:
  * with a width, in the primary sidebar at that width (a border's size is exact);
  * with a height, in the panel at that height;
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
  * the page doesn't scroll sideways at 1024 px.

## Steps

Each step is one commit and leaves `npm test`, `npm run typecheck` and `npm run test:smoke` green. Steps 3 to 9 are
independent of each other once step 2 has landed.

1. **Minimum sizes in the shell.**
   * `viewMinSizes` in `view-titles.ts` and `minSize` on `ViewDescriptor`.
   * `viewTab` sets `minWidth` and `minHeight`.
   * `ViewHost`'s frame, with the minimum as CSS variables.
   * The `flex-theme.css` override for the editor area.
   * Sidebars at 300 px, the panel's size on its border.
   * Unit tests: the default layout's tabs carry the minimums, and a saved layout without them gets them.
   * The `layout.smoke.spec.ts` checks for sashes and overlap.
2. **Container queries, the rule test and the min-size spec.**
   * The frame becomes `container: view / size`.
   * The architecture test for `@media`, `vw`, `vh`, `innerWidth`, `innerHeight` and `matchMedia`.
   * `dockAtSize`, and `views-at-min-size.smoke.spec.ts` with Sounds and the empty Clip.
   * Re-run the `QuickAdd` placement check in the dev build (open it in a narrow Instrument near the window's edge).
3. **Library.** Three, two and one columns; the folder `<select>`; the toolbar. Joins the spec.
4. **Samples.** The toolbar; the two-line rows; the sample editor's waveform height and toolbar. Joins the spec with
   the list and the editor.
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
11. **The transport bar wraps** (if decided). The `layout.smoke.spec.ts` check for 1024 px.
12. **The default layout** (if decided).
    * `DEFAULT_LAYOUT` and `default-layout.ts` move Samples, Sounds and Library to the primary sidebar, collapsed.
    * Update `layout.smoke.spec.ts`'s expectations: the panel's neighbour after Mixer leaves it, and what *Reset
      layout* shows.
    * Check the specs that assume the panel holds Samples or Library.
13. **Profiling and docs.**
    * Run `scripts/profile-status.cjs` (`editor` and `four`) against round 2's numbers. Container queries and sticky
      cells add style and layout work, not React work: component renders must stay at 145 a second.
    * ARCHITECTURE.md § Layout and navigation: minimum sizes, the frame, the container-query rule, `data-scroll`, the
      graph-view store and the default layout.
    * [README.md](README.md) marks round 3 done. The roadmap notes what moved.

## Behavior changes

Intended:

* A view can't be dragged, or stepped with the keyboard, below its minimum. When the window is smaller than the
  minimums, editor groups shrink and their views scroll; today they slide under a sidebar once minimums exist, and
  without minimums they shrink to nothing.
* Sidebars open at 300 px instead of 460.
* Views have narrow and short layouts: wrapping toolbars, drawers, collapsed columns and lists, sticky scene and
  master columns. At the default layout and 1440 × 900 they look as today. The one exception is the Session grid's
  sticky headers and scene column, which only show a difference while scrolling.
* Graph editors get a *Properties* toggle when narrow.
* The remaining text-only empty states offer actions.
* Switching tracks brings back that graph's pan, zoom and open sub-patch for the session. Today each switch starts
  over.
* The transport bar wraps below about 1100 px instead of making the page scroll (if decided).
* New browsers and *Reset layout* get Samples, Sounds and Library in a collapsed primary sidebar (if decided).

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
* Profiling as in step 13.

## Decisions to sign off

| Question | Proposed | Notes |
|---|---|---|
| Minimum sizes | **280 × 200** for Samples, Sounds, Library and Mixer; **480 × 240** for Session, Arrangement, Instrument, Effects, Notes and Clip | The proposal's values, signed off as proposed in round 2 but left to this plan. One change: **Notes is an editor**, not a tool view. It is a graph editor and broke like Instrument (a 20 px canvas at 400 px). Consequence: a sidebar showing an editor is at least 480 px wide. |
| When the window is smaller than the minimums | **Editor groups shrink and their views scroll**; sidebars and the panel keep their minimums | flexlayout's own behavior lets groups slide under a sidebar (measured). The alternative is hiding sidebars automatically, as VS Code does, which needs code that watches the workbench's size and changes the user's layout behind their back. The override relies on flexlayout's inline styles, which the version pin and the `ui/layout`-only rule contain. |
| Sidebar width when a view is first dropped there | **300 px** | Today 460 px, inherited from the panel. |
| Patch canvas view per graph (round-2 row) | **In memory** | Persisting it would extend `sfxlab:layout` with project-specific track ids. Revisit if users ask. |
| VS Code-style default layout | **Yes**: Samples, Sounds and Library in the primary sidebar, **shown but collapsed**; the panel keeps Instrument, Effects, Notes, Clip and Mixer | Round 2 deferred it to this round. Alternatives: the sidebar **open on Samples** (the editor area loses 300 px from the start), or **today's default** (the sidebar stays a place users find by dragging). Saved layouts are untouched either way. |
| The transport bar | **Wrap it in this round** (step 11) | It makes the page scroll sideways below about 1,124 px, whatever the layout, so views can't be tested at small window sizes. The alternative is round 8's restyle. |
| Narrow Session and Mixer | **Keep scrolling sideways**, with the scene column, headers and master strip sticky | The alternative is reflowing them, for example a vertical mixer in a sidebar. That is a new design, not a narrow layout, and it would change how they look at every size. |
| Graph editors when narrow | **The property editor becomes a drawer** over the canvas, toggled from the toolbar, below 720 px | The proposal's §3. Alternatives: below the canvas (tall), or hidden with the selection shown in a popover. |
| Can a view be open twice (roadmap row, "decide in round 3") | **Not in round 3** | Nothing here needs it. The graph-view store is keyed by target, so pinned per-track editors later can reuse it. |
| `regionId` in the selection store (proposal §1) | **Round 4** | Only linked selection needs it. |
