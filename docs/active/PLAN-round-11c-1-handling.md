---
status: active
date: 2026-10-31
note: "Plan signed off 2026-10-31 as proposed; not started. Part 1 of the handling-and-spectrum spec: toolbar, right-click menu, keys, mouse."
---
# Round 11c, part 1: handling

Status: **plan, signed off** 2026-10-31, every decision as proposed. Written 2026-10-31. Part of the [UI redesign](ui-redesign-roadmap.md). Carries out
part 1 of the signed-off [handling and spectrum spec](SPEC-wave-editor-handling-and-spectrum.md) (§ Suggested split):
its sections 1 to 4, the grouped toolbar, the right-click menu, the keys and the mouse. The inventory was taken on
`feat/ui-redesign` at `1780890` (round 11b done). The spec's decisions are settled and not repeated here; this plan only
adds the ones it raises. Where it differs from the spec, it says so.

## Goal

The wave editor is quick to work in, and its toolbar has room to grow. After this part:

* **one grouped toolbar line:** ▶ and *Loop*; *Cut*, *Copy*, *Paste*, *Delete*, *Crop*; *Process ▾*; *View ▾*; the
  sample's name, length, rate and channels; ⚙ for the crossfade and *Edits make copies*; ×;
* **a status bar** with the cursor or the selection, the selection's peak and RMS, and the gesture hint;
* **a level scale** beside each lane;
* **a right-click menu** on the lanes, built from a new `sample-selection` subject's actions;
* **Delete, ⌘C, ⌘X and ⌘V** work on the selection with the lanes focused, and the palette lists the editor's actions;
* **view keys:** ⌘A, Escape, arrows, Shift+arrows, Alt+arrows, Home, End, + and −, Z, Shift+Z, P;
* **the mouse:** middle-drag pans, selection edges drag, dragging past the edge scrolls, a double-click selects all of
  a channel.

**Out of scope** (the spec's later parts):

* markers, regions, snap, *Revert to original* (part 2);
* the second pane and the `pane` in the view key (part 3);
* lane modes and the spectrogram (11d). This part adds the renderer's `scale` function only for the level scale.

## Inventory

What part 1 touches, beyond the spec's inventory.

### The edit logic is inside the toolbar

`EditToolbar.tsx` (199 lines) holds everything an edit needs before `SampleLibrary.editSample`:

* `context()` builds the `SampleEditContext` from the selection, cursor, clipboard, the audio's length and rate, and
  four **per-browser values held in the component** with `useStoredState`: *Edits make copies*
  (`sfxlab:wave-edit-copies`), the crossfade (`sfxlab:wave-crossfade`), the fade curve (`sfxlab:wave-fade-curve`) and a
  popover's last values (`sfxlab:wave-edit-settings`);
* `blocked(entry)` says why an edit can't run (busy, no audio, no selection, empty clipboard, one channel of a
  length-changing edit);
* *Cut* is `copyWaveSelection` then the `delete` entry; *Copy* is `copyWaveSelection` alone;
* `asking` (component state) is which edit's `EditSettings` popover is open.

Actions live in `state` and can't reach any of it. **`state` may not touch `localStorage`** (only `storage` may; `ui`
uses `useStoredState`), so the four values have to move into a store that `ui` fills and saves.

### Subjects, menus and keys

* `ActionMenu` (`ui/shared/menu`) draws a subject's actions as a right-click menu, and its trigger records the subject
  (`recordMenuSubject`), so `focusSubjects(element)` finds it from the focused element. `useKeybindings` passes that
  list to the edit commands, which call `runVerb`. This is all the edit keys need: a focusable element inside an
  `ActionMenu` with a `sample-selection` subject.
* An action's `group` is one of `open`, `edit`, `clipboard`, `delete`; groups only place separators. An action with
  `choices` draws as **one level** of submenu (or inline entries). The palette shows one row per choice.
* The piano roll does the same work differently: its menu is a `ContextMenu` with its own entries, and ⌘A, ⌘C, ⌘X, ⌘V,
  ⌘D, Delete, arrows and Escape are its own `onKeyDown`. `VIEW_KEYS` lists them read only.
