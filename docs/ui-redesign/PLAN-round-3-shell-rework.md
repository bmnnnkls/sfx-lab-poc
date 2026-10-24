# Round 3: shell rework

Status: **plan**, 2026-10-24, decisions signed off: the first row by the user's own decision, the rest as proposed. Part of the
[UI redesign](README.md). Carries out [roadmap § Round 3](DRAFT-roadmap.md#round-3-shell-rework), which the review
of round 2's shell added on 2026-10-24. It comes before the views round, now
[round 4](PLAN-round-4-views.md), and overrides one round-2 decision: the panel stops being a flexlayout border.

## Goal

Rework the round-2 shell after using it. After this round:

* the sidebars run the full height of the workbench, from the transport bar to the status bar;
* the panel is a tab group in the layout. It collapses to its tab strip instead of disappearing, and can be split;
* the editor area and the panel each have a button that maximizes them inside the window, and back;
* the toggles for the sidebars and the panel sit at the right end of the panel's tab strip, and in the status bar's
  *Layout* menu;
* the activity bar holds Session, Arrangement, Wave editor and Library;
* the sample editor is its own view, *Wave editor*, in the editor area (today's editor; round 11 grows it);
* Sounds sits in the secondary sidebar by default, and sidebars open 300 px wide;
* layouts can be saved under a name and loaded again;
* the transport bar wraps instead of making the page scroll sideways.

**Out of scope:**

* minimum sizes, container queries and narrow layouts (round 4). Until then, a view docked in a sidebar looks as it
  does today. That's why Samples and Library stay in the panel by default for now;
* the Library folder tree (round 4, with Library's narrow layout);
* context menus throughout the app (round 5);
* track groups and the Tracks tree (rounds 7 and 8);
* pinned instrument and effects panels (round 9);
* keyboard shortcuts for the toggles and for maximizing (round 10's keybinding table);
* icons (round 13). The new buttons are text and glyphs, as round 2's are.

## Why the panel has to change

flexlayout lays out its borders in a fixed way: the top and bottom borders span the whole width, and the left and
right borders sit between them (`BorderContainer` in flexlayout 0.11.1; there is no attribute to change it). Round 2
made the panel the bottom border, so the sidebars always stop above it. Full-height sidebars are only possible if
the panel is not a border.

### Checked on the dev build

A stored layout with the sidebars as borders and the panel as a tab group under the editor area (`feat/ui-redesign`
at `3aaf4d7`, 1440 × 900):

* **Full height.** Both sidebars ran from below the transport bar to the status bar: 831 px high, with the panel
  only between them.
* **Collapse.** With `maxHeight: 0` on the panel's tab group, it shrank to its tab strip (25 px) and the editor area
  took the rest. flexlayout adds the tab strip to a tab group's maximum, so the strip stays visible and clickable.
* **Maximize.** flexlayout's own maximize button (`enableMaximize`) on the panel's tab group filled the layout with
  the panel and hid the editor area. The driver already understands a maximized tab group (round 2's `snapshot` and
  `reveal`).
* **Sounds in a 280 px right sidebar** read well. Round 4's measurements found it fits from 247 px.

The script is kept outside the repo with the session notes (`panel-tabset.cjs`).

## Design

### The panel as a tab group

* **Default layout.** The main layout's root row holds a column: the editor area's tab groups above, the panel's tab
  group (id `panel`) below. The sidebars stay borders (left, right). There is no bottom border any more.

  ```ts
  layout: { type: 'row', children: [{ type: 'row', children: [         // a column
    { type: 'tabset', id: 'editor', weight: 55, children: [session, arrangement, wave] },
    { type: 'tabset', id: 'panel', weight: 45, enableDeleteWhenEmpty: false, children: [instrument, …, library] },
  ] }] }
  ```

* **What "the panel" is.** The layout store's `RegionId` keeps `panel`. The panel is the tab group with id `panel`,
  wherever the user has moved it. Every other tab group in the main layout is the editor area. `GroupState.region`
  says which.
  * It can't be deleted when its last tab is dragged away (`enableDeleteWhenEmpty: false`), so `revealView` and the
    toggles always find it. An empty panel shows its tab strip only.
  * Users can split it (Clip beside Mixer, say) by dragging a tab to its edge. The new tab group is an editor-area
    group by this definition. See the decisions.
* **Collapsing.** The driver collapses the panel by setting `maxHeight: 0` on its tab group, and remembers the
  weight it had. Expanding clears `maxHeight` and restores the weight.
  * Selecting a tab of a collapsed panel, `revealView` of a panel view, and the panel's toggle expand it.
  * Clicking the panel's open tab collapses it, as clicking a sidebar's open tab already does (see the decisions).
  * The mirror counts a collapsed panel as a hidden region, so `visible` and the round-2 toggles keep their meaning.
  * Splitter drags can't open a collapsed panel; its maximum is the strip.
* **The panel's size** is a weight now, not pixels. Round 2's `DEFAULT_PANEL_SIZE` (460 px) becomes a default weight
  that gives about the same height at 1500 × 1000, the smoke tests' viewport. `MIN_PANEL_SIZE` goes; round 4's
  minimum sizes replace it.

### Maximize

* Every tab group in the main layout gets flexlayout's maximize button (`tabSetEnableMaximize: true`), styled through
  `flex-theme.css`. Double-clicking a tab strip does the same, as flexlayout already supports.
* A maximized tab group fills the main layout; the sidebars stay. Only one tab group can be maximized at a time.
* `revealView` of a view elsewhere restores first (round 2's driver already does this).
* **Not the browser's Fullscreen API.** Fullscreen on a view's element would hide every Radix menu, tooltip and toast,
  because they render into `document.body`, outside the fullscreen element. The browser's own full screen (F11, ⌃⌘F)
  combined with maximize covers the need.

### Toggles in the panel's tab strip

* `Workbench` passes flexlayout's `onRenderTabSet`. For the panel's tab group it adds three buttons at the right end
  of the strip, before maximize: primary sidebar ◧, panel ⬓, secondary sidebar ◨. They use `toggleRegion`, with
  `aria-pressed` as the activity bar's do today. The panel's own toggle collapses it to the strip it lives in, and
  expands it from there.
* The status bar's *Layout* menu keeps the same toggles and *Reset layout*. It is the fallback when the panel's strip
  isn't on screen (the editor area maximized) and the keyboard route.
* The activity bar loses its three toggles and *Reset layout* (now only in the *Layout* menu).

### Activity bar

Four buttons, in this order: **Session**, **Arrangement**, **Wave editor**, **Library**.

* A button reveals its view wherever it is docked (`revealView`).
* If the view is already the open tab of a sidebar, the button collapses that sidebar instead, as VS Code's
  activity bar does. In the editor area and the panel a second click does nothing.
* A button is marked while its view shows (`visible`), as Session and Arrangement are today.
* Round 7 adds **Tracks** here, for the Tracks tree.

### Wave editor

Today the sample editor replaces the Samples list when ✎ is clicked on a sample. It becomes a view of its own.

* `ViewId` gains `wave`, titled **Wave editor**, in the editor area's tab group by default.
* It shows `SampleEditor` for the selection store's `sampleId` (round 1 moved the target there). *Close* clears the
  selection, as today.
* `openSampleEditor` selects the sample and reveals `wave` instead of `samples`. The Samples view always shows its
  list.
* **Empty state** (round 1b's rule): "No sample is open." with the project's samples as buttons (up to eight, then
  *Show samples*) and **Import samples…**.
* Saved layouts don't have `wave`. The parser's existing repair puts it into its default region, the editor area.
* Round 11's wave editor replaces the inside of this view; the view, its id and its entry points stay.

### Default layout

* **Editor area:** Session, Arrangement, Wave editor.
* **Panel:** Instrument, Effects, Notes, Clip, Mixer, Samples, Library. Samples and Library move to the primary
  sidebar in round 4, once they fit it.
* **Secondary sidebar:** Sounds, shown but collapsed to its tab strip, so the editor area keeps its width until it is
  opened.
* **Primary sidebar:** empty and hidden, as today.
* **Sidebar width:** 300 px when first opened (today 460, inherited from the panel's height through `borderSize`).

### Saved layout version 2

* `sfxlab:layout` becomes `{ version: 2, model }`.
* A version-1 layout is migrated, not thrown away: its bottom border's tabs become the panel's tab group under the
  editor area, keeping their order and the open tab. The border's size becomes the panel's weight against the
  editor area, measured against 1000 px. A collapsed or hidden bottom border becomes a collapsed panel.
* The parser's checks stay as they are, plus: exactly one tab group with id `panel`; no bottom or top border.
* `useLayoutPersistence` saves a migrated layout at once, as it does for round 2's migration from the old keys.

### Named layouts

* **Save layout as…** in the *Layout* menu asks for a name and stores the current model under `sfxlab:layouts` as
  `{ version: 2, layouts: { [name]: model } }`. The same name overwrites, after a confirm.
* The menu lists the saved names. Choosing one loads it the way *Reset layout* loads the default (a new model and
  `generation`). A *Delete…* submenu removes one.
* Each saved layout goes through `parseStoredLayout` when it is loaded, so a layout saved before a later round's
  views still loads, with the new views repaired in.
* Per browser, like the layout itself. Built-in presets (*Compose*, *Mix*) can be added to the same list later.

### The transport bar

It holds the page at about 1,124 px wide (measured in round 4's survey). It gets `flex-wrap`, and the project name
can shrink to 120 px, so the page stops scrolling sideways down to 1024 px. Nothing is restyled: below about
1100 px it wraps to a second row.

### Browser tests

* `openView` keeps working: it clicks tabs. A collapsed panel expands when its tab is clicked.
* `dragView` and `dragViewToSidebar` keep working. A test that docked into the bottom border docks into the panel's
  tab group instead.
* `layout.smoke.spec.ts` changes and gains:
  * the sidebars span the workbench's full height;
  * the panel's toggle collapses it to its strip and expands it; clicking its open tab collapses it;
  * maximizing the editor area and the panel, and restoring;
  * the toggles in the panel's strip;
  * a version-1 layout in storage loads with its panel tabs and open tab kept;
  * saving a named layout, changing the layout, loading the name, and deleting it;
  * no sideways page scroll at 1024 px.
* A smoke spec for the Wave editor: ✎ on a sample opens it, *Close* empties it, the empty state's buttons work.

## Steps

Each step is one commit and leaves `npm test`, `npm run typecheck` and `npm run test:smoke` green.

1. **The panel as a tab group, layout version 2.**
   * `default-layout.ts` builds the column; `BORDER_LOCATIONS` loses `panel`.
   * The driver: the panel is the tab group with id `panel`; collapse and expand with `maxHeight` and the
     remembered weight; clicking the open tab collapses; the mirror counts a collapsed panel as hidden.
   * `layout-storage.ts`: version 2, the version-1 migration, the new checks. Unit tests for the migration (open,
     collapsed and hidden bottom borders) and for each new rejection.
   * Driver unit tests in Node, as in round 2: reveal into a collapsed panel, toggle, the open-tab click, an empty
     panel.
   * Update `layout.smoke.spec.ts` for the panel and add the full-height and migration checks.
2. **Maximize.** `tabSetEnableMaximize`, the theme, and the spec for both groups.
3. **Toggles in the panel's strip.** `onRenderTabSet`; the activity bar drops its toggles and *Reset layout*; the
   specs that clicked the activity bar's toggles use the strip or the *Layout* menu.
4. **Wave editor.** The `wave` view, `SampleEditor` moved out of `SamplesPanel`, `openSampleEditor` revealing it,
   its empty state, `ViewTitle` in `fixtures.ts`, and its smoke spec. The specs that edited a sample inside Samples
   open the Wave editor instead.
5. **Activity bar.** Wave editor and Library buttons; the collapse-on-second-click rule for sidebars.
6. **Default layout and sidebar width.** Sounds in the secondary sidebar, collapsed; `borderSize` 300. Specs that
   expect Sounds in the panel open it with `openView`, which already works anywhere.
7. **Named layouts.** Storage with unit tests (parse, overwrite, delete, a layout from an older version), the
   *Layout* menu entries, and the smoke check.
8. **The transport bar wraps**, with the 1024 px check.
9. **Profiling and docs.**
   * `scripts/profile-status.cjs` (`editor` and `four`) against round 2's numbers. The structure changed, the views
     didn't: component renders must stay at 145 a second.
   * ARCHITECTURE.md § Layout and navigation describes the panel as a tab group, collapse, maximize, the toggles,
     the activity bar, the Wave editor, layout version 2 and named layouts.
   * [README.md](README.md) marks round 3 done.

## Changes made while implementing

What turned out different from the design above, step by step.

* **Step 1: the default weight is 52, not 45.** Measured at 1500 × 1000 the layout is 931 px high; 52 of 100 gives
  the panel's views 457 px, round 2's 460. A height migrated from version 1 or from `sfxlab:editor-height` still
  becomes a weight against 1000 px (`panelWeightOf`), kept between 10 and 90.
* **Step 1: clicking the panel's open tab is caught before flexlayout.** flexlayout ignores a click on a tab group's
  open tab (borders toggle, tab groups don't), so `Workbench` listens in the capture phase and calls the driver's
  `clickTab`: on the panel's open tab it collapses the panel, on any open tab of a collapsed panel it expands it.
  Clicks on another tab go to flexlayout as before, and the driver's `intercept` adds the expand.
* **Step 1: a view in a collapsed panel is hidden by the mirror, not by flexlayout.** The panel keeps its open tab
  selected, so flexlayout's `visibility` event still says visible. `ViewTab` also asks the layout store, which
  counts the collapsed panel's open view as not visible, so `<Activity>` hides it and its Effects pause, as a
  collapsed border's did.
* **Step 1: a panel split sideways collapses with the groups beside it.** A row is only as tall as its shortest
  member, so `maxHeight: 0` on the panel shrinks the whole row it shares (Clip beside Mixer) to the strip. The
  driver treats that row as one band: its groups stay editor-area groups, as decided, but they count as hidden while
  the panel is collapsed, and selecting or revealing a view in them expands the panel. A panel with nothing above or
  below it (dragged beside the editor area) doesn't collapse: it would shrink the whole layout.
* **Step 1: the weight isn't remembered, it is kept.** `maxHeight` doesn't touch the panel's weight, so expanding
  restores the height by itself. The one thing that could change it, a drag on the pinned splitter beside a
  collapsed panel, is adjusted in `intercept`: the panel keeps its weight and the others are rescaled.
* **Step 1: a tab dropped into a collapsed panel expands it**, as a view dropped into a closed sidebar opens it
  (`borderAutoSelectTabWhenClosed`).
* **Step 1: empty tab groups were never deleted.** Round 2's `tabSetEnableClose: false` also stops flexlayout's tidy
  from deleting an emptied group, so `enableDeleteWhenEmpty: false` on the panel is a guard for later, not a fix.
  The parser applies it to every saved panel, like the global attributes.
* **Step 1: an emptied version-1 bottom border becomes a collapsed panel**, since an empty border was only a strip.
* **Step 1: the sidebars keep a minimum.** `MIN_PANEL_SIZE` went, but borders still need one until round 4, so
  `borderMinSize` is `MIN_SIDEBAR_SIZE` (180).
* **Step 1: `parseStoredLayout` returns `{ model, migrated }`**, so `useLayoutPersistence` saves a migrated layout at
  once.
* **Step 2: maximize was already on.** flexlayout's `tabSetEnableMaximize` defaults to true, and round 2's single
  editor group simply had nothing to maximize against. The attribute is now set on purpose, the button is themed,
  and its names are *Maximize* and *Restore* (flexlayout's "Maximize tabset", through `i18nTranslator`).
* **Step 2: the panel counts as hidden while another group is maximized**, so its toggle reads "off" and shows it by
  restoring the layout; hiding a maximized panel restores the others and collapses it.
* **Step 2: maximizing a collapsed panel expands it first.** A maximized group keeps its maximum height, so it would
  otherwise fill the layout with a 25 px strip. Double-clicking the panel's open tab clicks it twice (collapse,
  expand) before the double-click maximizes; the result is the same.
* **Step 3: the toggles stop the tab strip's own handling.** The strip starts drags on pointer down and maximizes on
  a double-click, so `RegionToggles` stops both. The Tab key's chrome rule now also covers the toggles
  (`data-region-toggles`) and flexlayout's tab group buttons (`button[data-layout-path]`), so Tab moves through
  them instead of switching Session and Arrangement.

## Behavior changes

Intended:

* The sidebars run the full height; the panel sits between them, under the editor area.
* The panel collapses to its tab strip instead of disappearing, and can be split.
* The editor area and the panel can be maximized inside the window.
* The panel and sidebar toggles move from the activity bar to the right end of the panel's tab strip; *Reset layout*
  is only in the *Layout* menu.
* The activity bar gains Wave editor and Library; clicking the button of a sidebar's open view collapses the sidebar.
* ✎ on a sample opens the Wave editor in the editor area; the Samples view always shows its list.
* New browsers and *Reset layout* get Sounds in a collapsed secondary sidebar and the Wave editor in the editor
  area. Saved layouts keep their arrangement, migrated to version 2.
* Sidebars open 300 px wide.
* Layouts can be saved under a name, loaded and deleted.
* The transport bar wraps below about 1100 px.

Anything else a reviewer notices is a bug in this round.

## Verification

* `npm test`, `npm run typecheck` and `npm run test:smoke` all pass. Run `npm run test:audio` once before merging.
* Manual pass on the dev build:
  * a round-2 layout in storage (one with views moved around, one with the panel hidden) loads as it was, with
    full-height sidebars;
  * collapsing, expanding, splitting and emptying the panel; maximizing both groups; *Reset layout*;
  * the toggles from the panel's strip and from the *Layout* menu, with the keyboard alone (Tab, F6);
  * every activity-bar button, in the default layout and with its view docked in a sidebar;
  * ✎ on a sample, and *Close*; the Wave editor's empty state;
  * saving, loading and deleting named layouts, then a reload;
  * a screen reader pass over the panel's strip buttons.
* Profiling as in step 9.

## Decisions to sign off

Signed off 2026-10-24: every row as proposed. The panel row is the user's own decision, made before the plan was written.

| Question | Decided | Notes |
|---|---|---|
| The panel: a bottom border, or a tab group in the layout | **Decided by the user on 2026-10-24: a tab group.** Overrides the round-2 row. | Needed for full-height sidebars (above). It also makes the panel splittable. |
| Hiding the panel | **Collapse to its tab strip**, never remove it | The toggles live in that strip, so it must stay. VS Code removes the panel entirely; our strip costs 25 px. |
| Clicking the panel's open tab | **Collapses it**, as for the sidebars | Consistent across regions. The alternative is that only the toggle collapses it, as in VS Code's panel. |
| A tab group split off the panel | **Belongs to the editor area** | Only the group with id `panel` is the panel. The alternative, a panel made of several groups, needs a rule for which group a toggle collapses. |
| "Fullscreen" for the editor area and the panel | **Maximize inside the window** (flexlayout's), not the browser's Fullscreen API | Element fullscreen hides every Radix menu and tooltip, which render into `document.body`. |
| Where the region toggles go | **The right end of the panel's tab strip**, and the *Layout* menu | The user's request, with the menu as the fallback when the strip is off screen. |
| *Reset layout* | **Only in the *Layout* menu** | It was in the activity bar; a destructive action shouldn't sit beside navigation. |
| Activity bar buttons | **Session, Arrangement, Wave editor, Library**; a second click collapses the view's sidebar | Round 7 adds Tracks. Library's button reveals it in the panel until round 4 moves it to the sidebar. |
| The Wave editor now | **Today's sample editor, moved into its own view** named *Wave editor* | The name is the round-11 view's. The alternative is *Sample editor* until round 11, and renaming then. |
| Sounds by default | **Secondary sidebar, shown but collapsed** | The user's request. The alternative is open, which takes 300 px from the editor area from the start. |
| Saved round-2 layouts | **Migrate** to version 2 | The alternative, falling back to the default, loses every user's arrangement. |
| Named layouts | **Per browser**, saved from the *Layout* menu, same name overwrites after a confirm | Like the layout itself. Built-in presets can join the list later. |
| The transport bar | **Wrap it in this round** | Moved here from round 4's plan: it is shell, and it holds the page at about 1,124 px. |
