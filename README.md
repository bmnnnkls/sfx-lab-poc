# SFX Lab (POC)

A browser-based music/sound-design sandbox: an Ableton-style **session view** (clip launcher + piano roll)
on top of a Max-style **patcher** (node graph) for building instruments. Everything runs client-side on
the Web Audio API with a custom DSP engine inside an `AudioWorklet`.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 — click a clip or scene to start audio (it opens on the Low Light example)
npm test           # unit tests + architecture (layering) test
npm run build      # typecheck + production build
```

## Live demo (GitHub Pages)

Pushes to `main` deploy automatically via `.github/workflows/deploy-pages.yml`. One-time setup: repo **Settings → Pages → Source: GitHub Actions**, and `main` must be an allowed branch under **Settings → Environments → github-pages → Deployment branches** (otherwise the deploy job fails with "not allowed to deploy ... due to environment protection rules"). The site is then at `https://<user>.github.io/sfx-lab-poc/`.

Use a Chromium-based browser or Firefox. Audio starts on your first click (browser autoplay policy).

## Two examples to play with

A first visit opens on **Low Light**, and **File → Examples** loads either of them (and the plain three-track *Starter*):

* **Low Light** — minimal tech house, 125 BPM, eight scenes (Intro, Groove, Stab, Hook, Break, Build, Drop, Outro). No samples: the kick is an
  impulse ringing a resonant filter, the hats are noise and metal, the stab is an organ you can pull the drawbars of. The bass, stab, arp, drone and
  echo **duck under the real sound of the kick** (a sidechain made of nodes). Every track has a **Panel** to turn while it plays, the master's panel is a
  **DJ filter**, a **Cut** button (hold it, let go on the beat) and a live dB readout, and the echo has a **Throw** button.
* **Glass Rain** — self-composing ambient, 92 BPM, six scenes (Fog to Storm and back). Nobody typed the melodies: a Perlin wander is sampled by a clock and a die
  and turned into notes of a scale; a Geiger counter draws raindrops from the same scale; parts of 3, 5 and 7 bars drift against a 4-bar harmony. Drag the XY
  pads, press **Randomize** on Bells or Drops to compose something else (and Undo to get it back), press **Hush** on the master.

[`docs/EXAMPLES.md`](docs/EXAMPLES.md) is a tour of both: what is in them, where to look, what to try. Add `?starter` to the address to open the plain starter instead of Low Light.

## Try it

