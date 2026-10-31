---
status: done
date: 2026-10-29
shipped_in: architecture/samples-and-wave-editor.md
note: "Done 2026-10-31: 11a and 11b as planned here; 11c and 11d through the handling-and-spectrum spec, which replaced 11c's keys and added the spectrum."
---
# Round 11: wave editor (spec)

Status: **done** 2026-10-31 (11a and 11b from this spec; 11c and 11d from the [handling and spectrum
spec](SPEC-wave-editor-handling-and-spectrum.md)); spec signed off 2026-10-29, every decision as proposed, with one request: build it so the decisions can
be changed later (see § Built to change). Round 11 can now be planned. Written 2026-10-29. Part of the [UI redesign](README.md).
[Roadmap § Round 11](../../active/ui-redesign-roadmap.md#round-11-wave-editor) asks for this spec first, because most of the round is
beyond the UI: the sample model, the engine, storage and undo. It starts from an inventory taken on
`imp/jovial-fermat-5ae301` at `380d574` (round 10 done, not merged into `feat/ui-redesign` yet). No code was changed.

The round plan will take its steps, its browser tests and its verification from here. Where this spec and the plan
disagree later, the plan wins and says so.

## Goal

The Wave editor becomes an editor for the audio itself, in the WaveLab tradition. After round 11:

* **a sample is edited in place.** An edit changes the sample everywhere the project plays it. Undo takes the edit
  back, like any other project edit. *Save as new sample* keeps today's behavior as a choice;
* **samples can be stereo,** in the file, the engine and the editor. Mono samples sound exactly as before;
* **the waveform is sharp at every zoom,** from the whole sample down to single samples, drawn from a peak pyramid
  and, zoomed in, from the audio;
* **an overview and a detail view** share one time axis, with a ruler in time or in beats;
* **a selection** (both channels, or one) can be processed: gain, fades with curves, normalize, reverse, silence,
  DC offset. It can be cut, copied, pasted and deleted, with crossfades at the joins;
* **markers and regions** are saved with the sample and follow its edits;
* **audio clips and arrangement regions** open their sample in the editor, at the part they play.

**Out of scope:**

* the spectrogram (it needs the FFT, H1 in [IDEAS](../../IDEAS.md)); this spec only says where it
  plugs in;
* the granular sampler (TASKS: sample editor stage 2); it shares the view later;
* time-stretch, pitch-shift, resampling to another rate, and effects other than the six processes listed;
* drawing samples with a pencil, spectral editing, batch processing;
* slicing to pads and loop points for the sampler (regions make room for both);
* stereo instruments: a sampler voice stays mono;
* cleaning up unused imported samples (ARCHITECTURE § Natural next steps, item 1).

## Inventory

### The view

`ui/wave-editor/` has three files.

* `WaveEditorView` reads `useSelectionStore.sampleId`. With a sample, it shows `SampleEditor`. Without one, it offers
  the project's first eight samples, *Show samples* and *Import samples…*. Round 3 made it a view of the editor
  area, with the ∿ button in the activity bar. Its doc comment says round 11 replaces the inside.
* `SampleEditor` (155 lines) draws one canvas, 150 px high. Its width is `peaks.length × pxPerBucket`, with a zoom
  slider from 1 to 24 px per bucket, inside a horizontal scroller. So the canvas grows with the zoom, up to 19,200 px.
* Each column draws the loudest absolute peak under it, mirrored around the centre. There is no negative half, no
  second channel and no ruler.
* The selection is component state, as fractions 0..1. It is not kept across tab switches and not saved.
* Seven buttons: ▶ (preview the whole sample), Normalize, Reverse, Keep selection, Delete selection, Fade in and
  Fade out (10 ms each), and Close. There is no playhead.

### Samples: stored, decoded, drawn

* **Model** (`core/sample/types.ts`). `SampleInfo` is `{ id, name, extension, durationSeconds, sampleRate, channels,
  bytes }`. The id is the SHA-256 of the original file. `channels` is the original file's count, sanitized to 1..8.
  `SampleData` is `{ id, sampleRate, data: Float32Array }`: **mono only**.
* **Three homes** (ARCHITECTURE § Samples): `Project.samples` holds the metadata and is undone. IndexedDB holds the
  original bytes (`storage/sample-storage.ts`, database `sfxlab`, store `samples`, shared by every project and by
  the personal library). The engine holds the decoded floats in `SampleBank`.
* **Decoding** (`audio/decode-audio.ts`). `decodeAudioData` on an `OfflineAudioContext` at 48 kHz, so every sample
  arrives at 48 kHz whatever its file's rate. All channels are averaged into one (`toMono`). Longer than 120 s is
  refused (`MAX_SAMPLE_SECONDS`).
* **Loading** (`app/sample-library.ts`). On startup and whenever `project.samples` changes, the service loads any
  sample the engine lacks: bytes from storage, decode, then `deliver`. `deliver` computes **800 peak buckets**
  (`computePeaks`, the loudest absolute value per bucket) into `useSampleStore.peaks`, and sends `sample/add` with
  the buffer *transferred*. So the main thread keeps no decoded audio, only the 800 peaks. A sample that leaves
  `project.samples` gets `sample/remove`.
* **Drawing.** `WaveformThumb` (session slots, Samples rows), the audio clip editor and arrangement regions all draw
  from the same 800 buckets, one column per pixel. The wave editor does too.
* **Engine readers** of `SampleData.data`: the sampler node (`dsp/nodes/sampler.node.ts`, mono `signal` out), the
  audio track runtime (`engine/audio-track-runtime.ts`, writes a mono scratch buffer into the insert graph at
  `Track in`), `SamplePreview` (mono to both master channels) and the offline bounce (`app/export-audio.ts` decodes
  the used samples with the same `decodeAudio`).
* **Stereo today** starts in the insert graph (ARCHITECTURE § Stereo). `Track in` is a mono `signal` source.
  `Return in`, `Master in` and `Group in` share `StereoIn`, which already reads a planar stereo `input` of
  `STEREO_FRAMES` and duplicates a mono one.
* **Files.** `encodeWav` writes mono 16-bit PCM; the demo samples' ids are hashes of its bytes, so it must not
  change. `encodeWavChannels` (added for the bounce) writes any channel count at 16-bit PCM or 32-bit float.

### Size limits

There is no 16 MB limit in the code. These are the limits that exist:

| Limit | Value | Where |
|---|---|---|
| An imported file | 32 MB | `MAX_FILE_BYTES`, `app/sample-library.ts` |
| A decoded sample | 120 s | `MAX_SAMPLE_SECONDS`, `audio/decode-audio.ts` |
| A sample entry in a project package | 64 MB inflated | `MAX_ENTRY_BYTES`, `storage/project-transfer.ts` |
| A sample in a library bundle | 32 MiB | [library-bundle.md](../../reference/library-bundle.md) |
| Samples in a project | 256 | `LIMITS.samples`, `core/persistence/format.ts` |
| The project JSON | ~5 MB of `localStorage` | ARCHITECTURE § Known POC limits |
| IndexedDB | the browser's quota for the site | nothing checks it before writing; quota errors are tested in the library storage |

At 48 kHz, 120 s of decoded audio is 23 MB per channel as floats. So the longest stereo sample is 46 MB of floats,
23 MB as 16-bit WAV and 46 MB as 32-bit float WAV.

### How a sample edit works now

* `core/sample/edit.ts` has six pure transforms on a mono `Float32Array`: `normalizeSample`, `reverseSample`,
  `keepSampleRegion`, `deleteSampleRegion` (the selection as fractions), `fadeIn` and `fadeOut`. They are tested.
* `SampleLibrary.deriveSample(id, suffix, transform)` reads the stored bytes, decodes them (again), runs the
  transform, encodes **mono 16-bit WAV**, hashes it and stores it. Then `addSamples` adds a **new** library entry,
  "name (suffix)", at the end of the list.
* So every edit makes a new sample. Nothing that played the original changes. A chain of edits is a chain of
  entries, each one quantized to 16 bits again. Undo removes the copy from the project; its bytes stay in IndexedDB.
* The transform is a closure handed from `ui` through `state` to `app`. It isn't data, so it can't be described,
  repeated or tested apart from its caller.

### Undo

* `core/history` keeps `past`, `present` and `future` of immutable snapshots, 200 steps, with merge keys within
  800 ms. The project store holds a `History<Project>`. History is not saved.
* A sample's bytes are not in history. Undo works because bytes are content-addressed and never deleted: the old
  `project.samples` still names an id whose bytes are stored.
* `removeSample` (`core/project/edit.ts`) clears every use of a sample in one step: sampler nodes in tracks, insert
  graphs, buses, the master and modules, sample bindings, and session audio clips.

### Entry points

* The activity bar's ∿ button shows the view.
* **✎ on a Samples row** runs `sample.open` (*Open in wave editor*), which calls `openSampleEditor(id)` in
  `state/navigation.ts`: it sets `selectionStore.sampleId` and reveals `wave`. The palette offers the same action for
  the selected sample (round 10's selection subjects).
* **Audio clips and arrangement regions have no way in.** `clip.*` and `region.*` offer *Edit clip*, *Edit*, *Edit
  session clip* and the rest, but nothing opens the sample. The audio clip editor has no link either.
* The sampler node's property editor picks a sample but can't open it.

### Noticed, not this round's

* `removeSample` leaves arrangement regions that play the removed sample. They stay in the project and play silence.
  The round can fix it on the way, since `replaceSample` (below) walks the same places.
* The `channels` field says what the file had, not what the engine plays. Old files keep that meaning.

### What the inventory changes in the roadmap's outline

* The roadmap's "original kept until project save" fits as: **bytes are never changed, only added**. An edit stores
  a new file and points the project at it. Originals are never deleted; only files that edits made are cleaned up,
  once nothing can reach them.
* Stereo "throughout" is cheaper than it sounds. The insert graph is already stereo, and `StereoIn` already reads a
  stereo input. The new work is the sample model, decoding, the audio track runtime and preview. Instruments stay mono.
* "Edit source" from clips and regions doesn't exist yet. It is new actions, not wiring.
* There is no 16 MB limit to design around. The real limits are listed above. 32-bit float edits of long stereo
  samples go past one of them, the library bundle's 32 MiB.

## Design

### Where each part lives

| Part | `core` | `state` | `ui` | Other | Crosses the worklet |
|---|---|---|---|---|---|
| Stereo sample model | `SampleAudio`, `SampleData.channels`, mono read helper | | | `audio`: decode keeps two channels | `sample/add` carries 1 or 2 buffers |
| Stereo playback | audio track runtime, `Track in` stereo, preview | | L R switch on `Track in` | | no new command |
| Peak pyramid | `buildPeakPyramid`, `updatePeakPyramid` | | | `app`: built on the main thread | no |
| Drawing | `columnsFor` (what each pixel column shows) | | canvases | | no |
| View state (zoom, scroll, cursor, selection) | | `wave-editor-store` | | | no |
| Markers and regions | on `SampleInfo`, edit functions, remap | store actions | lanes | `persistence`: v11 | no |
| Edits as data | `SampleEdit`, `applySampleEdit`, `remapFrame` | | | | no |
| Processing and crossfades | the transforms, `FadeCurve` | actions on the selection | toolbar, dialogs | | no |
| In-place edit | `replaceSample(project, from, to, map)` | `SampleLibrary.editSample` | | `app`: encode, hash, store, send | `sample/add` before, `sample/remove` later |
| Undo and memory | | | | `app`: decoded cache, engine keep-alive | delayed `sample/remove` |
| Storage | | | | `storage`: `sample-edits` store, cleanup, room check | no |
| Preview of a range | `SamplePreview` range and position | | playhead | | `sample/preview` gains a range; status gains the preview position |
| Entry points | | `openSampleEditor(id, range?)`, new actions | buttons | | no |
| Keys | | the selection as a focus subject, verbs | focusable canvas | | no |

### The sample's audio, in `core`

* **`SampleAudio`** is `{ sampleRate, channels: readonly Float32Array[] }`, with one or two channels of equal length.
  It is what edits work on and what the engine plays.
* **`SampleData`** becomes `{ id, sampleRate, channels }`. `data` goes. Every engine reader changes, and the
  compiler finds them all.
* **`monoAt(sample, index)`** reads the average of the channels. For a mono sample it is the one channel, bit for bit.
  The sampler node and `Track in` (mono) use it. Nothing allocates a mixdown.
* **More than two channels** are averaged to mono, as today. One or two channels are kept.
* `SampleInfo.channels` keeps its meaning for imports (the file's count). For files an edit writes, it is 1 or 2.

### Stereo through the engine

* **Decoding** returns the channels, not a mono mix. `decodeAudio` keeps one or two; more are averaged.
* **`sample/add`** sends `SampleData` with each channel's buffer in the transfer list.
* **The audio track runtime** writes a planar stereo scratch (`STEREO_FRAMES`, left then right), the layout
  `dsp/stereo.ts` already uses. A mono sample is written to both halves. Fades, gain, re-pitch and loops are worked
  out once per frame and applied to both channels, so the read position math doesn't change.
* **`Track in`** reads the input like `StereoIn` does. It gets the **L R switch** that stereo-capable nodes have
  (ARCHITECTURE § Stereo). Off, it outputs `monoAt`: the average, so an old graph hears what `toMono` gave it. On, its output is
  `stereo`. New audio tracks start with it on. Instrument tracks keep it off; their instruments are mono anyway.
* **Track audio taps** (`taps.write(trackId, 0, …)`) keep getting a mono signal: the average of the scratch.
* **The sampler node** stays mono and reads `monoAt`.
* **`SamplePreview`** plays both channels to the master's two channels, at the same level as today.
* **The bounce** gets stereo `SampleData` from the same `decodeAudio`, so the file and the live engine agree.
* **Old projects sound the same.** Their audio tracks' `Track in` has no `stereo` flag, so it is off. A test renders
  both shipped examples and a stereo-file project before and after, and compares the output bit for bit.

### File format

* **Version 11.** `SampleInfo` gains optional `markers`, `regions` and `origin` (below). The migration from 10 is
  the identity; a v11 fixture is committed. A bump, rather than optional fields at 10, keeps an older build from
  loading a v11 file and dropping its markers without a word.
* `Track in` joins the nodes that may keep `stereo`. No migration: old files don't have it.
* **The personal library** sanitizes samples through `sanitizeSamples`, so markers and regions travel with a captured
  sample. Its catalog version doesn't change: the fields are optional.
* **Files an edit writes** are WAV, 32-bit float, one or two channels, at the decoded rate (48 kHz). Float is exact:
  a chain of edits isn't quantized again at every step, and what reloads is what was heard. The same edit of the same
  audio gives the same bytes, so the same id.
* **The library bundle's** per-sample cap goes from 32 MiB to 64 MiB, the project package's entry cap. A 120 s stereo
  float file is 46 MB.

### Peak pyramid

Replaces the 800 buckets inside the editor. The thumbnails keep their 800 buckets.

* **`buildPeakPyramid(audio)`** in `core/sample`. Level 0 holds a **min and a max** per channel for every 64 frames.
  Each next level halves the count, until a level has at most 512 buckets. Min and max, not one absolute peak, so
  the waveform's two halves are drawn as they are.
* **Size.** For 120 s at 48 kHz, level 0 has 90,000 buckets per channel. With every level, that is about 1.4 MB per
  channel as `Float32Array`s. It is kept only for the open sample.
* **Built on the main thread** from the working copy (below), when the sample opens and after each edit.
  **`updatePeakPyramid(pyramid, audio, fromFrame)`** rebuilds from the first changed frame on, so a fade at the end of
  a long sample doesn't redo the whole sample. The plan measures both; if a full build of 120 s stereo is over 50 ms,
  the build is cut into slices across frames.
* **Thumbnails** (`computePeaks`, 800 buckets) take the loudest of both channels. They stay in `useSampleStore` for
  every sample, as today.

### Drawing

* **One rule** in `core`: `columnsFor(view, pyramid, audio)` says what each pixel column shows, from the frames per
  pixel (*fpp*).
  * fpp ≥ 64: min and max from the finest pyramid level whose bucket fits in a column.
  * 1 ≤ fpp < 64: min and max from the audio itself, at most 64 frames read per column.
  * fpp < 1: a line through the sample values; from 8 px per frame on, a dot on each sample.
* **Canvases are the size of what is visible**, times `devicePixelRatio`, and are redrawn when the view changes, in
  an animation frame. Today's canvas as wide as the zoomed sample goes. Zoom and scroll don't re-render React.
* **Stereo** draws two lanes, left above right, each with its own centre line. Mono draws one.
* Colours come from the theme's variables, as today.

### Overview, detail and the ruler

* **Overview:** a strip 48 px high, the whole sample, from the pyramid's coarsest level. A box shows what the detail
  view shows. Drag the box to scroll, drag its edges to zoom, click to centre there.
* **Detail:** the lanes, the marker lane above them and the ruler at the top. It fills the rest of the view.
* **Zoom** runs from the whole sample in the width down to 32 px per frame. ⌘ or Ctrl with the wheel, or a pinch,
  zooms around the pointer. The wheel and a trackpad scroll sideways. *Zoom to selection* and *Zoom to fit* are
  buttons and commands.
* **The ruler** shows time or beats, switched on the ruler.
  * **Time:** minutes, seconds and milliseconds; frames when zoomed in to under 1 fpp.
  * **Beats:** bars and beats in 4/4 (the piano roll's assumption), beat 1 at frame 0. The tempo is the project's,
    or the sample's own guess from its name ("… 98 BPM"), the guess *Fit to tempo* already makes.
* **Snap:** to beats while the ruler shows beats, and to zero crossings as a toggle. Both off by default.
* **The minimum size** stays the editors' 480 × 240. At 240 px the overview stays, the lanes share the rest, and the
  marker lane folds into the ruler.

### Cursor, selection, markers and regions

* **View state** lives in `state/wave-editor-store.ts`, per sample, in memory, like the graph view store: zoom, scroll,
  cursor frame, selection, ruler mode, snap. It isn't saved and isn't undone.
* **The selection** is `{ from, to, channels: 'both' | 'left' | 'right' }`, in frames. Drag in the lanes to select; on
  a stereo sample, dragging in the top quarter of the left lane selects left only, the bottom quarter of the right
  lane right only, as in WaveLab and Audition. Shift extends. A click with no drag sets the cursor.
* **Markers** are `{ id, frame, name }`. Add one at the cursor, drag it in the marker lane, rename in place, delete,
  jump to it.
* **Regions** are named selections, `{ id, from, to, name }`. *Make region* saves the selection; clicking a region
  selects it. Later they become slices for pads and loop points for the sampler.
* Both are on `SampleInfo`, so they are **project edits and undone**. A drag is one step (merge key
  `marker:<sample>:<marker>`). At most 256 of each per sample; the sanitizer clamps them to the sample's length.
* **Edits move them** (`remapFrame`, below): after a delete, later ones move left; a marker inside the deleted part is
  removed; a region is clipped and removed if nothing is left. Undo brings them back with the audio.

### Edits as data

* **`SampleEdit`** is a discriminated union in `core/sample`: `{ kind: 'gain', range, channels, db }`,
  `{ kind: 'fade', range, channels, direction, curve }` and so on. A `range` is `{ from, to }` in frames.
* **`applySampleEdit(audio, edit)`** returns a new `SampleAudio`. It is pure and tested as tables.
* **`remapFrame(edit, audio, frame)`** says where a frame of the old audio is in the new one, or `null` if it is gone.
  Markers, regions and audio clips' trims use it.
* This replaces the closure `deriveSample` takes. `state` and `app` pass an edit, not a function.

### Processing a selection

Each process works on the selection, or on the whole sample when there is none, on the selected channels.

| Process | Settings | Notes |
|---|---|---|
| Gain | −48 to +24 dB | Ramps in and out over the crossfade length at the selection's edges, so a step doesn't click. |
| Fade in, fade out | curve | Over the selection. Curves below. |
| Normalize | target peak, default −0.1 dBFS; linked or per channel | Linked keeps the stereo balance. A peak under −100 dB is left alone, as today. |
| Reverse | | |
| Silence | | Ramps like Gain. |
| Remove DC offset | | Subtracts each channel's mean over the selection, ramped at partial selections' edges. |

* **Fade curves** (`FadeCurve`, `t` from 0 to 1): linear `t`; equal power `sin(πt/2)`; slow start `t³`; fast start
  `1 − (1 − t)³`; S-curve `(1 − cos πt) / 2`. A fade out uses `g(1 − t)`.
* Gain and normalize take a small dialog (a popover by the toolbar). The others run at once.
* **Preview before applying** is not in this round. ▶ plays the selection as it is.

### Cutting, pasting and crossfades

* **Structure edits:** *Delete* (join the parts around the selection), *Crop* (keep only the selection), *Insert
  silence* at the cursor, and *Cut*, *Copy*, *Paste* (insert at the cursor, or replace the selection).
* **The audio clipboard** is a store in `state`, like the note clipboard: the copied `SampleAudio` and 50 ms of
  **handles** on each side, the audio just outside the copy. It is not the OS clipboard.
* **A crossfade at every join.** Where two parts meet, the outgoing part continues into its handle and fades out,
  while the incoming part starts early from its handle and fades in. The result has the length you expect: a delete
  removes exactly the selection.
  * A delete has handles from the deleted audio. A paste has the clipboard's and the audio around the cursor.
  * Where a part has no handle (the sample's start or end), its fade becomes a plain fade.
  * The length is a toolbar setting: 0 to 100 ms, default 5 ms. 0 is a butt splice. The curve is linear (equal gain,
    right for the same material on both sides) or equal power (for unrelated material); linear by default.
* Gain and Silence use the same length for their edge ramps, so one setting covers every edge.

### In-place edits: replacing a sample

The core of the round. An edit makes a new file, as today, and then moves every use of the old sample onto it.

* **The ids stay content hashes.** Storage, project packages, library bundles and import dedupe all rely on "id =
  SHA-256 of the bytes". An edit keeps that true: the new file has its own hash.
* **`replaceSample(project, fromId, to, remap)`** in `core/project` is the mirror of `removeSample`. It walks the same
  places, and also arrangement regions, presets' sample bindings and asset revisions' sample ids:
  * the `samples` entry is replaced **where it is**, keeping its name; markers and regions are remapped;
  * sampler nodes, bindings and audio clips point at the new id;
  * audio clips' and regions' trims (`start`, `end`, fractions) go through `remap`, so a clip keeps playing the audio
    it played. `lengthBeats` doesn't change; *Fit to tempo* redoes it;
  * a trim that `remap` empties keeps the minimum region where the audio was, and the edit warns once.
  * Asset revisions are immutable records, but their compatibility ignores samples (ARCHITECTURE § Snapshots), so
    pointing them at the new id changes no signature.
* **`origin`** on `SampleInfo` is the id of the first version. An in-place edit keeps it; *Save as new sample* starts
  a new one. The editor follows the open sample through edits, undo and redo by `origin`. *Revert to original* points
  every use back at the origin's bytes, which are never deleted.
* **If the result is already in the project** (reverse twice gives an earlier version), the uses point at that entry,
  and the edited entry is removed. A toast says so.
* **The flow** (`app/sample-library.ts`, `SampleLibrary.editSample(id, edit, { asCopy })`):
  1. take the working copy (below), or decode the stored bytes;
  2. `applySampleEdit`; refuse an empty result, as today;
  3. encode float WAV, hash, check there is room, store the bytes, and note the id as edit-made;
  4. send `sample/add` for the new id, so the engine has it before anything points at it;
  5. commit `replaceSample` as one project step, if the sample is still in the project;
  6. leave the old id in the engine for undo (below).

  One edit runs at a time; the toolbar is busy meanwhile, as today.
* **The sampler's *Start* param isn't remapped** by an edit that changes the length. It is a numeric param,
  automatable and kept in presets. Only trims, markers and regions are remapped.
* **What playing audio does.** Audio clips swap through `track/setAudioClips`, so a playing voice becomes a 5 ms tail
  while the new one starts, as for any clip edit. Samplers swap through `track/setSample`.
* **Who sees the edit.** Everything in this project. Not the personal library: its items keep the version they
  captured. Not other exported files.

### Undo, memory and storage

* **Undo is a project step.** Undoing an edit puts back the old `SampleInfo` and the old ids. Nothing else is needed
  for correctness: the old bytes are stored.
* **Undo should also be instant and gapless.** Two caches make it so; both have a budget.
  * **The working copy** (`app`): the decoded `SampleAudio` of the open sample, kept on the main thread. The engine
    gets a copy, since a transfer would take it away. Recent versions stay in an LRU cache, so undo and redo don't
    decode again.
  * **Engine keep-alive** (`app`): a sample the present project no longer uses gets `sample/remove` only once no
    history entry names it, or once the budget runs out, oldest first. Until then the engine still holds it, so undo
    plays it at once. Past the budget, undo reloads it from storage; its uses play silence for the moment it takes,
    as a sample that hasn't arrived does today.
  * The budget is decoded audio not used by the present project: **128 MB on each side**. That is about three
    versions of a 120 s stereo sample, or dozens of short ones.
* **History itself doesn't grow:** a step holds a new `SampleInfo`, a few hundred bytes. The 200-step limit stays.
* **Storage grows by one file per edit.** A 5 s stereo one-shot is 1.9 MB as float WAV; 120 s stereo is 46 MB.
  * **A `sample-edits` store** (IndexedDB upgrade in `storage/library-database.ts`) notes each id an edit wrote, with
    its time.
  * **Cleanup** runs once after startup, when idle. It deletes edit-made bytes older than a day that neither the saved
    project, the backup slot nor the library catalog names. Imported bytes are never deleted. The day keeps a second
    tab's undo working.
  * **Room check.** Before storing, `navigator.storage.estimate()`; with less than twice the file's size free, the
    edit is refused with a toast and the project doesn't change. A `QuotaExceededError` is reported the same way.
* **Saving and loading** are unchanged: autosave writes the project JSON, which names the new id, whose bytes were
  stored first. A reload loads the present version only.

### Entry points

* **`openSampleEditor(sampleId, range?)`** gains an optional range, as fractions. The editor selects it and zooms to it.
* **New actions:**
  * `clip.edit-sample` (*Edit sample*), on audio clips, opens the clip's sample at its trim;
  * `region.edit-sample` (*Edit sample*), on audio regions, likewise;
  * a button in the audio clip editor's toolbar runs `clip.edit-sample`;
  * the sampler node's property editor gets *Edit* beside its sample picker.
* ✎ on a sample and the activity bar stay as they are.

### Keys and commands

* The detail view is focusable. Focused, it gives a **sample-selection focus subject** (round 10), with the verbs
  *delete*, *copy*, *cut* and *paste*. So Delete, ⌘C, ⌘X and ⌘V work on the selection.
* The processes, *Make region*, *Add marker*, zoom and *Revert to original* are actions on that subject, so the
  palette and the editor's menus list them.
* View-local keys, listed read only in the shortcuts dialog: arrows move the cursor, Shift+arrows extend the
  selection, + and − zoom, Home and End go to the ends, M adds a marker.
* **Space stays the transport's.** ▶ in the editor, or P with the view focused, previews the selection.

### Preview and the playhead

* `sample/preview` gains an optional `{ from, to, loop }` in frames. The editor plays the selection, or from the
  cursor to the end.
* `EngineStatus` gains `preview: { sampleId, frame } | null`. The editor draws a playhead from it, at the status
  rate. Its subscription is a narrow selector, as round 1b asks of every per-frame reader.

### What crosses the worklet boundary

Only these change:

* `sample/add`: `SampleData` with one or two channel buffers, each transferred.
* `sample/preview`: an optional range and loop.
* `EngineStatus.preview`: the preview's sample and frame.
* When `sample/remove` is sent: later than today, under the keep-alive rule.

Nothing else crosses: the pyramid, the working copy, view state, markers, regions, edits and the clipboard all stay on
the main thread. An in-place edit reaches the engine through the commands `diffProject` already sends when a
sample reference changes (`track/setSample`, `track/setAudioClips`, `arrangement/set`).

### The spectrogram, later

* **Where it plugs in:** a lane renderer beside the waveform's, under the same ruler and selection. The detail view
  draws lanes through one small interface (draw these frames into this canvas); the waveform is its first renderer.
* **Its data:** an STFT of the working copy on the main thread, built on H1 in `core`, cached as image tiles per zoom
  level. Nothing crosses the worklet.
* **Its place:** a toggle per lane (waveform, spectrogram, both). Not this round.

### The granular sampler, later

It reads the same `SampleData`, so stereo comes to it for free. The editor's selection could set its position and
range, and its grains could be drawn over the lanes. That is the granular round's to decide.

## Suggested split

The round is big. Three parts, each landing green on its own, in this order:

1. **11a, stereo and the pyramid.** The sample model, decoding, the engine, `Track in`'s switch, preview with a
   range, format v11 with `origin`, the pyramid, the drawing rule, and the new view (overview, detail, ruler,
   selection in the store). Edits still derive copies, through `SampleEdit`.
2. **11b, in-place edits.** `replaceSample`, the flow, the caches, the `sample-edits` store, cleanup and the room
   check; the processes, curves, structure edits, crossfades and the clipboard; the entry points.
3. **11c, markers, regions and keys.** Markers and regions with their remap, the focus subject and verbs, the
   view-local keys, snap.

## Tests

* **`core`:** the pyramid against a brute-force min and max at every level, and `updatePeakPyramid` against a full
  build; `columnsFor` at each fpp band; every process and curve as a table; crossfades with and without handles;
  `remapFrame` for every edit kind; `replaceSample` against `usedSampleIds` (no use left behind, regions included);
  stereo audio tracks, `Track in` on and off; old projects bit for bit.
* **`app` and `storage`:** an edit stores bytes before it commits; undo and redo inside and past the budget; cleanup
  keeps imports, recent files and everything the project, backup and catalog name; a full disk refuses the edit
  and leaves the project as it was.
* **Audio:** a stereo file plays its two channels through an audio track and through the bounce.
* **Browser:** open from a sample, a clip and a region; select, process, undo, reload and find the edit; stereo lanes;
  the views-at-minimum-size spec; Safari loads a float WAV (checked by hand if no Safari runs in CI).

## Built to change

Signed off with a request: "make sure to design it in a way that allows us to change things later". So every
decision below sits behind one seam, and the plan names that seam in the step that adds it. The rule: **a decision is
a constant, a table entry or one function, and nothing else reads around it.**

| Decision | The seam that keeps it cheap to change |
|---|---|
| Edits in place vs. copies | Both run through `SampleLibrary.editSample(id, edit, { asCopy })`. The toolbar, menus and keys call that, never the steps inside it. Making copies the default is one flag. |
| A new id per edit vs. a stable id with a content hash | Every place that turns a `SampleInfo` into stored bytes (storage, the package writer and reader, the bundle, the loader) asks one function, `bytesKeyOf(info)`, which returns the id today. `replaceSample` is the only code that rewrites uses. Switching to stable ids changes those two and adds a migration. |
| What an edit rewrites | `replaceSample` walks the project through one list of visitors, one per place (nodes, bindings, clips, regions, presets, revisions). Leaving presets alone is removing a visitor. A test checks the list against `usedSampleIds` and `projectSampleDependencies`, so a new place can't be forgotten. |
| Remapping trims, markers and regions | All of them go through `remapFrame`. Not remapping trims is one visitor's choice. |
| Stereo in the engine | Engine readers reach channels only through `monoAt` and a per-frame stereo read, never `channels[1]` directly. Mono-only playback again would be one change in each helper. |
| Old and new audio tracks' `Track in` | The default is one constant where audio tracks are made (`NEW_AUDIO_TRACK_STEREO`). Old tracks are whatever their files say. |
| Files with more than two channels | One function, `keepChannels(decoded)`, in `audio/decode-audio.ts`. |
| The format edits write | One constant, `EDIT_WAV_BIT_DEPTH`. Readers take any WAV, so changing it later only affects new edits; old files stay valid. |
| Budgets, cleanup age, room factor | One module of constants in `app` (`sample-budgets.ts`). Tests import the constants, not the numbers. Cleanup can be switched off there. |
| The pyramid's base and step | Constants inside `core/sample`. Nothing outside reads levels; drawing goes through `columnsFor`. |
| Processes and curves | A registry: each process is one entry (id, title, settings, `apply`, `remap`), each curve one row of `FADE_CURVES`. The toolbar, menus and palette are built from it. Adding or dropping one is one entry. |
| The crossfade's default, snap, ruler mode | Settings in `wave-editor-store`, per browser, not in the project. Changing a default touches nobody's files. |
| Space and the view keys | Rows in round 10's key table, so the user can already change them. |
| Lane renderers (waveform, later spectrogram) | One interface; the waveform is its first implementation. |
| The split into 11a, 11b, 11c | Each part lands green and is usable alone, so the order can change or a part can stop early. |

**What is hard to change later**, said plainly so it is decided with open eyes:

* **Files already written.** Projects saved after 11b name edit-made ids, and their float WAV bytes sit in IndexedDB and
  in exported packages. A later scheme must keep loading them.
* **Format v11.** Once files are saved as v11, they stay readable forever: fields can be added, not taken away.
* **Stereo audio already heard.** A track switched to stereo sounds different if the engine goes back to mono.

## Decisions to sign off

Signed off 2026-10-29: every row as proposed. § Built to change says how each can be revisited.

| Question | Proposed | Alternative |
|---|---|---|
| Destructive edits or derived samples | **In place, with undo:** a new file, and every use moved onto it in one step; *Save as new sample* stays as a choice | Keep deriving copies and add *Replace uses* as a separate action |
| How an in-place edit names its result | **A new content-hash id;** `replaceSample` rewrites the uses; `origin` lets the editor follow and revert | Keep the id and add a `content` hash to `SampleInfo`. No rewriting, but "id = hash" breaks in storage, packages, bundles and the library, and one id can mean two sounds |
| What an edit changes | **Everything in the project:** nodes, bindings, clips, regions, presets, asset revisions | Leave presets and revisions on the old version, which then shows as missing on recall |
| Length-changing edits and clip trims | **Remap the trims** so a clip plays the same audio; `lengthBeats` stays | Leave the fractions alone; a clip then plays different audio |
| Stereo throughout or only in the editor | **Throughout:** decoding, the bank, audio tracks, preview, the bounce. Instruments stay mono | Only in the editor and the file, with the engine on a mixdown |
| Old audio tracks | **`Track in` mono** (the average, so they sound the same); new audio tracks start in stereo | Turn every audio track's `Track in` to stereo; old stereo files would then sound wider |
| Files with more than two channels | **Averaged to mono,** as today | Folded down to stereo |
| The format of files an edit writes | **32-bit float WAV:** exact, no requantizing; the bundle's cap goes to 64 MiB | 16-bit PCM: half the size, quantized again at every edit, and fits the 32 MiB cap |
| Format version | **v11** with an identity migration and a fixture | Optional fields at v10, as samples were added; an older build drops the markers silently |
| Memory budget for undo | **128 MB of decoded audio** each on the main thread and in the engine | No budget: unbounded with long stereo samples. Or none kept: every undo decodes and has a gap |
| Cleaning up edit-made bytes | **At startup, only edit-made files over a day old** that the project, backup and catalog don't name | Never, until the general cleanup (Natural next steps, item 1) |
| Asking for persistent storage | **Not this round.** `navigator.storage.persist()` asks the user in some browsers | Ask at the first in-place edit |
| Pyramid | **Min and max per 64 frames, halving per level,** open sample only | Absolute peaks (as today), or a finer base level |
| The default crossfade | **5 ms, linear,** at every join and selection edge; 0 turns it off | Off by default (a butt splice), with snap to zero crossings on |
| Preview of a process before applying | **Not this round** | A `sample/previewData` command that plays a processed buffer |
| Space in the wave editor | **The transport's,** as everywhere; P or ▶ previews | Space previews while the editor is focused, as in WaveLab |
| One round or three | **Three parts** (11a, 11b, 11c), each with its own plan sign-off or one plan with three parts | One round, one plan |
