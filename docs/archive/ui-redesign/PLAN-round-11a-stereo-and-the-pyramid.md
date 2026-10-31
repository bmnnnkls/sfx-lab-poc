---
status: done
date: 2026-10-29
shipped_in: architecture/samples-and-wave-editor.md
---
# Round 11a: stereo and the pyramid

Status: **done** 2026-10-29; plan signed off 2026-10-29, decisions as proposed. Written 2026-10-29. Part of the [UI redesign](README.md). Carries out the first of
the three parts in the signed-off [round 11 spec](SPEC-round-11-wave-editor.md) (§ Suggested split), from a second
inventory of the code it touches, taken on `imp/jovial-fermat-5ae301` at `be367c6` (round 10 done and the spec
signed off, neither merged into `feat/ui-redesign` yet). The spec's decisions are settled and not repeated here; this
plan only adds the ones it raises.

## Goal

Samples become stereo, and the Wave editor becomes the new view. Edits still make copies, as today. After 11a:

* **a stereo file stays stereo:** decoded with both channels, held by the engine with both, played in stereo by an
  audio track whose `Track in` is switched to stereo, by the preview and by the bounce. New audio tracks start in
  stereo. Every old project sounds exactly as before;
* **the Wave editor has an overview, a detail view and a ruler** in time or beats, with one lane per channel;
* **the waveform is sharp at every zoom,** from the peak pyramid and, zoomed in, from the audio itself, down to single
  samples;
* **the selection** is in frames, on both channels or one, and lives in a store, so it survives tab switches;
* **▶ plays the selection** (or from the cursor), with a playhead;
* **the editor's six edits** are described as data (`SampleEdit`) and keep both channels. They still make a copy, now
  saved as 32-bit float WAV;
* **file format v11** carries `origin`, `markers` and `regions` on a sample, ready for 11b and 11c.

**Out of scope** (11b and 11c, per the spec):

* in-place edits, `replaceSample`, the undo caches, the `sample-edits` store and cleanup, the room check;
* the new processes, fade curves, cut and paste, crossfades, the audio clipboard;
* the entry points from clips, regions and the sampler;
* markers and regions in the UI; snap; the focus subject, verbs and view keys;
* the spectrogram and the granular sampler.

## Inventory

What the spec's inventory found holds. These are the details this part needs.

### Who reads decoded audio

| Reader | File | Reads | Changes in 11a |
|---|---|---|---|
| Sampler node | `core/dsp/nodes/sampler.node.ts` | `sample.data`, linear interpolation | reads `monoAt` |
| Audio track runtime | `core/engine/audio-track-runtime.ts` | `sample.data` through `regionOf`, `readRegion`, `fadeGain`; writes a mono `scratch` of `MAX_BLOCK_FRAMES` | a stereo path |
| Preview | `core/engine/sample-preview.ts` | `sample.data`, the same value into both master channels | both channels, a range, a position |
| Bounce | `core/engine/bounce.ts`, `app/export-audio.ts` | `SampleData[]` from `decodeAudio(...).mono` | channels |
| Library preview | `app/library.ts` | `audio.mono`; a sample item plays its first 4 s in both channels | channels |
| Loader | `app/sample-library.ts` | `decoded.mono`, transferred | channels, each transferred |
| Thumbnails | `app/sample-library.ts` (`computePeaks`) | `decoded.mono` | the loudest of the channels |

`decodeAudio` has four callers: the loader (twice), the export and the library preview.

### `Track in` and stereo lifting

* `Track in` (`core/dsp/nodes/track-in.node.ts`) copies `input[i]`. It has no inputs and one `signal` output.
* Lifting (`compile.ts`, `node-shape.ts`): a node with `stereo: true` whose definition is `stereoCapable` gets two DSP
  copies, one per channel, with its signal ports turned stereo. Gain, Filter, Delay, Comb, EQ and Compressor opt in today.
* A lifted copy isn't told which channel it is. For a node with inputs that doesn't matter: each copy is handed its
  channel's buffer. For `Track in`, which reads `ProcessContext.input`, both copies would read the left channel.
* `sanitize-patch.ts` keeps `stereo` only when the definition is `stereoCapable`, so making `Track in` capable is
  enough for files.
