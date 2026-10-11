# Browser checks

Reference scripts that drive the real app in Chromium with Playwright, including real audio through the AudioWorklet.
They are **not** part of `npm test` (see "Browser (end-to-end) tests in the repo" in `docs/TASKS.md`; these are the seed
for that). Every feature so far shipped with one, and each prints `PASS` / `FAIL` per check.

## Running one

```
npm run build
npx vite preview --port 4173 &                 # the scripts expect http://localhost:4173/
node docs/browser-checks/notegraph.mjs /some/dir   # the directory receives screenshots
```

The scripts load Playwright through `createRequire('/node-tools/node_modules/')` and launch
`/opt/pw-browsers/chromium` with `--no-sandbox --autoplay-policy=no-user-gesture-required`; those two paths are the cloud
sandbox's. Change them (or install `playwright`) elsewhere.

## What each covers

| Script | Covers |
| --- | --- |
| `audio.mjs` | audio tracks and clips: add from the library, tempo-locked playback, gain, warp, loop |
| `trim.mjs` | audio clip trim handles, fades, fit to tempo, undo, persistence |
| `samples.mjs` | sample library, import, sampler tracks, `.sfxlab` packages |
| `roll.mjs`, `polish.mjs` | piano roll: draw, move, resize, select, clipboard, velocity lane, grooves |
| `menu.mjs` | the context menu and double-click delete |
| `mod.mjs` | importing a project with LFO + reverb nodes, the node palette |
| `modules.mjs` | sound modules: group, edit in place, knobs, reuse on another track, unlink, undo, persistence |
| `fx.mjs` | the insert graph (Effects tab) on an audio track: default pass-through, a gain, a reverb tail that rings after the clip stops and survives a knob turn, persistence |
| `stereo.mjs` | stereo: per-channel level of the real output, pan, mono-into-stereo rules and the M / L R switch, stereo reverb, persistence |
| `returns.mjs` | return tracks and the Send node: the + menu, a return's effects, a send to it heard through a turned-down track, the tail after the clip stops, removing the return and undo, loop refusal, persistence |
| `sends.mjs` | send knobs (in the Mixer tab): shown only when returns exist, per return with its real name, none left in the headers, post-fader, one undo step per drag, removed with the return, persistence |
| `mixer.mjs` | the Mixer tab: a strip per track, return and master in order; fader, pan per output channel, mute (also stops the sends), solo (a soloed track keeps its return), master volume 0 / 1, per-track meters, undo, persistence |
| `master.mjs` | the Master strip: its graph on the final mix, a master gain silencing every track, a master reverb tail, undo, persistence |
| `trackaudio.mjs` | the Track audio node: another track's sound heard through a track turned all the way down, before/after Take, loop refusal (picker and send knob), removal and undo, persistence |
| `panel.mjs` | the front panel: the Graph / Panel switch, Build from graph, knob drag / keys / wheel / double-click, the same value in the graph view, one undo step per drag, real audio (the Gain knob silences and restores the bass), an XY pad that moves two parameters and undoes together, edit mode (add, rename, resize, reorder, remove), deleting a node removes its controls, separate panels for Instrument and Effects, persistence |
| `notegraph.mjs` | the note graph: split, merge, bypass, notes from another track (real audio), loop refusal, note modules, persistence |

`mixer.mjs` has one unreliable assertion, "panned hard right": it compares the right channel's level with the centred one over a 900 ms window of a looping drum sample, so it fails whenever that window falls on a quieter part of the loop (it also fails on `main`; the sound itself is right, with the left channel at about 1e-17). Compare the channels within one window instead.

## Conventions inside the scripts

* `check(label, ok, extra)` prints one line per assertion; scripts end with a "no page errors" check.
* State is reset with `localStorage.clear()` and `indexedDB.deleteDatabase('sfxlab')` before the first reload.
* `level(ms)` returns the peak of the output meter (`[data-peak]`) over a window: use it to assert sound and silence.
  After stopping a track wait about 9 s (release tails) before asserting silence.
* Nodes are found by their title; wires are made by mouse from `[data-testid="out-<node>-<port>"]` to
  `[data-testid="in-<node>-<port>"]` (see `wire()` in `notegraph.mjs`).
* Role-based locators with prefix-sharing names need `exact: true`.
