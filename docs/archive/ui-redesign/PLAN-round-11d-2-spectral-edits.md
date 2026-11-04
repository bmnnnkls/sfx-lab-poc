---
status: done
date: 2026-10-31
shipped_in: architecture/samples-and-wave-editor.md
note: "Part 5 of the handling-and-spectrum spec (round 11d, part 2): a frequency band on the selection, band gain and keep band, applied in the spectrum worker. The hand pass is BACKLOG V10; the edit's long task on long samples is P5."
---
# Round 11d, part 2: spectral selection and edits

Status: **done** 2026-10-31; plan signed off 2026-10-31, every decision as proposed. Written 2026-10-31. Part of the
[UI redesign](README.md). Carries
out part 5 of the signed-off [handling and spectrum spec](SPEC-wave-editor-handling-and-spectrum.md) (§ 8, § Suggested
split): a selection with a frequency band, drawn as a box in the spectrogram, and the two spectral edits, band gain and
keep band, that change only that band. The inventory was taken on `imp/jolly-rhodes-4ca064` at `d82cf25` (round 11d
part 1 done, [its plan](PLAN-round-11d-1-spectrogram.md)). The spec's decisions are settled and
not repeated here; this plan adds the ones it leaves open, and one where the code asks to read the spec differently
(Alt, which round 11c-2 gave to snapping), in § Decisions to sign off.

## Goal

After this part:

* **a drag in the spectrogram selects a box** in time and frequency, on the lane it starts in (both when dragged across
  both); its edges and corners drag; a right-click inside it keeps it; the status bar says its band;
* **with a band selected, only the spectral edits run:** *Cut*, *Delete*, *Crop*, *Paste*, *Insert silence…* and the
  time-only processes are disabled with "Needs a selection without a frequency band. Press Escape or click the
  waveform."; *Copy* copies the whole time range and says so; Escape drops the band first, then the selection;
* ***Process ▾* has a *Spectral* group:** *Band gain…* (−60 to +12 dB, or *Remove*) and *Keep band*, from the registry,
  so the right-click menu and the palette have them too;
* **both edits feather their edges** (in time over the crossfade length, in frequency over a sixth of an octave), keep
  the length, undo in one step, and leave audio more than a window outside the range bit for bit the same;
* **the spectrogram follows the edit** through the partial update part 1 built.

**Out of scope** (the spec's § Wishes):

* spectral repair, noise reduction, a brush or lasso, spectral copy and paste, frequency zoom;
* auditioning the band alone (▶ plays the time range, as now);
* the band's peak and RMS (the status bar's levels stay the time range's);
* snapping the band's edges to anything.

## Inventory

What part 2 touches, beyond the spec's inventory and part 1's.

### The selection

* **`WaveSelection`** (`state/wave-editor-store.ts`) is `{ from, to, channels }`, in memory, per pane and origin. It is
  made by the lanes' drags, Shift-extend and double-click (`use-wave-gestures.ts`), the view keys (`waveKeyAction`:
  ⌘A, Escape, Shift+arrows), `afterEdit`, a revert, and, for the other pane after an edit, `moveAlong`
  (`app/sample-library.ts`), which rebuilds it as `{ from, to, channels }` from the remapped range: **a band there
  would be dropped**.
* It is read by the edits (`waveEditContext` → `EditSelection`), *Copy* (`copyWaveSelection`), the marks (*Make
  region*, *Set loop*), the preview (*Play selection*), the status bar (`WaveStatus`: range, length, channels, peak and
  RMS) and the lanes' overlay (`LaneOverlay.selection`, columns only).
* **Hit-testing is time and channel only:** `selectionEdgeAt(view, selection, x, channel)` (4 px), `menuTargetAt(
  selection, frame, channel)` (inside keeps, outside clears), `channelsAt` (the quarter rule), `laneAt`.