* `createAudioTrack` uses `createDefaultFxGraph()`: `Track in` wired to `Track out`, which is already a stereo sink.

### Exactness

Old projects must sound the same, bit for bit. Two traps:

* An old project's stereo file was averaged once at decode (`toMono`) and then interpolated, gained and faded. If the
  runtime read both channels and averaged *after* the gain, the result would differ in the last bit.
* A mono sample read as stereo (left = right = x) and averaged gives `(x + x) / 2 = x` exactly. So mono samples are
  safe either way.

### The editor's tests

* `tests/browser/wave-editor.smoke.spec.ts` opens a sample with ✎, closes it, opens it from the empty state, and
  imports nine files. Its names (`sample-editor`, *Close*, *No sample is open.*, *Import samples…*, *Show samples*)
  stay.
* `arrangement.smoke.spec.ts` clicks *Reverse* in the editor and closes it. *Reverse* stays a button.
* `views-at-min-size.smoke.spec.ts` checks that the waveform "scrolls sideways inside its own scroller"
  (`[data-scroll]`). The new detail view doesn't scroll natively (below), so that check changes.

### Profile

`scripts/profile-status.cjs` has no case with the Wave editor open while audio plays. A preview playhead adds a
status reader there, so 11a adds one.

## Design

### The sample's audio (`core/sample`)

* **`SampleAudio`** `{ sampleRate, channels: readonly Float32Array[] }`, one or two channels.
* **`SampleData`** `{ id, sampleRate, channels }`. `data` goes; the compiler finds every reader.
* **`monoAt(sample, index)`**: the one channel, or `(left + right) / 2`. The same arithmetic as `toMono`, so the same
  bits.
* **`frameCount(sample)`**: the length, so nobody reads `channels[0].length` by hand.
* These two and a per-frame stereo read are the only ways engine code reaches the channels (§ Built to change).
* **`keepChannels(channels)`** in `audio/decode-audio.ts`: one or two kept; more averaged to one, as today.
* `DecodedAudio` becomes `{ audio: SampleAudio, channels, durationSeconds }`, where `channels` is still the file's
  count for `SampleInfo`.

### Stereo through the engine (`core/engine`, `core/dsp`)

* **`sample/add`** carries the new `SampleData`. The loader puts each channel's buffer in the transfer list.
* **The sampler node** reads `monoAt` where it read `data[index]`.
* **`Track in` gets the L R switch.** Its definition becomes `stereoCapable`. Lifted copies learn their channel
  through a new optional `DspNode.setChannel?(channel: 0 | 1)`, which the compiler calls on each copy. `Track in`
  reads `input[RIGHT + i]` for channel 1 when the input is stereo, and `input[i]` otherwise. A mono `Track in` given a
  stereo input reads its average. The hook is generic, so any later source node can use it.
* **The audio track runtime takes one of two paths**, chosen when its graph is built (`trackInIsStereo(patch)`):
  * **mono** (the switch off): reads `monoAt` and runs today's math into today's mono `scratch`. The same operations
    in the same order, so the same bits.
  * **stereo** (on): a planar `STEREO_FRAMES` scratch. The read position, the fade and the gain are worked out once
    per frame; the two channels are read at that position and scaled by the same level. A mono sample fills both
    halves with the same values.
  * `readRegion` takes a channel. `regionOf` takes `frameCount`.
  * Track audio taps keep a mono signal: on the stereo path, the average of the two halves.
* **New audio tracks start in stereo:** `NEW_AUDIO_TRACK_STEREO = true` in `core/project`, used by
  `createAudioTrack`. A mono sample on such a track sounds as it did.
* **The preview** plays both channels to the master's two, at the same level. `sample/preview` gains optional
  `from`, `to` (frames) and `loop`. `SamplePreview.position()` reports where it is.
* **`EngineStatus.preview`**: `{ sampleId, frame } | null`, set while a preview plays. Absent from the status when
  null, so nothing changes for the rest of the app.
* **The bounce and the library preview** get `SampleData` with channels, from the same decoder. A sample item in the
  library previews in stereo.

### File format v11 (`core/persistence`)

