# Audio export

The offline bounce to WAV.

File > Export audio (WAV)… renders the project to a stereo WAV without playing it. The render is a core function (`core/engine/bounce.ts`, no
browser and no Web Audio); the UI is a dialog and `app/` fetches the sample audio and saves the file.

* **What is run.** `renderProject(project, samples, options)` builds an `Engine` at `options.sampleRate` (44100 or 48000, default 48000), applies
  `diffProject(null, project)` (the commands that build the live engine from nothing: tempo, master graph and volume, every track and group bus, and `arrangement/set`),
  a `sample/add` for each decoded sample it is given, and one launch: `clip/launch` for a **clip** scope (one track's clip; the other tracks idle, but the
  returns it sends to and the master still work), `scene/launch` for a **scene** (the clip of every track in that row), or `arrangement/play` for an
  **arrangement** scope (the timeline from beat 0; no clip or scene is ever launched, so the launch state machines stay idle and only the timeline plays,
  looping regions included). It then pulls `Engine.render` in chunks
  of 4096 frames (`BOUNCE_CHUNK_FRAMES`, 32 engine blocks) and returns `{ left, right, sampleRate, bitDepth, bodyFrames }`. The transport starts at beat 0
  and a launch takes effect at the next bar line, so the first note is at the first sample. It is the engine the worklet runs, so the file is what you
  hear, master volume, soft clip and all; a muted or soloed track or group is muted or soloed in the file, and buses sum as they do live (a clip scope still runs every bus, as it runs the returns).
* **Where it ends** (clips loop for ever, so the bounce decides). The *body* is `bars` bars (a bar is four beats, the project is 4/4 everywhere) at the
  project tempo, to the frame (`round(bars * 4 * 60 / tempo * sampleRate)`; `bars` may be fractional, so a 2-beat clip is 0.5 and is 1 s at 120 BPM
  and 2 s at 60). Its default is the longest clip of the scope played once through (`defaultBounceBars`; an arrangement scope runs to the end of its last
  region), limited to 1/4 to 64 bars. At the end of the
  body the bounce does what the Stop button does (`transport/stop`: launchers reset, held notes released, an audio clip faded in 5 ms), and keeps rendering
  the *tail* until the output (both channels, after master and soft clip) has stayed under -80 dB for 0.25 s, or `maxTail` seconds (default 10, at most
  30; 0 for none) have gone by. The file ends at the last sample above -80 dB and is never shorter than the body, so reverbs, delays and envelope
  releases are not cut and a dry loop has no dead air; a patch that never goes quiet (noise or a clock into the output) runs its tail to `maxTail`.
  A note on the very last sample of the body (the loop point) is not started (tested at several tempos). A non-finite sample is written as 0.
* **Options.** `normalize` scales both channels together so the peak is -1 dBFS (down as well as up; a peak under -100 dB is silence and is left alone).
  `bitDepth` is 16 (PCM, rounded, no dither, so the bytes are repeatable) or 32 (IEEE float, as rendered). `resolveBounceOptions` fills defaults and
  clamps, so a bad option cannot ask for a day of audio; a scope that is not in the project throws.
* **Determinism** is the point: same project, same samples, same bytes (tested: two renders and a step-by-step run are identical, down to the
  file). Everything random is seeded and a voice's salt is its slot in the pool (see "Sources of sound and chance"), and nothing reads the clock.
* **Steps.** `Bounce` is the render as an object: `step()` renders one chunk, `progress` is 0..1 (the tail counts in full until it ends, which is
  usually early), `done`, then `result()`; `renderProject` just loops. That is what lets the UI keep the page alive: `app/export-audio.ts` runs steps for
  about 12 ms, reports progress, and yields with a `setTimeout(0)`, so a few seconds of audio takes a moment and the dialog can still be used (Stop aborts
  through an `AbortSignal`). The engine renders far faster than real time (seconds of audio per tens of milliseconds), so a worker was not needed.
* **Samples.** The live engine holds decoded samples in the audio thread, so the export decodes the ones the project plays again from storage
  (`usedSampleIds(project)`: audio clips and every sampler node, in tracks, insert graphs, buses, the master and modules, through `decodeAudio`). A sample whose
  audio is missing is silent and the user is told, as for the project export.
* **WAV** (`sample/wav.ts`). `encodeWavChannels(channels, rate, 16 | 32)` writes any number of interleaved channels: RIFF, `fmt ` (PCM, or float
  with the 18-byte form and a `fact` chunk the format asks for), `data`, padded when odd. The old mono `encodeWav` is untouched: the demo samples'
  ids are hashes of its bytes. `encodeBounce(result)` is the stereo file.
* **UI** (`ui/file-menu/ExportAudioDialog.tsx`, a native `<dialog>` opened with `showModal`; the model is pure, `export-model.ts`). Scope: the open clip
  (disabled when none is open), a scene (empty ones are marked and cannot be exported) or the arrangement (offered when the timeline has anything on it),
  then bars (untouched, it follows the scope), tail, sample rate,
  bit depth and normalize; Export, and Cancel / Stop. The file is `<project name>.wav` (`fileStem`); a toast says what was saved. `ProjectFiles.exportAudio`
  is the one call from the UI.
* **Limits.** One file, the whole mix: no stems per track, no batch export of variations, no MP3 or OGG, no dither, no loop-point export (the file is the
  bars, not a seamless loop of them). The length is by bars, so a clip that sounds longer than its length (a long release) is in the tail, not wrapped.
* **Tests.** `engine/bounce.test.ts` (length, pitch and peak of a known tone, a note starting on its beat, looping, the tempo, stereo with pan, clip, scene
  and arrangement scopes, a sampler of a known buffer and an audio clip, the tail's stop, `maxTail` and a reverb, normalize and silence, determinism, a chord's
  voices being different noise), `sample.test.ts` (headers and a round trip), `ui/file-menu/export-model.test.ts`. Browser check
  `docs/browser-checks/export.mjs` (the dialog, the download, the bytes, twice identical, 32-bit float, a clip and a sample).
