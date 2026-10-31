---
status: active
date: 2026-10-31
note: "Signed off 2026-10-29 as proposed. Amends round 11c's keys and adds round 11d (the spectrum). Parts 1 (handling) and 2 (markers and regions, with loop points) done 2026-10-31; part 3 (a second pane) done 2026-10-31; part 4 (round 11d, part 1: the spectrogram) is planned and signed off, not started (PLAN-round-11d-1-spectrogram.md); part 5 is not planned yet."
---
# Wave editor: handling, a second pane and the spectrum (spec)

Status: **spec, signed off** 2026-10-29, every decision as proposed. Written 2026-10-29 on `feat/ui-redesign` at `eff1ba3` (round 11b done). No code was
changed. It follows a request to make the wave editor nicer to work in (a context menu, keys for copy, cut and paste,
zooming with the mouse, panning with the middle button), to make its UI more attractive with room for more, to add a
second waveform for navigating and copying side by side, and to add a frequency view with some editing.

It **amends** [round 11's spec](SPEC-round-11-wave-editor.md) where they overlap (§ Keys and commands there, and the
order of 11c), and **adds** a round 11d for the spectrum. Where the two disagree, this one wins and says so. The round
plans take their steps and tests from here.

**One rule for every choice below: do what the rest of the app already does.** Where the app has no precedent, pick
the most common behavior of audio editors and leave a seam for a setting. Settings are added later, where use asks for
them, not up front.

## Goal

After this work:

* **the editor is quick to work in:** a right-click menu on the lanes, Delete, ⌘C, ⌘X and ⌘V on the selection,
  view keys for the cursor, the selection and the zoom, middle-drag to pan, draggable selection edges, and a view that
  scrolls while a selection is dragged past its edge;
* **the toolbar is grouped,** with the processes and the view options in menus, so new features go into a menu, not
  onto a third row of buttons;
* **a second pane** can show another place of the same sample, or another sample, under the first; copy in one, paste
  in the other;
* **each lane can show a spectrogram** (waveform, spectrogram, or both split), under the same ruler, cursor and
  selection;
* **a selection can have a frequency band,** drawn as a box in the spectrogram, and the spectral edits change only
  that band: band gain (down to removing it) and keep band.

**Out of scope** (see § Wishes, later for where each might go):

* markers, regions, snap and *Revert to original*: still round 11c, part 2, as specified;
* spectral repair, noise reduction, a spectral brush or lasso, spectral copy and paste, frequency zoom;
* drawing samples with a pencil, envelopes over the sample, time-stretch, pitch-shift, resampling;
* previewing a process before applying it (U8);
* new icons: the app has no icon set and draws ▶ and ■ as text. Round 13 (visual refresh) brings one; this spec uses
  text and the glyphs the app already has.

## Inventory

