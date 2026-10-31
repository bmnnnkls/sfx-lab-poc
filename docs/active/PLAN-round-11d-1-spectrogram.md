---
status: active
date: 2026-10-31
note: "Plan signed off 2026-10-31 as proposed; not started. Part 4 of the handling-and-spectrum spec (round 11d, part 1): the spectral core and a read-only spectrogram in the wave editor."
---
# Round 11d, part 1: the spectral core and the spectrogram

Status: **plan, signed off** 2026-10-31, every decision as proposed. Written 2026-10-31. Part of the [UI redesign](ui-redesign-roadmap.md). Carries
out part 4 of the signed-off [handling and spectrum spec](SPEC-wave-editor-handling-and-spectrum.md) (§ 5, § 7,
§ Suggested split): the spectral core (IDEAS H1), a spectrum pyramid computed in a Web Worker, and a spectrogram in the
lanes, read only. Spectral selection and the band edits (§ 8) are part 2, with a plan of their own once this one has
landed. The inventory was taken on `feat/ui-redesign` at `9d44a5a` (round 11c done). The spec's decisions are settled
and not repeated here; this plan adds the ones it leaves open, and the two places where the code asks to read the spec
differently (the memory figure and the zoomed-in columns), in § Decisions to sign off.

## Goal

After this part:

* ***View ▾ → Waveform / Spectrogram / Split*** sets what every lane of the editor shows: the waveform (as now), a
  spectrogram, or the waveform over the spectrogram (a third and two thirds of the lane). Remembered per browser;
  waveform by default;
* **the spectrogram is drawn under the same ruler, cursor, selection, marks and playhead** as the waveform, one per
  channel lane, with a **frequency scale** in the gutter beside it;
* **it is computed in a Web Worker**, the part in view first, and fills in while the rest is computed; the main thread
  has no task over 50 ms while a 120 s stereo sample fills in;
* **after an edit,** only the columns whose windows touch the changed frames are computed again;
* **zoomed in past the spectrum's hop,** the visible columns are computed on demand, so the picture stays sharp;
* **⚙ gains the spectrogram's settings:** the frequency scale (log or linear), the FFT size (1024, 2048, 4096) and the
  floor of the color scale (−120 to −60 dB);
* **`core/spectrum`** has a real FFT, windows, an STFT and an inverse STFT with overlap-add, tested in Node: the base
  for part 2 and for the spectral ideas (IDEAS § H, C7, C9, B5).

**Out of scope:**

* band selection, band gain and keep band (part 2);
* frequency zoom, a level or frequency readout under the pointer, a spectrogram in the overview or in clips;
* spectral effects in the engine (IDEAS § H): this part gives them their core, not their nodes.

## Inventory

What part 1 touches, beyond the spec's inventory.

### The lanes and their renderer

* **`LaneRenderer`** (`ui/wave-editor/lane-renderers.ts`) is already `{ draw(context, columns, size, colors),
  scale(context, size, colors) }`, the shape § 5 asks for, but `draw` takes `LaneColumns`, the waveform's data
  (`peaks`, `frames` or `points`, from `laneColumns(columnsFor(…), channel, view)`). `waveformRenderer` is the only
  renderer; `levelMarks(height)` places the level scale's marks and is tested.
* **`WaveLane`** (`WaveLane.tsx`) fits its canvas to its box at the device pixel ratio (`fitted`, a transform to CSS
  pixels), draws the selection's veil, then the renderer, then the marks' lines and the cursor, when `DetailView` calls
  its handle; never through React. **`LaneScale`** draws the renderer's `scale` into the 28 px gutter on mount and on
  resize only. Both take the renderer as a prop, and `WavePane` and `DetailView` pass `waveformRenderer`.
* **`DetailView`** draws in an animation frame when the pane's view, the project's samples or its size change, from
  `columnsFor(view, pyramid, audio)`, and writes the band to `data-draw`. Nothing else in the editor reads the
  columns.
* **`Overview`** draws the whole sample from `columnsFor` at its own width; it is the pane's scrollbar.

### The data

* **The peak pyramid** (`core/sample/pyramid.ts`): level 0 a min and max per 64 frames, each next level the extremes
  of two buckets, up to 512 buckets at the top; `updatePeakPyramid(pyramid, audio, changed)` copies the buckets before
  `changed.from` (and after `changed.to` when the length is the same) and computes the rest, equal to a full build.
  `columnsFor` picks the finest level whose bucket fits a column, reads the audio from 1 to 64 frames a pixel, and the
  points below that. Nothing outside the file reads the levels.
