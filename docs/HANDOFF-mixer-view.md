# Handoff: the Mixer view (master volume, pan, mute/solo, meters)

> **Status: built** (see `ARCHITECTURE.md`, "Mixer", for how and for the answers to the open questions; `docs/TASKS.md` "Effects follow-ups" for what is left). The text below is the original brief, kept as the record of what was decided.

For the next session. Read this first, then `ARCHITECTURE.md` (how things are built) and `docs/TASKS.md` ("Effects
follow-ups"). Nothing of the work below has been started. Work on the branch **`feature/mixer-view`** (cut from `main` at
`461c588`); merge back to `main` when it is done. `main` deploys to GitHub Pages on every push (the `github-pages`
environment allows only `main`), so only push to `main` when tests and the browser checks pass. Do not open a pull
request unless asked.

## Why

The six steps of `docs/HANDOFF-track-effects-and-stereo.md` are built and live: insert graphs (Effects tab), stereo, return
tracks and Send nodes, send knobs, the Master strip, Track audio. The user then could not find the sends ("where is the
mixer?") and noticed there is **no master volume**. The controls are scattered: volume is the slider in each session-view
header, sends are tiny knobs in the header (labelled only A, B, ...), pan exists only as a *Pan* node in an insert graph,
the Master is a header with just an effects badge, and the only level meter is the output one in the transport bar.

## The goal

A **Mixer** tab in the bottom editor panel (beside Instrument, Effects, Notes, Clip, Samples): one vertical channel strip
per track, then the return tracks, then the master, in the order the sound flows.

| Strip | Contents |
| --- | --- |
| Instrument and audio track | name, effects badge (opens the Effects tab), pan, mute, solo, vertical fader, level meter, one send knob per return **with the return's real name** |
| Return track | the same without the send knobs (returns have none), no solo needed for sends but mute/solo apply |
| Master | name, effects badge, **master volume fader**, level meter (the output peak) |

Decisions already made with the user (do not reopen without a reason):

* **A Mixer tab, not a replacement of the session view.** The session grid keeps its header volume slider; the **send
  knobs move out of the headers into the mixer** (the headers are cramped). Keep `track/setSends` and `setTrackSend`
  exactly as they are; only the UI moves.
* **Pan and the fader apply after the track's insert graph**, where the fader is today. Pan is a track property (a number
  -1..1, default 0) using the same constant-power law as the *Pan* node (`dsp/nodes/pan.node.ts`: centre is -3 dB per
  channel). Sends stay post-fader and are not panned (they carry the stereo signal to the return as today).
* **Mute and solo are saved fields**, not transient UI state (losing mutes on reload is annoying). Solo mutes everything
  that is not soloed *and not a return track fed by a soloed track* (the usual "solo in place" rule: returns stay audible so
  the soloed track still gets its reverb); decide how a soloed return behaves and write it down in `ARCHITECTURE.md`.
* **Master volume** is a saved field on `Project.master` (default 1, a gain applied after the master graph and before the
  output soft clip). **No limiter yet**; the soft clip in `Engine.render` stays as it is.
* **Per-track meters** are new: the engine must report a peak per track in `EngineStatus`.
* Every new saved field is optional with a safe default, so the file format version (`persistence/format.ts`) does not need
  a bump. Old files must load identically (pan 0, unmuted, unsoloed, master volume 1).

## Working conditions

```
npm ci                          # node_modules is not in the repo
npx tsc --noEmit                # strict, noUncheckedIndexedAccess, noUnusedLocals/Parameters
npx vitest run                  # ~585 tests; run from the REPO ROOT (running inside src/ breaks the @core alias)
npm run build                   # tsc + vite build
npx vite preview --port 4173    # after a build, for browser checks
```

* **Layering is enforced by `tests/architecture.test.ts`**: `core` (no browser, no third-party) <- `audio`, `storage`,
  `state` <- `ui` <- `app`; inside `core`, other folders are reached only through their `index.ts`.
* Style: small files, immutable data, pure edit functions in `core`, a no-op edit returns the **same object** (no empty undo
  steps), comments explain why, tests beside the code. `console.log` is suppressed in vitest.
