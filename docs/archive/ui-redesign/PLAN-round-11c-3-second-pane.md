---
status: done
date: 2026-10-31
shipped_in: architecture/samples-and-wave-editor.md
note: "Part 3 of the handling-and-spectrum spec: a second pane in the wave editor. The hand pass in browsers is BACKLOG V10."
---
# Round 11c, part 3: a second pane

Status: **done** 2026-10-31; plan signed off 2026-10-31, every decision as proposed. Written 2026-10-31. Part of the
[UI redesign](README.md). Carries out part 3 of the signed-off [handling and spectrum
spec](../../active/SPEC-wave-editor-handling-and-spectrum.md) (§ 6, § Suggested
split): a second pane under the first, showing the same sample at its own place or another sample, for navigating and
for copying from one into the other. The inventory was taken on `feat/ui-redesign` at `2d94ad4` (round 11c parts 1
and 2 done). The spec's decisions are settled and not repeated here; this plan adds the ones it leaves open, in
§ Decisions to sign off.

## Goal

After this part:

* ***View ▾ → Second pane*** adds a pane under the first, with its own overview, ruler, mark lane, lanes and status
  bar; a splitter between them sets their heights. Off by default; open or closed, its sample and its height are
  remembered per browser;
* **the second pane shows the first pane's sample** (at its own zoom, scroll, cursor and selection) **or one picked
  from a menu on its name**;
* **the active pane** (pressed or focused last) has the accent on its border, and is what ▶, the toolbar, *Process ▾*,
  *View ▾* and the palette act on; each pane's lanes and mark lane keep their own right-click menu and keys;
* **copy in one pane, paste in the other,** through the clipboard that is already shared;
* **an edit in either pane** moves every pane showing that sample onto the result; a pane that wasn't edited keeps
  looking at the same audio;
* **memory:** a second working copy only while the second pane shows another sample than the first.

**Out of scope:**