* **The working copy** (`WaveAudio`, `state/wave-audio-store.ts`) holds a pane's `audio` and `pyramid`; two panes on
  one sample share both. `app/sample-library.ts` builds the pyramid on decode (`decodeWorking`), updates it after an
  edit (`runEdit`, from `changedFrames`), rebuilds it after a revert, and lets the copy go to `copies`
  (`app/working-copies.ts`, 128 MB of decoded audio, `WORKING_COPY_CACHE_BYTES`) when no pane holds it.
* **No FFT** (IDEAS H1) and **no `core/spectrum`** exist. 120 s of stereo at 48 kHz is 5,760,000 frames a channel,
  46 MB of decoded audio.
* **The spectrum's size** at the spec's numbers: a hop of 512 gives 11,250 columns of 1,025 bins a channel, 11.5 MB;
  every level above adds about as much again, so **23 MB a channel and 46 MB for stereo**. The spec's "23 MB" is a
  channel's (§ Decisions). With the hop a quarter of the FFT size, the bytes are the same at every FFT size.

### Workers, the build and the tests

* **The only worker-like code** is the engine's AudioWorklet: `audio/audio-host.ts` imports
  `./worklet/engine-processor.ts?worker&url` and adds it as a module. **No Web Worker exists**, and `vite.config.ts` has
  no `worker` section; rolldown's code splitting (`build.rolldownOptions`) is set for the main bundle only.
* **Layering:** `audio` may import `@core` and nothing else (`tests/architecture.test.ts`); `ui` imports `@core` and
  `@state`, never `@audio`; `app` wires them. So the ui can't call a worker: it reads stores and calls the services
  `app` provides through `@state` (`useSampleLibrary`), as it does for edits.
* **`tsconfig.json`** has `DOM` and no `WebWorker` lib; a worker file has to type its own scope.
* **Vitest runs in Node** (`environment: 'node'`), which has no `Worker`, so `app` tests need the spectrum service's
  main-thread fallback anyway, the seam the spec names.
* **Settings:** the edit settings (`state/wave-edit-settings.ts`) are a `state` store with `restore`, saved field by
  field under `sfxlab:wave-*` keys by `ui/wave-editor/use-wave-edit-settings-storage.ts`; the ruler's mode is a ui
  `useStoredState` in `SampleEditor`, which `app` can't read. ⚙ is `EditorSettings.tsx`; *View ▾* is `ViewMenu.tsx`.

### Tests and numbers to hold

* `wave-editor.smoke.spec.ts`, `wave-marks.smoke.spec.ts`, `wave-panes.smoke.spec.ts`, `views-at-min-size.smoke.spec.ts`
  (480 × 240), `core/sample/pyramid.test.ts`, `app/sample-library.test.ts`, `ui/wave-editor/wave-editor.test.ts`.