* `PopupMenu` (a Radix dropdown) takes `MenuEntry`s, which **can** nest submenus. The *File* and *View* menus use it.

### Tests that name the toolbar's buttons

* `wave-editor.smoke.spec.ts`: *Cut*, *Paste*, *Gain…*, *Zoom to selection*, *Loop*, *Play from cursor*, *Close*.
* `arrangement.smoke.spec.ts`: *Reverse*, *Edits make copies* (with `aria-pressed`).
* `scripts/profile-status.cjs` (`wave`): *Loop*, *Play from cursor*, and `EditToolbar` and `EditSettings` among the
  watched components. 11b's figure for the `wave` case is 56 component renders a second.
* `views-at-min-size.smoke.spec.ts` checks that a view's main controls show inside its box.

## Design

### The edit logic in `state` (`state/wave-edits.ts`)

* **`useWaveEditSettings`**, a store with `asCopy`, `crossfade`, `fadeCurve` and `lastValues` (by kind), with setters
  and the same validators as today. `ui` loads it from the **same four `localStorage` keys** once, when the Wave editor
  view mounts, and saves each change (`useWaveEditSettingsStorage()`, in `ui/wave-editor`), so nobody loses a setting.
* **`waveEditContext(sample, wave, view)`**, **`waveEditBlocked(entry, …)`**, **`runWaveEdit(entry, variant?,
  values?)`**, **`copyWave()`** and **`cutWave()`** read the open sample, its working copy and view from the stores,
  and call `SampleLibrary.editSample` (passed in, as actions get it from `ActionContext`). The toolbar, the actions and
  the keys all call these; nothing else builds an edit.
* **`asking`** moves to the view store: `useWaveEditorStore.ask(key, kind | null)`. The toolbar draws the
  `EditSettings` popover for it, so a menu entry, a palette row and a toolbar entry all open the same popover, in the
  same place (under the toolbar).

### The subject and its actions (`state/actions/sample-selection.ts`)

* **`{ kind: 'sample-selection', sampleId }`**, the open sample. The spec's `pane` comes with part 3, which needs it;
  until then there is one pane. `subject-name` calls it "Selection in *name*".
* **Actions,** in order:

  | Group | Actions |
  |---|---|
  | `clipboard` | `wave.cut` (verb `cut`), `wave.copy` (`copy`), `wave.paste` (`paste`) |
  | `edit` | `wave.delete` (`delete`), `wave.crop` |
  | `process` (new) | one per `process` entry of `SAMPLE_EDITS`, and *Insert silence…*. *Fade in* and *Fade out* take `choices`, one per `FADE_CURVES` row, the last used first and marked |
  | `view` (new) | `wave.select-all`, `wave.zoom-selection`, `wave.zoom-fit`, `wave.play` (*Play selection*, *Play from cursor*, or *Stop*) |

  `enabled` is `waveEditBlocked(…) === null`; `tooltip` is the reason when blocked, the entry's tooltip otherwise.
  An entry with settings runs `ask` instead of the edit. The two new groups are added to `Action['group']`.
* **The process entries come from the registry,** as the toolbar's do: a new `process` entry in `SAMPLE_EDITS` gets an
  action with no other change. `sample-selection.ts` builds them with one function, so a test can check the list
  against the registry.

### The right-click menu and the focus

* `DetailView` is wrapped in an `ActionMenu` with the subject while a sample is open. It gets `tabIndex={0}`, a focus
  ring, and takes the focus on a press, as the piano roll's surface does.
* **`menuTargetAt(view, selection, frame, channel)`** (`ui/wave-editor/wave-geometry.ts`) is the right-click rule: a
  press inside the selection, on a channel it covers, keeps it; anywhere else clears it and sets the cursor to the
  frame. `onContextMenu` runs it before the menu opens.
* **Zoom actions need the detail's width.** The actions call `useWaveEditorStore.zoom(key, range | 'fit')`, which sets a
  `zoomPending`-like request (`zoomTo`), and the editor resolves it against its width in an animation frame, as
  `reveal` already does. One path for buttons, menu entries, keys and entry points.

