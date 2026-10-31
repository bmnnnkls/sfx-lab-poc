# Samples and the wave editor

How samples are stored, decoded and drawn, and the wave editor (in-place edits, the peak pyramid, processes).

## Samples

A **sampler node** plays a library sample, re-pitched from the note being played, so samples are playable
instruments that reuse everything else: MIDI clips, polyphony, envelopes, filters, effects.

* **Sampler node** (`dsp/nodes/sampler.node.ts`): inputs `freq` and `gate`; params *Mode* (`one-shot` plays through
  regardless of the gate, `hold` stops when the gate falls, `loop` repeats until it falls), *Root note* (plays at
  original speed), *Start*, *Tune*. It compensates for the sample's own sample rate, interpolates linearly, and
  fades out in 10 ms on release to avoid clicks. Its sample is a node-level reference (`PatchNode.sampleId`, chosen
  with a picker in the property editor), not a numeric param.
* **Three homes for one sample**, all keyed by the **SHA-256 of the file** (so importing the same file twice is a
  no-op, and ids can't collide). Everything that turns a `SampleInfo` into stored bytes (the loader, an edit's read,
  the bounce, the project package's writer and reader, the library bundle and preview) asks **`bytesKeyOf(info)`**
  (`core/sample/marks.ts`), which returns the id: a later scheme with stable ids changes that and `replaceSample` only:
  1. **Project** — `Project.samples: SampleInfo[]` (name, duration, …) is the library. Saved, undoable, tiny.
  2. **Storage** — the original bytes in IndexedDB (`storage/sample-storage.ts`), written once at import.
     Autosave only ever writes the small project JSON.
  3. **Engine** — decoded float data in `SampleBank` (`core/sample`), **one or two channels** (`SampleData` is
     `{ id, sampleRate, channels }`), delivered by a `sample/add` command whose channel buffers are each *transferred*
     to the worklet, not copied.
* **Flow** (`app/sample-library.ts`): import/drop → hash → decode (`audio/decode-audio.ts`, via
  `OfflineAudioContext`, so no user gesture is needed; `keepChannels` keeps one or two channels and averages more into
  one) → store bytes → add to project → send to engine. On startup and
  whenever `project.samples` changes it loads any sample the engine lacks from storage. Removing a sample from
  the project clears every use of it (undo restores them) but keeps the bytes, so undo and re-import work; the engine
  keeps the audio while history names it (§ Undo / redo).
* **Where a sample is used** (round 11b, `core/project/sample-uses.ts`). `SAMPLE_USES` lists the places, one visitor
  each (`collect`, `replace`, `remove`, and whether the sample `plays` from there): the master's, buses' and modules'
  patches; tracks (insert graph, instrument and session audio clips, one visitor so samples are listed track by track);
  arrangement audio regions; sample bindings; presets' bindings; asset revisions (their `sampleIds` and the samplers in
  their payloads). `usedSampleIds` (the visitors that play), `projectSampleDependencies` (all of them), `removeSample`
  and `replaceSample` are built from it, so a new place is added once. `removeSample` clears samplers, removes the
  session clips and arrangement regions that play the sample, silences bindings, and leaves presets and revisions naming
  it (a recall then reports it missing).
* **`replaceSample(project, fromId, to, remap)`** moves every use onto an edit's result: the library entry is replaced
  where it is, with the old name, `origin: originOf(old)`, and markers and regions through the remap (a marker whose
  frame is gone is dropped, a region clipped and dropped when empty); samplers, bindings, presets and revisions point at
  `to.id` (asset signatures ignore samples, so none changes); clips' and regions' trims go through the remap so they
  play the audio they played, and one the edit emptied keeps `MIN_REGION` where it started (`report.emptiedTrims`). A
  result already in the library is merged into (`report.merged`). The sampler's *Start* param is a param, so it isn't
  remapped. A visitor with nothing to change returns the same object; `diffProject` then sends only the commands a
  changed reference needs (`track/setSample`, `track/setAudioClips`, `arrangement/set`).
