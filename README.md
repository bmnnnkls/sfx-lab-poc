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
   drag from an output dot to an input dot to wire, click a wire to remove it, tweak sliders live.
3. Edit away: your project **autosaves in this browser** and is restored on reload.
   Use **File → Export / Import** to move projects as `.sfxlab.json` files, and **File → Restore previous**
   to undo a replace (import / new / demo).
4. Click **✎** on a clip to open it in the **Clip** tab and click cells to add/remove notes while it plays.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how it is put together and where to add things.