### The toolbar (`EditToolbar` and `SampleEditor`)

```
[▶] [Loop] │ [Cut] [Copy] [Paste] [Delete] [Crop] │ [Process ▾] [View ▾] │ name · 0:04.000 · 44.1 kHz · stereo │ [⚙] [×]
```

* One line, groups separated by a hairline. It wraps **a whole group at a time** (`flex-wrap` on the groups, `nowrap`
  inside one); the sideways-scrolling second row goes.
* **Process ▾** is a `PopupMenu` built from the same function as the actions (so the menu and the right-click menu
  can't differ), with *Fade in* and *Fade out* as submenus of curves.
* **View ▾:** *Zoom to selection*, *Zoom to fit*, then *Time* / *Beats* as two checked entries, then the beat tempo
  (*Project tempo* / *Tempo from the name*), checked.
* **⚙** opens a panel styled like `EditSettings`: the crossfade length and curve, and *Edits make copies* as a
  checkbox. `aria-label="Editor settings"`.
* **×** replaces *Close*, `aria-label="Close sample"`.
* **The sample's facts** are quiet text: the name (bold, truncated with an ellipsis and a tooltip), the length
  (m:ss.mmm), the rate and *mono* / *stereo*.
* No new icons (spec, § Out of scope): ▶, ■, ▾, ⚙ and × are text, as the app draws ▶ and ■ now.

### The status bar and the level scale

* **Fields:** the cursor, or the selection's range, length and channels (as now); the selection's **peak** and **RMS**
  in dBFS; on the right, the hint "Scroll to move · Ctrl/⌘ + scroll to zoom · Middle-drag to pan".
* **`selectionLevels(audio, range, channels)`** in `core/sample/audio-math.ts`: the peak and RMS of the range, the
  loudest of the channels. It runs when the selection settles (pointer up, a key, an edit), never during a drag, and
  the status bar shows "…" meanwhile. The step measures it for 120 s of stereo; past 20 ms, the peak comes from the
  pyramid and only the RMS from the audio.
* **The level scale:** a 28 px gutter at the left of each lane with 0, −6, −12 and −∞ dB marks (one line each, labels
  where there is room). `LaneRenderer` becomes `{ draw, scale }`; the waveform's `scale` draws the marks. The gutter is
  its own canvas, redrawn only on resize, so zoom and scroll don't touch it.

### Keys

* **Edit keys** through the subject: Delete and Backspace (`wave.delete`), ⌘C, ⌘X, ⌘V. Nothing to add to
  `DEFAULT_KEYS`.
* **View keys** in `DetailView`'s `onKeyDown`, as the piano roll's are, through one pure function,
  **`waveKeyAction(key, view, frames, width)`**, which returns what to do (a new cursor, a selection, a zoom, select
  all, clear, play) or nothing. The handler applies it and prevents the default only then.

  | Keys | Action |
  |---|---|
  | ⌘A | Select all, on the channels the selection had, else both |
  | Escape | Clear the selection; the cursor goes to its start |
  | ← → | Cursor one column; with a selection, collapse it to that side |
  | Shift+← → | Extend the selection one column from the cursor's side |
  | Alt+← → | Cursor a tenth of the view |
  | Home, End | Cursor to the start or end; with Shift, extend the selection there |
  | + or =, − | Zoom in or out by `WHEEL_ZOOM`² around the cursor (or the view's middle when the cursor is outside it) |
  | Z, Shift+Z | Zoom to the selection, zoom to fit |
  | P | Play the selection or from the cursor; again to stop |

  The view follows the cursor: a key that moves it outside the view scrolls the view by the least that shows it.
* **`VIEW_KEYS`** gets *Wave editor* rows, so the shortcuts dialog lists them.

### The mouse (`DetailView`)

* **Middle-drag pans:** `onPointerDownCapture` with button 1, as the patcher does; pointer capture, `cursor: grabbing`,
  `startFrame` follows the drag (`resolveView` clamps it). Releasing doesn't move the cursor.
* **Edge drag:** on pointer move without a drag, within `EDGE_PX` (4) of a selection edge on a channel it covers, the
  element's `style.cursor` becomes `ew-resize` (set directly, not through React). A press there drags that edge; the
  other edge is the anchor. `selectionEdgeAt(view, selection, x, channel)` is the hit test.
* **Auto-scroll:** while a selection or an edge is dragged with the pointer past the left or right edge, an
  animation-frame loop scrolls by `autoScrollFrames(distancePx, framesPerPixel)` (a tenth of the distance in columns a
  frame, at most a quarter of the view) and extends the selection to the edge's frame. It stops on release, cancel, or
  when the pointer comes back.
* **Double-click** selects the whole sample on the channel rule a drag uses (`channelsAt`).
* **The wheel stays as it is** (spec). The hint is the change.

## Steps

Each step lands green: `npm test`, `npm run typecheck`, `npm run test:smoke` (outside the sandbox: it needs local
ports). No step changes engine code, so the bounce hashes in `old-projects.test.ts` hold without `test:audio`.

1. **The edit logic and its settings in `state`.** `state/wave-edits.ts`, `useWaveEditSettings`, the storage hook in
   `ui`, `ask` and `zoom` in the view store; `EditToolbar` calls them and looks the same.
   *Tests:* `waveEditBlocked` as a table (busy, no audio, no selection, empty clipboard, one channel of a
   length-changing edit, mono); `waveEditContext` against today's for a mono and a stereo sample; the settings store
   reads the four existing keys (a fixture with today's JSON) and refuses bad values; `zoom` resolves once.
   *Browser:* the existing wave editor specs pass unchanged.
2. **The subject, its actions, the right-click menu and the edit keys.** `sample-selection` actions, the two groups,
   `subject-name`, `ActionMenu` around the lanes, focus on press, `menuTargetAt`.
   *Tests:* the process actions match the registry's `process` entries one for one; each action's `enabled` and
   `tooltip` with and without a selection, a clipboard, a one-channel selection and a running edit; `verbTarget`
   finds `wave.delete`, `wave.copy`, `wave.cut` and `wave.paste` from the lanes' subject; `menuTargetAt` inside,
   outside, and on a channel the selection doesn't cover.
   *Browser* (`wave-editor.smoke.spec.ts`): right-click inside a selection → *Cut*, click elsewhere, ⌘V, and the length
   is back; right-click outside a selection moves the cursor and clears it; Delete with the lanes focused deletes the
   selection, and Delete in the project name field doesn't; the palette lists *Gain…* with the lanes focused.
3. **The grouped toolbar, the status bar and the level scale.** `EditToolbar` and `SampleEditor` rebuilt; *Process ▾*,
   *View ▾*, ⚙, ×; `selectionLevels`; `LaneRenderer` with `scale`; CSS.
   *Tests:* `selectionLevels` against a brute force (silence, a full-scale square, a stereo pair with different
   levels, a one-channel range); the toolbar's *Process ▾* lists the registry's entries.
   *Browser:* the specs that click *Reverse*, *Gain…* and *Edits make copies* go through *Process ▾* and ⚙;
   `views-at-min-size` passes with the wave editor at its minimum size (the toolbar wraps by group, nothing is cut
   off); the status bar shows a peak for a selection.
   *Measure:* `selectionLevels` on 120 s of stereo in Chromium.
4. **View keys.** `waveKeyAction`, the handler, view-follows-cursor, `VIEW_KEYS` rows.
   *Tests:* `waveKeyAction` as a table for every row, at the sample's ends, with and without a selection, mono and
   stereo; the view follows a cursor moved past either edge.
   *Browser:* Shift+→ ten times selects ten columns; Z zooms to it (the overview's box narrows); Escape clears it; P
   starts and stops the preview; the shortcuts dialog lists the *Wave editor* rows.
5. **The mouse.** Middle-drag pan, edge drag, auto-scroll, double-click.
   *Tests:* `selectionEdgeAt` (each edge, between them, the wrong channel, a selection narrower than two `EDGE_PX`);
   `autoScrollFrames` (zero inside, growing with distance, capped).
   *Browser:* a middle-drag to the left moves the view right and leaves the cursor; dragging a selection's right edge
   widens it; a drag to past the right edge of a zoomed view scrolls and selects to there; a double-click on the left
   lane's top quarter selects all of the left channel.
6. **Docs and the profile.** `architecture/samples-and-wave-editor.md` (§ The sample editor: the toolbar, the menu, the
   keys, the gestures, `state/wave-edits.ts`), `architecture/workbench.md` (the subject's row in the actions table);
   this plan's "Changes made while implementing", sorted per [doc-workflow](../dev/doc-workflow.md); STATUS and
   BACKLOG; the profile.

## Behavior changes

* The toolbar is one grouped line. The processes and *Insert silence…* are in *Process ▾*; the zoom buttons and the
  ruler's mode in *View ▾*; the crossfade and *Edits make copies* behind ⚙; *Close* is ×.
* *Fade in* and *Fade out* take their curve from a submenu each time; the toolbar's curve `select` goes. The last used
  curve is still remembered and listed first.
* Right-clicking the lanes opens a menu. The lanes take the focus on a press, and with it Delete, Backspace, ⌘C, ⌘X
  and ⌘V act on the selection (before, they did nothing there).
* The view keys and the mouse gestures above are new. The wheel is unchanged.
* The status bar shows the selection's peak and RMS and the gesture hint.
* Settings made before are kept (the same `localStorage` keys).

## Verification

* `npm test`, `npm run typecheck`, `npm run test:smoke` at every step.
* **Profiling:** `scripts/profile-status.cjs` `wave` must stay at 11b's 56 component renders a second, with the preview
  playing; the setup's *Loop* and *Play from cursor* clicks still work (they stay buttons). `EditToolbar` reads
  `useWaveEditSettings` with narrow selectors, so a playing preview renders nothing new. The status bar's levels are
  computed on settle, not per status frame.
* **Manual pass** in Chrome, and Firefox and Safari where they can be run (V3 isn't done): every key in the table and
  the edit keys with the focus on the lanes, on the toolbar, and in the project name field; middle-drag on a mouse;
  edge drags and auto-scroll on a trackpad; the right-click menu with Shift+F10.
* **Measures** recorded in "Changes made while implementing": `selectionLevels` for 120 s stereo.

## Decisions to sign off

Signed off 2026-10-31: every row as proposed.

| Question | Proposed | Alternative |
|---|---|---|
| Where the edit logic and its settings live | **In `state`** (`wave-edits.ts`, `useWaveEditSettings`), filled and saved by `ui` under today's keys, so the toolbar, menu, palette and keys share one path | Keep them in the toolbar, and have actions reach it through an event the mounted toolbar listens to |
| The processes in the right-click menu | **A group of their own, flat,** with *Fade in* and *Fade out* as curve submenus. An action's choices nest one level; a *Process ▸* submenu would need two. *Process ▾* on the toolbar is a submenu, as the spec says | Teach `ActionMenu` to fold a group into a submenu, so the right-click menu also has *Process ▸* |
| The subject's `pane` | **Added in part 3,** with the second pane | Added now, always `main` |
| ⌘A, Escape, arrows, Z, P | **View-local keys** in the lanes' `onKeyDown`, listed in `VIEW_KEYS`, as the piano roll does | Commands in `DEFAULT_KEYS`, so the user can rebind them; more to build for keys only one view uses |
| Where a popover opens from a menu or the palette | **Under the toolbar,** always, as from the toolbar | At the pointer |
| Peak and RMS | **Computed when the selection settles,** "…" during a drag | Live during a drag |
| The fade curve | **Chosen from a submenu at each fade,** the last used listed first | Keep a curve setting (in ⚙) and one *Fade in* / *Fade out* entry each |
| The toolbar's glyphs | **Text glyphs** (▶ ■ ▾ ⚙ ×) until round 13 brings an icon set | Add a small inline SVG set now |

## Changes made while implementing

Nothing yet.