1. With the starter open: click **▶ 1** (scene 1) — the Bass, Lead and Pad clips launch on the next bar and loop.
2. Select a track name, then edit its instrument in the **Instrument** tab: drag nodes by their header,
   drag from an output dot to an input dot to wire, click a wire to remove it, tweak sliders live. Besides oscillator, filter, envelope, gain and delay there are an **LFO** (wire it into a filter `Cutoff`, oscillator `Pitch` or gain `CV`) and a **Reverb**. Select nodes (Shift-click, or drag a box) and **Group into module** to make a reusable module: edit it once and every use changes, or **Unlink** a use to make it independent. The **Notes** tab holds the track's **note graph**: wire the clip's notes through effects (scale lock, chord, arpeggiator, echo, …), split a stream and treat the branches differently, merge them again, or mix in the notes of another track with *Track notes*. The piano roll beside it shows what the instrument will hear. Group nodes into a module to reuse them. The **Effects** tab gives every track, instrument or audio, an insert graph from *Track in* to *Track out*: put a filter, delay or reverb (or a module of them) on a sample loop or a synth. Sound can be **stereo** there: *Pan* a mono track, widen it, run a filter or delay in stereo (the **M / L R** switch on the node), or use the *Stereo reverb* and *Ping-pong delay*. Add a **Return track** from the `+` menu, give it a reverb, and put a **Send** node in other tracks' effects to share it: the send can sit before or after their other effects, and several tracks can send to one return. The **Mixer** tab has a channel strip for every track, return and the master: pan, **mute** and **solo**, a fader, a level meter, and a **send knob** per return (post-fader) named after it, plus a **master volume**. The **Master** strip at the end of the session grid has its own effects graph on the final mix (a gain, a glue reverb, a width), in stereo. A **Track audio** node plays another track's sound (before or after its effects) inside a track's effects, for parallel chains or modulation. Every graph (instrument, effects, notes, master, modules) also has a **Graph | Panel** switch: *Panel* shows the graph's **control nodes** (knobs, sliders, XY pads, switches) to play with instead of nodes and wires. A control is a node you wire into any parameter (right-click a parameter socket, or *Edit panel*, to make one already wired); *Edit panel* adds, hides, renames, resizes and reorders them, a pad moves two parameters at once, and one drag is one undo step.
   Beyond the sound nodes there are **control nodes** (knobs, sliders, XY pads, switches and push buttons, selectors), **indicators** (LED, number display, bar meter) that show live values, **math and logic** nodes (clock, counter, schmitt trigger and more), **analysis** nodes (envelope follower, level in dB, pitch detector), seeded **noise, Perlin noise, Geiger clicks** and a **Random** value, and ready-made **example modules** (an overtone oscillator, a drawbar organ) under *Add → Examples*. **Randomize / Mutate** in the toolbar re-rolls the settings from a seed (lock a node to keep it). Ideas for what comes next are in [`docs/IDEAS-nodes-and-controls.md`](docs/IDEAS-nodes-and-controls.md).
3. Edit away: your project **autosaves in this browser** and is restored on reload.
   Use **File → Export / Import** to move projects as `.sfxlab.json` files, and **File → Restore previous**
   to swap back after a replace (import / new / demo).
   **Undo / redo** with ↶ ↷ or `Ctrl/⌘+Z` / `Ctrl/⌘+Shift+Z`: dragging a slider or node is a single step.
   **File → Export audio (WAV)…** renders the open clip or a scene offline to a stereo WAV (16-bit or 32-bit float, 44.1 or 48 kHz) named after the project:
   choose the bars, a tail so reverbs and delays are not cut, and whether to normalize to -1 dBFS. The same project always gives the same file.
4. Open the **Samples** tab: **Add demo samples** (or import/drag in your own audio), press ▶ to audition, and
   **New sampler track** to get a playable track. Projects with samples export as a `.sfxlab` package.
   **New audio track** (or `+` → *Audio track*, then a slot's `+`) plays a sample as a tempo-locked, looping **audio
   clip**: try *Demo Drum Loop 120 BPM*, then change the BPM and watch it follow. Open the clip to drag its orange edges (trim) and set fades.
5. Click **✎** on a clip to open it in the **Clip** tab: drag on empty space to draw a note of any length, drag a
   note to move it, drag its ends to resize, Shift-click to select several, **Del** to delete. Change the clip's
   **Length** (or hit **Double**) for longer clips, and zoom with the slider or Ctrl+wheel. Ctrl-drag selects a box, Ctrl+C / X / V copy, cut and paste at the mouse, and the lane
   under the roll sets velocities. Notes are played as you edit them (toggle **Audition**), and the roll can follow the
   playhead. Right-click a note for copy / cut / paste / duplicate / delete (double-click also deletes), and open **Groove** for
   quantize, swing and humanize. Drag the bar above the editor to give it more room. Edit while it plays.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how it is put together and where to add things.

Open work is tracked in [`docs/TASKS.md`](docs/TASKS.md); how it is built is in [`ARCHITECTURE.md`](ARCHITECTURE.md). Longer-range directions (GPU sound, small MIDI models, a Rust engine, collaboration, git-backed projects, a dockable layout and tablet Surfaces, visuals, lighting and installations, and a platform of many hosts around one Rust engine) are sketched in [`docs/EXPLORATIONS.md`](docs/EXPLORATIONS.md).
