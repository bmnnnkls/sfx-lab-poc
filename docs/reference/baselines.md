# Baselines

Numbers worth comparing against, taken from the rounds' implementation notes. Each row says when, on which commit or
round, and how it was measured. The machine is an Apple Silicon Mac, often under load. Load moves these numbers, so to
compare two builds, measure both in the same session, interleaved
([gotchas](../dev/gotchas.md#measuring)). Raw campaign evidence is in [`measurements/`](../measurements/README.md).

## UI work per second while playing

`scripts/profile-status.cjs`: one run per setup, 10 s after 2 s of warm-up, headless Chromium at 1500 × 1000; the dev
server for component renders and `vite preview` for script time. Setups are described in the script's header.
Latest: round 11b (2026-10-29, load average 5 to 8).

| Per second | `editor` | `four` | `groups` | `pinned` | `wave` |
|---|---:|---:|---:|---:|---:|
| Component renders (dev) | 145 | 173 | 87 | 145 | 56 |
| Script ms (production) | 15.3 | 16.7 | 15.5 | 16.5 | 14.6 |

* Component renders are the stable signal: they have matched since round 2 (`editor` 144–145, `four` 173). A change
  of even one is worth explaining.
* Script time is noisy. 11a's build profiled again beside 11b's on the same machine gave `editor` 12.6 / 13.3 ms
  against 13.0 / 13.5 ms. Compare only within one session.
* In `wave`, the only status readers are `WavePlayhead` (29/s, the status rate) and `LevelMeter` (27/s). The editor's
  own components render 0 times.

Round 11c-1 (2026-10-31, load average 4 to 6), `wave` only: 56 component renders and 13.8 to 15.2 script ms a second; the new
toolbar, status bar and scale components (`ProcessMenu`, `ViewMenu`, `EditorSettings`, `WaveStatus`, `LaneScale`)
render 0 times.

Round 11c-2 (2026-10-31, `f8b3560`, load average 4 to 6), `wave` only, its setup adding two markers, a region and the
loop: 56 component renders and 12.6 script ms a second; `MarkLane` renders 0 times.

Round 11c-3 (2026-10-31, `3ac4f0d`, load average 3.5 to 4.5): `wave` 56 component renders and 12.8 script ms a second;
`wave-split` (the second pane open on the playing sample) 85 and 11.6, `WavePlayhead` 58 (one per pane, at the status
rate); `WavePane`, `PaneTitle` and `PaneSplitter` render 0 times.

Round 11d-1 (2026-10-31, `0dc9fd5` and `79c090d`, load average 4 to 6, four interleaved pairs): `wave` 56 component
renders and 13.9 script ms a second on average (12.9 to 15.4); `wave-spectrum` (the lanes on the spectrogram, filled
in) 56 and 14.5 (13.1 to 16.0); `wave-split` 85 and 14.8. `DetailView`, `WaveLane` and `LaneScale` render 0 times. A
single pair varies by ±2 ms.

Round 11d-2 (2026-10-31, `6d134da`, load average 4 to 5): `wave` 56 and 15.2; `wave-split` 85 and 15.1;
`wave-spectrum`, its setup now drawing a box in the spectrogram (so ▶ loops the box's time range), 57 and 11.2 to 14.7:
`WavePlayhead` renders 29 times a second, at the status rate. `DetailView`, `WaveLane`, `WaveStatus` and `LaneScale`
render 0 times.

Round 12a (2026-11-04, `9ac535f`, load average 9 to 10): `editor` 87 component renders and 14.2 script ms a second
(145 before: the arrangement drew one playhead per lane, three on the Starter, and now draws one); `groups` 58 and 10.0
(87 before: the arrangement's playheads ran while scene 1 played, and now show only in arrangement mode); `wave` 56 and
11.3, unchanged. `ArrangementView`, `ArrangementRegion` and the headers render 0 times; `ArrangementPlayhead` 29.

Round 12b (2026-11-04, `6353599`, load average 5 to 7): `editor` 87 and 13.5; `groups` 58 and 15.1; `loop`, new (the
`editor` setup with three markers and a one-bar brace turned on, so the arrangement loops while measured), 87 and
16.9. `ArrangementMarks` and `ArrangementMarkLines` render 0 times: they subscribe to the project, not the status.

Earlier tables: [round 2](../archive/ui-redesign/PLAN-round-2-shell.md#changes-made-while-implementing) (the
first, with base comparisons), [round 11a](../archive/ui-redesign/PLAN-round-11a-stereo-and-the-pyramid.md#changes-made-while-implementing),
[round 11b](../archive/ui-redesign/PLAN-round-11b-in-place-edits.md#changes-made-while-implementing).

## Wave editor

Chromium (Playwright's headless shell), median of 7 runs for the pyramid and 5 for the flow, load average 5 to 9,
round 11b step 8 (2026-10-29). The measuring script is not committed ([BACKLOG](../BACKLOG.md#verification-debt) V8).

| 120 s stereo, 48 kHz | Time |
|---|---:|
| `buildPeakPyramid` (full build) | 19.3 ms (11.7 ms in 11a, unloaded) |
| `updatePeakPyramid`, a fade over the last 0.5 s | 0.2 ms |
| `updatePeakPyramid`, a delete of the first second (a full rebuild) | 19.5 ms |

`selectionLevels` (the status bar's peak and RMS), round 11c-1 step 3 (2026-10-31), Chromium 156 (Playwright's) on
the dev server's modules, median of 7 runs after 2 warm-ups, load average 4 to 6, `scripts/measure-selection-levels.cjs`:

| 120 s stereo, 48 kHz | Time |
|---|---:|
| `selectionLevels`, the whole of it, stereo | 11.5 ms |
| `selectionLevels`, the whole of it, one channel | 7.0 ms |
| `selectionLevels`, a tenth of it, stereo | 1.2 ms |

*Revert to original* and the zero-crossing search, round 11c-2 step 7 (2026-10-31, `f8b3560`), Chromium 156
(Playwright's) on the dev server's modules, load average 4 to 6, `scripts/measure-revert-and-zero.cjs`:

| 120 s stereo, 48 kHz | Time |
|---|---:|
| `revertSample` after one in-place edit (read, decode, commit) | 44.9 ms |
| the same, the first time (the engine is sent the audio too) | 75.2 ms |
| `decodeAudio` of the original alone (16-bit WAV) | 43.7 ms |
| `nearestZeroCrossing` at the widest zoom (46,080 frames either way), on a sine | under 0.001 ms |
| the same on a constant (no crossing: the whole reach read) | 0.22 ms |

Opening the second pane, round 11c-3 step 5 (2026-10-31, `3ac4f0d`), Chromium 156 (Playwright's) on the dev server's
modules without the app, load average 3.5 to 4.5, `scripts/measure-second-pane.cjs`, from the call to the pane's
working copy:

| 120 s stereo, 48 kHz | Time |
|---|---:|
| on another sample than the first pane's (read, decode, pyramid), median of 3 | 66.7 ms |
| the same, the first run | 107.8 ms |
| on the first pane's sample (shared: nothing decoded) | 0 ms |

The spectrogram, round 11d-1 step 6 (2026-10-31, `79c090d`), Chromium 156 (Playwright's) on the dev server's modules
without the app, load average 2.6 to 3.3, `scripts/measure-spectrogram.cjs`, FFT 2048, the worker:

| 120 s stereo, 48 kHz | Time |
|---|---:|
| from *Spectrogram* to the view's columns (25 s at 600 frames a pixel), median of 3 | 239 ms |
| from *Spectrogram* to the whole pyramid (45.4 MB) | 930 to 950 ms |
| the longest main-thread task while it fills (the observer saw a 60 ms test task) | none over 50 ms |
| one redraw of two 1400 × 300 lanes from the pyramid (`spectrumColumnsFor`, `paintSpectrum` twice) | 11.3 to 11.9 ms |
| `updateSpectrumPyramid` after a 1 s Gain at 60 s (copying the untouched columns) | 5 to 15 ms |
| the edit's result refilled after the edit (98 base columns) | 9 to 10 ms |
| the edit's longest task, spectrogram on / waveform only (P5) | 104 to 130 / 98 to 123 ms |
| a view's columns on demand at 50 frames a pixel, 1400 px (2100 columns a channel) | 131 to 145 ms |
| one base column of one channel, main thread | 41 µs |

Band gain, round 11d-2 step 5 (2026-10-31, `6d134da`), the same script and setup, load average 3 to 5, two runs: band
gain (200 Hz to 2 kHz, −12 dB, both channels) through the app, applied in the spectrum worker. The longest task is the
edit's own encode and hash ([BACKLOG](../BACKLOG.md#performance) P5); the last column is the same edit applied on the
main thread, one task.

| 120 s stereo, 48 kHz, band gain over | to the result | longest main-thread task | spectrum refilled | on the main thread |
|---|---:|---:|---:|---:|
| 1 s | 123 to 125 ms | 107 to 109 ms | 11 to 12 ms | 14 to 16 ms |
| 10 s | 204 to 227 ms | 108 to 116 ms | 82 ms | 95 to 98 ms |
| the whole sample | 1.24 to 1.25 s | 95 to 113 ms | 936 to 937 ms | 1.0 s |

| In-place edit flow, stereo | apply | encode | hash | store | total |
|---|---:|---:|---:|---:|---:|
| 5 s | 0.2 ms | 1.7 ms | 0.9 ms | 1.4 ms | 4.2 ms |
| 120 s | 2.9 ms | 44 ms | 20 ms | 34 ms | 100.9 ms |

## Arrangement

`scripts/measure-long-timeline.cjs` (2026-11-04, `9ac535f`, production build, headless Chromium, load average 9 to 10):
a region at beat 4000 and one at 0 at the closest zoom (256 px a beat) make each lane 1,025,976 px wide. Five seconds
of sideways wheel scrolls and ⌘-wheel zooms out and back in gave no long task (none over 50 ms).

## Library tree

The near-limit case of `tests/browser/library/library-tree.smoke.spec.ts` (2026-11-05, library phase 1, production build,
Chromium 156 via Playwright, Apple M3 Pro, load averages 6 to 8, `ba349a2`): a catalog of 1024 folders (32 top-level, 31 inside
each) and 4096 items (a quarter presets). A search matching 238 rows took 28–36 ms to the next frame, clearing it (a full
re-render of the collapsed tree, 34 rows) 14–21 ms, and opening a top-level folder 14–19 ms. Raw numbers in
[measurements/library-tree-near-limit.json](../measurements/library-tree-near-limit.json). The threshold for
virtualizing the tree is 100 ms.

The Factory catalog (library phase 6, 2026-11-05, `95ad59a`, the main development machine): 49 items, 14 folders and 37
revisions, **524 900 bytes** of JSON. `createFactoryCatalog` took **80, 96 and 103 ms** in Chromium on the dev build
(three cold loads in the app's preview pane, read from the `sfxlab:factory-catalog` performance measure) and 85–150 ms
in Node under Vitest (the first build of a process the slower); `validateLibraryCatalog` on it about 75 ms. The plan's
threshold for building it in an idle callback is 150 ms.

## Audio engine

The F1 capacity campaign (2026-10-19) is the most recent engine measurement. Its accepted results (first callback
3.265 ms against a 2.667 ms budget, +27/+30% no-lane overhead) are in [STATUS](../STATUS.md#accepted-limits); the
method and raw data are in [measurements/f1-fix](../measurements/f1-fix/README.md) and
[`scripts/review-benchmark/`](../../scripts/review-benchmark/README.md).

## Bit-for-bit references

`core/engine/old-projects.test.ts` holds bounce hashes taken before round 11a's engine changes: both examples' busiest
scene and a project with stereo files on old audio tracks and a sampler. They must not change unless a decision says
old projects may sound different.

## Bundle

After the vendor chunk split, the main chunk went from 705.5 kB to 400.1 kB, React 218.8 kB, menu dependencies
85.8 kB, and the audio worklet 117.8 kB (slice 1, 2026-10). These numbers predate the redesign; measure again before
using them ([BACKLOG](../BACKLOG.md#performance) P4). The spectrum worker is its own chunk, 106.5 kB (round 11d-1,
2026-10-31), 109.6 kB with the band edits (round 11d-2): it imports `@core`'s index.

With `src/core` in its own chunk (library phase 5, 2026-11-05, `df33d91`, `npm run build` on the main development
machine, gzipped sizes from Vite's report): `core` 123.0 kB, `state` 29.7 kB (146.9 before), main `index` 112.3 kB
(114.8 before); the eager total grew about 2.9 kB, under 1 kB of it the step's own code. The lazy `library` chunk
(the library service) stays 3.7 kB. At the end of phase 5 (`d2d50d4`): `core` 123.7 kB, `state` 30.0 kB,
`index` 112.9 kB, `LibraryPanel` 10.4 kB.

With the Factory (library phase 6, 2026-11-05, gzipped, against `cb124ef`): a lazy `factory` chunk of 16.9 kB (5.4 kB
gzipped), not preloaded; `index` 112.9 → 112.3 kB, `core` 123.7 → 124.9, `state` 30.0 → 30.7, `LibraryPanel` 10.4 → 11.0,
`library` 1.8 → 1.9. `vite build` takes about 0.4 s after `tsc`.

## Project files

Library links (library phase 5, 2026-11-05): Low Light with ten of its instruments saved and inserted again as linked
sounds (26 tracks, 282 pairs) is 510 331 bytes, against 501 329 with the links stripped: 9 002 bytes, 1.8 %, about
900 bytes a link. It loads without warnings and reads back identical; measured with a throwaway Vitest file running
`captureLibraryAsset` and `insertLibraryAsset` on the example.

## Test suites

The main development machine (12 logical cores), on `feat/library-improvements`:

* **`npm test`** (2026-11-04, `953d72d` with library work in progress): 246 files in 29 s wall, 107 s summed over
  files. The wall time is set by `core/examples/low-light.test.ts` (28 s) and `glass-rain.test.ts` (24 s), most of it
  their *cannot be broken by Randomize* tests (14 s and 17 s); `core/engine` is another 35 s summed, spread over 33 files.
* **`test:smoke`**: 229 tests summed to about 250 s on one worker (2026-11-04, the run's HTML report). On two workers
  (2026-11-05, `204821d` plus the worker change), 235 tests passed in 148 s wall, 278 s summed. The longest files then
  were `arrangement` (33 s), `views-at-min-size` (28 s), `wave-editor` (25 s), `wave-marks` (22 s) and `automation`
  (20 s). A probe on six workers (2026-11-04) took 101 s wall.
* `tsc --noEmit` and `vite build` take about 3 s together.