* **Browser checks** live in `docs/browser-checks/*.mjs` (see its README). They drive real Chromium with Playwright against
  `vite preview`, including real audio through the AudioWorklet. Write one per feature (`mixer.mjs`). Playwright is at
  `/opt/node-tools/node_modules` and Chromium at `/opt/pw-browsers/chromium` in the cloud sandbox (the scripts pick the
  right `require` path). To see the output **per channel** in a check, copy the `AudioWorkletNode` tap from
  `docs/browser-checks/stereo.mjs`; for a **per-track** level, use the new status field, not the page's output meter.
* Run the older checks too before merging (`fx`, `stereo`, `returns`, `sends`, `master`, `trackaudio`, `notegraph`,
  `modules`, `mod`, `audio`, `menu`, `samples`): the mixer touches the header and the session view. They all passed at
  `461c588`. Note: some select tracks with `[class*="_trackName_"]` and the send knobs by `aria-label`
  (`"<track> send to <return>"`, group `"<track> sends"`); `sends.mjs` will need updating when the knobs move.
* Commit with the attribution lines from your session instructions.
* Things that bit us: events on a 128-sample block edge can land a sample early or late (compare chunked renders only in
  multiples of 128); float32 results need `toBeCloseTo(.., 5)`-ish tolerances in tests; new nodes spawn in a free grid slot (right under the two ends in an insert graph); wait ~1 s after turning a slider before asserting levels (the meter lags); tails need seconds to die.

## Where things are (only what this work touches)

| Concern | Files |
| --- | --- |
| Track model | `src/core/project/types.ts` (`InstrumentTrack`, `AudioTrack`, `ReturnTrack`, `SendLevels`, `MasterBus`), `project/edit.ts` (`createTrack`, `createAudioTrack`, `createReturnTrack`, `setTrackVolume`, `setTrackSend`, `removeTrack`) |
| Engine | `src/core/engine/engine.ts` (`render`, `mixSegment`, `processMaster`, `status`, `mixTracks`), `track-runtime.ts` / `audio-track-runtime.ts` / `return-track-runtime.ts` (each has a `mixInto` that applies `volume` and adds to the buses, and writes sends/taps), `playable-track.ts` (`MixContext`), `commands.ts`, `status.ts` (`EngineStatus`) |
| Master | `Project.master` (`MasterBus { fx }`), `Engine.processMaster`, `master/setFx|setParam|setSample` commands |
| Diffing | `src/core/sync/diff-project.ts` (`diffTrack` sends `track/setVolume`, `track/setSends`; add the new fields here) |
| Persistence | `src/core/persistence/sanitize-project.ts` (`sanitizeTrack`, master), `sanitize-sends.ts` |
| Pan law to reuse | `src/core/dsp/nodes/pan.node.ts` |
| Meter today | `src/ui/transport-bar/LevelMeter.tsx` (`data-peak`), `src/state/status-store.ts` (status ~30 Hz) |
| UI | `src/ui/editor-panel/EditorPanel.tsx` (tabs), `src/state/selection-store.ts` (`EditorTab`, `master`, `selectTrack`, `selectMaster`), `src/ui/session-view/TrackHeader.tsx` (volume slider, send knobs, badges), `MasterHeader.tsx`, `SessionView.tsx`, `track-order.ts` (`sessionOrder`: clip tracks, then returns) |
| Store | `src/state/project-store.ts` (`setTrackVolume`, `setTrackSend`, merge keys for undo) |

## How the audio path works now (what you change)

* `Engine.render` runs 128-frame blocks; `mixSegment` calls `track.mixInto(left, right, offset, frames, mix)` for every
  track in **mix order** (a return after its senders, a track after the tracks it takes audio from). Each runtime computes
  `signal = fx.process(...)` (a stereo planar buffer: left at `[i]`, right at `[RIGHT + i]`, `RIGHT = 128`) and adds
  `signal * volume` to `left`/`right`. The post-fader sends use `level * volume`. `Engine.processMaster` then runs the master
  graph on the block, the sample preview is added, then `softClip` and the peak.
* `EngineStatus` is `{ playing, beat, peak, tracks: Record<id, LauncherStatus> }`; `peak` resets each time it is read. A
  per-track peak belongs next to `LauncherStatus` (or a parallel record) and should be read-and-reset the same way.
* Volume is clamped to 0..1 by `setTrackVolume`. Tracks have no pan, mute or solo today.