* **Missing audio is not fatal.** A sample listed in the project but absent from storage (cleared browser data,
  plain-JSON import on another machine) shows *audio missing*, plays silence, and is restored by importing the
  original file again (same hash).
* **Engine side:** a sampler node looks samples up at process time (`ProcessContext.samples`), so samples that
  arrive after the instrument was built, or are swapped (`track/setSample`), take effect without a rebuild.
  `sample/preview` auditions a sample straight to the master, each channel to its side: the whole sample, or frames
  `from` up to `to`, once or looping (`loop`). While it plays, `EngineStatus.preview` is `{ sampleId, frame }`, and it is
  absent otherwise, so nothing else changes. `EngineStatus.peak` drives the output meter.
* **Project files with samples** (`storage/project-transfer.ts`): a project with no samples exports as plain
  `name.sfxlab.json`. With samples it exports as a zip, `name.sfxlab`: `project.json` (the same envelope as
  always) + `samples/<sha256>.<ext>` holding the **original bytes** (no re-encoding; WAV is deflated, compressed
  formats are stored). Import sniffs the first bytes (`PK` = zip), verifies **each sample against its hash** before
  trusting it, ignores unexpected entries, caps inflated entry size, then runs the usual `parseProject`.
  Missing/corrupt samples become warnings, not failures.
* **Persistence of the new fields:** `samples` and `sampleId` are optional with safe defaults (a reference to a
  sample not in the library is dropped with a warning), so no format-version bump was needed. Format v11 (round 11a)
  added a sample's origin, markers and regions; `MIGRATIONS[10]` is the identity.
* **Reading channels** (round 11a, `core/sample/channels.ts`). Engine code reaches a sample's audio only through
  `frameCount`, `monoAt` (the one channel, or the average of two with `toMono`'s exact arithmetic, so a stereo file reads
  the bits the old mixdown gave) and `channelAt` (one channel; a mono sample is the same in both). The sampler node and a
  mono `Track in` path read `monoAt`; the stereo path, the preview and the library's sample preview read `channelAt`.
  Playing everything as mono again would be a change in these helpers alone. Thumbnails (`computePeaks`, 800 buckets)
  take the loudest of the channels.
* **Origin, markers and regions** (format v11). `SampleInfo` may carry `origin` (the first version's id; `originOf`
  reads `origin ?? id`), `markers` (`{ id, frame, name }`) and `regions` (`{ id, from, to, name }`), in frames.
  `sanitizeSamples` keeps them when well formed (whole frames inside `durationSeconds × sampleRate`, `from < to`, names
  of at most 60 characters, at most 256 of each, unique ids) and drops the rest with a warning. 11a only defines and
  keeps them; 11b remaps them through edits and 11c gives them a UI. The personal library keeps them with a captured
  sample.
* **Add a sample-playing node:** set `usesSample: true` on its definition; the property editor shows the picker and the
  engine calls `setSample` on it.

## The sample editor

An editor for one library sample in the **Wave editor** view (`ui/wave-editor/`; ✎ on a row of Samples opens it). With
no sample open the view offers the project's samples (up to eight, then *Show samples*) and *Import samples…*. Round 11a
rebuilt the inside; round 11b made edits change the sample in place.

