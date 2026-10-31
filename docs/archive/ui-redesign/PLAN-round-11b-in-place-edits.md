---
status: done
date: 2026-10-29
shipped_in: architecture/samples-and-wave-editor.md
---
# Round 11b: in-place edits

Status: **done** 2026-10-29; plan signed off 2026-10-29, every decision as proposed (one plan, one branch). Written 2026-10-29. Part of the [UI redesign](README.md). Carries out the second
of the three parts in the signed-off [round 11 spec](SPEC-round-11-wave-editor.md) (§ Suggested split), from a fresh
inventory of the code it touches, taken on `imp/serene-clarke-868d95` at `e1d2404` (round 11a done, not merged into
`feat/ui-redesign` yet). The spec's decisions are settled and not repeated here; this plan only adds the ones it raises.
Where it differs from the spec, it says so.

## Goal

An edit changes the sample everywhere the project plays it, and undo takes it back. After 11b:

* **an edit is in place:** it writes a new file, and every use of the old sample moves onto it in one undo step. Clips
  and regions keep playing the audio they played. *Edits make copies* is a toolbar switch that brings back 11a's
  behaviour;
* **undo and redo are instant** inside the budgets: the old audio is still decoded on the main thread and still held by
  the engine;
* **storage stays bounded:** edit-made files are noted, and the ones nothing can reach any more are deleted a day later;
  an edit that wouldn't fit is refused before the project changes;
* **the selection can be processed** (gain, fades with five curves, normalize, reverse, silence, DC offset), on both
  channels or one;
* **the selection can be cut, copied, pasted and deleted,** the sample cropped and silence inserted, with a crossfade at
  every join;
* **audio clips, arrangement regions and the sampler open their sample** in the editor, at the part they play.

**Out of scope** (11c, or later, per the spec):

* markers and regions in the UI (11b only keeps them correct through edits, below), snap, the sample-selection focus
  subject, its verbs (Delete, ⌘C, ⌘X, ⌘V) and the view keys. In 11b the clipboard and the processes are toolbar buttons;
* *Revert to original* (below, Decisions);
* preview of a process before applying it; the spectrogram; the granular sampler;
* cleaning up unused **imported** samples (Natural next steps, item 1).

## Inventory

Taken at `e1d2404`. What the spec's inventory and 11a's found holds; these are the details 11b needs.

### The edit today

* `core/sample/edits.ts` (157 lines): `SampleEdit` is six kinds (`normalize`, `reverse`, `keep`, `delete`, `fade-in`,
  `fade-out`), `applySampleEdit` is one `switch`, and `SAMPLE_EDITS` holds the toolbar's entries (`kind`, `title`,
  `tooltip`, `suffix`, `needsSelection`, `create({ selection })`). Every edit works on every channel; the selection's
  `channels` is ignored. The fades are 10 ms on the whole sample. No entry has `apply` or `remap` yet; the spec's
  registry shape (§ Built to change) is half there.
* `app/sample-library.ts` (258 lines) `editSample(id, edit)` reads the working copy when it is the open sample's, or
  decodes the stored bytes; applies; refuses an empty result; encodes `EDIT_WAV_BIT_DEPTH` WAV; hashes; refuses a result
  already in the library; stores; `addSamples` "name (suffix)". It takes no options yet: the `asCopy` flag lives only in
  `state/sample-library.tsx`'s `SampleEditOptions`, typed `{ asCopy: true }`.
* `SampleEditor.tsx` holds `busy` in component state and calls `editSample(…, { asCopy: true })`. Nothing else edits.
* `tests/browser/arrangement.smoke.spec.ts` ("derives a reversed copy without touching the original") clicks
  *Reverse* and expects "Demo Kick (reversed)" in the library. 11b changes what that test expects.

### Where a sample is used

`usedSampleIds` and `projectSampleDependencies` (`core/project/sample-use.ts`) and `removeSample`
(`core/project/edit.ts`) each walk the project by hand. The places:

| Place | `usedSampleIds` | `projectSampleDependencies` | `removeSample` |
|---|---|---|---|
| `samples` (the library list) | | | removes the entry |
| sampler nodes in the master's, buses', tracks' effects and instruments, and modules' patches | yes | yes | clears `sampleId` |
| session audio clips (`track.clips`, audio tracks) | yes | yes | removes the clip |
| arrangement audio regions (`region.content.sampleId`) | yes | yes | **left in place** (the spec's "noticed") |
| `sampleBindings` | yes | yes | sets `sampleId: null` |
| presets' `samples` (bindings) | | yes | left |
| asset revisions: `payload.sampleIds` and sampler nodes inside `payload.patch`, `noteGraph`, `graph` and `modules` | | `sampleIds` only | left |

* Instruments' note graphs hold no sampler nodes (`usesSample` is only on the sampler, an audio node); nobody walks them.
* `assetSignature` ignores `sampleId` (it keeps node ids, types, `moduleId`, `stereo`, `bypassed` and control
  configs), so pointing a revision at another sample changes no signature. Checked in `core/preset/assets.ts`.
* `diffProject` (`core/sync/diff-project.ts`) already sends `track/setSample` / `master/setSample` when a node's sample
  changes, `track/setAudioClips` when a track's clips change and `arrangement/set` when the arrangement changes. So
  `replaceSample` reaches the engine with no new command, as the spec says.

### Where an id becomes bytes

Every one reads `info.id` (or a bare id) as the storage key today. These are `bytesKeyOf`'s call sites:

| Where | What |
|---|---|
| `app/sample-library.ts` | `load`, `openAudio`, `editSample`, `ingest` |
| `app/export-audio.ts` | the bounce reads the bytes of `usedSampleIds` |
| `app/project-files.ts` → `storage/project-transfer.ts` | the package writer (`samples/<id>.<ext>`, `readSample(sample.id)`) and reader (checks each entry's hash against `sample.id`) |
| `storage/library-transfer.ts`, `app/library.ts` | the bundle's export and import, the library preview, capturing a sample into the catalog |

### Engine and memory

* `syncWithProject` sends `sample/remove` for any id the **present** `project.samples` lacks, at once. So undoing a
  removal today decodes the sample again from storage, and its uses are silent meanwhile.
* `deliver` **transfers** the channels to the engine. An in-place edit keeps the new audio as the working copy, so the
  engine must get a copy.
* The working copy (`state/wave-audio-store.ts`) holds one `{ sampleId, audio, pyramid }`. `openAudio` decodes from
  storage whenever `useSelectionStore.sampleId` changes. There is no cache.
* `core/history`: `past`, `present`, `future`, 200 steps. Snapshots share unchanged parts, so the `samples` arrays of
  most entries are the same object.
* `updatePeakPyramid` doesn't exist. The full build of 120 s stereo is ~12 ms in Chromium (11a, step 5).

### The editor's view state

* `state/wave-editor-store.ts` keys `views` **by sample id**; `waveViewOf` is read in `SampleEditor`, `DetailView`,
  `Overview`, `Ruler` and `current-view.ts`. After an in-place edit the id changes, so the view (zoom, scroll, selection)
  would be lost.
* `useSelectionStore.sampleId` (set only by `openSampleEditor` and the editor's *Close*) names the open sample by id.
  When the id leaves the project, `WaveEditorView` shows its empty state.
* The ruler, its tempo and *Loop* are per browser through `useStoredState` in `ui` (11a). The crossfade settings will
  sit beside them.

### Storage

* `storage/library-database.ts` opens database `sfxlab` at **version 2** with stores `samples` and `catalog`;
  a blocked upgrade rejects with "Close older SFX Lab tabs, then retry". `sample-edits` makes it version 3.
* `SampleStorage` has `has`, `get`, `put`, `delete`. Nothing calls `delete` today, and nothing checks free space.
  `library-storage.ts` turns a `QuotaExceededError` into a message; `sample-storage.ts` doesn't.
* Project slots in `localStorage` (`storage/project-storage.ts`): `sfxlab:project`, `sfxlab:backup`,
  `sfxlab:corrupt` and `sfxlab:pre-signature-v9`. The catalog lists its `samples` (`SampleInfo[]`) in IndexedDB.
* `fake-indexeddb` is a dev dependency, so the new store can be unit tested.

### Limits

* The library bundle's entry cap is `LIBRARY_ARCHIVE_LIMITS.entry = 32 MiB` (`storage/library-archive.ts`), stated in
  `docs/LIBRARY-BUNDLE.md` and used in one test (`library-transfer.test.ts`, line 254). The project package's is 64 MB
  (`MAX_ENTRY_BYTES`).
* An imported file is capped at 32 MB (`MAX_FILE_BYTES`). Edit-made files don't pass through `ingest`, so a 46 MB
  edit is fine; dragging that file back in from disk would be refused. Left as it is (Known POC limits).

### Entry points

* `openSampleEditor(sampleId)` (`state/navigation.ts`) selects and reveals `wave`. Callers: `sample.open` (✎ and the
  palette).
* `clipActions` (`state/actions/clip.ts`) and `regionActions` (`state/actions/region.ts`) have no sample action.
  `AudioClipEditor` gets a `clipRef` that is a session clip or a region (round 6), so its button can run either action.
* `PropertyEditor.tsx` draws `SamplePicker` for nodes with `usesSample`; its value may come from a preset's binding
  (`resolveSampleTarget`).

### What the inventory changes

* **The visitor list can be the only walk.** `usedSampleIds`, `projectSampleDependencies`, `removeSample` and
  `replaceSample` all walk the same places. Built from one list, the spec's "a test checks the list against
  `usedSampleIds`" becomes true by construction, and a new place is added once. The test then checks the list against a
  project that uses a sample in every place the format allows.
* **The view must follow the sample, not the id.** Keying `wave-editor-store` by `originOf(info)` makes the view
  survive edits, undo and redo with no copying.
* **11b has to keep markers and regions right** though their UI is 11c's: a crop that leaves a marker past the end
  would be dropped by the sanitizer on the next load, with a warning. The remap is a few lines in the `samples`
  visitor.
* **Size.** 11b is about twice 11a. It splits cleanly after step 5 (in place, caches, storage and entry points, with
  today's edits) and before step 6 (the new processes, structure edits and the clipboard). The plan keeps one plan and
  one branch with that seam; Decisions offers the split.

## Design

### Edits as data, finished (`core/sample`)

* **The registry gets the spec's shape.** `SAMPLE_EDITS` is a record by kind. Each entry: `kind`, `title`, `tooltip`,
  `suffix` (for a copy's name, as 11a), `group` (`'process' | 'structure' | 'clipboard'`), `settings` (a list of numeric
  fields, for a popover; none for most), `channels` (`'any'`, or `'both'` for edits that change the length),
  `needsSelection`, `create(context)`, `apply(audio, edit)`, `remap(edit, frames)`, `changed(edit, frames)` and
  `after(edit)` (the selection and cursor once it lands). `applySampleEdit`, `remapFrame`,
  `remapRange` and the pyramid update dispatch through it; nothing else switches on `kind`.
* **`SampleEdit` kinds** (11a's six are replaced; edits are never saved, so nothing migrates):

  | Kind | Fields | Length | Notes |
  |---|---|---|---|
  | `gain` | `range`, `channels`, `db`, `ramp` | same | −48 to +24 dB |
  | `fade` | `range`, `channels`, `direction`, `curve` | same | `direction`: `in` or `out` |
  | `normalize` | `range`, `channels`, `peakDb`, `linked` | same | default −0.1 dBFS, linked |
  | `reverse` | `range`, `channels` | same | |
  | `silence` | `range`, `channels`, `ramp` | same | |
  | `dc-offset` | `range`, `channels`, `ramp` | same | |
  | `delete` | `range`, `crossfade` | shorter | joins the parts around `range` |
  | `crop` | `range` | shorter | keeps `range`; there is no join, so no crossfade |
  | `insert` | `at`, `audio`, `handles`, `crossfade` | longer | silence (`audio` of zeros) and paste |
  | `replace` | `range`, `audio`, `handles`, `crossfade` | either | paste over a selection |

  `range` is the selection, or the whole sample when there is none (`create` fills it in). `channels` is the
  selection's (`'both' | 'left' | 'right'`; always `both` on a mono sample).
* **`FADE_CURVES`**: one row each for `linear`, `equal-power`, `slow-start`, `fast-start` and `s-curve`, with the
  spec's `g(t)`; a fade out uses `g(1 − t)`. The toolbar's curve menu is built from it.
* **Edge ramps.** Gain, silence and DC offset ramp from no change to full change over `ramp` frames at each edge of a
  range that isn't the whole sample, **inside** the range, so audio outside the selection is never touched. A ramp is
  at most half the range. Its shape is the crossfade curve.
* **Crossfades** (`core/sample/crossfade.ts`). A join is centred: over `crossfade` frames, the outgoing part continues
  into the audio after it (its handle) while fading out, and the incoming part starts early from the audio before it
  while fading in. The output has exactly the expected length. For a delete, both handles are the deleted audio; for a
  paste, the clipboard's handles and the audio around the cursor. Where a side has no audio to borrow (the sample's
  start or end, or a handle shorter than half the crossfade), that side's fade is a plain fade over what there is.
  Curves: `linear` (equal gain) or `equal-power`, from `FADE_CURVES`.
* **Constants** (private to `core/sample`, exported only for tests): `MAX_CROSSFADE_SECONDS = 0.1`,
  `DEFAULT_CROSSFADE = { seconds: 0.005, curve: 'linear' }`, `CLIPBOARD_HANDLE_SECONDS = 0.05` (half the longest
  crossfade, so a paste always has enough), the gain range, the normalize default and `SILENT_PEAK`.
* **Clipping.** Gain and normalize may take a value past full scale; float WAV keeps it. The flow warns once ("peaks at
  +2.3 dBFS") and keeps the edit.
* **`remapFrame(edit, frames, frame)`** says where an old frame is now, or `null` if it is gone; **`remapRange(edit,
  frames, range)`** maps a range's start forward and its end backward, or `null` if nothing is left. A process maps
  every frame to itself, except reverse, which mirrors inside its range. `SampleRemap` bundles them with the old and new
  lengths, for `replaceSample`.
* **`changed(edit, frames)`** is the range of output frames that differ from the input (to the end for edits that
  change the length). The pyramid update uses it.

### Replacing a sample (`core/project`)

* **`SAMPLE_USES`** (`core/project/sample-uses.ts`) is the list of places, one visitor each: `id`, `plays` (whether the
  sample sounds from there), `collect(project, add)`, `replace(project, from, to, remap, report)` and
  `remove(project, id)`. The visitors, in today's `usedSampleIds` order: master patch, bus patches, module patches, track
  effects and instruments' sampler nodes, session audio clips, arrangement audio regions, sample bindings, presets'
  bindings, asset revisions. The `samples` entry is handled by `replaceSample` itself.
* **Derived from it:** `usedSampleIds` (visitors with `plays`), `projectSampleDependencies` (all), `removeSample` (each
  visitor's `remove`, then the entry), and `replaceSample`. Same results and order as today, except that `removeSample`
  now removes arrangement regions that played the sample (the spec's "noticed"; Decisions).
* **`replaceSample(project, fromId, to: SampleInfo, remap: SampleRemap): { project, report }`**:
  * the `samples` entry is replaced where it is, with the old `name`, `origin: originOf(old)`, and markers and regions
    remapped (a marker whose frame is gone is dropped; a region is clipped, and dropped when empty). If `to.id` is
    already in the library, the old entry is removed instead and the uses point at the existing one (`report.merged`);
  * sampler nodes, sample bindings, presets' bindings and revisions' sampler nodes and `sampleIds` point at `to.id`;
  * session audio clips and arrangement audio regions point at `to.id`, with `start` and `end` through `remapRange` (as
    frames of the old and new lengths). `lengthBeats`, fades and gain stay. A trim that `remapRange` empties keeps the
    minimum region (`MIN_REGION`) where its start was mapped, and counts in `report.emptiedTrims`;
  * the sampler's *Start* param is not touched.
  * A visitor that changes nothing returns the same object, so an unaffected track keeps its identity and the engine
    hears nothing.
* **`bytesKeyOf(info)`** in `core/sample/marks.ts` (beside `originOf`): returns `info.id`. Every call site in the
  inventory's table asks it; `export-audio` looks the info up from `usedSampleIds`. The package reader verifies an
  entry's hash against `bytesKeyOf(sample)`.

### The in-place flow (`app/sample-library.ts`)

`SampleLibrary.editSample(sampleId, edit, { asCopy })`, the one call (§ Built to change). `SampleEditOptions` becomes
`{ asCopy: boolean }`.

1. **One at a time.** `useWaveAudioStore.editing` is set for the run; a second call meanwhile is refused (returns
   at once). The toolbar reads `editing`, so 11c's keys will too.
2. **Read the audio:** the working copy if it is this sample's, else the working-copy cache, else the stored bytes
   (`bytesKeyOf`) decoded.
3. **Apply**; refuse an empty result, as today. A result equal to the input (same hash) says "Nothing changed" and stops.
4. **Encode** float WAV, **hash**, **check room** (below), **store**, and **note** the id in `sample-edits`, unless it
   was already stored. A storage failure, a quota error or too little room refuses the edit with a toast; the project is
   untouched.
5. **Send `sample/add`** for the new id with a **copy** of the channels (the main thread keeps the audio). Thumbnail
   peaks are computed as for any delivery.
6. **Commit**, if `sampleId` is still in the project (an undo during steps 2 to 5 may have taken it away; then the edit
   is dropped with a toast and its file left to cleanup):
   * `asCopy: false`: the store action `replaceSample(fromId, to, remap)`, one undo step, no merge key. A merge says
     "Already in the library as "…"; its uses now point there". Emptied trims warn once: "N clips were trimmed to
     audio the edit removed".
   * `asCopy: true`: `addSamples` "name (suffix)" with no origin, as 11a, and the editor opens the copy (Decisions).
7. **Move the editor:** the old audio goes into the working-copy cache; the new audio becomes the working copy, with
   its pyramid from `updatePeakPyramid(old pyramid, audio, changed)`; `useSelectionStore.sampleId` becomes the new id;
   the view's selection and cursor come from the entry's `after(edit)` (processes keep the selection; delete leaves the
   cursor at the join; crop selects nothing and puts the cursor at 0; insert and paste select what was inserted).
8. The old id stays in the engine and in the cache, under the keep-alive rule.

**Following the sample through undo and redo.** `connect` already watches `project.samples`. When the open sample's id
leaves the project, it opens the sample with the same `originOf` in the new project, if there is one (first in library
order), else it closes as today. The view, keyed by origin, comes with it; a selection past the new end is clamped.

### Undo, memory and the budgets (`app/sample-budgets.ts`, `app/sample-library.ts`)

* **`app/sample-budgets.ts`** is the one module of constants: `WORKING_COPY_CACHE_BYTES = 128 MB`,
  `ENGINE_KEEP_ALIVE_BYTES = 128 MB`, `EDIT_CLEANUP_AGE_MS = 24 h`, `EDIT_CLEANUP_ENABLED = true`,
  `EDIT_CLEANUP_DELAY_MS` (the idle fallback), `ROOM_FACTOR = 2`. Tests import them, not the numbers.
* **Bytes of decoded audio** are `frames × channels × 4`, from `SampleAudio`; one helper, `decodedBytes(audio)` in
  `core/sample`.
* **The working-copy cache** (`app/working-copies.ts`): a small LRU of `{ sampleId, audio, pyramid }` that are not the
  open one, up to `WORKING_COPY_CACHE_BYTES`. `openAudio` looks there before decoding. Plain JS in `app`; nothing
  renders from it.
* **Engine keep-alive** replaces `syncWithProject`'s immediate `sample/remove`:
  * the **named** ids are those in the `samples` list of every history entry (`past`, `present`, `future`). Entries
    share `samples` arrays, so each array is read once per change (a `WeakSet` of arrays seen);
  * an id in the engine that the present doesn't name is **kept** while history names it, oldest-to-leave first out
    once the kept audio passes `ENGINE_KEEP_ALIVE_BYTES`, and removed (`sample/remove`, peaks forgotten) as soon as no
    entry names it;
  * it runs on every project-store change (the history changes on commits that don't touch the present's samples, such
    as one that drops the redo future), so it is cheap by design: no walk of patches, only the `samples` arrays;
  * past the budget, undo reloads the sample from storage, and its uses are silent for that moment, as the spec says.
  This applies to removed samples as well as edited ones, so undoing *Remove* becomes instant too.

### Storage (`storage`, `app/sample-cleanup.ts`)

* **`sample-edits`** store: `openLibraryDatabase` goes to version 3 and creates it beside `samples` and `catalog`.
  Key: the id; value: `{ at }` (ms). `storage/sample-edit-log.ts`: `note(id, at)`, `list()`, `forget(id)`, and a memory
  version for tests and private mode.
* **Imported wins.** `ingest` (a file, a demo sample) calls `forget(id)`, so bytes a user imported are never deleted,
  even if an edit made them first. Bytes from a project package or a library bundle aren't noted, so they count as
  imported.
* **Room check** (`storage/storage-room.ts`): `freeBytes()` from `navigator.storage.estimate()` (`quota − usage`), or
  `null` where it is missing. The flow refuses when it is known and under `ROOM_FACTOR ×` the file. `SampleStorage.put`
  turns a `QuotaExceededError` into a typed error, which the flow reports the same way.
* **Cleanup** (`app/sample-cleanup.ts`), once after startup, in `requestIdleCallback` (or after
  `EDIT_CLEANUP_DELAY_MS`), and only with persistent storage and `EDIT_CLEANUP_ENABLED`: for each noted id older than
  `EDIT_CLEANUP_AGE_MS`, delete its bytes and its note unless it is **named** by
  * the text of any project slot in `localStorage` (current, backup, corrupt, pre-signature): a search for the 64-hex
    id in the raw text, so an unreadable slot still protects its samples;
  * the personal library's catalog (`samples`);
  * any entry of this tab's history (the user may have edited before the idle callback ran).
  A second tab's undo of a file older than a day can lose its bytes; the day is the spec's guard for that, and the
  sample then shows *audio missing* until redone.
* **The bundle's cap** goes to 64 MiB (`LIBRARY_ARCHIVE_LIMITS.entry`), with `LIBRARY-BUNDLE.md` and its test.

### The pyramid after an edit (`core/sample/pyramid.ts`)

* **`updatePeakPyramid(pyramid, audio, changed)`** returns a new pyramid: buckets wholly before `changed.from` (and,
  for edits that keep the length, wholly after `changed.to`) are copied from the old one at each level; the rest are
  computed. Edits that change the length rebuild from `changed.from` to the end. It must equal `buildPeakPyramid(audio)`
  exactly.
* Measured in step 4 against the full build, for a fade at the end and a delete at the start of 120 s stereo.

### The view (`state`, `ui`)

* **`wave-editor-store` is keyed by `originOf(info)`**, so a view follows its sample through edits. `waveViewOf(views,
  key)`'s callers pass the open sample's origin. It gains `reveal(key, selection)`, which sets the selection and a
  `zoomPending` flag the editor consumes once its width and audio are known (`zoomTo`, as *Zoom to selection*).
* **Toolbar**, built from `SAMPLE_EDITS` by `group`, wrapping as today:
  * ▶ / ■, *Loop* (as 11a);
  * **Edit:** *Cut*, *Copy*, *Paste*, *Delete*, *Crop*, *Insert silence…*;
  * **Process:** *Gain…*, *Fade in*, *Fade out* (the curve from a menu beside them), *Normalize…*, *Reverse*,
    *Silence*, *Remove DC offset*;
  * **Crossfade:** its length (0 to 100 ms, a number field) and curve (*Linear*, *Equal power*), per browser
    (`sfxlab:wave-crossfade`), next to the edits it governs;
  * *Edits make copies* (a toggle, per browser, `sfxlab:wave-edit-copies`, off);
  * zoom, ruler and *Close* (as 11a).
  * A button is disabled with a tooltip that says why: no selection where one is needed, a one-channel selection for an
    edit that changes the length ("Select both channels to delete"), an empty clipboard, or `editing`.
* **Settings popovers** (*Gain…*, *Normalize…*, *Insert silence…*) are one component, `EditSettings`, built from an
  entry's `settings` (label, unit, min, max, step, default) with *Apply* and *Cancel*; the last values are kept per
  browser. *Insert silence* takes seconds (0.001 to 10, default 1).
* **The audio clipboard** (`state/audio-clipboard.ts`, a `createClipboard` like the clip clipboard): `{ audio,
  handles: { before, after } }`, the copied channels and up to `CLIPBOARD_HANDLE_SECONDS` of audio on each side. A copy
  from one channel of a stereo sample holds that channel alone. Pasting a mono copy into a stereo sample puts it in both
  channels; pasting a stereo copy into a mono sample pastes its average (`monoAt`). Not the OS clipboard.
* *Copy* is not an edit: it reads the working copy and fills the clipboard. *Cut* is *Copy* then *Delete*, one undo step
  (the copy isn't undone).

### Entry points (`state`, `ui`)

* **`openSampleEditor(sampleId, range?)`**: `range` is `{ start, end }` as fractions (a clip's own fields). It selects
  the sample, reveals `wave` and, with a range, calls `reveal` with it in frames (`savedFrameCount(info)`).
* **`clip.edit-sample`** (*Edit sample*, group `open`) on session clips of audio tracks (`applies`), enabled while the
  sample is in the library; opens it at the clip's trim.
* **`region.edit-sample`** (*Edit sample*) on regions whose content is audio; likewise.
* **The audio clip editor** gets an *Edit sample* button in its toolbar, running `clip.edit-sample` or
  `region.edit-sample` by its `clipRef`'s kind, through `runAction`.
* **The sampler** gets *Edit* beside its picker in the property editor, opening the sample the picker shows (the
  binding's, when a preset binds it); disabled with none.
* The palette lists the two new actions for the selected clip or region (round 10's selection subjects).

## Steps

Each step lands green: `npm test`, `npm run typecheck`, `npm run test:smoke` (outside the sandbox). `npm run test:audio`
at steps 3 and 7. The bounce hashes in `src/core/engine/old-projects.test.ts` must hold at every step.

1. **The visitor list, `replaceSample` and `bytesKeyOf`.** `SAMPLE_USES`; `usedSampleIds`,
   `projectSampleDependencies` and `removeSample` built from it (arrangement regions now removed too); `SampleRemap`,
   `remapFrame` and `remapRange` for 11a's kinds through new registry fields; `replaceSample` with markers, regions and
   trims; `bytesKeyOf` and its call sites; the project store's `replaceSample` action.
   *Tests:* a fixture project that uses one sample in every place (a sampler in the master, a bus, a module, a track's
   effects and instrument; a session clip; an arrangement region; a binding; a preset binding; a revision) — after
   `replaceSample` neither `usedSampleIds` nor `projectSampleDependencies` names the old id, and every place names the
   new one; `usedSampleIds` and `projectSampleDependencies` give the same arrays as before on every committed fixture;
   trims of a delete before, across and after a clip's region, and an emptied trim; markers and regions remapped; a merge
   into an existing entry; asset signatures unchanged; `removeSample` removes regions; the package round-trips.
2. **Storage.** Database version 3 with `sample-edits`; the edit log; `freeBytes`; `QuotaExceededError` from `put`;
   `app/sample-budgets.ts`; the bundle cap at 64 MiB.
   *Tests* (fake-indexeddb): a version-2 database upgrades and keeps its samples and catalog; the log notes, lists and
   forgets; a 40 MiB entry is accepted by the archive reader and a 65 MiB one refused.
3. **Edits in place.** `editSample(…, { asCopy })` with both paths; `editing` in `wave-audio-store`; the room check;
   `sample/add` with a copy; following by origin; `wave-editor-store` keyed by origin, `after(edit)`; *Edits make
   copies*. The toolbar still has 11a's six edits, now in place.
   *Tests* (`app/sample-library.test.ts`, memory storage and a fake host): bytes are stored and noted before the commit,
   and `sample/add` is sent before the commit; one undo step; undo and redo move the editor and keep its view; a full
   disk (and a `QuotaExceededError`) refuses the edit and leaves the project and history as they were; an edit whose
   sample left the project meanwhile is dropped; "Nothing changed"; a merge; an edit while one runs is refused;
   `asCopy` adds a copy and opens it.
   *Browser:* `arrangement.smoke.spec.ts`'s copy test becomes "reverses the sample in place, and undo brings it back",
   plus one with *Edits make copies* on; `wave-editor.smoke.spec.ts`: reverse, then reload and find the edited sample
   playing in its clip.
4. **The caches and the pyramid update.** `working-copies.ts`, engine keep-alive, `decodedBytes`, `updatePeakPyramid`.
   *Tests:* undo and redo inside the budgets send no `sample/remove` and decode nothing; past the budget the oldest goes
   first and undo decodes it again; a committed step that drops the future removes its ids; removing a sample and
   undoing it decodes nothing; `updatePeakPyramid` equals a full build for edits at the start, middle and end, with and
   without a length change, at every level.
   *Measure:* `updatePeakPyramid` against `buildPeakPyramid` for 120 s stereo, and the whole in-place flow (apply,
   encode, hash, store) for a 5 s and a 120 s stereo sample in Chromium.
5. **Cleanup and the entry points.** `app/sample-cleanup.ts` on startup; `openSampleEditor(id, range)` and `reveal`;
   `clip.edit-sample`, `region.edit-sample`; the audio clip editor's button; the sampler's *Edit*.
   *Tests:* cleanup keeps imports, files under a day old, and everything a slot (even an unreadable one), the catalog or
   this tab's history names, and deletes the rest with their notes; it doesn't run on memory storage or when disabled;
   the actions' `applies` and `enabled`; `reveal` selects and zooms once.
   *Browser:* open from a sample, a session clip (selection matches the trim), a region and the sampler.
   **After this step 11b is usable on its own** with 11a's six edits in place; it is the seam for a split.
6. **Processes.** The registry's final shape; `gain`, `fade` with `FADE_CURVES`, `normalize` (target, linked or per
   channel), `reverse`, `silence`, `dc-offset` on a range and channels, with edge ramps; the settings popovers; the
   crossfade settings in the toolbar; the clipping warning. 11a's `keep`, `fade-in` and `fade-out` go (`delete` stays,
   and gains its crossfade in step 7).
   *Tests:* each process and curve as a table, on mono and stereo, whole sample and partial range, each channel choice;
   ramps leave the frames outside the range bit for bit; normalize linked keeps the balance and leaves a peak under
   −100 dB alone; `remap` and `changed` per kind.
   *Browser:* select on the left channel, apply *Gain…* −6 dB, only the left lane changes; undo.
7. **Structure edits, crossfades and the clipboard.** `crossfade.ts`; `delete`, `crop`, `insert` and `replace`;
   `audio-clipboard.ts`; *Cut*, *Copy*, *Paste*, *Delete*, *Crop*, *Insert silence…*; one-channel rules; `after(edit)`
   for each.
   *Tests:* crossfades with both handles, with one, with none, at 0 ms (a butt splice, bit for bit the plain cut), and
   each curve; the result lengths are exact; delete, crop, insert and replace remap trims, markers and regions; paste
   mono into stereo and stereo into mono; *Cut* is one undo step.
   *Browser:* cut a part and paste it at the cursor; the length and the status line agree; undo twice.
8. **Docs and the profile.** ARCHITECTURE § Samples, § The sample editor, § Undo / redo (sample bytes, keep-alive),
   § Saving (the cleanup), § Known POC limits; `LIBRARY-BUNDLE.md`; this plan's "Changes made while implementing"; the
   profile; README and roadmap marked done.

## Behavior changes

* **An edit changes the sample in place:** every clip, region, sampler, binding, preset and revision that used it plays
  the new version, and one undo puts all of it back. *Edits make copies* brings back the copy, which now opens in the
  editor.
* **The editor's edits act on the selection** (or the whole sample), on the selected channels. 11a's *Keep selection*
  becomes *Crop*; *Fade in* and *Fade out* fade over the selection with a curve instead of 10 ms at the ends; *Delete*
  crossfades the join (5 ms by default).
* **Removing a sample also removes its arrangement regions** (they used to stay and play silence). Undo restores them.
* **Undoing a removal or an edit is instant** while within the budgets; the engine now holds samples the present project
  no longer uses, up to 128 MB.
* **Edit-made files are deleted** a day after nothing names them. Imported files never are.
* **The first start after 11b upgrades the browser's sample database** (version 3). An older tab still open blocks it
  with the existing "Close older SFX Lab tabs" message.
* **Library bundles** accept samples up to 64 MiB; older builds refuse a bundle with such a sample.
* Audio clips, regions and the sampler have *Edit sample* / *Edit*.
* The file format stays v11.

## Verification

* `npm test`, `npm run typecheck` and `npm run test:smoke` at every step; `npm run test:audio` at steps 3 and 7. Smoke
  and audio tests need local ports, which the sandbox refuses, so they run outside it.
* **Bit for bit:** the bounce hashes in `old-projects.test.ts` hold at every step (11b changes no engine code; the
  keep-alive only delays `sample/remove`).
* **Manual pass** on the dev build, in Chrome, and Firefox and Safari where they can be run:
  * reverse a sample used by a session clip, an arrangement region and a sampler; all three play it reversed; undo, redo,
    each with no gap; reload, and the edit is there;
  * delete a part of a looped clip's sample before its trim; the clip plays the same audio;
  * a 120 s stereo file: a fade at the end, a delete at the start, undo and redo, and the time each takes;
  * cut and paste across the sample with 0 ms and 100 ms crossfades, by ear;
  * fill storage in a small quota (Chrome's DevTools storage override) and see the edit refused;
  * set a noted file's time two days back by hand, reload, and see it cleaned up;
  * Safari loads a float WAV (11a didn't check it; 11b depends on it more).
* **Profiling:** `scripts/profile-status.cjs` as 11a ran it. `editor`, `four`, `groups`, `pinned` and `wave` must match
  11a (144, 173, 87, 145 and 56 component renders a second). The keep-alive subscription and the follow-by-origin rule
  add no renders: they are plain store subscriptions in `app`. The `wave` case gets no new reader.
* **Measures recorded** in "Changes made while implementing": the pyramid update against the full build, and the flow's
  time for 5 s and 120 s stereo.

## Decisions to sign off

Signed off 2026-10-29: every row as proposed.

| Question | Proposed | Alternative |
|---|---|---|
| One part or two | **One plan, one branch,** with step 5 as the seam: if the round should stop or pause there, everything up to it is usable | Split into 11b-1 (steps 1–5) and 11b-2 (steps 6–7), each with its own sign-off |
| How *Save as new sample* is offered | **A toolbar toggle, *Edits make copies*,** per browser, off; a copy opens in the editor so edits chain on it | A per-edit modifier (Alt-click) and the editor stays on the original, as in 11a |
| Markers and regions in 11b | **Remapped by `replaceSample` now,** with no UI, so a saved file never holds a marker past the end | Leave them to 11c; a crop may then leave markers the sanitizer drops on load |
| `removeSample` and arrangement regions | **Removes the regions too,** now that it walks the visitor list (the spec's "noticed") | Keep leaving them, playing silence |
| The view state's key | **The sample's origin,** so zoom, scroll and selection follow edits, undo and redo | By id, copied to the new id after each edit; undo then loses the view |
| Edges of gain, silence and DC offset | **Ramped inside the selection,** so audio outside it never changes | Centred on each edge, like a join |
| Edits that change the length on one channel | **Disabled, with a tooltip;** a one-channel selection can be copied and processed | Delete on one channel silences it, as some editors do |
| Pasting stereo into a mono sample | **Pastes the average;** the sample stays mono | Turns the sample stereo |
| What cleanup counts as "named" | **The id's text anywhere in a project slot,** the catalog, or this tab's history, so an unreadable slot still protects its files | Parse each slot; an unreadable one protects nothing |
| *Revert to original* | **In 11c,** with the subject's actions. Remapping trims back through a chain of edits needs the chain, which isn't kept; 11c decides how | In 11b, keeping trims as fractions |
| An edit that clips | **Kept, with a warning;** float WAV holds it | Refused, or limited to full scale |

## Changes made while implementing

* **Step 1: one visitor for tracks.** A track's insert graph, its instrument and its session audio clips are one visitor
  (`tracks`), not three, so `usedSampleIds` still lists samples track by track. A test compares `usedSampleIds` and
  `projectSampleDependencies` with a copy of the old hand-written walks on all 13 committed fixtures and both examples:
  the same arrays. `removeSample` moved from `core/project/edit.ts` into `sample-uses.ts`, beside `replaceSample`.
* **Step 1: the remap's shapes.** `core/sample/remap.ts` has four `FrameMap`s (identity, a splice, a crop, a mirror),
  each with `frame`, `range` and `start` (where a range's start moves forward to, which an emptied trim needs).
  Positions are frame boundaries, 0 to the length, and may be fractional (a trim). A trim that didn't move, through an
  edit of the same length, keeps its fractions exactly, so a process changes no clip's numbers. The store's
  `replaceSample` returns the report for the flow's toasts.
* **Step 1: `bytesKeyOf`'s call sites** are the plan's table, plus the library's preview and *Insert*, which look the
  catalog's `SampleInfo` up to ask it.
* **Step 2.** `LIBRARY_DATABASE_VERSION = 3` is the one place the version is written; the storage tests that checked
  the database at version 2 open it at that constant, and `library.smoke.spec.ts`'s check opens version 3. The typed
  quota error is `StorageFullError`. The 65 MiB refusal and the 40 MiB acceptance read real zips.
  `LIBRARY-BUNDLE.md` says older builds refuse a bundle with a sample over 32 MiB.
* **Step 3: `after(edit)` came in step 3,** not with the new kinds: moving the editor needs it. `WaveAudio` carries
  `viewKey` (the origin), so the lanes, the overview and the ruler find their view without the `SampleInfo`.
* **Step 3: the order of moving the editor.** In place, the new working copy is set before the commit, so following
  the sample to its new id finds it and decodes nothing; with a copy, the copy is added first and the working copy set
  after, for the same reason. A merge into an entry whose origin differs can't be followed by origin; the flow selects it
  itself (that one decodes once). "Nothing changed" is an info toast; a failed edit says why in an error toast. Importing
  bytes an edit wrote forgets their note from step 3 on (the plan's Storage section, with the flow that notes them).
* **Step 3: browser tests** read the autosaved project to see the edit (the entry keeps its name and gains `origin`).
* **Step 4: the keep-alive and the loader are separate.** Loading still runs only when the present's samples change
  (otherwise a sample with missing audio would be read again on every edit); the keep-alive runs on every history
  change and returns at once while the engine holds only what the present uses. The budgets can be passed to
  `createSampleLibrary` for tests (defaults from `sample-budgets.ts`). The working copies are fed by a subscription:
  whenever the editor's working copy changes to another sample, the old one goes in.
* **Step 4: measures**, in Chromium (Playwright's headless shell) on the dev server's modules, median of 7 runs for the
  pyramid and 5 for the flow, load average 5 to 9:

  | 120 s stereo | `updatePeakPyramid` | `buildPeakPyramid` |
  |---|---|---|
  | a fade over the last 0.5 s | 0.3 ms (0.2 ms at step 8) | 20.5 ms (19.3 ms) |
  | a delete of the first second | 19.8 ms (19.5 ms) | 19.5 ms (19.5 ms) |

  An edit at the start moves everything after it, so the update is a full build there; the plan expected that.

  | The in-place flow, stereo | apply | encode | hash | store | total |
  |---|---|---|---|---|---|
  | 5 s, step 4 (11a's 10 ms fade) | 16 ms | 2.0 ms | 1.0 ms | 2.0 ms | 21.8 ms |
  | 120 s, step 4 | 552.9 ms | 49.1 ms | 20.6 ms | 43.8 ms | 663.4 ms |
  | 5 s, step 8 (a fade or a crossfaded delete at the start) | 0.2 ms | 1.7 ms | 0.9 ms | 1.4 ms | 4.2 ms |
  | 120 s, step 8 | 2.9 ms | 44 ms | 20 ms | 34 ms | 100.9 ms |

  11a's fades mapped every frame through `Float32Array.from` with a callback; step 6's processes copy the channels and
  loop over the range, which is what made the 120 s flow six times faster. The measuring script is not committed.
* **Step 5: cleanup waits.** It runs `EDIT_CLEANUP_DELAY_MS` (10 s) after startup and then when the browser is idle,
  not at the first idle moment: run at once, it opened the database at version 3 before `library.smoke.spec.ts`'s
  stand-in for an older tab could open it at version 1, and startup is busy anyway. It needs both the sample storage and
  the edit log to be persistent. The project slots are read by `ProjectStorage.slotTexts()`.
* **Step 5: the sampler's *Edit*** sits beside the picker on one row; the waveform takes the next.
* **Step 6: the registry.** *Fade in* and *Fade out* are one kind (`fade`, with `direction`) and two `variants`; an entry
  with `takesFadeCurve` gets the curve menu beside it, and step 7's *Paste* has `needsClipboard`. A setting is a number or
  a toggle (*Normalize…*'s "Same gain for both channels"). *Gain…* starts at −3 dB (the plan gave no default). `changed`
  takes `(edit, frames)`, as the plan says (step 1's took the sample rate, for 11a's fades). A copy's suffix comes from its
  variant (`editSuffix`: "fade in", "fade out").
* **Step 6: ramps.** An edge ramps only where it is inside the sample: a range from the sample's start has nothing to
  ease out of there. The weight over a ramp of `k` frames is `g((j + 1) / (k + 1))`, never 0 or 1 inside it, and a fully
  changed frame takes the processed value exactly. *Normalize* on part of a sample isn't ramped, as the spec's table
  says. A fade's gain at frame `i` is `g((i − from) / n)` in and `g((to − 1 − i) / n)` out.
* **Step 6: a one-channel reverse moves no positions:** a clip keeps playing the same part of the sample, and the
  markers stay. Only a reverse of every channel mirrors them.
* **Step 6: constants.** `DEFAULT_CROSSFADE`, `MAX_CROSSFADE_SECONDS` and `clampCrossfadeSeconds` are exported: the
  toolbar's crossfade field needs its default and its range. The rest stay inside `core/sample` but for tests.
* **Step 7: Paste is `replace`.** With no selection it replaces the empty range at the cursor, which is an insert;
  `insert` is *Insert silence…*. Cut and Copy are toolbar buttons beside the registry's entries, not entries: Copy
  isn't an edit, and Cut is Copy and then the `delete` entry.
* **Step 7: crossfades.** Each side fades over its own window: the outgoing part until its handle runs out, the incoming
  from where its handle begins, so a missing handle gives that side a plain fade on its half. A paste's two joins are
  each at most the pasted length long, so they never overlap. A delete's (and a paste's) changed range starts half a
  crossfade before the join.
* **Step 7: the edits' own line.** With the structure edits added, the wrapped toolbar pushed the overview 4 px out of
  the editor at 480 × 240 (`views-at-min-size`). The edits now sit on a line of their own under the editor's buttons,
  which scrolls sideways where it doesn't fit (`data-scroll`); the settings popover sits outside that line, so it isn't
  clipped.
* **Step 8: the profile.** As 11a ran it: one run each, 10 s after 2 s of warm-up, headless Chromium, 1500 × 1000, the
  dev server and `vite preview` outside the sandbox, load average 5 to 8. `WATCHED` gained `EditToolbar` and
  `EditSettings`.

  | Per second | 11a `editor` | 11b `editor` | 11a `four` | 11b `four` | 11a `groups` | 11b `groups` | 11a `pinned` | 11b `pinned` | 11a `wave` | 11b `wave` |
  |---|---|---|---|---|---|---|---|---|---|---|
  | Component renders (dev) | 144 | 145 | 173 | 173 | 87 | 87 | 145 | 145 | 56 | 56 |
  | Script ms (production) | 10.7 | 15.3 | 12.5 | 16.7 | 11.3 | 15.5 | 10.5 | 16.5 | 10.1 | 14.6 |

  Renders match 11a (`editor`'s one is the `ArrangementPlayhead` render rounds 10 and 11a also saw come and go);
  `EditToolbar` and `EditSettings` render 0 times in every case, and the `wave` case's only status readers are still
  `WavePlayhead` (29) and `LevelMeter` (27). The script times read higher than 11a's record in every case, the ones
  without the editor too, so 11a's build (`ef518db`) was profiled again beside 11b's on the same machine, twice each:
  `editor` 12.6 and 13.3 ms against 11b's 13.0 and 13.5, `wave` 13.0 and 12.7 against 12.8 and 13.0. The same, within
  the noise; the difference from 11a's record is the machine's.
* **Step 8: checks.** `npm test` and `npm run typecheck` passed at every step: 2454 unit tests at step 1, 2461 at
  step 2, 2474 at step 3, 2491 at step 4, 2498 at step 5, 2518 at step 6, 2536 at step 7. The bounce hashes in
  `old-projects.test.ts` held at every step (11b changes no engine code). Full smoke runs, outside the sandbox: 193 at
  steps 1 and 2, 195 at steps 3 and 4, 196 at step 5, 197 at step 6, 198 at steps 7 and 8. Four first runs had tests
  fail for a reason the step then fixed and re-ran: step 2's library spec opened the database at version 2; step 3's two
  new tests read the autosave without its envelope; step 5's library spec met the cleanup's early database open; step
  7's failed `views-at-min-size` by 4 px.
  `npm run test:audio`: 21 at step 3, and 21 at step 7 (twice: before and after the toolbar's own line).
* **Not checked.** The manual pass in Verification was not done by hand: nothing was heard by ear (reverse used by a
  clip, a region and a sampler; a delete before a looped clip's trim; cut and paste with 0 and 100 ms crossfades);
  the quota override in DevTools and setting a note two days back by hand weren't tried (the unit tests stand in for
  both); a 120 s stereo file wasn't opened in the UI (the flow and the pyramid were timed on 120 s of audio in a page);
  Firefox and Safari weren't run (not installed, or not drivable from the session, as in 11a), so whether Safari loads
  float WAV is still unknown. In Chromium, the dev build was looked at in the app's browser pane: the toolbar, and
  *Gain…*'s popover under it.
