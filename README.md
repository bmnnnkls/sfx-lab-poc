# SFX Lab (POC)

A browser-based music/sound-design sandbox: an Ableton-style **session view** (clip launcher + piano roll)
on top of a Max-style **patcher** (node graph) for building instruments. Everything runs client-side on
the Web Audio API with a custom DSP engine inside an `AudioWorklet`.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 — click a clip or scene to start audio
npm test           # unit tests + architecture (layering) test
npm run build      # typecheck + production build
```

## Live demo (GitHub Pages)

Pushes deploy automatically via `.github/workflows/deploy-pages.yml`. One-time setup: repo **Settings → Pages → Source: GitHub Actions**. The site is then at `https://<user>.github.io/sfx-lab-poc/`.

Use a Chromium-based browser or Firefox. Audio starts on your first click (browser autoplay policy).

## Try it

1. Click **▶ 1** (scene 1) — the Bass, Lead and Pad clips launch on the next bar and loop.
2. Select a track name, then edit its instrument in the **Instrument** tab: drag nodes by their header,
   drag from an output dot to an input dot to wire, click a wire to remove it, tweak sliders live. Besides oscillator, filter, envelope, gain and delay there are an **LFO** (wire it into a filter `Cutoff`, oscillator `Pitch` or gain `CV`) and a **Reverb**. Select nodes (Shift-click, or drag a box) and **Group into module** to make a reusable module: edit it once and every use changes, or **Unlink** a use to make it independent. The **Notes** tab holds the track's **note graph**: wire the clip's notes through effects (scale lock, chord, arpeggiator, echo, …), split a stream and treat the branches differently, merge them again, or mix in the notes of another track with *Track notes*. The piano roll beside it shows what the instrument will hear. Group nodes into a module to reuse them.
3. Edit away: your project **autosaves in this browser** and is restored on reload.
   Use **File → Export / Import** to move projects as `.sfxlab.json` files, and **File → Restore previous**
   to swap back after a replace (import / new / demo).
   **Undo / redo** with ↶ ↷ or `Ctrl/⌘+Z` / `Ctrl/⌘+Shift+Z`: dragging a slider or node is a single step.
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

Open work is tracked in [`docs/TASKS.md`](docs/TASKS.md); how it is built is in [`ARCHITECTURE.md`](ARCHITECTURE.md).