* **Ways in** (round 11b). ✎ on a sample, the palette's *Open in wave editor*, `clip.edit-sample` and
  `region.edit-sample` (*Edit sample*, on audio clips and regions, enabled while the sample is in the library; the audio
  clip editor's *Edit sample* button runs them), and *Edit* beside the sampler's picker (the sample the picker shows,
  a preset's binding included). `openSampleEditor(id, range?)` selects the sample and reveals the view; with a clip's trim
  (fractions) it calls the view store's `reveal`, which selects that part in frames and sets `zoomPending`, which the
  editor consumes once with a zoom to the selection when it has its width and the audio.
* **The working copy** (`app/sample-library.ts`). When the editor opens a sample (`useSelectionStore.sampleId`), the
  service takes it from the working copies (§ Undo / redo) or decodes it from storage, builds its peak pyramid and puts
  both in `state/wave-audio-store.ts` (`{ sampleId, viewKey, audio, pyramid } | null`, plus `loading` and `editing`).
  The engine has its own copy. A working copy the editor lets go of goes into the working copies. Memory: one copy of
  the open sample, at most 46 MB (120 s stereo), plus the cache's budget.
* **The pyramid** (`core/sample/pyramid.ts`). `buildPeakPyramid(audio)`: level 0 holds a min and a max per channel for
  every 64 frames; each next level halves the count until a level has at most 512 buckets. A full build of 120 s of
  stereo takes about 12 to 20 ms in Chromium, so it runs at once on the main thread. After an edit,
  **`updatePeakPyramid(pyramid, audio, changed)`** copies the buckets wholly outside the frames the edit changed
  (`changedFrames`) and computes the rest, equal to a full build bucket for bucket: a fade at the end of 120 s stereo
  takes 0.2 ms, an edit at the start (which moves everything after it) a full build. **`columnsFor(view, pyramid, audio)`** is
  its only reader and the one drawing rule: from 64 frames per pixel up, min and max from the finest level whose bucket
  fits in a column (`peaks`); from 1 to 64, min and max read from the audio (`frames`); under 1, the sample points
  (`points`), with dots from 8 px per frame. The base and the step are private constants there.
* **View state** (`state/wave-editor-store.ts`), in memory, keyed by the sample's **origin** (`originOf`), so a view
  follows its sample through edits, undo and redo: `framesPerPixel` (null: fit the whole sample), `startFrame`, `cursor`,
  `selection` (`{ from, to, channels: 'both' | 'left' | 'right' }`, frames), `zoomTo` and `asking`. Not saved with the
  project and not undone, so it survives tab switches until reload. **Zooms are asked for**, since only the editor knows
  its width: `zoom(key, range | 'fit')` (buttons, menu entries, keys) and `reveal` (entry points) set `zoomTo`, and the
  editor does it once it has a width and the audio (`takeZoom` reads and clears it; `resolveZoom` in
  `wave-geometry.ts`). `ask(key, kind | null)` opens an edit's settings popover (`asking`), under the toolbar, from a
  button, a menu entry or the palette alike. When the open sample's id leaves the project (an undo or redo of an edit),
  the service opens the sample with the same origin, first in library order, and clamps a selection past its end; with
  none, the view shows its empty state, as for a removed sample. The ruler's mode (time or beats) and its tempo (the
  project's or the one in the sample's name, `tempoFromName`) are per browser (`useStoredState`: `sfxlab:wave-ruler`,
  `sfxlab:wave-ruler-tempo`).
* **The edit settings** (`state/wave-edit-settings.ts`, `useWaveEditSettings`): *Edits make copies*, the crossfade,
  the fade curve last used, each popover's last values, and the preview's *Loop*. `state` doesn't touch
  `localStorage`, so `useWaveEditSettingsStorage` (in `ui/wave-editor`, mounted by the view) restores them once per page
  and saves each change, under `sfxlab:wave-edit-copies`, `sfxlab:wave-crossfade`, `sfxlab:wave-fade-curve`,
  `sfxlab:wave-edit-settings` and `sfxlab:wave-loop`. `restore` takes each field that is valid and keeps the default
  for the rest; a popover value saved as `null` (an emptied field) is dropped, so the edit takes that field's default.
* **One path for every edit** (`state/wave-edits.ts`). `openWave(sampleId)` reads a sample with its working copy and
  view; `waveEditFacts` is what decides (an edit running, the audio loaded, the selection, something copied, the
  channels); `waveEditBlocked(entry, facts)` says why an edit can't run now ("Select both channels to delete"), and
  `waveCopyBlocked` and `waveCutBlocked` Copy's and Cut's (Copy runs while an edit runs); `waveEditContext` builds the
  `SampleEditContext`; `runWaveEdit(library, sampleId, kind, { variant, values, curve })` checks, remembers the values
  and the curve, and calls `editSample`; `copyWave` and `cutWave` fill the clipboard. `state/wave-view.ts` has
  `toggleWavePreview` (▶) and `selectAllWave`. The toolbar, the menus, the palette and the keys all call these.
* **The view.** `SampleEditor` is the frame: the toolbar, the `Overview`, the `Ruler`, the `DetailView` with a level
  scale beside each lane, and the status bar. The **toolbar** is one line of groups, separated by a hairline, that
  wraps a whole group at a time: ▶ (■ while playing) and *Loop*; *Cut*, *Copy*, *Paste*, *Delete*, *Crop*
  (`EditToolbar`, its `TOOLBAR_EDITS`); *Process ▾* and *View ▾*; the sample's name (truncated, with a tooltip),
  length, rate and *mono* / *stereo* as quiet text; ⚙ (*Editor settings*: the crossfade's length and curve and *Edits
  make copies*, a panel that Escape or a press outside closes) and × (*Close sample*). The glyphs are text until the app
  has an icon set. **Process ▾** is the `sample-selection` subject's `process` actions (below), so it and the
  right-click menu can't differ: the `process` entries of `SAMPLE_EDITS`, *Fade in* and *Fade out* each a submenu of
  the curves (the last used first, checked), then *Insert silence…*. **View ▾** has the subject's two zooms, *Time* /
  *Beats*, and the tempo the beats count at (*Project tempo*, *Tempo from the name*), checked when in effect. The
  **status bar** shows the cursor, or the selection's range, length and channels (`data-testid="wave-status"`); the
  selection's peak and RMS in dBFS (`selectionLevels` in `core/sample/audio-math.ts`, the loudest of its channels, one
  pass over the audio: 11.5 ms for 120 s of stereo in Chromium), computed once the selection hasn't changed for
  150 ms, so never during a drag ("…" meanwhile); and, at the right, "Scroll to move · Ctrl/⌘ + scroll to zoom ·
  Middle-drag to pan". The **level scale** is the editor's first grid column, 28 px: the overview and the ruler sit in
  the second, lined up with the lanes. The **overview** (48 px) is the whole sample from `columnsFor`;
  its box is what the detail shows, and it **is the scrollbar** (`role="scrollbar"`, focusable: arrows, Page Up and
  Down, Home and End): drag the box to scroll, its edges to zoom, click elsewhere to centre there. A native scroller
  can't be wide enough at full zoom. The **ruler** shows m:ss.mmm (frames under one frame per pixel) or bars and beats in
  4/4 from frame 0 (`ruler-ticks.ts`, labels at least 72 px apart). The **detail** has one `WaveLane` per channel, each a
  canvas the size of its box times `devicePixelRatio`; `data-draw` on it says which band is drawn. It is focusable
  (`role="group"`, *Waveform lanes*), takes the focus on any press, and is the `sample-selection` subject's
  `ActionMenu` trigger.