* `SampleInfo` gains optional `origin` (a 64-character hex id), `markers` (`{ id, frame, name }[]`) and `regions`
  (`{ id, from, to, name }[]`).
* **All three come now,** though 11a only reads them in tests, so the format bumps once for the whole round.
* `sanitizeSamples` keeps them when well formed: frames are integers inside the sample (`durationSeconds ×
  sampleRate`), `from < to`, names at most 60 characters, at most 256 of each, ids unique. Anything else is dropped
  with a warning.
* `CURRENT_VERSION = 11`; `MIGRATIONS[10]` is the identity. A fixture, `v11-sample-markers.sfxlab.json`, has a sample
  with an origin, two markers, a region, and an audio track with `Track in` in stereo.
* `originOf(info)` in `core/sample`: `info.origin ?? info.id`.

### Edits as data, still copies (`core/sample`, `state`, `app`)

* **`SampleEdit`** is a union of today's six edits: `normalize`, `reverse`, `keep` and `delete` (with a `range` in
  frames), `fade-in` and `fade-out` (with `seconds`). Each works on every channel. Normalize keeps the stereo balance
  (one gain for both).
* **`applySampleEdit(audio, edit)`** in a new `core/sample/edits.ts`; the six transforms move there and take
  `SampleAudio`. Their tests become tables over mono and stereo.
* **The registry** (§ Built to change): `SAMPLE_EDITS`, one entry per kind with id, title, tooltip and whether it needs a
  selection. The toolbar is built from it. 11b adds the new processes as entries.
* **`SampleLibrary.editSample(id, edit, { asCopy: true })`** replaces `deriveSample`. In 11a only `asCopy: true`
  exists; 11b adds the in-place path behind the same call.
* **Copies are written by `encodeWavChannels`** at `EDIT_WAV_BIT_DEPTH = 32`, with one or two channels. `encodeWav` (mono
  16-bit) stays for the demo samples, whose ids are hashes of its bytes.
* The edit reads the open sample's working copy (below) instead of decoding the bytes again.

### The working copy and the pyramid (`core/sample`, `state`, `app`)

* **`buildPeakPyramid(audio)`**: level 0 holds a min and a max per channel for every `PYRAMID_BASE = 64` frames; each
  next level halves the count, until a level has at most 512 buckets. Constants in `core/sample`, private.
* **`columnsFor({ startFrame, framesPerPixel, width }, pyramid, audio)`** returns, per channel, a min and a max per
  column, or, under one frame per pixel, the sample points to draw. It picks the source by the spec's three bands. It
  is the only reader of the pyramid's levels.
* **The working copy** is the decoded `SampleAudio` of the open sample, on the main thread. `app/sample-library.ts`
  decodes it from storage when the editor opens a sample, builds the pyramid, and puts both in a new
  **`state/wave-audio-store.ts`** (`{ sampleId, audio, pyramid } | null`, plus `loading`). The engine keeps its own
  copy, as today. Closing the editor, or a project without the sample, drops it.
* The engine's copy isn't reused, since it was transferred. Memory: one extra copy of the open sample, at most 46 MB
  (120 s stereo). 11b's budget covers more.
* **Thumbnails** (`computePeaks`) take the loudest of the channels. They stay 800 buckets, for every sample.

### The view (`state`, `ui`)

* **`state/wave-editor-store.ts`**, per sample id, in memory: `framesPerPixel`, `startFrame`, `cursor`, `selection`
  (`{ from, to, channels: 'both' | 'left' | 'right' } | null`, frames). Not saved with the project and not undone.
* **The ruler's settings** are per browser, through `useStoredState` in `ui` (it is a `ui` hook): `ruler`
  (`'time' | 'beats'`) and `rulerTempo` (`'project' | 'sample'`).