* **The profile** (`scripts/profile-status.cjs`): `wave` is **56** component renders a second with the preview
  playing (`WavePlayhead` 29, `LevelMeter` 27, the editor's own components 0) and 12.8 script ms a second; `wave-split`
  is **85**.
* Smoke tests run outside the sandbox and one at a time: they share port 4173.

## Design

### The spectral core (`core/spectrum/`)

* **`createFft(size)`**: a radix-2 real FFT of a power of two, through a complex FFT of half the size with its twiddle
  and bit-reversal tables made once. `forward(input, re, im)` and `inverse(re, im, output)` write into buffers the
  caller owns; nothing is allocated per call.
* **Windows:** `windowOf('hann' | 'blackman-harris', size)`, made once per kind and size, with their sums
  (`coherentGain`) for scaling.
* **`createStft({ size, hop, window })`**: `magnitudes(channel, centre, out)` writes one column's magnitudes in dB,
  scaled so a full-scale sine centred on a bin reads 0 dB, frames outside the channel read as zero. `inverse` and
  `overlapAdd` resynthesize a range from columns, for part 2.
* **Bytes:** `dbToByte` and `byteToDb` over the fixed range, −120 to 0 dB in 256 steps (`SPECTRUM_DB_FLOOR`, a
  constant). The view's floor is a setting of the colors, not of the data.

### The spectrum pyramid (`core/spectrum/pyramid.ts`)

* **Like the peak pyramid, one file owns the levels.** Level 0 has a column per hop (a quarter of the FFT size: 512 at
  2048), each a byte per bin (`size / 2 + 1`) per channel, its window centred on the middle of its hop. Each next level
  keeps the **maximum per bin of two columns**, until a level has at most 512 columns.
* **Filled in parts.** `createSpectrumPyramid(frames, channels, fftSize, rate)` is empty, with a `filled` flag per base
  column; `fillSpectrum(pyramid, audio, from, to)` computes base columns `from` to `to` and the levels above them, so a
  build can run in chunks in any order and a view can draw what is filled. `buildSpectrumPyramid` is the whole fill.
* **`updateSpectrumPyramid(previous, audio, changed)`**: columns whose windows lie wholly before `changed.from`
  widened by half a window (and wholly after `changed.to`, when the length is the same) are copied, the rest left to
  fill: equal to a build, byte for byte, as `updatePeakPyramid` is. `columnsToFill(pyramid)` says which.
* **`spectrumColumnsFor(view, pyramid)`** picks, as `columnsFor` does, the finest level whose column fits a pixel
  column and gives, per pixel column, the level's column to draw (or none outside the sample or not yet filled):
  `levels` from the hop up, `stretched` below it (each base column over several pixels).
* **`spectrumBytes(frames, channels, fftSize)`** for the budget and the tests.
* The window of the spectrogram is **Blackman-Harris** (§ Decisions), a constant of the pyramid.

### The worker and the service (`audio/`)

* **`audio/spectrum-worker.ts`**, loaded as a module worker (`new Worker(new URL(…, import.meta.url), { type:
  'module' })`, Vite's own way; the worklet's `?worker&url` is for `addModule`), runs `core/spectrum`. It is stateless:
  each job brings its frames and returns bytes.
* **One service call,** `createSpectrumService().spectrumOf(job, onChunk): cancel`, as the spec's seam says. A job is
  a sample's channels (the frames the columns read, copied and transferred, never the working copy itself), the FFT
  size, and the columns to compute in order. The worker answers in chunks of base columns (`SPECTRUM_CHUNK_COLUMNS`,
  256: about half a megabyte for stereo at 2048), yielding between chunks so a cancel gets through.
* **The main-thread fallback** is the same call where `Worker` doesn't exist (Node, the `app` tests): the chunks run in
  `setTimeout` slices.
* Nothing crosses the AudioWorklet or the engine.

### The spectra in `state` and `app`

* **`useWaveSpectrumStore`** (`state/wave-spectrum-store.ts`): a spectrum per sample a pane shows, `{ sampleId,
  fftSize, pyramid, version }`. Two panes on one sample share it, as they share the audio. The chunks fill the pyramid
  in place and bump `version`, so the lanes redraw without React rendering (the store is read by subscription, as
  `DetailView` reads the views).
* **`app/wave-spectrum.ts`** decides what to compute, watching the panes' working copies and the lane mode:
  * while the lanes show the spectrogram (*Spectrogram* or *Split*), each shown sample without a spectrum at the
    setting's FFT size gets one: the columns in the pane's view first, then outwards from it;
  * **after an edit,** the result's spectrum starts as `updateSpectrumPyramid` of the source's (copied a level at a
    time), and only the columns left to fill are sent, with only the frames they read;
  * a spectrum goes when no pane shows its sample; a new FFT size cancels the jobs and starts again; a job whose sample
    a pane left is cancelled.
* **The settings** join `useWaveEditSettings`, so `app` sees them: `lanes: 'waveform' | 'spectrogram' | 'split'` and
  `spectrum: { scale: 'log' | 'linear', fftSize: 1024 | 2048 | 4096, floorDb }`, saved under `sfxlab:wave-lanes` and
  `sfxlab:wave-spectrum` by the existing storage hook (a bad value keeps the default, as now).

### Lane modes and the spectrogram (`ui/wave-editor/`)

* **The renderer table:** `LANE_RENDERERS = { waveform, spectrogram }`, each `LaneRenderer<Data>`; `DetailView` asks
  `columnsFor` for the waveform and `spectrumColumnsFor` for the spectrogram, and nothing else knows which mode is on.
  *Split* draws the waveform in the top `SPLIT_WAVE_SHARE` (a third) and the spectrogram under it, in one canvas; the
  scale does the same in the gutter. The overlay (veil, marks, cursor, playhead) stays the lane's, over every mode.
* **Drawing the spectrogram:** each pixel row maps to a range of bins on the frequency scale (`binRows(height, scale,
  bins, rate)`: the loudest bin of the range, or the nearest bin where a row is finer than a bin); each byte maps to a
  color through one 256-entry table (`SPECTRUM_COLORS`, a constant round 13's themes can swap) shifted by the floor.
  The pixels are written into an `ImageData` at the lane's size in CSS pixels and drawn with smoothing off, one column
  per pixel as the waveform is. Columns not filled yet are the floor's color.
* **The frequency scale:** `frequencyMarks(height, scale, nyquist)`; on the log scale 20 Hz to the Nyquist frequency,
  labels at 50, 100, 200, 500, 1k, 2k, 5k, 10k, 20k where they are at least 24 px apart; on the linear scale steps of
  1, 2 or 5 kHz chosen for the same spacing. Redrawn when the scale, the FFT size or the gutter's size changes.
* **The selection over the spectrogram** keeps its veil and gains a 1 px accent line at each edge, since an amber veil
  is hard to see on a ramp that runs through amber.
* **`data-spectrum`** on the detail says what was drawn (`levels`, `stretched`, `on-demand`, or `pending` while the
  view's columns aren't filled), as `data-draw` does for the waveform, for the tests.
* ***View ▾*** gains *Waveform*, *Spectrogram* and *Split* as checked entries after the zooms; **⚙** gains a
  *Spectrogram* group: the scale (two radio buttons), the FFT size (a `select`) and the floor (a number in dB).
* **The overview stays the waveform** in every mode (§ Decisions).

### Zoomed in: columns on demand

* **Below the base hop** (512 frames a pixel at 2048), `spectrumColumnsFor` gives `stretched` columns, drawn at once.
  The pane then asks `SampleLibrary.spectrumView(at, view)` (`@state`'s service, which `app` answers through
  `spectrumOf`) for the view's own columns: one FFT per pixel column, at most one per `ON_DEMAND_MIN_HOP` frames
  (an eighth of the hop, 64 at 2048; finer than that adds nothing a window that long can show), in the worker.
* **One request per pane,** made once the view has settled for an animation frame; a newer view cancels it. The answer
  is kept for the view it was asked for (`{ startFrame, framesPerPixel, width, bytes }`) and drawn while the view is
  the same; a scroll draws `stretched` columns until the next one arrives.

## Steps

Each step lands green: `npm test`, `npm run typecheck`, `npm run test:smoke` (outside the sandbox, one spec run at a
time). No engine change, so `npm run test:audio` runs only at the end. **Holds** names the profile and measures each
step must keep.

1. **The spectral core.** `core/spectrum/` (`createFft`, `windowOf`, `createStft`, the inverse and overlap-add,
   `dbToByte`), exported through `core/index.ts`. Nothing visible.
   *Tests:* forward then inverse gives the input back within 1e-6 at 1024, 2048 and 4096; a tone at bin *k* peaks at
   bin *k*, and one between bins at the nearer one; each window's sum against its constant; a full-scale sine reads
   0 dB within the window's scalloping; STFT then overlap-add with Hann at a quarter hop gives the input back within
   1e-6 away from the ends; repeated calls return the same buffers (no allocation).
   *Holds:* `wave` 56 (unchanged code paths).
2. **The spectrum pyramid.** `core/spectrum/pyramid.ts`: the empty pyramid and `filled`, `fillSpectrum` in chunks,
   `buildSpectrumPyramid`, `updateSpectrumPyramid`, `columnsToFill`, `spectrumColumnsFor`, `spectrumBytes`.
   *Tests:* each level against a brute-force maximum of the base; chunks filled in any order equal a build; the update
   after a same-length edit and after a length-changing one equals a build, byte for byte, and leaves to fill only the
   columns whose windows touch the change; `spectrumColumnsFor` at each band (`levels` at the top, at a middle level,
   at the hop, `stretched` below it, none outside the sample or unfilled); `spectrumBytes` for 120 s stereo.
   *Holds:* `wave` 56.
3. **The worker, the service and the spectra.** `audio/spectrum-worker.ts`, `createSpectrumService` with its fallback,
   `useWaveSpectrumStore`, `app/wave-spectrum.ts`, the two settings and their keys. The editor still draws the
   waveform: nothing on screen changes, but switching `lanes` in the store computes spectra.
   *Tests* (`app`, memory storage, the fallback): with `lanes` on *Spectrogram* an open sample gets a spectrum equal to
   `buildSpectrumPyramid`, the view's columns first; on *Waveform* none is computed; the second pane on the same sample
   shares it, on another computes its own; an edit fills only the columns to fill, and the result equals a build; a new
   FFT size rebuilds; closing the pane drops it; a pane moving to another sample cancels its job. The worker's message
   handler, as a function, answers a job with the same bytes as the fallback. The settings: restore, a bad value
   ignored. *Build:* `npm run build` emits the worker as its own chunk (a check in `bundle.smoke.spec.ts`; `worker.format:
   'es'` in `vite.config.ts` if rolldown asks for it).
   *Holds:* `wave` 56, `wave-split` 85 (waveform mode computes nothing).
4. **Lane modes and the spectrogram.** `LANE_RENDERERS`, the generic renderer, *Split*, the spectrogram renderer
   (`binRows`, `SPECTRUM_COLORS`, the floor), the frequency scale, the selection's edges, `data-spectrum`, *View ▾*'s
   three entries, ⚙'s *Spectrogram* group.
   *Tests* (ui units): `binRows` covers every bin once, rises with the row and puts 1 kHz where the scale says, on both
   scales; `frequencyMarks` keeps 24 px between labels at 60, 120 and 400 px; the color table at the floor and at 0 dB;
   a column painted into a pixel buffer. *Browser* (`wave-spectrum.smoke.spec.ts`, on a generated sample with a 1 kHz
   tone in its first half): *View ▾ → Spectrogram* draws (`data-spectrum` leaves `pending`), the 1 kHz row is brighter
   than the 8 kHz row in the first half and not in the second; *Split* shows both and both scales; ⚙ → FFT 4096
   redraws; reload keeps the mode and the settings; *Gain…* on a part still draws, then undo; the second pane on
   another sample draws its own; `views-at-min-size` with *Split* and two panes.
   *Holds:* `wave` 56 (waveform); a new `wave-spectrum` setup (the spectrogram on, the preview playing) at most 56, the
   editor's components and the spectrum store's readers 0 renders, script ms within 10 % of `wave`'s.
5. **Columns on demand.** `ON_DEMAND_MIN_HOP`, `SampleLibrary.spectrumView`, the request per pane and its cancel, the
   drawn answer.
   *Tests:* the answer's columns equal one STFT column each at the pixel's centre (brute force); at 50 frames a pixel
   it computes one column per 64 frames (`ON_DEMAND_MIN_HOP`), not one per pixel; a newer view cancels the older
   request; the answer is drawn only for its own view. *Browser:* zoomed in to 50 frames a pixel, `data-spectrum` goes
   from `stretched` to `on-demand`; a scroll goes back to `stretched`, then `on-demand`.
   *Holds:* `wave` 56, `wave-spectrum` as after step 4.
6. **Docs, the profile and the measures.** `architecture/samples-and-wave-editor.md` (lane modes, the renderer table,
   the spectrum pyramid, the worker and its jobs, the columns on demand), `architecture/overview.md` if the worker
   changes the layering's picture, `reference/formats-and-versions.md` (the two keys), `reference/baselines.md` (the
   measures), IDEAS H1 marked done; the notes sorted per [doc-workflow](../dev/doc-workflow.md); STATUS, BACKLOG (U9
   becomes part 2; V10's hand pass grows); the plan to `archive/ui-redesign/`. The spec stays in `active/` for part 2.

## Behavior changes

* *View ▾* gains *Waveform*, *Spectrogram* and *Split*; the lanes show the waveform until one is picked, and the
  choice is remembered per browser.
* ⚙ gains the spectrogram's scale, FFT size and floor.
* While the spectrogram shows, a worker computes it; memory grows by about 23 MB a channel for a 120 s sample at any FFT
  size (46 MB for stereo), per sample shown, and is given back when no pane shows it.
* Nothing in the project format, the engine or the edits changes.

## Verification

* `npm test`, `npm run typecheck`, `npm run test:smoke` at every step; `npm run test:audio` at the end.
* **Profile:** `wave` stays at 56 component renders a second, `wave-split` at 85; `wave-spectrum` (new, step 4) at
  most 56, with the spectrogram's drawing outside React.
* **Measure** (`scripts/measure-spectrogram.cjs`, committed, on the dev server's page with the app's entry stubbed as
  `measure-second-pane.cjs` does): for a 120 s stereo 48 kHz sample, the time from *Spectrogram* to the view's columns
  and to the whole pyramid; the **longest main-thread task** while it fills (a `longtask` observer; must be under
  50 ms, the spec's test); one view's draw time at 1400 × 2 lanes; the partial update after a 1 s *Gain…* at 60 s; the
  on-demand answer at 50 frames a pixel; the FFT's cost per column in the worker. Recorded in "Changes made while
  implementing", then in `reference/baselines.md`.
* **Manual pass** (BACKLOG V10 grows): the spectrogram's colors and scale in both themes, *Split* at small heights, the
  fill-in on a long file, zooming in and scrolling on a trackpad.

## Decisions to sign off

Signed off 2026-10-31: every row as proposed.

| Question | Proposed | Alternative |
|---|---|---|
| One plan or two for round 11d | **Two:** this one (read only), then part 2 (band selection and edits) planned once this has landed, on what it found | One plan for both parts |
| The spectrum's memory (the spec says ≈23 MB for 120 s stereo; that is a channel's) | **Accept ≈46 MB for 120 s stereo** at the spec's hop (a quarter window), per sample shown | A hop of half a window: 23 MB for stereo, coarser in time, columns on demand from 1024 frames a pixel |
| When it is computed | **Only while the lanes show it** (*Spectrogram* or *Split*) | On opening a sample, in the background, in every mode |
| How it fills in (the spec's "coarse first") | **The view's columns first, then outwards,** each chunk complete in every level; columns not filled yet are the floor's color | A sparse pass first (every 32nd column, the whole sample), then the full fill |
| The spectrogram's window | **Blackman-Harris** (its sidelobes stay under a −100 dB floor) | Hann (Audacity's default; visible smear around strong tones at −100 dB) |
| A spectrum no pane shows any more | **Dropped;** an undo back to it computes it again, filling in | Kept beside the working copies' cache, under a budget of its own |
| Columns zoomed in past the hop | **On demand in the worker,** at most one FFT per 64 frames, stretched base columns drawn meanwhile | On the main thread, one per pixel (the spec's words; about 2,800 FFTs a redraw for a 1400 px stereo view, likely over 50 ms) |
| Lane modes with two panes | **One mode for the editor,** both panes (the spec's "per editor") | A mode per pane |
| The overview | **Stays the waveform** in every mode: it is the scrollbar, and the waveform reads at 48 px | A spectrogram from the pyramid's top level in *Spectrogram* mode |
| The color table | **A ramp from the background through violet and the accent's amber to white,** one constant | A standard map (magma or inferno), or grey |
| Where the settings live | **In `useWaveEditSettings`,** under `sfxlab:wave-lanes` and `sfxlab:wave-spectrum`, so `app` knows when to compute | A ui `useStoredState`, as the ruler's mode (then `app` can't see the mode) |
| The selection over the spectrogram | **The veil plus a 1 px accent line at each edge** | The veil only, as on the waveform |

## Changes made while implementing


**Step 1 (the spectral core).** As planned. The windows are periodic (DFT-even), so Hann overlaps to exactly a constant
at a quarter hop; `overlapAdd` scales by the windows' squares summed over a hop, which is that constant.

**Step 2 (the spectrum pyramid).**

* **A worker's chunk goes in through `putSpectrumColumns`,** beside `fillSpectrum`: the worker computes base columns
  (`spectrumColumnBytes`, from a slice of the channel starting at `offset`), the main thread writes them and the levels
  above them. Each level keeps a `filled` flag per column (both of its columns below filled), so `spectrumColumnsFor`
  says `pending` without walking the base.
* `spectrumColumnsFor` gives each pixel column a range of a level's columns (`from`, `to`), drawn loudest per bin, not
  one column: a pixel between two level hops covers up to two.
* The sizes differ by up to 2 % between FFT sizes, not 0: the levels stop at 512 columns or fewer, so the top level's
  rounding differs.

**Step 3 (the worker, the service and the spectra).**

* **The service sends one chunk at a time, with only the frames its windows read** (about a megabyte for stereo), two
  chunks in flight per job, instead of a copy of the whole working copy up front: no task on the main thread copies more
  than a chunk, and a cancel only stops sending. The worker keeps nothing; a worker that fails hands its chunks to the
  main thread, sliced again.
* **An edit's result finds its source through the working copy:** `WaveAudio.editedFrom` (`{ sampleId, changed }`),
  set by `runEdit`. `app/wave-spectrum.ts` makes new spectra before it drops old ones, so the result is updated from
  its source's pyramid in the same store change that takes the source away.
* **The view's columns first is a guess at the width:** the stores keep no view's width, so the fill puts first the
  chunks over `startFrame` to `startFrame + 2000 px` at the view's zoom (`VIEW_GUESS_PX`).
* The worker bundles to 106 kB: it imports `@core`'s index, as every layer does.
* The build check is the step 4 browser spec (the spectrogram draws from the built worker, and the spec sees the
  `spectrum-worker` script start), not `bundle.smoke.spec.ts`.

**Step 4 (lane modes and the spectrogram).**

* **A lane draws its parts, not one renderer:** `laneParts(lanes)` gives the waveform, the spectrogram or both with
  their share of the height, and `WaveLane` and `LaneScale` draw each part through `LaneRenderers` (the waveform's
  renderer and a spectrogram renderer made per scale, floor and sample rate by `useLaneRenderers`). The veil goes under
  the waveform and over the spectrogram, with the accent lines there.
* **The image goes through a small canvas of its own:** `putImageData` ignores the lane's transform and clip, so the
  renderer paints an `ImageData` at the part's CSS size, puts it into a scratch canvas and draws that with
  `drawImage` (smoothing off), which honours both.
* A mono lane is labelled *Spectrogram* while it shows only the spectrogram (and *Waveform* otherwise), as `Left` and
  `Right` name stereo lanes.
* **The demo files and the spec's tone are short, so they draw `stretched`**, not `levels`: 2 s in 1300 px is under
  the hop a pixel. The browser spec takes any drawn state and checks the pixels instead: the 1 kHz row is bright in the
  tone's half and the 8 kHz row isn't.
* A reload doesn't reopen the sample (the editor's sample isn't saved); the spec opens it again and finds the mode and
  the settings kept.
* **Profile** (load average 5 to 6, at the step 4 tree): `wave` holds at **56** component renders a second, 15.4 script
  ms; `wave-spectrum`, a new setup with the spectrogram filled in, **56** and 13.2 script ms. `DetailView`, `WaveLane`
  and `LaneScale` render 0 times while the preview plays.

**Step 5 (columns on demand).**

* **The ask goes through the store, not `SampleLibrary`:** a pane's lanes set `useWaveSpectrumStore.asks[pane]`
  (`spectrumAsk`), and `app/wave-spectrum.ts`, which owns the service, answers into `answers[pane]` if the ask is still
  the pane's. The ui reaches `app` through stores here, as `openAudio` follows the selection, and the spectrum service
  stays out of the sample library.
* **An ask covers the view and a quarter of its width on each side,** so a small scroll still draws from it; the lanes
  ask again only when the answer, or the ask in flight, doesn't cover the view (`askCovers`).
* **"Settled for a frame" is the view object being the same a frame later:** the ask is made in the next animation
  frame only if the store's view for the pane hasn't changed. Without that, a long scroll queued an ask a frame at the
  worker, each one's chunks computed after it was cancelled.
* **The hop on demand is whole frames** (`max(an eighth of the hop, round(frames per pixel))`), and `framesRead` gives
  whole frames: a fractional slice start shifted the worker's columns by a frame against the main thread's.
* Columns on demand take their hop through the same call: `spectrumColumnBytes`, the request and the job gained a
  `hop` (the pyramid's by default).
* The demo files and the spec's tone are under the hop a pixel, so the browser spec sees `on-demand` without zooming,
  then again after a ⌘-wheel zoom.
* **Profile** (load average 4 to 6, step 5's tree, interleaved): `wave` **56** renders and 13.0, 12.9 and 14.4 script ms
  a second; `wave-spectrum` **56** and 16.0, 13.1 and 15.6; `wave-split` **85** and 14.8. With step 4's pair, `wave`
  averages 13.9 script ms and `wave-spectrum` 14.5 (+4 %), within the plan's 10 %; a single pair varies by ±2 ms.