* **Drawing without React.** Zoom and scroll write to the store; the detail, the overview's box and the ruler subscribe
  to the store directly and redraw in an animation frame (and on resize). React renders only when the sample, the
  selection or the cursor changes. A lane is drawn by a **lane renderer** (`lane-renderers.ts`), `{ draw(context,
  columns, size, colors), scale(context, size, colors) }`: `draw` fills the lane, `scale` its gutter. The waveform
  (`waveformRenderer`) is the only one, a spectrogram would be a second. Its scale marks 0, −6 and −12 dB above and
  below the middle and −∞ on it (`levelMarks(height)`: a label only 11 px or more below the last). Each gutter is its
  own canvas (`LaneScale`), drawn on mount and on resize, never on zoom or scroll.
* **The right-click menu** is the **`sample-selection`** subject's (`{ kind: 'sample-selection', sampleId }`,
  "Selection in *name*", `state/actions/sample-selection.ts`): *Cut*, *Copy*, *Paste*, *Delete*, *Crop* (one group,
  `clipboard`, as on the toolbar) · the processes (`process`, built from the registry by `processActions`, so a new
  process is an action, a *Process ▾* entry and a palette row with no other change) · *Select all*, *Zoom to
  selection*, *Zoom to fit*, *Play selection* / *Play from cursor* / *Stop* (`view`). An action is disabled with the
  reason as its tooltip (`waveEditBlocked`); one with settings opens its popover (`ask`) and `takesFocus`, so the
  closing menu leaves the focus in the popover. What a right-click lands on follows the piano roll
  (`menuTargetAt(selection, frame, channel)`): inside the selection, on a channel it covers, keeps it; anywhere else
  clears it and puts the cursor there. Shift+F10 opens it, as everywhere.