* **`ui/wave-editor/`** is rebuilt:
  * `WaveEditorView` and its empty state stay.
  * `SampleEditor` becomes the frame: toolbar, overview, ruler, detail, status line (cursor, selection length).
  * `Overview`: 48 px, the whole sample from `columnsFor` at the coarsest zoom; the box shows the detail's span. Drag
    the box to scroll, drag its edges to zoom, click to centre. It is the scrollbar: `role="scrollbar"`, focusable,
    with arrow keys and Page Up and Down, since a native scroller can't be wide enough at full zoom (184 M px for
    120 s at 32 px per frame; browsers stop far earlier).
  * `Ruler`: time (m:ss.mmm, frames under one frame per pixel) or bars and beats in 4/4 from frame 0, at the
    project's tempo or the sample's from its name (`tempoFromName` in `core/project/audio-clip.ts`, which *Fit to
    tempo* uses). A button switches.
  * `DetailView`: one `WaveLane` per channel, each a canvas the size of its box times `devicePixelRatio`, drawn from
    `columnsFor` in an animation frame when the view changes. Zoom and scroll write to the store and redraw; React
    renders only on a selection, cursor or sample change. `data-draw="peaks" | "frames" | "points"` on the view says
    which band is drawn, for tests.
  * **Lane renderers:** `WaveLane` takes a renderer `(context, columns, size) => void`. The waveform renderer is the
    only one now; the spectrogram is a second one later.
  * Gestures: drag to select; on a stereo sample, from the top quarter of the left lane for left only, the bottom
    quarter of the right lane for right only; Shift extends; a click sets the cursor. ⌘ or Ctrl with the wheel, or a
    pinch, zooms around the pointer; the wheel and a trackpad scroll. Pointer capture as today.
  * Toolbar: ▶ / ■ (the selection, or from the cursor), the six edits from `SAMPLE_EDITS`, *Zoom to selection*, *Zoom
    to fit*, the ruler switch, *Close*.
  * `Playhead`: a leaf component that selects `status.preview` only, as the piano roll's does.
* **At 480 × 240** the overview, ruler and two lanes share the height; the toolbar wraps, as round 4's toolbars do.

## Steps

Each step lands green: `npm test`, `npm run typecheck`, `npm run test:smoke`.

1. **Channels in the sample model.** `SampleAudio`, `SampleData.channels`, `monoAt`, `frameCount`; `keepChannels`
   and the new `DecodedAudio`; the four decoder callers; the loader's transfer list; the sampler node, the preview
   (both channels, no range yet), the bounce and the library preview; thumbnails from the loudest channel. The audio
   track runtime reads `monoAt` everywhere (its mono path), so nothing sounds different yet.
   *Tests:* a stereo `SampleData` whose channels are equal renders bit for bit like the mono one; the shipped examples
   and a project with a stereo file bounce to the same bytes as before the step (hashes taken from `be367c6` and
   written into the test).
2. **`Track in` in stereo.** `stereoCapable`, `setChannel`, the runtime's stereo path, `trackInIsStereo`,
   `NEW_AUDIO_TRACK_STEREO`. The property editor's **Stereo** switch shows on `Track in` with no UI change.
   *Tests:* unit tests for both paths, loops, fades, re-pitch and warp off on a stereo sample, and taps; the bounce
   of a stereo audio track keeps its channels; `npm run test:audio` with a new `stereo-sample.audio.spec.ts` (left a
   sine, right silent; the output's left is loud and its right quiet; switched off, both are half).
3. **Format v11.** The three fields, their sanitizing, the migration, the fixture, `originOf`; the library catalog
   keeps them.
   *Tests:* the v11 fixture loads and round-trips; every older fixture still loads; hostile markers and regions are
   dropped with warnings.
4. **Edits as data.** `SampleEdit`, `applySampleEdit`, `SAMPLE_EDITS`, `editSample(…, { asCopy: true })`,
   `EDIT_WAV_BIT_DEPTH`. The old editor's buttons call it, with its fractions turned into frames. Copies keep both
   channels.
   *Tests:* the transforms as tables, mono and stereo; a stereo copy decodes back to the same floats; the copy is
   still a new library entry, and undo removes it.
5. **The pyramid and the working copy.** `buildPeakPyramid`, `columnsFor`, `wave-audio-store`, the loader's
   `openAudio`.
   *Tests:* each level against a brute-force min and max; `columnsFor` in each band and across a level boundary.
   *Measure:* build time for 120 s stereo in Chromium. Over 50 ms, the build runs in slices before step 7.
6. **Preview a range, with a position.** `sample/preview`'s range and loop, `SamplePreview.position()`,
   `EngineStatus.preview`.
   *Tests:* engine tests for the range, loop and the reported frame; the status stays as it was with no preview.
7. **The new view.** `wave-editor-store`, `Overview`, `Ruler`, `DetailView` and `WaveLane`, gestures, the toolbar,
   `Playhead`; the old canvas and scroller go.
   *Tests:* unit tests for the store and for the ruler's labels; `wave-editor.smoke.spec.ts` gains a stereo import
   with two lanes, a zoom from `peaks` to `points`, a drag that selects, the ruler switch, ▶ with a moving playhead,
   and a tab switch that keeps the selection; `views-at-min-size` checks the overview scrollbar instead of
   `[data-scroll]`; the arrangement spec's *Reverse* still works.
8. **Docs and the profile.** ARCHITECTURE § Stereo, § Samples, § The sample editor and § Known POC limits; a
   `wave` case in `scripts/profile-status.cjs` (the Wave editor open, a preview looping); this plan's "Changes made
   while implementing"; README and roadmap marked done.

## Behavior changes

* A stereo file in an audio track whose `Track in` is switched to stereo plays in stereo. Old tracks don't change.
* New audio tracks start with `Track in` in stereo.
* The preview and the library's sample preview play stereo files in stereo.
* Thumbnails of stereo files show the louder channel instead of the average, so they can look a little fuller.
* Edit copies are 32-bit float WAV and keep both channels, so they are about twice the size of today's (four times for
  stereo). The same edit no longer gives the same id it gave before 11a.