* the spectrum (11d);
* linked scrolling or zoom between the panes, a third pane, panes side by side (§ Decisions);
* dragging audio from one pane into the other: copy and paste is the way (the spec's wish *Drag a selection out*).

## Inventory

What part 3 touches, beyond the spec's inventory.

### One view key per sample

* **`useWaveEditorStore.views`** (`state/wave-editor-store.ts`) is keyed by the sample's origin (`originOf`), in memory
  only: not saved, not undone. Every reader derives the key from the sample, so **two views of one sample would share
  zoom, scroll, cursor and selection**. Readers: `openWave` (`state/wave-edits.ts`), `SampleEditor`,
  `openSampleEditor` (`state/navigation.ts`, which reveals a clip's trim), and in `app/sample-library.ts` `moveEditor`,
  `clampView`, `follow` and `runRevert`.
* **`WaveAudio.viewKey`** carries the key with the working copy, and everything under `SampleEditor` reads it from
  there: `DetailView`, `Overview`, `Ruler`, `MarkLane`, `useWaveGestures`, `useMarkGestures`, `currentView`, `snap.ts`.
  Mark drags' merge keys include it (`marker:<viewKey>:<id>`).

### One working copy

* **`useWaveAudioStore`** (`state/wave-audio-store.ts`) has one `current` working copy, one `loading` and one `editing`
  (one edit runs at a time). `openAudio` in `app/sample-library.ts` fills `current` from
  `useSelectionStore.sampleId`; when the editor lets a copy go, it is kept in `copies` (`app/working-copies.ts`,
  `WORKING_COPY_CACHE_BYTES`, 128 MB) and reused when the sample opens again.
* **`audioOf`** (the audio an edit starts from) takes the working copy when it is the edited sample's, else the cache,
  else decodes the stored bytes.
* **After an edit**, `moveEditor` puts the result in `current`, copies the view to the result's origin when *Edits make
  copies* made a new one, applies `afterEdit`'s selection and cursor, and clamps; `runEdit` then selects the result
  (`selectSample`) if the editor had the sample open. **`follow`** moves the editor onto the sample with the same
  origin when an undo or redo takes its id away, and clamps the view. `runRevert` does the same for a revert.

### Subjects without a pane

* `sample-selection`, `sample-marker`, `sample-region` and `sample-loop` (`state/actions/types.ts`) carry `sampleId`
  (and the mark's id). Each action finds its view through `openWave(sampleId)`. *Go to*, *Select*, *Zoom to*, the
  edits' cursor and selection, the settings popover (`asking`) and the mark lane's rename field all live in that view.
* **Focus finds the subject:** `DetailView` and `MarkLane` are `ActionMenu` triggers; `focusSubjects` reads the
  innermost trigger around the focus when a key is pressed or the palette opens. A second pane's triggers would give
  their own subjects with no other change.
* `SampleLibrary.editSample(sampleId, edit, { asCopy })` and `revertSample(sampleId)` don't know which view asked.

### The editor's layout

* **`SampleEditor`** is one grid (`.editor`: two columns, the 28 px scales and the rest; rows toolbar, overview 48 px,
  ruler 18 px, mark lane 20 px (6 px folded under 300 px of height), lanes, status bar). The toolbar's groups are
  preview, the edit buttons (`EditToolbar`), the menus (`ProcessMenu`, `ViewMenu`), the sample's facts (name, length,
  rate, channels), and ⚙ and ×. Each takes the one sample and its selection.
* **The playhead** (`WavePlayhead`) shows where the preview of *its sample* is; the engine plays one preview at a time.
* **No splitter inside a view exists.** The docking shell's splitters are flexlayout's, `role="separator"`, which
  `isChromeTarget` (`ui/commands/scopes.ts`) already treats as chrome (Tab moves the focus as usual).
* **Settings shared by the editor:** the ruler's mode and tempo (`sfxlab:wave-ruler`, `sfxlab:wave-ruler-tempo`),
  *Loop*, the snaps, the edit settings. Per-browser state is kept by a `ui` hook (`use-wave-edit-settings-storage.ts`),
  since `state` doesn't touch `localStorage`.

### Tests and numbers to hold

* `wave-editor.smoke.spec.ts`, `wave-marks.smoke.spec.ts`, `views-at-min-size.smoke.spec.ts` (480 × 240),
  `app/sample-library.test.ts` (edits, follow, revert), `state/wave-editor-store.test.ts`.
* The `wave` profile (`scripts/profile-status.cjs`): 56 component renders a second with the preview playing, of which
  `WavePlayhead` is 29 (the status rate) and `LevelMeter` 27; the editor's own components render 0 times.

## Design

### Pane ids and view keys (`state`)

* **`WavePane = 'main' | 'second'`** and **`waveViewKey(pane, origin)`** → `main:<origin>`, `second:<origin>`. Every
  reader above takes its key from it; nothing else builds a key. A third pane would be another id.
* **`openWave(sampleId, pane)`**: the sample, the pane's working copy if it holds that sample, the pane's key and view.
  The default stays `main`, so callers outside the editor (entry points, the palette with nothing focused) are
  unchanged.
* **The four subjects gain `pane`**: `{ kind: 'sample-selection', sampleId, pane }`, and the same on `sample-marker`,
  `sample-region` and `sample-loop`, so *Go to*, *Select* and *Zoom to region* act on the pane they were invoked from.
  Names are unchanged ("Selection in *Kick*"). `commitRename` ignores the pane (a name is the sample's); the mark lane
  shows its rename field only when the renaming subject's pane is its own.

### The panes' state (`state/wave-panes.ts`)

* **`useWavePanesStore`**: `second: { open, sampleId, share }` and `active: WavePane`. `sampleId` null means *the
  first pane's sample*; `share` is the first pane's part of the height (0.5 by default).
* **Which sample a pane shows:** the first pane, `useSelectionStore.sampleId` (as now). The second, its `sampleId` if
  the project has it, else the first pane's.
* **Per browser:** a `ui` hook, `use-wave-panes-storage.ts`, keeps `second` under one key, `sfxlab:wave-second-pane`
  (the snap settings' pattern). `active` is not stored: it starts at the first pane.

### Two working copies (`state`, `app`)

* **`useWaveAudioStore`** holds a working copy per pane, `panes: Record<WavePane, WaveAudio | null>`, and `loading`
  per pane; `editing` stays one (one edit runs at a time, in either pane).
* **`openAudio` per pane.** A pane showing the same sample as another **shares its audio and pyramid** (a `WaveAudio`
  with its own `viewKey`, nothing decoded or allocated); otherwise it loads as now, from the cache or the stored bytes.
  A copy no pane holds any more goes to `copies`, as now. So two 120 s stereo samples cost two copies (up to 92 MB),
  one sample in both panes costs one.
* **Edits and reverts name their pane:** `editSample(sampleId, edit, { asCopy, pane })` and `revertSample(sampleId,
  pane)`, from the subject. `audioOf` looks in every pane.
* **After an edit, every pane showing that sample moves:**
  * **the edited pane** as now: onto the result, with `afterEdit`'s selection and cursor;
  * **another pane on the same sample** moves onto the same result (sharing its audio), and its cursor, selection and
    scroll go through the edit's remap, so it keeps looking at the same audio; a selection the edit removed goes. With
    *Edits make copies* the edited pane moves to the copy and the other stays on the original, which didn't change.
  * the second pane's `sampleId` follows its sample's new id, as `selectSample` does for the first.
* **`follow` per pane** (undo and redo): a pane whose sample left the project moves to the sample with the same origin,
  else the second pane falls back to the first pane's sample, and the first shows the empty state, as now. A revert
  moves every pane showing the sample, as an edit does.

### The pane (`ui/wave-editor/WavePane.tsx`)

* **`SampleEditor` splits** into the toolbar and one or two **`WavePane`s**. A pane is what is under the toolbar now:
  overview, ruler, mark lane, the scales and lanes, the status bar, taking `pane` and building its subjects with it.
  `DetailView`, `MarkLane` and the gestures are unchanged apart from the subject's `pane`.
* **The toolbar acts on the active pane:** ▶ and *Loop*, `EditToolbar`, *Process ▾*, *View ▾* (its zooms) and the
  settings popover take the active pane's sample, working copy and selection. One toolbar, as the spec has it.
* **Names while split:** with the second pane open, each pane gets a **title row** (20 px) with its sample's name as a
  menu button and its facts (length, rate, channels), and the toolbar's facts group hides. The menu lists the project's
  samples (the shown one checked); the second pane's starts with *Same as the first pane* (checked while `sampleId` is
  null). Picking one in the first pane opens it as ✎ would (`selectSample`); in the second, sets `sampleId`. The second
  pane's title row ends with × (*Close the second pane*). With one pane, the editor looks as now.
* **Active:** a press or focus inside a pane makes it active (`onPointerDownCapture`, `onFocusCapture`). While split,
  the active pane has a 1 px accent border, the other the plain one. Closing the second pane makes the first active.
* **The playhead** shows in every pane showing the previewed sample, since both show the same audio.

### The splitter

* A 5 px bar between the panes, `role="separator"`, `aria-orientation="horizontal"`, `aria-valuenow` the first pane's
  share in percent, labelled *Resize the panes*; `row-resize` cursor; drawn like the docking shell's splitters.
* **Drag** sets `share`; **↑ ↓** move it by 5 %; **double-click** returns it to half. Each pane keeps at least its
  minimum (below); the share is clamped to what fits, so a short editor never hides a pane.
* The panes are two rows of the editor's grid, sized `share` and `1 − share` of what the toolbar leaves.

### Small heights

* **Two panes under 300 px of editor height** (the container query the mark lane's fold already uses): each pane's
  overview folds to a 12 px strip (the view's box, still a scrollbar that drags, without the waveform), the mark lanes
  fold as now, and the title rows lose their facts. Each pane's lanes keep at least 32 px. `views-at-min-size` opens
  the second pane at 480 × 240 and checks both panes' lanes, rulers and status bars are visible and nothing overflows.

## Steps

Each step lands green: `npm test`, `npm run typecheck`, `npm run test:smoke` (outside the sandbox). No engine change,
so `npm run test:audio` runs only at the end.

1. **Panes in `state`.** `WavePane`, `waveViewKey`, `openWave(sampleId, pane)`, the subjects' `pane` and every action
   passing it, `useWavePanesStore`, `editSample` and `revertSample` taking the pane (the `app` side still one copy).
   The editor shows one pane, keyed `main:`; nothing visible changes.
   *Tests:* the view-store tests with pane keys; two keys on one origin keep separate views; each selection, marker,
   region and loop action acts on its subject's pane's view (*Go to*, *Select*, *Zoom to region*, an edit's cursor);
   the rename subject keeps the pane; `subjectName` unchanged.
2. **Two working copies in `app`.** `useWaveAudioStore.panes`, `openAudio` per pane, sharing, release to `copies`,
   `audioOf`, `moveEditor` for every pane, the other pane's remap, `follow` and revert per pane, the second pane's
   fallback.
   *Tests* (`app`, memory storage): the second pane on another sample loads its own copy, on the same one shares it
   (the same `audio` object); closing it or pointing it at the first's sample releases its copy to the cache; an edit
   in one pane moves both when they show the sample, the other's cursor and selection remapped (a delete before them
   shifts them left, a delete over the selection drops it); with *Edits make copies* the other stays; undo and redo
   move both; the second pane's sample removed falls back to the first's; a revert from the second pane.
3. **The pane component.** `WavePane` out of `SampleEditor`; the toolbar on the active pane; still one pane on screen.
   *Tests:* the existing smoke specs pass unchanged.
4. **The second pane.** *View ▾ → Second pane*, the title rows and their sample menus, the splitter, the active pane's
   border, small heights, `use-wave-panes-storage`.
   *Tests:* the storage hook (load, save, a bad value ignored); the splitter's clamp as a function of the heights.
   *Browser* (`wave-panes.smoke.spec.ts`): open the second pane, it shows the same sample; zoom it, the first keeps its
   zoom; pick another sample in its menu; select and ⌘C in it, click the first pane, ⌘V pastes there, one undo
   removes it; Delete in the second pane on the same sample moves the first pane's cursor; ▶ plays the active pane's
   sample; the splitter drags and takes ↑ ↓; reload keeps the pane open with its sample and share;
   `views-at-min-size` with two panes.
5. **Docs and the profile.** `architecture/samples-and-wave-editor.md` (panes, view keys, two working copies, the
   other pane after an edit), `architecture/workbench.md` (the subjects' pane), `reference/formats-and-versions.md`
   (`sfxlab:wave-second-pane`); the notes sorted per [doc-workflow](../../dev/doc-workflow.md); STATUS and BACKLOG; the
   profile; the plan to `archive/ui-redesign/`. The spec stays in `active/` for 11d.

## Behavior changes

* *View ▾* gains *Second pane*. With it on, the editor has two panes, a splitter and title rows, and the toolbar's
  sample facts move into the title rows.
* The toolbar, ▶ and *Process ▾* act on the active pane, which is the first one unless the second was pressed or
  focused last.
* An edit also moves a second pane showing the same sample; its cursor and selection follow the audio they were on.
* Views are kept per pane: a sample's zoom and selection in the first pane are not the second's. In memory only, as
  before; nothing in the project format changes.

## Verification

* `npm test`, `npm run typecheck`, `npm run test:smoke` at every step; `npm run test:audio` at the end.
* **Profile:** `wave` stays at 56 component renders a second with one pane. A second setup, `wave-split`, with the
  second pane showing the playing sample, stays under 56 + 29 (one more `WavePlayhead`); `WavePane`, the title rows
  and the splitter render 0 times while it plays.
* **Measure** (`scripts/measure-second-pane.cjs`, committed): opening the second pane on another 120 s stereo sample
  (decode and pyramid), and on the same sample (expect no decode), recorded in "Changes made while implementing".
* **Manual pass** (BACKLOG V10 grows): copying between two samples in the two panes, the splitter on a trackpad, the
  active pane's border in both themes, the small heights.

## Decisions to sign off

Signed off 2026-10-31: every row as proposed.

| Question | Proposed | Alternative |
|---|---|---|
| What *Same sample* means | **The second pane follows the first pane's sample** (its `sampleId` is null) until another is picked; its menu says so | It keeps the sample the first had when it opened |
| Where entry points open a sample (✎, a clip's *Edit sample*) | **In the first pane,** as now (`selectSample`) | In the active pane |
| Naming the panes' samples while split | **A 20 px title row per pane** with the sample menu and facts; the toolbar's facts hide while split | Keep the facts in the toolbar for the active pane, and give only the second pane a title row |
| The other pane after an edit on its sample | **Its cursor, selection and scroll go through the edit's remap** (it keeps looking at the same audio) | Clamp only, as an undo does |
| The mark subjects | **Carry the pane too,** so *Go to*, *Select* and *Zoom to* act where they were invoked | Only `sample-selection` gets a pane; marks always act on the first pane |
| Turning the second pane on | **A checked entry in *View ▾*** and × in its title row, like the snaps; no key | Also a palette action and a key |
| The splitter | **Drag, ↑ ↓ by 5 %, double-click for half;** the share stored per browser | Fixed halves |
| Two panes in a short editor | **Under 300 px high, overviews fold to 12 px strips** and title rows lose their facts; lanes keep 32 px each | Hide the second pane below a height |
| The playhead | **In every pane showing the previewed sample** | Only in the active pane |
| What the second pane remembers | **Open, its sample and the share, per browser,** under `sfxlab:wave-second-pane` | Nothing: closed at every load |
| Linked scrolling and zoom | **Not in this part:** each pane scrolls on its own, which is what navigating between far places asks for | A *Link panes* toggle |

## Changes made while implementing

**Step 1 (panes in `state`).**

* The helpers take a **`WaveAt`** (`{ sampleId, pane }`) instead of `(sampleId, pane)`: a subject of the editor and a
  working copy (`WaveAudio` gained `pane`) are both one, so the actions pass their subject and the editor its
  `WaveAudio`. `openWave` has no default pane: every caller names one, and the typechecker found them all.
* `markerOf` and `regionOf` read the project's sample, without a pane: a mark is the sample's.
* `paneSampleId(pane)` (which sample a pane shows) is in `state/wave-panes.ts` beside the store; closing the second
  pane (`setSecond({ open: false })`) makes the first active there, so no caller has to.
* `SampleLibrary.editSample` takes the pane in its options, `revertSample` as a second argument; `app` keys every view
  `main:` and ignores the pane until step 2.

**Step 2 (two working copies).**

* **One decode for two panes.** When both panes ask for a sample not loaded yet (the second pane open on the first's
  sample at load), they wait on one decode (`decodeWorking`), which builds the pyramid too; the second pane then shares
  it. Found by the test that counts decodes.
* **An edit with *Edits make copies* from the first pane, while the second shows the first's sample** (its `sampleId`
  null), sets the second's `sampleId` to the original before the first moves to the copy; otherwise the second would
  follow the first onto the copy.
* **A revert** keeps what it did in the pane it was asked from (the cursor mapped back, the selection cleared); another
  pane on the sample moves along like after an edit, its selection mapped.
* `follow` clamps every pane's view to its sample's length on any change of the project's samples, not only when a pane
  followed a sample; a second pane whose own sample left the project with no successor keeps that id (so a redo brings
  it back) and shows the first pane's sample meanwhile.

**Steps 3 and 4 (the pane, and the second pane), one commit.** `WavePane` was written for two panes from the start, and
the toolbar's reading of the active pane can only be tried with two, so they landed together.

* **Lanes keep 24 px, not 32, and under 300 px of height two panes also hide their status bars.** At 480 × 240 the
  toolbar takes about 60 px; two panes with title rows, 12 px overviews, rulers, folded mark lanes, 32 px lanes and
  status bars needed about 226 px of the 180 left. The splitter's clamp uses the same 24 px (`LANES_MIN_PX`), and
  measures the rest of each pane's minimum from the pane itself.
* **The splitter is 4 px,** the docking shell's (`--flexlayout-splitter-size`), not 5.
* **Each pane's ruler counts its own sample's tempo** when *Tempo from the name* is on (`rulerBpm`); *View ▾* names the
  active pane's.
* The title rows' buttons are 18 px high; the sample menu's entries are checkable, the shown one checked, and the second
  pane's starts with *Same as the first pane*.
* The spec helpers for the marked test file moved from `wave-marks.smoke.spec.ts` to `tests/browser/marked-sample.ts`:
  a spec can't import another spec's file without running its tests.

**Step 5 (docs, the profile and the measures).**

* **Profile** (`3ac4f0d`, load average 3.5 to 4.5): `wave` holds at **56** component renders and 12.8 script ms a
  second. `wave-split`, a new setup with the second pane open on the playing sample: **85** and 11.6 ms, `WavePlayhead`
  58 (two at the status rate), so exactly 56 + 29, at the plan's bound rather than under it; `WavePane`, `PaneTitle` and
  `PaneSplitter` render 0 times.
* **Opening the second pane** (`scripts/measure-second-pane.cjs`): on another 120 s stereo sample **66.7 ms** (median
  of 3, each a sample not opened before; the first 107.8 ms), decoding and building its pyramid; on the first pane's
  sample **0 ms**, sharing its copy (the script checks the two panes hold the same audio).
* The measure runs on the dev server's page with the app's entry stubbed (`page.route`, a regex, since Vite asks for
  `main.tsx?t=…`): with the app running, its own sample library answers the same stores, finds none of the script's
  samples in its storage and empties the pane the script waits for.
* `scripts/measure-revert-and-zero.cjs` (round 11c-2) passes the pane that `editSample` and `revertSample` now take.
* The smoke run of steps 3 and 4 had one failure, the known flake V6 (`library.smoke.spec.ts`, the isolated preview
  case reading the saved project before the autosave); that file passed three runs alone.