* **Keys.** With the lanes focused, the **edit keys** go through the subject's verbs (`runVerb`): Delete and Backspace
  delete, ⌘C copies, ⌘X cuts, ⌘V pastes; in a text field they stay the field's. The **view keys** are the lanes' own
  (`onKeyDown`), listed read only in the shortcuts dialog (`VIEW_KEYS`, *Wave editor*), and one pure function decides
  what each does, `waveKeyAction(key, view, frames, width)` (`wave-keys.ts`): ⌘A selects all (the channels selected,
  else both); Escape clears the selection, the cursor at its start; ← → move the cursor a column (at least a frame),
  or collapse a selection to that side; Alt with them a tenth of the view; Home and End to the ends; Shift with an
  arrow, Home or End moves the selection's end the cursor is on (the cursor follows it) and keeps the other; + (or =)
  and − zoom by two wheel notches around the cursor (the middle when it is out of view); Z zooms to the selection,
  Shift+Z to fit; P plays or stops. A key that moves the cursor out of the view scrolls it by the least that shows it.
  Space stays the transport's; ⌘0, ⌘+ and ⌘− the browser's.
* **Gestures** (`useWaveGestures`, `use-wave-gestures.ts`). Drag to select; on a stereo sample a drag starting in the
  top quarter of the left lane selects the left channel only, in the bottom quarter of the right lane the right only
  (`channelsAt`). Shift extends from the far end. A click sets the cursor; a double-click selects the whole sample on
  the channels a drag there would take. Within `EDGE_PX` (4) of a selection's edge, on a channel it covers, the pointer
  shows a resize cursor and a drag moves that edge (`selectionEdgeAt`; the nearer edge on a narrow selection). A
  selection dragged past the detail's left or right edge scrolls the view each animation frame by
  `autoScrollFrames` (a tenth of the distance past it in columns, at most a quarter of the view) and selects to the
  edge. A middle-drag pans, with a grabbing hand, and leaves the cursor; a fitted view neither pans nor auto-scrolls.
  The cursor styles are set on the element, not through React. ⌘ or Ctrl with the wheel (and a trackpad pinch) zooms
  around the pointer, from the whole sample to 32 px per frame (`WHEEL_ZOOM`, 1.25 a notch); the wheel scrolls; a
  *Wheel zooms* setting would branch in the one wheel handler.
* **Preview.** ▶ (or P, or *Play selection*) plays the selection, or from the cursor to the end, looping with *Loop*;
  ■ stops. The playhead
  (`WavePlayhead`) is a leaf that selects `status.preview` only. A preview may play while the transport plays; it is mixed
  into the master.