* The editor's selection survives tab switches; zoom and scroll too, per sample, until reload.
* Projects are saved as v11. A v11 file is refused by builds before 11a, with the usual message.

## Verification

* `npm test`, `npm run typecheck` and `npm run test:smoke` at every step; `npm run test:audio` at steps 1, 2 and 6.
  Smoke and audio tests need local ports, which the sandbox refuses, so they run outside it.
* **Bit for bit:** the bounce hashes in step 1's test are taken before any engine change and must hold to the end.
* **Manual pass** on the dev build, in Chrome, Firefox and Safari on macOS where they are installed:
  * import a stereo WAV, a stereo MP3 and a mono file; the lanes, zoom to single samples and back, the ruler in both
    modes and both tempos;
  * select on one channel and on both, play the selection, loop it; switch tabs and come back;
  * an edit copy of a stereo file, then open the copy;
  * an old project with a stereo file: it sounds the same; switch its `Track in` to stereo and hear it widen;
  * the editor at 480 × 240, and with a long (120 s) stereo file.
* **Profiling:** `scripts/profile-status.cjs` as round 10 ran it. `editor`, `four`, `groups` and `pinned` must match
  round 10. The new `wave` case is recorded as the baseline for 11b; the playhead should be its only status reader
  that renders, and the lanes should not render React while the preview plays.

## Decisions to sign off

Signed off 2026-10-29: every row as proposed.

| Question | Proposed | Alternative |
|---|---|---|
| How `Track in` knows its channel when lifted | **A generic `DspNode.setChannel?`** the compiler calls on each lifted copy | A separate stereo source node type for audio tracks, which old graphs would need migrating to |
| Keeping old projects bit for bit | **Two runtime paths:** a switched-off `Track in` runs today's mono math on `monoAt` | One stereo path for every track, averaged at `Track in`; old stereo files then differ in the last bit |
| When the format bumps | **Once, in 11a,** with `origin`, `markers` and `regions` all defined now | A bump in 11a for `origin` and another in 11c for markers |
| The working copy in 11a | **Decoded again when the editor opens a sample,** kept for that sample only | Keep a main-thread copy of every sample at load (doubles memory for all samples) |
| Scrolling the detail view | **The overview is the scrollbar** (`role="scrollbar"`, keyboard), plus the wheel | A native scroller with a capped virtual width, which can't reach full zoom on long samples |
| The ruler settings | **Per browser,** like layouts | Per sample, in memory |
| The six edits in 11a | **As today** (normalize, reverse and the 10 ms fades on the whole sample; keep and delete on the selection), now on both channels | Apply them to the selection already; 11b changes that with the new processes anyway |
| Copies' format from 11a on | **32-bit float WAV** (`EDIT_WAV_BIT_DEPTH`), as the spec settled for edits | Keep 16-bit for copies until 11b |
| A preview while the transport plays | **Allowed, as today:** the preview is mixed into the master | Stop the preview when the transport starts |