* **Alt is taken:** since round 11c-2, Alt held during a click or a drag turns snapping off (`snap.ts`,
  `useWaveGestures`' `alt`). The spec (written before) gives Alt+drag in the spectrogram to time-only selection.
* Escape clears the selection and puts the cursor at its start; there is no band to drop first.

### The edits

* **`SAMPLE_EDITS`** (`core/sample/edits.ts`): each entry has a `group` (`process`, `structure`, `clipboard`),
  `settings` (number fields and toggles, one popover, `EditSettings`), `channels` (`any` or `both`),
  `needsSelection`, `create(context)`, a synchronous `apply(audio, edit)`, `remap`, `changed` and `after`.
  `processActions` builds *Process ▾*, the right-click menu's *Process* submenu and the palette from the `process`
  group; `waveEditBlocked(entry, facts)` gives every disabled entry its reason.
* **`runEdit`** (`app/sample-library.ts`) applies the edit on the main thread (`applySampleEdit`), then encodes,
  hashes and stores the result; on 120 s of stereo that is one task of 100 to 130 ms already (BACKLOG P5).
  `changedFrames` feeds the peak pyramid's and the spectrum pyramid's partial updates (`editedFrom`).
* An edit whose result has the same bytes is "Nothing changed" (the hash is the id).
* Processes ramp their edges inside the range over the crossfade length (`EdgeRamp`), so audio outside the range never
  changes.

### The spectral core and the spectrogram (part 1)

* `createStft` gives a column's complex spectrum and `overlapAdd` resynthesizes; with periodic Hann at a quarter hop it
  gives the signal back within 1e-6. Nothing yet modifies a spectrum.
* `spectrogram.ts` maps frequencies to rows (`frequencyY`, log or linear, the setting's) and back
  (`frequencyAt`, private); the lane's parts are `laneParts(lanes)` and `partBox`.
* The spectrum worker answers stateless requests (`answerSpectrum`); the service sends a chunk at a time with only the
  frames it reads.
* The selection is drawn as a veil under the waveform and a veil with edge lines over the spectrogram.

### Tests and numbers to hold

* `wave-spectrum.smoke.spec.ts`, `wave-editor.smoke.spec.ts`, `wave-marks.smoke.spec.ts`, `wave-panes.smoke.spec.ts`,
  `views-at-min-size.smoke.spec.ts`; `core/sample/edits.test.ts`, `state/actions/sample-selection.test.ts`,
  `ui/wave-editor/wave-keys.test.ts`, `app/sample-library.test.ts`.
* **The profile:** `wave` **56** component renders a second, `wave-spectrum` **56**, `wave-split` **85**.

## Design

### The band (`state`)

* **`WaveSelection` gains `band?: { low, high }`** in Hz, `0 ≤ low < high ≤` the Nyquist frequency. Everything that
  rebuilds a selection keeps it: `moveAlong` (the other pane after an edit), Shift-extend and Shift+arrows (they move
  time and keep the band). ⌘A and double-click select time only (no band), as they do now.
* **Escape drops the band first** (the time range stays), then, pressed again, the selection (`waveKeyAction`).
* **What a band allows is each entry's `allowsBand`** (the spec's seam): true for the spectral edits, false for every
  other edit. `waveEditBlocked` refuses an entry without it while a band is selected, with the spec's tooltip; *Cut*
  follows *Delete*. *Copy* runs and copies the time range; its tooltip says "Copies the whole time range: the clipboard
  has no band". The marks (*Add marker*, *Make region*, *Set loop*) and ▶ act on the time range.
* **The spectral edits need a band** (`needsBand`): without one they are disabled with "Drag a box in the spectrogram
  first".
* **The status bar** adds the band to the selection field: "Selection 0:01.000 – 0:02.000 (0:01.000) · 200 Hz –
  2.0 kHz"; the peak and RMS stay the time range's, and their tooltip says so.

### The spectral edits (`core/spectrum/band-edits.ts`, `SAMPLE_EDITS`)

* **Two entries, group `spectral`**, `allowsBand` and `needsBand`, `channels: 'any'`, `remap` null (the length and
  every position stay), `after` keep:

  | Edit | Data | Settings |
  |---|---|---|
  | Band gain… | `{ kind: 'band-gain', range, channels, band, db, feather }` | Gain, −60 to +12 dB (−6 by default); *Remove* (a toggle: −∞) |
  | Keep band | `{ kind: 'keep-band', range, channels, band, feather }` | none |

  `feather` is `{ frames, octaves }`: the crossfade length when the edit is made, and `BAND_FEATHER_OCTAVES` (1/6).
* **The mask** (`bandMask`): per column a time weight, 1 inside the range and ramping to 0 over `feather.frames` at its
  edges, inside it (as `EdgeRamp` does); per bin a frequency weight, 1 inside the band and ramping to 0 over
  `feather.octaves` at its edges, inside it (a raised cosine on the log-frequency axis). So nothing outside the box
  changes beyond what the window's own spread carries. Band gain's weight is `(g − 1) · t · f`; keep band's is
  `−t · (1 − f)` (everything outside the band, in the range, removed).
* **Applying it, exactly as the spec says:** STFT the range widened by a window (`BAND_EDIT_FFT_SIZE` 2048, periodic
  Hann, a quarter hop, columns on a grid anchored at frame 0 so the result doesn't depend on where a slice starts),
  multiply each column by its weight, overlap-add the difference, and add it to the audio. `changed` is the range
  widened by a window, clamped. A column whose time weight is 0 adds nothing, so audio a window outside the range is
  bit for bit the same, and band gain at 0 dB adds zeros: the same bytes, "Nothing changed".
* **`applyBandEdit(channels, edit, offset)`** works on a slice of each channel starting at `offset` that holds the
  widened range, and returns the changed frames; the entry's `apply` calls it on the whole audio. The same function
  runs in the worker, in the fallback and in the tests, so the floats are the same everywhere.

### Where they run (`audio`, `app`)

* **Spectral edits apply in the spectrum worker:** a second request kind, `{ kind: 'band-edit', edit, offset,
  channels }` (the widened range's frames, transferred), answered with the changed frames. The service gains one call,
  `applyOf(audio, edit): Promise<SampleAudio>`, which splices the answer into a copy of the audio; the fallback runs the
  same function on the main thread.
* **`runEdit`** awaits `applyOf` for an edit whose entry is `spectral` and calls `applySampleEdit` for the rest; the
  encode, hash, store, undo and the panes' moves are unchanged. The spectrum pyramid refills only the columns touching
  `changed` (part 1).

### The box in the spectrogram (`ui`)

* **A drag that starts in a spectrogram part** (the whole lane in *Spectrogram*, the lower two thirds in *Split*)
  selects a box: time from the drag's ends (snapping as a time drag does, Alt turning it off), frequency from the rows
  (`frequencyAt`, the inverse of `frequencyY`, on the setting's scale). Its channels are the lane it starts in, or
  both once the pointer crosses into the other lane. A drag in the waveform part selects time only, as now.
* **A time-only selection in *Spectrogram* mode** is a box drag and Escape (which drops the band and keeps the time),
  or a drag in the waveform part of *Split* (§ Decisions: Alt stays "don't snap").
* **Edges and corners** (`boxEdgeAt`, 4 px, beside `selectionEdgeAt`): the left and right edges move time, the top and
  bottom move the band's high and low ends, a corner both; the pointer shows `ew-resize`, `ns-resize` or the diagonal
  resize cursor. Shift-extend moves time and keeps the band.
* **Drawing:** in the spectrogram part, a veil inside the box only, and a 1 px accent outline; in the waveform part of
  *Split*, the time veil, as now. The overlay gains the band's rows (`LaneOverlay.band`, from `frequencyY`).
* **The right-click** (`menuTargetAt(selection, frame, channel, hz)`): inside the box keeps it; in the spectrogram
  outside the box (in time or in frequency) clears it and puts the cursor there, as outside a time selection.
* **`data-band`** on the detail says the band in Hz while one is selected, for the tests.

### The menus

* ***Process ▾*** lists the `spectral` group after the processes, under a separator, as *Band gain…* and *Keep band*;
  the right-click menu's *Process* submenu and the palette take them from the same actions (`processActions`). The
  toolbar's five buttons are unchanged; they are disabled with the tooltip while a band is selected.

## Steps

Each step lands green: `npm test`, `npm run typecheck`, `npm run test:smoke` (outside the sandbox, one run at a time).
No engine change, so `npm run test:audio` runs only at the end. **Holds** names the profile each step keeps.

1. **The band edits in `core`.** `core/spectrum/band-edits.ts` (`bandMask`, `applyBandEdit`, the constants), the two
   entries in `SAMPLE_EDITS` (group `spectral`, `allowsBand`, `needsBand`, settings), the `SampleEdit` union. Not in
   any menu yet.
   *Tests* (tables): a tone inside the band, in the middle of a long range, is attenuated by the asked dB within
   0.5 dB (−6, −24, −60, and *Remove* to under −90 dB); a tone outside the band is untouched to 1e-6; keep band does
   the opposite; audio more than a window outside the range is bit for bit the same; 0 dB gives the same floats;
   `remap` null, `changed` the widened range; on a slice at any offset the result equals the whole audio's, bit for
   bit; the same edit twice gives the same floats.
   *Holds:* `wave` 56.
2. **The band in `state`.** `WaveSelection.band`; `moveAlong` keeps it; `allowsBand` and `needsBand` in
   `waveEditBlocked`; *Copy*'s tooltip; Escape drops the band first; ⌘A without a band; the spectral actions in
   `processActions` (disabled until a band can be drawn); the status bar's band.
   *Tests:* each action enabled and disabled with and without a selection, a band and a clipboard (the spec's
   `state` row); the key table's Escape rows; the other pane's selection keeps its band through an edit; the status
   text.
   *Holds:* `wave` 56; *Process ▾* gains two disabled entries.
3. **The box in the spectrogram.** The drag, the channels across lanes, `boxEdgeAt` and the cursors, Shift-extend,
   the overlay's band (veil and outline), `menuTargetAt` with the frequency, `data-band`.
   *Tests* (ui units): `frequencyAt` inverts `frequencyY` on both scales; `boxEdgeAt` for each edge and corner;
   `menuTargetAt` inside and outside the box in time and in frequency. *Browser* (in `wave-spectrum.smoke.spec.ts`):
   a drag in the spectrogram selects a box (`data-band`, the status bar), *Cut* is disabled with the tooltip, Escape
   drops the band and *Cut* is enabled, a corner drag moves both edges, a drag in *Split*'s waveform part selects
   time only.
   *Holds:* `wave` 56, `wave-spectrum` 56.
4. **The edits run.** The worker's `band-edit` request, `applyOf` and its fallback, `runEdit`'s branch, *Band gain…*'s
   popover with *Remove*.
   *Tests:* the worker's handler and the fallback give the same floats as the entry's `apply`; `app` (memory storage,
   the fallback): band gain on a box is one undo step, keeps the length, the cursor and the selection with its band,
   and the spectrum refills only the columns touching `changed`; 0 dB is "Nothing changed". *Browser:* on the tone
   file, a box over the tone's row, *Band gain…* → *Remove*: the 1 kHz row goes dark in that range and stays bright
   outside it; undo brings it back; *Keep band* on a box above the tone removes the tone in the range.
   *Holds:* `wave` 56, `wave-spectrum` 56.
5. **Docs, the profile and the measures.** `architecture/samples-and-wave-editor.md` (the band, the box, the spectral
   edits, where they run), `architecture/workbench.md` if the subject's actions change shape, the notes sorted per
   [doc-workflow](../../dev/doc-workflow.md); STATUS, BACKLOG (U9 closes; V10 grows); the plan to `archive/ui-redesign/`,
   and **the spec too**, its last part done.

## Behavior changes

* In the spectrogram, a drag selects a box in time and frequency instead of a time range; a drag in *Split*'s
  waveform part still selects time.
* While a band is selected, the structure and clipboard edits (but *Copy*) and the time-only processes are disabled;
  Escape drops the band before the selection.
* *Process ▾*, the right-click menu and the palette gain *Band gain…* and *Keep band*.
* Nothing in the project format changes: edits are applied, not stored.

## Verification

* `npm test`, `npm run typecheck`, `npm run test:smoke` at every step; `npm run test:audio` at the end.
* **Profile:** `wave` 56, `wave-split` 85, `wave-spectrum` 56 (its setup gains a box selection, so the box is drawn);
  the editor's components render 0 times while the preview plays.
* **Measure** (`scripts/measure-spectrogram.cjs` grows): band gain on 120 s of stereo over 1 s, 10 s and the whole
  sample: the time to the result, the longest main-thread task (the edit's own encode and hash, P5, apart), and the
  spectrum's refill. Recorded in "Changes made while implementing", then in `reference/baselines.md`.
* **Manual pass** (BACKLOG V10 grows): drawing and resizing boxes on a trackpad, listening to band gain and keep band
  on real material (ringing, the feathers), both themes.

## Decisions to sign off

Signed off 2026-10-31: every row as proposed.

| Question | Proposed | Alternative |
|---|---|---|
| A time-only selection in the spectrogram (the spec gives it Alt+drag, but Alt has meant "don't snap" since round 11c-2) | **Alt keeps one meaning, "don't snap", everywhere;** time only is a box drag then Escape, or a drag in *Split*'s waveform part | Alt+drag selects time only in the spectrogram, as the spec says, and snaps there |
| Spectral edits without a band | **Disabled:** "Drag a box in the spectrogram first" | Run over every frequency (band gain is then Gain, keep band nothing) |
| Where the spectral edits run | **In the spectrum worker** (a second request kind), the main thread only as the fallback: a 10 s box is about 4,000 FFTs, the whole of 120 s stereo about 45,000 | On the main thread, like every other edit (P5 grows by up to seconds) |
| Where the feathers lie | **Inside the box,** in time and in frequency, as processes ramp inside their range: nothing outside the box changes beyond the window's spread | Centred on the box's edges |
| The marks and ▶ with a band selected | **Act on the time range** (they are about time) | Disabled with the band, like the time-only edits |
| ⌘A and double-click | **Select time only** (drop the band) | Keep the band and widen the time |
| Shift-extend and Shift+arrows | **Move time and keep the band** | Drop the band |
| *Remove* | **A toggle in *Band gain…*'s popover** (−∞) | A third entry, *Remove band* |
| The status bar | **Shows the band; peak and RMS stay the time range's,** their tooltip says so | The band's own levels (an STFT per settled selection) |
| The box in *Split*'s waveform part | **The time veil,** as now | Nothing |
| Band gain's default | **−6 dB** | −∞ (*Remove*) |

## Changes made while implementing

* **Step 1. The change is added per frame, not per column.** The plan weighted each STFT column by the time ramp,
  which would have changed audio up to half a window (21 ms) before and after the range, and nothing at all in a range
  shorter than the hop that held no column's centre. The edits now filter the range and a window on each side with the
  band's weights per bin (no time weight in the spectrum), and add the result to each frame of the range with the time
  ramp (as `EdgeRamp` does, linear). So audio outside the range never changes (bit for bit), the feathers in time lie
  exactly inside it, `changed` is the range itself (not widened), and an edit reads the range and a window on each
  side (`bandEditReads`). `applyBandEdit` takes a slice (`BandSlice`: the channels from `offset`, the sample's length
  and rate) and returns every channel's frames over the range; `applyBandEditTo` is the whole-audio form `apply` uses.
* **Step 1.** Removing a band from a mix leaves the other tone within 2.6e-6, not the plan's 1e-6 (the resynthesis
  itself is good to 1e-6 a tone); the tests take 1e-5 there and keep 1e-6 for a tone alone outside the band. Band
  gain hits −6, −24 and −60 dB, and +6 and +12, within 0.5 dB; *Remove* leaves the tone under −90 dB.
* **Step 1.** The spectral entries' `needsSelection` is false: `needsBand` gives the reason ("Drag a box in the
  spectrogram first") without one, and a band is always on a selection.
* **Step 2.** The toolbar's *Copy* says "Copies the whole time range: the clipboard has no band" too, not only the
  action. `select` orders a band and drops an empty one (`low === high`), so a box drawn with no height is a time
  selection.
* **Step 3. A submenu whose action can't run is disabled, with the reason.** With a band selected, *Fade in* and *Fade
  out* (submenus of curves) opened with every curve disabled; the same happened while an edit ran. `ActionMenu` now
  disables the submenu itself (`MenuSubmenu.disabled`, `tooltip`).
* **Step 3.** The toolbar's tooltip lowercases only the first letter of a reason, since the band's has two sentences.
* **Step 3.** The frequency at a row past the spectrogram part's bottom is 0 Hz and past its top the Nyquist frequency
  (`FrequencyScale.hzAt`, from `useLaneRenderers` with `rowOf`), so a box dragged past the bottom of the log scale
  reaches 0 Hz rather than 20 Hz. The channels follow the lane under the pointer at each move (back on the first lane,
  one channel again), not once crossed. In the spectrogram a press near a band-less selection's time edge drags that
  edge, as in the waveform; with a band, only the box's edges drag there (`boxEdgeAt`).
* **Step 3.** Profile at `a7ac93f`: `wave` 56 and `wave-spectrum` 56 component renders a second, as before.
* **Step 4.** One spectrum service for the spectra and the library (`app/services.ts`); `SampleLibraryOptions.spectrum`
  is optional, and without it band edits apply on the main thread (`applySampleEdit`), as the tests that mock `@audio`
  need. `isBandEdit(edit)` is the registry's group, so `runEdit` doesn't switch on the kind. The protocol's messages
  carry a `kind` (`columns`, `band-edit`); `replyTo` is the worker's whole job. *Band gain…*'s *Gain* is disabled while
  *Remove* is on (`EditSetting.offWhen`).
* **Step 3's smoke run failed two specs** (`library.smoke.spec.ts` isolated previews, and the spectrogram following a
  delete) while the unit tests ran alongside it; both pass alone three times out of three, and step 4's full run, with
  nothing beside it, passes.
* **Step 5. The measures** (`6d134da`, `scripts/measure-spectrogram.cjs`, 120 s stereo at 48 kHz, the lanes on the
  spectrogram, load average 3 to 5, two runs): band gain (200 Hz to 2 kHz, −12 dB, both channels) through the app, in
  the worker, over 1 s: 123 to 125 ms to the result, the longest main-thread task 107 to 109 ms, the spectrum refilled
  in 11 to 12 ms; over 10 s: 204 to 227 ms, 108 to 116 ms, 82 ms; over the whole sample: 1.24 to 1.25 s, 95 to 113 ms,
  936 to 937 ms. The longest task is the edit's own encode and hash (P5); the same edit applied on the main thread
  would have been one task of 14 to 16 ms, 95 to 98 ms and 1.0 s. Part 1's measures, run again: unchanged.
* **Step 5. The profile** (`6d134da`, load average 4 to 5): `wave` 56 component renders a second, `wave-split` 85,
  `wave-spectrum` (its setup now drawing a box, so ▶ loops the box's time range) 57: `WavePlayhead` 29 at the status
  rate (29 commits a second), where it was 28. `DetailView`, `WaveLane`, `WaveStatus` and `LaneScale` render 0 times.