* **Edits as data** (`core/sample/edits.ts`). `SampleEdit` is a union, one kind per edit, and `SAMPLE_EDITS` a record
  by kind: each entry has its title, tooltip, suffix (for a copy's name), `group` (`process`, `structure`,
  `clipboard`), `settings` (numeric fields and toggles for a popover), `variants` (*Fade in* and *Fade out* are one kind),
  `channels` (`both` for edits that change the length), `needsSelection`, `needsClipboard`, `takesFadeCurve`, and
  `create(context, variant)`, `apply(audio, edit)`, `remap(edit, frames)`, `changed(edit, frames)` and
  `after(edit, frames)`. `applySampleEdit`, `remapFrame`, `remapRange`, `sampleRemap`, `changedFrames` and `afterEdit`
  dispatch through it; nothing else switches on the kind, and the toolbar's menus and the actions are built from it.
  * **Processes** keep the length and work on the selection (or the whole sample) and its channels: `gain` (−48 to
    +24 dB), `fade` (in or out, with a curve from `FADE_CURVES`: linear, equal power, slow start, fast start, S-curve;
    out uses `g(1 − t)`), `normalize` (a target peak, −0.1 dBFS by default, linked or per channel; a peak under −100 dB
    is left alone), `reverse`, `silence` and `dc-offset`. Gain, silence and DC offset **ramp** in and out over the
    crossfade length at edges inside the sample, inside the range, so audio outside it never changes. A one-channel
    reverse moves no positions. A result past full scale is kept (float WAV holds it), with a warning.
  * **Structure edits** need both channels of a stereo selection: `delete` (joins the parts around the selection),
    `crop` (keeps it; no join, so no crossfade), `insert` (*Insert silence…* at the cursor) and `replace` (*Paste*, over
    the selection, or an empty range at the cursor). **Crossfades** (`core/sample/crossfade.ts`) are centred on each
    join: the outgoing part continues into its handle while it fades out, the incoming starts early from its handle
    while it fades in, so the result has exactly the expected length. A delete's handles are the deleted audio; a
    paste's are the clipboard's and the audio around the cursor. A side with less to borrow fades over what there is;
    0 ms is the plain cut, bit for bit. The length (0 to 100 ms, 5 ms by default) and curve (linear or equal power) are
    set under ⚙ (§ The edit settings).
  * **Remapping**: each kind's `remap` is one of four shapes in `core/sample/remap.ts` (identity, a splice, a crop, a
    mirror), which say where a position is now (`frame`), where a range's start moves forward to (`start`) and where a
    range is (`range`, start forward, end backward, null when nothing is left). `replaceSample` takes them with the old
    and new lengths (`SampleRemap`).
* **The audio clipboard** (`state/audio-clipboard.ts`, a `createClipboard`): the copied channels and up to
  `CLIPBOARD_HANDLE_SECONDS` (50 ms, half the longest crossfade) of audio on each side. A copy from one channel holds
  that channel alone; a mono copy pastes into both channels of a stereo sample, a stereo copy into a mono one as its
  average (`monoAt`). *Copy* isn't an edit; *Cut* is *Copy*, then the delete, one undo step. Not the OS clipboard.
* **The in-place flow** (`SampleLibrary.editSample(id, edit, { asCopy })`, the one call). One edit runs at a time
  (`useWaveAudioStore.editing`; the toolbar is disabled meanwhile). It reads the working copy (or the working copies, or
  decodes the stored bytes), applies the edit, refuses an empty result and one that changes nothing ("Nothing changed",
  same hash), encodes `EDIT_WAV_BIT_DEPTH` (32-bit float) WAV, hashes it, refuses the edit when the site's free
  storage (`freeBytes`, `navigator.storage.estimate()`) is under `ROOM_FACTOR` (2) times the file or the write hits the
  quota (`StorageFullError`), stores and notes the file, sends the engine `sample/add` with a **copy** of the audio,
  then commits, if the sample is still in the project (an undo meanwhile drops the edit, its file left to cleanup):
  in place, `replaceSample` as one undo step, with a toast for a merge and for emptied trims; with *Edits make copies*
  (off by default), a new sample "name (suffix)" with no origin, which the editor opens.
  The editor moves first: the old working copy goes to the cache, the new one (its pyramid updated) becomes current,
  the selected id changes, and the entry's `after` sets the selection and cursor (processes keep them; delete leaves
  the cursor at the join; crop selects nothing; insert and paste select what they inserted). `encodeWav` (mono 16-bit)
  stays for the demo samples, whose ids are hashes of its bytes.
* **Not yet.** Markers, regions, snap, *Revert to original* (11c, part 2); a second pane (part 3), whose subject gains a
  `pane`; previewing a process before applying it; the spectrogram (11d); the granular stage.