## Changes made while implementing

* **Step 1: the hashes.** Taken on `5e39f94` (the plan's sign-off), whose `src/` is `be367c6`'s, before any engine
  change, and kept unchanged to the end in `core/engine/old-projects.test.ts`: both examples' busiest scene, one bar,
  32-bit float; and a project with a stereo file (two tones with seeded noise, at 44.1 kHz so playback resamples) on
  three old audio tracks (re-pitched and loop-trimmed with fades and gain, at original speed, a mono file) and a sampler
  at three pitches, four bars and a 1 s tail. Its tracks are made "old" by dropping `stereo` from their graphs, since
  step 2 makes new tracks stereo. Two runs gave the same bytes before the step.
* **Step 1: `monoAt` rounds as `toMono` did.** `toMono` stored the sum in a `Float32Array` before halving it, so
  `monoAt` is `fround(fround(left + right) / 2)`; without the inner `fround` the average differs in the last bit for
  some pairs. A test compares the two on 4096 frames of noise.
* **Step 1: the per-frame stereo read is `channelAt(sample, channel, index)`**, beside `monoAt` and `frameCount`, in
  `core/sample/channels.ts`. `readRegion` takes `'mono' | 0 | 1`, so the runtime's two paths share it.
* **Step 2: `createDefaultFxGraph(stereo?)`** makes the graph with its `Track in` switched, and `trackInIsStereo` lives
  beside it in `core/patch`. The runtime also switches path when `track/setFx` brings a graph whose switch changed.
* **Step 2: browser tests.** The new `stereo-sample.audio.spec.ts` imports a left-only stereo WAV, makes an audio track
  from it, hears the left only, switches *Stereo* off on `Track in` in the property editor and hears half the level in
  both channels.
* **Step 3: what "well formed" means.** A marker or region id is 1 to 64 letters, digits, `_` or `-`; a frame may be
  the sample's last (`frame == length`, `to == length`); a name may be empty. A list that isn't a list is dropped with
  a warning; an empty list is kept as it is. `savedFrameCount(info)` (`durationSeconds × sampleRate`, rounded) is the
  length they are checked against. Seven tests that expected version 10 now expect `CURRENT_VERSION` (or 11).
* **Step 4: the registry's entries** carry the copy's name suffix (as before: *normalized*, *reversed*, *cut*,
  *edited*, *fade in*, *fade out*) and `create({ selection })`, which makes the edit or returns null without a
  selection, so the toolbar holds no edit logic. `core/sample/edit.ts` and its six functions are gone; their tests are
  now tables in `edits.test.ts`. A new `app/sample-library.test.ts` stands a small WAV reader in for Web Audio.
* **Step 5: the pyramid is not sliced.** A full build of 120 s of stereo at 48 kHz took 11.7 ms (median of 7) in
  Playwright's Chromium headless shell and 14.1 ms in Node 24, on Apple Silicon, under load. Measured by running
  `pyramid.ts` as it is (types stripped) in a page; the script is not committed. `updatePeakPyramid` stays 11b's.
* **Step 5: the working copy follows `useSelectionStore.sampleId`,** which only the Wave editor sets, and is dropped
  when it is cleared or the sample leaves the project. An edit of the open sample reads it, so it works even when the
  stored bytes are gone.
* **Step 6: a loop's seam** interpolates from the range's last frame into its first, as audio clips do. `PreviewRange`
  is exported for `SampleLibrary.preview(sampleId, range?)`.
* **Step 7: a *Loop* toggle** sits beside ▶ (per browser, `sfxlab:wave-loop`): the plan's manual pass loops the
  selection, and nothing else asked for it. The tempo choice is a button shown with the beats ruler (*Project 120 BPM* /
  *Sample 98 BPM*), disabled when the name has no tempo.
* **Step 7: files.** The ruler's labels are in `ruler-ticks.ts` (a `ruler.ts` would clash with `Ruler.tsx` on a
  case-insensitive disk), the geometry in `wave-geometry.ts`, and `current-view.ts` resolves the stored view in the
  detail's width for the overview, the ruler and the toolbar. Lanes are labelled *Left* and *Right* (*Waveform* when
  mono). The status line replaces the old hint. Shift extends a selection from its far end. The editor's playhead is
  `WavePlayhead`, so the profile tells it from the piano roll's `Playhead`.