What the editor does now (`src/ui/wave-editor/`, documented in
[samples-and-wave-editor](../architecture/samples-and-wave-editor.md#the-sample-editor)), and what the rest of the app
does for the same gestures.

### The editor today

* **Toolbar:** two rows of text buttons, all of the same weight. Row one: the name, ▶, *Loop*, *Zoom to selection*,
  *Zoom to fit*, *Time*/*Beats*, *Close*. Row two (`EditToolbar`, built from `SAMPLE_EDITS` by group): *Cut*, *Copy*,
  *Paste*, *Delete*, *Crop*, *Insert silence…*, *Gain…*, *Fade in*, *Fade out*, the fade curve, *Normalize…*,
  *Reverse*, *Silence*, *Remove DC offset*, the crossfade length and curve, *Edits make copies*. At 1400 px the second
  row already runs past the right edge and scrolls sideways.
* **Lanes:** one `WaveLane` canvas per channel, drawn by a `LaneRenderer` (`drawWaveform`, the only one). No level
  scale. The status line shows the cursor, or the selection and its length.
* **Mouse:** drag selects (top quarter of the left lane: left only; bottom quarter of the right lane: right only);
  Shift extends from the far end; a click sets the cursor; the wheel scrolls; ⌘ or Ctrl with the wheel, and a pinch,
  zoom around the pointer. Only the left button is handled. No right-click menu.
* **Keys:** none. The global edit keys (`edit.delete`, `edit.copy`, `edit.cut`, `edit.paste`) find no subject in the
  editor, so they do nothing there. The overview, a `role="scrollbar"`, takes arrows, Page Up and Down, Home and End.
* **View state** (`state/wave-editor-store.ts`) is keyed by the sample's origin: one zoom, scroll, cursor and
  selection per sample. Two views of one sample would share them.
* **The Wave editor is one view** in the workbench (one per kind, like Session and Arrangement), so a second waveform
  has to live inside it.
* **No FFT** exists in the code (IDEAS H1). No Web Worker either: the only worker-like code is the AudioWorklet,
  loaded with `?worker&url` in `audio/audio-host.ts`.

### What the rest of the app does

| Gesture | Patcher (`PatchCanvas`) | Piano roll | Wave editor now |
|---|---|---|---|
| Wheel | Scrolls; Shift+wheel sideways | Scrolls | Scrolls (sideways, it has no vertical axis) |
| ⌘/Ctrl+wheel, pinch | Zooms at the pointer | Zooms | Zooms at the pointer |
| Middle-drag | Pans (and the *Hand* tool with the left button) | — | — |
| Right-click | The subject's actions (`ActionMenu`) | Selects the note under it if it isn't selected; the click becomes the paste point | — |
| Box drag | Selects nodes | Selects notes in **time and pitch** | Selects time |
| Edit keys | Subjects and verbs (`runVerb`) | View-local keys (`VIEW_KEYS`) | — |
| A hint for the gestures | "Scroll to pan · Ctrl/⌘ + scroll to zoom" in the corner | — | — |
| Something that can't run now | — | — | Disabled, with a tooltip saying why (the ruler's tempo button) |

## Design

### 1. The toolbar, grouped

One line, in groups, that wraps as a whole group when narrow (as the editor toolbar does now):

```
[▶] [Loop]   [Cut] [Copy] [Paste] [Delete] [Crop]   [Process ▾] [View ▾]   name · 0:04.000 · 44.1 kHz · stereo   [⚙]
 preview      clipboard and structure                 menus                 the sample                          settings
```

* **Preview:** ▶/■ and *Loop*, as now.
* **Clipboard and structure:** the five edits used most, as buttons. *Insert silence…* moves to *Process ▾* (it is
  rarer, and it has settings).
* **Process ▾** (a `PopupMenu`): the `process` group of `SAMPLE_EDITS`, then *Insert silence…*, then (11d) the
  spectral edits under a separator. The fade curve becomes a submenu of *Fade in* and *Fade out* (each curve an entry,
  the last used marked), so the toolbar loses its `select`. Entries with `settings` open the existing `EditSettings`
  popover. The menu is built from the registry, as the toolbar is now, so a new edit is still one entry.
* **View ▾:** *Zoom to selection*, *Zoom to fit*, *Time* / *Beats* (and the beat tempo), and from 11d *Waveform* /
  *Spectrogram* / *Split*, and *Second pane*.
* **The sample:** the name, its length, rate and channels, as quiet text. *Close* moves to the end of this group as
  ×.
* **⚙ (a popover):** the crossfade length and curve, *Edits make copies*, and from 11d the spectrogram's settings.
  These are set once and rarely changed, so they don't need to show all the time.
* **The status line becomes a status bar** of fields: cursor (or selection, length and channels), the selection's peak
  and RMS (computed from the pyramid's level, then the audio, on change only), and on the right the gesture hint, in
  the patcher's words: "Scroll to move · Ctrl/⌘ + scroll to zoom · Middle-drag to pan".
* **A level scale** beside each lane: 0, −6, −12, −∞ dB on the waveform (on the spectrogram, from 11d, a frequency
  scale). It is the lane's own small canvas, drawn by the renderer's scale function (§ 5).

The same groups are the right-click menu's groups (§ 2), so what a button does and what its menu entry does is one
action.

### 2. The right-click menu

* The lanes are an `ActionMenu` trigger with a new subject, **`{ kind: 'sample-selection', sampleId, pane }`**. Its
  actions live in `state/actions/sample-selection.ts` like every subject's, and they read the selection, cursor and
  clipboard from the stores. They call `SampleLibrary.editSample`, never the steps inside it (round 11's seam).
* **Entries,** in groups: *Cut*, *Copy*, *Paste*, *Delete*, *Crop* · *Process* (a submenu, the same list as
  *Process ▾*) · *Select all*, *Zoom to selection*, *Zoom to fit* · *Play selection* (or *Play from here*).
* **Where the click lands** follows the piano roll: the menu acts on what was clicked. A right-click **inside** the
  selection (on a channel it covers) keeps it. A right-click **outside** it clears the selection and puts the cursor
  there, as a left click would, because the cursor is where *Paste* and *Insert silence* go.
* **Shift+F10** opens it, as on everything with a menu.

### 3. Keys

Round 11's spec planned these as a focus subject with verbs; that stays. This section replaces its list.

* **The edit keys** go through the subject and `runVerb`: Delete and Backspace delete, ⌘C copies, ⌘X cuts, ⌘V
  pastes. The detail view is focusable (`tabIndex={0}`, focused on a press), so the focus subject is the selection.
  The piano roll handles the same keys as view-local keys; the subject route is the one round 11's spec chose, and it
  gives the palette and the menu the same actions for free.
* **View-local keys,** listed read only in the shortcuts dialog (`VIEW_KEYS`, *Wave editor*):

  | Keys | What |
  |---|---|
  | ⌘A | Select all (the channels the selection had, else both) |
  | Escape | Clear the selection (the cursor goes to its start) |
  | ← → | Move the cursor by one column; with a selection, collapse it to that end |
  | Shift+← → | Extend the selection by one column from the cursor |
  | Alt+← → | Move the cursor by a tenth of the view |
  | Home, End | Cursor to the start or the end (Shift: extend the selection there) |
  | + or =, − | Zoom in and out around the cursor |
  | Z, Shift+Z | Zoom to the selection, zoom to fit |
  | P | Play the selection, or from the cursor; again to stop |

* **Space stays the transport's,** as signed off in round 11.
* **⌘0, ⌘+ and ⌘− stay the browser's** page zoom; the editor's zoom keys have no modifier.

### 4. The mouse

* **The wheel stays as it is everywhere in the app:** the wheel scrolls, ⌘ or Ctrl with the wheel (and a pinch) zooms
  around the pointer. A horizontal wheel or swipe scrolls too. What was missing was knowing about it: the status bar's
  hint says it. A *Wheel zooms* setting is the obvious later addition if people ask; its seam is the one wheel handler
  in `DetailView`.
* **Middle-drag pans,** as in the patcher: the pointer shows a grab hand, the view follows the drag sideways (in 11d,
  vertical drags do nothing yet; frequency zoom is out of scope).
* **Selection edges are draggable:** within 4 px of an edge of the selection the pointer shows a resize cursor, and a
  drag moves that edge. Shift-extend stays as it is.
* **Dragging past the edge scrolls,** at a speed that grows with the distance past it.
* **Double-click** selects all of the channel under the pointer (the same rule as a drag's start: both, left or
  right). 11c, part 2 will make it select the region under the pointer, when there is one.

### 5. Lane modes and the renderer seam

Round 11 left one seam for the spectrogram: `LaneRenderer`. It grows to three modes per editor (not per lane, so both
channels always show the same thing):

* **Waveform** (today), **Spectrogram**, **Split** (the waveform over the spectrogram, a third and two thirds of the
  lane). In *View ▾*, per browser (`sfxlab:wave-lanes`), waveform by default.
* The renderer interface becomes `{ draw(context, data, size, colors), scale(context, size, colors) }`, so each mode
  draws its own scale beside the lane. The overlay (selection, cursor, playhead) stays the lane's, drawn over every
  mode.
* The detail view asks each renderer for its data through one function per kind: `columnsFor` for the waveform,
  `spectrumColumnsFor` for the spectrogram (§ 7). Nothing else knows which mode is on.

### 6. The second pane

* *View ▾ → Second pane* adds a pane under the first, with its own overview, ruler, lanes and status bar. A splitter
  sets their heights. Off by default, per browser.
* **Each pane shows a sample of its own:** by default the same one, at its own zoom and position (to navigate between
  far places), or another one picked from a menu on its name (to copy from a source into a target). The clipboard is
  already shared and already pastes between samples, with the mono/stereo rules it has.
* **The active pane** is the one pressed or focused last. It has the accent on its border, gets the keys, and is the
  one ▶ and the toolbar act on. The toolbar stays one, at the top.
* **View state per pane.** Today it is keyed by origin. It becomes keyed by `pane:origin` (`main:…`, `second:…`), so
  two panes on one sample keep separate zooms and selections. The second pane's sample is remembered per browser
  (`sfxlab:wave-second-pane`); when it leaves the project, the pane follows its origin, then falls back to the first
  pane's sample.
* **Memory.** The working copy is one sample today (`useWaveAudioStore.current`). The second pane needs a second slot
  when it shows another sample: two working copies, up to 92 MB for two 120 s stereo samples. The second slot is
  released when the pane closes or shows the same sample as the first.
* **Edits.** An edit in either pane runs through `editSample` as now; the other pane, if it shows the same origin,
  follows the new id like any view does after an edit.

### 7. The spectrogram (round 11d, part 1)

* **The spectral core** (H1) in `core/spectrum/`: a radix-2 real FFT, Hann and Blackman-Harris windows, an STFT over a
  range of a channel, and an inverse STFT with overlap-add. Preallocated, pure, tested in Node: round trip within
  1e-6, known tones in the right bin, a window's sum against its constant. It is the base for the spectral effects
  in IDEAS § H and for C7, C9 and B5 later.
* **Its data, the spectrum pyramid:** a magnitude per bin and column in dB, quantized to a byte over a fixed range
  (−120 to 0 dB), per channel. The base level has a hop of a quarter window (FFT 2048, hop 512); each next level keeps
  the maximum of two columns, as the peak pyramid does, until a level has at most 512 columns. 120 s of stereo at
  48 kHz: about 11,000 columns of 1,025 bins per channel, 23 MB with every level. Zoomed in past the hop (under 512
  frames per pixel), the visible columns are computed on demand, one FFT per pixel column, and not kept.
* **Where it is computed: a Web Worker** in `audio/` (browser integration), running `core/spectrum`. The editor sends
  a copy of the working copy's channels (transferred), the worker answers with levels as they are done, coarse first,
  so the view fills in rather than waiting. After an edit, only the columns whose windows touch the changed frames
  (`changedFrames`, widened by a window) are computed again, as `updatePeakPyramid` does. Nothing crosses the
  AudioWorklet.
* **Drawing:** `spectrumColumnsFor(view, pyramid)` picks the level whose columns fit the view, as `columnsFor` does,
  and the renderer maps bins to rows on the frequency scale and bytes to colors through one 256-entry color table
  (a constant, swappable by round 13's themes).
* **Settings** (⚙, per browser): the frequency scale (**log** by default, or linear), the FFT size (1024, **2048**,
  4096: a new size rebuilds the pyramid), and the dB floor of the color scale (−120 to −60, **−100**).
* **The frequency scale** beside the lane: Hz labels at least 24 px apart (50, 100, 200, 500, 1k, 2k, 5k, 10k, 20k on
  the log scale).
* **The spectrogram follows stereo as the waveform does:** one per channel lane.

### 8. Spectral selection and edits (round 11d, part 2)

* **The selection gains a band.** `WaveSelection` gets an optional `band: { low, high }` in Hz, `low < high`, inside 0
  to the Nyquist frequency.
* **Drawing one follows the piano roll's box select:** a drag in the spectrogram selects a box in time and frequency.
  A drag in the waveform part (in *Split*) selects time only, as now. **Alt+drag** in the spectrogram selects time
  only. The box's channels are the lane it starts in, or both when it is dragged across both lanes (the quarter rule
  is the waveform's and doesn't apply here). Its four edges and corners can be dragged (§ 4).
* **What a band selection allows:** only the spectral edits. The structure edits (cut, delete, crop, paste, insert
  silence) and the time-only processes are **disabled while a band is selected,** with a tooltip: "Needs a selection
  without a frequency band. Press Escape or click the waveform." *Copy* copies the whole time range (the clipboard has
  no band), and its tooltip says so. Escape drops the band first, then the selection.
* **The spectral edits** are entries of `SAMPLE_EDITS` (group `spectral`), so the menus, the palette and the toolbar
  get them from the registry:

  | Edit | Settings | What it does |
  |---|---|---|
  | Band gain | −60 dB to +12 dB, or *Remove* (−∞) | Changes the band's level in the time range |
  | Keep band | | Removes everything outside the band in the time range |

  Both **feather** their edges, in time over the crossfade length and in frequency over a sixth of an octave, so a
  box doesn't ring or click. Both keep the length: `remap` is the identity, so trims, markers and regions don't move.
* **How they are applied, exactly:** STFT the time range widened by one window, multiply by `(g − 1) × mask` (the
  feathered box), inverse STFT, and **add that difference** to the audio. Audio more than one window outside the
  range is untouched bit for bit; `changed` returns the widened range, so the peak pyramid's partial update and the
  spectrum pyramid's both stay small. A gain of 1 (0 dB) is "Nothing changed", as for every edit.
* **The edit is data,** like the others: `{ kind: 'band-gain', range, channels, band, db, feather }`. The same edit of
  the same audio gives the same floats every time; the FFT size of the edit is a constant of the edit kind (2048, not
  the view's setting), so changing the view never changes what an edit does.

## Suggested split

Each part lands green and is usable alone.

1. **11c, part 1: handling.** The grouped toolbar and the status bar (§ 1), the right-click menu and the
   `sample-selection` subject (§ 2), the keys (§ 3), the mouse (§ 4), the level scale. No change to the sample model.
2. **11c, part 2: markers and regions,** as round 11's spec has them, plus *Revert to original*, and loop points as a
   region kind if the plan finds it cheap (§ Wishes).
3. **11c, part 3: the second pane** (§ 6). After part 1, so the toolbar has a place for the switch.
4. **11d, part 1: the spectral core and the spectrogram,** read only (§ 5, § 7).
5. **11d, part 2: spectral selection and edits** (§ 8).

## Tests

* **`core`:** the FFT and STFT (round trip, known tones, window sums); the spectrum pyramid against a brute-force
  maximum at each level, and its partial update against a full build; `spectrumColumnsFor` at each band; band gain and
  keep band as tables (a tone inside the band attenuated by the asked dB, a tone outside untouched to 1e-6, audio a
  window outside the range bit for bit the same), and their `remap` and `changed`.
* **`state`:** the `sample-selection` actions (enabled and disabled with and without a selection, a band and a
  clipboard); `verbTarget` finds them from the detail view's focus; view state keyed per pane.
* **`ui` units:** the key table rows for the editor; the right-click rule (inside keeps, outside moves the cursor);
  edge hit-testing; the grouped toolbar built from the registry (a new entry appears in *Process ▾* with no other
  change).
* **Browser:** right-click → *Cut*, then ⌘V at the cursor, and undo; Delete with the detail focused, and not with a
  text field focused; middle-drag pans; a selection edge drag; the second pane copying from one sample into another;
  the spectrogram fills in for a 120 s stereo file without a long task over 50 ms on the main thread; a band
  selection disables *Cut* with its tooltip; band gain then undo. The views-at-minimum-size spec covers the new
  toolbar.

## Built to change

The same rule as round 11: **a decision is a constant, a table entry or one function, and nothing else reads around
it.**

| Decision | The seam |
|---|---|
| Wheel scrolls, ⌘+wheel zooms | The one wheel handler in `DetailView`; a *Wheel zooms* setting would branch there |
| What a right-click outside the selection does | One function, `menuTargetAt(view, frame, channel)` |
| The view keys | Rows of `VIEW_KEYS` and one key handler; the edit keys are round 10's table, which the user can change |
| What goes on the toolbar and what in a menu | The groups of `SAMPLE_EDITS` and one list of "toolbar edits" in `EditToolbar` |
| Lane modes | The renderer table (`waveform`, `spectrogram`), and `split`'s proportions in one constant |
| The spectrum's FFT size, hop, dB range, levels | Constants in `core/spectrum`; the view's FFT size is a setting |
| Main thread or worker | `audio/spectrum-worker.ts` behind one service call (`spectrumOf(channels, changed?)`); a main-thread fallback is the same call |
| What a band selection allows | Each edit entry's `allowsBand` flag |
| Feathering | Two constants of the spectral edits |
| One pane or two | The pane id in the view key; a third pane is another id |

## Wishes, later

Asked for while writing this: what else would we likely want? Not committed to; each goes to
[BACKLOG](../BACKLOG.md) or [IDEAS](../IDEAS.md) when this is signed off.

**The basics:**

* **Loop points for the sampler**, set in the editor, with a crossfaded loop and a loop finder. The sampler already has
  a *loop* mode.
* **Snap** to zero crossings, markers and the beat grid (round 11's spec has it in 11c).
* **Level zoom** (vertical), and a loudness readout (LUFS) beside peak and RMS.
* **Scrubbing** on the ruler, and the view following the playhead.
* **Previewing a process** before applying it (U8).
* **More processes:** a filter or EQ, pitch and speed change, channel swap, make mono, invert polarity, stereo width,
  trim silence, normalize to loudness.
* **A pencil** to redraw samples at the closest zooms (removing one click).
* **Drag a selection out** as a new sample, an audio clip, or onto a sampler.
* **Slice to pads:** find transients, place markers, slice to pads or a sampler (E8).

**A handful of exotics:**

* **Process a selection through a patch:** run it through any effect graph, a track's chain or a module, offline.
  The app has the graphs and the offline bounce; no other editor can do this.
* **Edit chains:** edits are data already, so a recorded chain can be replayed on other samples (batch processing).
* **Curves over the sample:** a volume envelope, a pan curve, a speed curve (Doppler passes, pitch dives).
* **Spectral repair** (fill a cough or a click from around it), spectral freeze and smear of a band, noise reduction
  from a profile, frequency zoom.
* **Painting in the spectrogram:** a brush that adds or removes energy, or an image imported as sound.
* **Extreme time-stretch** (Paulstretch-style), convolution and morphing of two samples, granular resynthesis of a
  selection (with the granular sampler).
* **Generators at the cursor:** noise, a tone, a chirp.

## Decisions to sign off

Signed off 2026-10-29: every row as proposed. § Built to change says how each can be revisited.

| Question | Proposed | Alternative |
|---|---|---|
| The wheel | **As everywhere in the app:** scrolls; ⌘/Ctrl+wheel and pinch zoom; a hint in the status bar | Plain wheel zooms (RX, WaveLab), with a setting; inconsistent with the patcher and piano roll |
| Middle mouse | **Pans,** as in the patcher | Nothing |
| Right-click outside the selection | **Clears it and puts the cursor there** (the menu acts on what was clicked, as in the piano roll) | Keeps the selection |
| The edit keys | **A focus subject with verbs** (round 11's plan, round 10's route) | View-local keys, as the piano roll does |
| The toolbar | **One grouped line:** five clipboard and structure buttons, *Process ▾*, *View ▾*, ⚙; the same groups in the right-click menu | Keep every edit as a button and let the row scroll |
| A second waveform | **A second pane inside the editor,** its own sample or the same one at its own place, view state per pane | A second Wave editor view in the workbench (needs views that can open twice) |
| Lane modes | **Waveform, spectrogram, split, for the whole editor** | Per lane |
| Spectrum data | **A byte per bin, a pyramid like the peaks' (≈23 MB for 120 s stereo), on-demand columns zoomed in** | Floats (4× the memory), or no pyramid (recompute on every scroll) |
| Where the spectrum is computed | **A Web Worker,** coarse levels first | The main thread in chunks |
| Selecting a band | **A drag in the spectrogram selects time and frequency** (as the piano roll selects time and pitch); Alt+drag selects time only | A tool switch between time and time-frequency selection |
| Edits with a band selected | **Only the spectral edits; the others disabled with a tooltip** | The others act on the time range and ignore the band |
| The first spectral edits | **Band gain (down to remove) and keep band**, feathered, applied as an added difference | Also spectral repair now |
| Order | **11c handling → 11c markers and regions → 11c second pane → 11d spectrogram → 11d spectral edits** | Spectrogram before markers and regions |
