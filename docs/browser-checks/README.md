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
| `notegraph.mjs` | the note graph: split, merge, bypass, notes from another track (real audio), loop refusal, note modules, persistence |

## Conventions inside the scripts

* `check(label, ok, extra)` prints one line per assertion; scripts end with a "no page errors" check.
* State is reset with `localStorage.clear()` and `indexedDB.deleteDatabase('sfxlab')` before the first reload.
* `level(ms)` returns the peak of the output meter (`[data-peak]`) over a window: use it to assert sound and silence.
  After stopping a track wait about 9 s (release tails) before asserting silence.
* Nodes are found by their title; wires are made by mouse from `[data-testid="out-<node>-<port>"]` to
  `[data-testid="in-<node>-<port>"]` (see `wire()` in `notegraph.mjs`).
* Role-based locators with prefix-sharing names need `exact: true`.