* **Step 7: browser tests.** `wave-editor.smoke.spec.ts` gains one test that does everything the plan lists (a stereo
  import with two lanes, a left-only drag, a drag that selects, Ctrl with the wheel from `peaks` through `frames` to
  `points`, *Zoom to fit*, the ruler and its tempo, ▶ looping with a moving playhead and ■, and a tab switch that keeps
  the selection); `views-at-min-size` checks the overview scrollbar.
* **Step 8: the profile.** As round 10 ran it: one run each, 10 s after 2 s of warm-up, headless Chromium, 1500 × 1000,
  the servers outside the sandbox (the dev server, and `vite preview` of the production build). The machine was busy
  (load average 11 to 14, other sessions running). `WATCHED` gained `SampleEditor`, `Overview`, `Ruler`, `DetailView`,
  `WaveLane` and `WavePlayhead`.

  | Per second | Round 10 `editor` | 11a `editor` | Round 10 `four` | 11a `four` | Round 10 `groups` | 11a `groups` | Round 10 `pinned` | 11a `pinned` | 11a `wave` |
  |---|---|---|---|---|---|---|---|---|---|
  | Component renders (dev) | 145 | 144 | 173 | 173 | 87 | 87 | 144 | 145 | 56 |
  | Script ms (production) | 11.8 to 12.8 | 10.7 | 13.5 to 14.1 | 12.5 | 16.6 | 11.3 | 13.0 | 10.5 | 10.1 |

  The four old setups match round 10 within the one `ArrangementPlayhead` render round 10 also saw come and go. The new
  `wave` case is the baseline for 11b: 29 `WavePlayhead` renders a second (the status rate) and 27 of the transport's
  `LevelMeter` (the preview is heard); `SampleEditor`, `Overview`, `Ruler`, `DetailView` and `WaveLane` render 0 times
  while the preview loops.
* **Step 8: checks.** `npm test` and `npm run typecheck` passed at every step: 2365 unit tests at step 1, 2375 at
  step 2, 2382 at step 3, 2392 at step 4, 2401 at step 5, 2406 at step 6, 2415 from step 7. `tests/architecture.test.ts`'s
  drag check twice ran past vitest's 5 s timeout while the whole suite ran on the busy machine, and passed alone and on
  the next full run. Every check in that file read all 525 source files again, and under a full run's contention for
  the disk each took 0.3 to 1.5 s instead of 40 to 150 ms. After the round, the file reads each source once when it
  loads: its checks take 5 to 17 ms in a full run at a load average of 19. Full smoke runs, outside the sandbox: 192 at
  steps 1 to 6, 193 at steps 7 and 8. `npm run test:audio`: 20 at step 1 (one test failed on a missing trace file as
  Playwright closed its context, then passed with its spec, 6 of 6), 21 at steps 2 and 6. At step 1 the browser tests ran
  on exactly step 1's files, set apart from step 2's.
* **Not checked.** The manual pass in Verification was not done by hand. Firefox isn't installed; Safari is, but this
  session can't drive it; and this Playwright version's Firefox and WebKit builds aren't downloaded (a WebKit check of
  a float stereo WAV failed to launch for that reason). So neither Firefox nor Safari was tried, nor a stereo MP3, nor
  whether Safari loads the float WAV copies. In Chromium, the dev build was looked at in the app's browser pane (the drum loop
  opened, a selection, zoom to the selection and to single samples, ▶ with a moving playhead, no console errors), and
  the specs above stand in for the rest. Hearing an old project with a stereo file is covered by the bounce hashes, and
  its widening by the audio spec, not by ear. A 120 s stereo file was not opened in the UI; only the pyramid's build
  was timed.
