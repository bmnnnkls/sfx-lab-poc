# UI redesign roadmap (draft)

Status: **draft**, 2026-10-24. Part of the [UI redesign](README.md). Round 1 has its own
[plan](PLAN-round-1-untangling.md); every later round gets a plan of its own before it starts, and this outline is
revised with what the previous round taught us.

## Target workbench

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Transport: ▶ ■ ● Touch · BPM · position · meter · undo/redo · File · MIDI   │
├──┬───────────────┬─────────────────────────────────────────┬───────────────┤
│A │ Primary       │ Editor area (tab groups, splittable)    │ Secondary     │
│c │ sidebar       │  Session · Arrangement · Wave editor ·  │ sidebar       │
│t │  Browser:     │  Instrument (Patcher) · …               │  Control      │
│i │  Samples,     │                                         │  panel /      │
│v │  Sounds,      ├─────────────────────────────────────────┤  inspector    │
│i │  Library      │ Panel: Clip · Instrument · Effects ·    │               │
│t │               │        Notes · Mixer                    │               │
│y │               │                                         │               │
├──┴───────────────┴─────────────────────────────────────────┴───────────────┤
│ Status bar: save state · audio load · MIDI · notifications                 │
└────────────────────────────────────────────────────────────────────────────┘
```

* **Activity bar** (left icon strip): switches the primary sidebar's content and opens the large views
  (Session, Arrangement, Wave editor) in the editor area. Clicking the active icon collapses the sidebar.
* **Every region toggles** (keyboard and menu); every view can be dragged into another region or tab group.
* **Layout presets:** *Compose* (session + clip), *Arrange* (arrangement + mixer), *Sound design*
  (patcher + panel + wave editor), *Mix* (mixer large). Plus **Reset layout**, always available.
* Large views open in the editor area by default; tool views in the sidebars and panel. Defaults only:
  the user can put anything anywhere.

## Round 2: the shell

Replace `Workspace` with a docking workbench that mounts the round-1 view registry.

* **Library decision (spike first).** Candidate: [dockview](https://dockview.dev) (React, no dependencies,
  tab groups, drag-to-dock, floating groups, popout windows, JSON-serializable layouts). Fallbacks: flexlayout-react,
  or our own fixed regions with toggles and tab drag (no free nesting). The spike is a throwaway branch that mounts
  three real views and is judged on:
  * pointer-capture gestures inside panels: node drag, piano roll, faders, region drag;
  * Radix context menus and dropdowns inside panels;
  * theming through our CSS variables;
  * keyboard and screen-reader access to tabs and splitters;
  * a render-only-visible mode;
  * bundle size;
  * Playwright selectors.
* **Layout model.** The docking library owns the layout tree. `state/layout-store` becomes a façade:
  `revealView` delegates to the library's API, and the store mirrors which views are visible for code that needs
  it. Callers from round 1 do not change.
* **Persistence.** The whole layout is saved per browser, versioned and validated, falling back to the default on
  anything unreadable, the same as `useStoredState`. The panel-tab question from round 1 is settled here.
* **Regions.** Activity bar, primary and secondary sidebars, editor area, panel, status bar. Move
  `SaveIndicator`, toasts and the audio-failure banner into the status bar where that reads better.
* **Rules.** The architecture test's `ui` allow-list gains the docking package. Consider a rule that only
  `ui/layout/` may import it.
* **Tests.** The `openView` helper learns the new chrome. Add a smoke spec for:
  * toggling regions,
  * moving a view and reloading,
  * reset layout,
  * a corrupt saved layout falling back to the default.

## Round 3: views that work anywhere

Work through the round-1 container audit, view by view.

* No view reads the window size. `Splitter` goes, or becomes a region-internal splitter measuring its container.
* Narrow and short layouts for the session grid, mixer, patcher toolbar, clip editor toolbar and samples list.
* State that should survive a hidden view moves to stores, e.g. arrangement zoom and scroll, clip editor zoom.
* Proper empty states ("Select a clip with ✎" and similar) that offer the action that fills them.
* Per-frame work (playheads, meters) pauses while a view is hidden.

## Round 4: working across views

The point of seeing several views at once.

* One drag-and-drop payload type for clips, samples, presets and library items, with drop targets in the session
  grid, arrangement lanes, tracks and the patcher.
* Drag a session slot onto an arrangement lane. This replaces the right-click workaround the architecture doc
  describes.
* Linked selection: selecting a region in the arrangement opens it in Clip, and selecting a track anywhere updates
  the inspector.

## Round 5: commands and keys

* A **command registry**: every view, region toggle, preset and common action, with an id and a title.
* A **command palette** (⌘⇧P / ⌘K), built on the matching already in the patcher's QuickAdd.
* Keybindings defined in one table, overridable by the user, shown in tooltips (`shortcut-labels.ts` exists).
* Menus (File, View) generated from the same registry.

## Round 6: wave editor

The biggest single piece, mostly beyond the UI. It needs its own SPEC before planning.

* **Data:**
  * a multi-resolution peak pyramid instead of today's 800 buckets per sample;
  * when zoomed in, draw the actual samples from the decoded buffer;
  * stereo samples (the model is mono-only today).
* **Editing:**
  * destructive, in-place edits with undo, replacing today's "every edit is a new library sample";
  * selections, markers and regions;
  * processing a selection (gain, fades with curves, normalize, reverse, silence, DC offset);
  * crossfades at edit points.
* **Views:**
  * waveform overview plus a detail view, with a time ruler in time and in beats;
  * a spectrogram once the FFT utility (H1 in TASKS) exists.
* **Entry points:**
  * the activity bar;
  * ✎ on a sample (round 1's `openSampleEditor` intent);
  * an audio clip or an arrangement region ("edit source").
* **Link:** the granular sampler (TASKS: sample editor stage 2) shares this view.

## Round 7: arrangement editor

Grows from the existing prototype. Follow-ups are already listed in [TASKS.md](../TASKS.md).

* Track headers (name, mute, solo, arm) docked beside the lanes, with vertical scroll kept in sync.
* Automation lanes on the timeline, and recording into the arrangement (touch recording, slice 3c).
* Loop brace, markers, follow-playhead, horizontal zoom to fit or to the selection.
* Opening a region in the clip editor and in the wave editor.

## Round 8: visual refresh and themes

Deliberately last, so it restyles a stable structure.

* Design tokens: spacing, type scale, radii, elevation and colour roles, built on the variables in `theme.css`.
* Remove the hard-coded colours (e.g. `MidiSettings.module.css`).
* A light theme, high-contrast, user accent colour; a density setting.
* One icon set for the activity bar, toolbars and node categories.

## Cross-cutting

* **Performance.** More views on screen means more React work per transport-status update. Status consumers
  stay narrow selectors, hidden views do not render, and a profiling pass with Session + Arrangement + Mixer
  visible is part of rounds 2 and 3. The DSP runs in the worklet, so the risk is UI smoothness, not dropouts.
* **Accessibility.**
  * Regions are landmarks; tabs follow the tab pattern.
  * Splitters are keyboard-operable, as `Splitter` is today.
  * Focus moves sensibly when views are revealed.
* **Popout windows** (second monitor). Possible with dockview because popouts share the JS realm, so the zustand
  stores just work. Later, after round 3, since every view must already be size-agnostic.
* **Tests.** Fresh browser contexts already give every spec the default layout; keep it that way, and add layout
  fixtures only where a spec needs a specific arrangement.

## Decisions to make (tracked here until settled)

| Question | Proposed | Decide in |
|---|---|---|
| Docking library or own regions | dockview, subject to the spike | round 2 |
| Layout saved per browser or per project | per browser | round 2 |
| Can a view be open twice (e.g. two patchers on different tracks)? | not yet: one instance of each view; pinned per-entity editor tabs later | round 3 |
| Wave editor: destructive edits vs. derived samples | destructive with undo, original kept until project save | round 6 SPEC |
| Stereo samples throughout the engine, or only in the editor | throughout (needed for the wave editor to be honest) | round 6 SPEC |