## Suggested build order

1. **Model + engine, no UI.** `pan` (-1..1, default 0), `muted`, `soloed` on instrument/audio/return tracks; `volume` on
   `MasterBus`. Pure edits in `project/edit.ts` (clamp, same object when unchanged, solo/mute independent), commands
   (`track/setPan`, `track/setMute`, `track/setSolo`, `master/setVolume`, or one `track/setMix`), `diffProject` (compare the
   fields), sanitizer defaults, `removeTrack` needs nothing new. Engine: pan after the fx (reuse the pan law), the solo rule
   decided above (compute an "audible" flag per track when the commands change, not per sample), mute silences the track
   everywhere it is heard, **including its sends** (see the open questions), master volume before the soft clip. A muted/soloed-out track must still write its taps and keep its effects running (tails,
   Track audio sources); only what it adds to the output is silenced.
2. **Per-track peak** in `EngineStatus` (post-fader, post-pan, per channel if cheap; one value is enough for the strip
   meter). Master meter = the existing `peak`.
3. **Tests**: pan law keeps power, centre is -3 dB; mute/solo rules; a soloed track keeps its return; master volume 0 silences,
   scales exactly; old project loads with defaults; round trip; garbage in for each new field; diff emits one command per
   change and nothing for a no-op; peak per track.
4. **The Mixer tab** (`ui/mixer/`): `MixerPanel`, `ChannelStrip` (vertical fader with an accessible `<input type="range">`
   rotated by CSS or a custom control; label each control, e.g. `"<track> pan"`, `"<track> mute"`, `"<track> solo"`,
   `"<track> fader"`, `"<track> send to <return>"`), `MasterStrip`, a small `LevelBar` fed by the status store. Add `'mixer'`
   to `EditorTab`. Reuse `sessionOrder`. Fader drags merge into one undo step (`mergeKey`, as `setTrackVolume` does).
5. **Move the send knobs** out of `TrackHeader.tsx` into the strips (keep the loop rule: a send is disabled when
   `mixesAfter(project, track.id, return.id)`; keep the "post-fader" tooltip). Decide whether the header keeps a mute button.
6. **Browser check** `docs/browser-checks/mixer.mjs`: strips for every track, return and master in order; fader changes the
   level; pan moves sound between channels (per-channel tap); mute and solo silence the right tracks and a soloed track keeps
   its return; master volume 0 silences everything and 1 restores it; send knobs work from the mixer and the header has none;
   per-track meters move only for the track that plays; undo/redo; reload keeps everything; no page errors. Update
   `sends.mjs` and any check that used the header knobs.
7. **Docs**: `ARCHITECTURE.md` (a "Mixer" section, update "Send knobs" and "The master bus"), `README.md` (one sentence),
   `docs/TASKS.md` (remove the mixer bits from "Effects follow-ups"), `docs/browser-checks/README.md`.

## Open questions to settle early (write the answer in `ARCHITECTURE.md`)

* Does **mute** also stop a track's sends? (Recommended: yes, mute silences the track everywhere it is heard, including the
  sends, but its effects keep running.) Does **solo** apply to returns?
* One `track/setMix` command or several small ones? (Several small ones keep diffing trivial and mirror `track/setVolume`.)
* Meter ballistics: raw peak per status tick is fine; a slow fall-off in the UI (`requestAnimationFrame`) looks better and
  needs no engine change.
* Fader law: the stored volume is linear 0..1 like today; if you want a dB-ish feel, do it in the control, not in the model.

## Out of scope (do not add)

A master limiter or compressor, chorus/flanger, an envelope follower for sidechains, automation, MIDI mapping. These are in
`docs/TASKS.md` ("Effects follow-ups") for later.

## Reference: what already exists and works (do not rebuild)

Insert graphs on every track and the master (`Effects` tab, `GraphEditor`), stereo (`PatchNode.stereo`, planar buffers),
return tracks (`ReturnTrack`, `Return in`), the Send node and send knobs (`SendLevels`, `AudioBoard`), the master bus
(`Project.master`, `Master in`), Track audio (`AudioTaps`, `project/mix-order.ts` for all the loop rules), two engine orders
(schedule and mix). Persistence is sanitized everywhere (`sanitize-*.ts`); files from every earlier version load.
